import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  onSessionStart,
  onMessageReceived,
  onPhaseChange,
  onToolExecuted,
  onSessionEnd,
  getStatus,
  getActiveSessionId,
  syncFromPRD,
} from "../handlers/statusline-writer.js";

const TEST_SESSION = "test-statusline-writer";
const SESSION_FILE = `/tmp/pai-opencode-status-${TEST_SESSION}.json`;
const FALLBACK_FILE = "/tmp/pai-opencode-status.json";

function cleanup() {
  try { if (existsSync(SESSION_FILE)) rmSync(SESSION_FILE); } catch {}
  try { if (existsSync(FALLBACK_FILE)) rmSync(FALLBACK_FILE); } catch {}
}

function readStatusFile(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

describe("statusline-writer", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    // Clean up session state
    onSessionEnd(TEST_SESSION);
    cleanup();
  });

  describe("onSessionStart", () => {
    it("creates session-specific status file (ISC-2)", () => {
      onSessionStart(TEST_SESSION);
      expect(existsSync(SESSION_FILE)).toBe(true);
    });

    it("creates fallback status file", () => {
      onSessionStart(TEST_SESSION);
      expect(existsSync(FALLBACK_FILE)).toBe(true);
    });

    it("writes valid JSON with phase field (ISC-3)", () => {
      onSessionStart(TEST_SESSION);
      const data = readStatusFile(SESSION_FILE);
      expect(data).not.toBeNull();
      expect(data!.phase).toBe("ACTIVE");
    });

    it("writes JSON with messageCount field (ISC-4)", () => {
      onSessionStart(TEST_SESSION);
      const data = readStatusFile(SESSION_FILE);
      expect(data).not.toBeNull();
      expect(data!.messageCount).toBe(0);
    });

    it("writes JSON with duration field (ISC-5)", () => {
      onSessionStart(TEST_SESSION);
      const data = readStatusFile(SESSION_FILE);
      expect(data).not.toBeNull();
      expect(data!.duration).toBe(0);
    });

    it("sets active session ID", () => {
      onSessionStart(TEST_SESSION);
      expect(getActiveSessionId()).toBe(TEST_SESSION);
    });

    it("ignores empty session ID", () => {
      onSessionStart("");
      expect(getActiveSessionId()).not.toBe("");
    });

    it("cleans stale fallback file from previous session", () => {
      // Simulate a stale fallback file from a crashed session
      const { writeFileSync: wfs } = require("node:fs");
      wfs(FALLBACK_FILE, JSON.stringify({ phase: "ACTIVE", messageCount: 42 }));
      expect(existsSync(FALLBACK_FILE)).toBe(true);

      // Start a new session — should clean the stale file and write fresh data
      onSessionStart(TEST_SESSION);
      const data = readStatusFile(FALLBACK_FILE);
      expect(data).not.toBeNull();
      expect(data!.messageCount).toBe(0);
    });

    it("cleans stale session-specific files from previous sessions", () => {
      // Simulate a stale session file from a different session
      const { writeFileSync: wfs } = require("node:fs");
      const staleFile = "/tmp/pai-opencode-status-old-crashed-session.json";
      wfs(staleFile, JSON.stringify({ phase: "ACTIVE", messageCount: 99 }));
      expect(existsSync(staleFile)).toBe(true);

      // Start a new session — should clean up the stale file
      onSessionStart(TEST_SESSION);
      expect(existsSync(staleFile)).toBe(false);
    });

    it("always starts with messageCount 0 regardless of stale state", () => {
      // Write stale data, then start fresh
      const { writeFileSync: wfs } = require("node:fs");
      wfs(SESSION_FILE, JSON.stringify({ phase: "ACTIVE", messageCount: 15 }));

      onSessionStart(TEST_SESSION);
      const status = getStatus(TEST_SESSION);
      expect(status?.messageCount).toBe(0);
    });
  });

  describe("onMessageReceived", () => {
    it("increments messageCount", () => {
      onSessionStart(TEST_SESSION);
      onMessageReceived(TEST_SESSION);
      onMessageReceived(TEST_SESSION);
      const status = getStatus(TEST_SESSION);
      expect(status?.messageCount).toBe(2);
    });

    it("updates the status file on disk", () => {
      onSessionStart(TEST_SESSION);
      onMessageReceived(TEST_SESSION);
      const data = readStatusFile(SESSION_FILE);
      expect(data!.messageCount).toBe(1);
    });

    it("uses active session when no session ID provided", () => {
      onSessionStart(TEST_SESSION);
      onMessageReceived("");
      const status = getStatus(TEST_SESSION);
      expect(status?.messageCount).toBe(1);
    });
  });

  describe("onPhaseChange", () => {
    it("updates phase to uppercase", () => {
      onSessionStart(TEST_SESSION);
      onPhaseChange(TEST_SESSION, "build");
      const status = getStatus(TEST_SESSION);
      expect(status?.phase).toBe("BUILD");
    });

    it("writes updated phase to disk", () => {
      onSessionStart(TEST_SESSION);
      onPhaseChange(TEST_SESSION, "verify");
      const data = readStatusFile(SESSION_FILE);
      expect(data!.phase).toBe("VERIFY");
    });
  });

  describe("onToolExecuted", () => {
    it("accumulates duration", () => {
      onSessionStart(TEST_SESSION);
      onToolExecuted(TEST_SESSION, "bash", 5);
      onToolExecuted(TEST_SESSION, "read", 3);
      const status = getStatus(TEST_SESSION);
      expect(status?.duration).toBe(8);
    });

    it("tracks active agent/tool name", () => {
      onSessionStart(TEST_SESSION);
      onToolExecuted(TEST_SESSION, "grep", 2);
      const status = getStatus(TEST_SESSION);
      expect(status?.activeAgent).toBe("grep");
    });

    it("writes updated data to disk", () => {
      onSessionStart(TEST_SESSION);
      onToolExecuted(TEST_SESSION, "write", 10);
      const data = readStatusFile(SESSION_FILE);
      expect(data!.duration).toBe(10);
      expect(data!.activeAgent).toBe("write");
    });
  });

  describe("onSessionEnd", () => {
    it("removes status files", () => {
      onSessionStart(TEST_SESSION);
      expect(existsSync(SESSION_FILE)).toBe(true);
      onSessionEnd(TEST_SESSION);
      expect(existsSync(SESSION_FILE)).toBe(false);
    });

    it("clears active session ID", () => {
      onSessionStart(TEST_SESSION);
      onSessionEnd(TEST_SESSION);
      expect(getActiveSessionId()).toBeNull();
    });

    it("removes in-memory status", () => {
      onSessionStart(TEST_SESSION);
      onSessionEnd(TEST_SESSION);
      expect(getStatus(TEST_SESSION)).toBeUndefined();
    });
  });

  describe("atomic writes (ISC-7)", () => {
    it("fallback file matches session file content", () => {
      onSessionStart(TEST_SESSION);
      onMessageReceived(TEST_SESSION);
      onPhaseChange(TEST_SESSION, "think");

      const sessionData = readStatusFile(SESSION_FILE);
      const fallbackData = readStatusFile(FALLBACK_FILE);
      expect(sessionData).toEqual(fallbackData);
    });

    it("file is valid JSON after rapid sequential writes", () => {
      onSessionStart(TEST_SESSION);
      for (let i = 0; i < 20; i++) {
        onMessageReceived(TEST_SESSION);
      }
      const data = readStatusFile(SESSION_FILE);
      expect(data).not.toBeNull();
      expect(data!.messageCount).toBe(20);
    });
  });

  describe("new PRD-enriched fields", () => {
    it("default status includes effortLevel as empty string", () => {
      onSessionStart(TEST_SESSION);
      const status = getStatus(TEST_SESSION);
      expect(status?.effortLevel).toBe("");
    });

    it("default status includes taskDescription as empty string", () => {
      onSessionStart(TEST_SESSION);
      const status = getStatus(TEST_SESSION);
      expect(status?.taskDescription).toBe("");
    });

    it("default status includes iscProgress with zeros", () => {
      onSessionStart(TEST_SESSION);
      const status = getStatus(TEST_SESSION);
      expect(status?.iscProgress).toEqual({ checked: 0, total: 0 });
    });

    it("default status includes algorithmPhase as empty string", () => {
      onSessionStart(TEST_SESSION);
      const status = getStatus(TEST_SESSION);
      expect(status?.algorithmPhase).toBe("");
    });

    it("new fields are written to disk JSON", () => {
      onSessionStart(TEST_SESSION);
      const data = readStatusFile(SESSION_FILE);
      expect(data).not.toBeNull();
      expect(data!.effortLevel).toBe("");
      expect(data!.taskDescription).toBe("");
      expect(data!.iscProgress).toEqual({ checked: 0, total: 0 });
      expect(data!.algorithmPhase).toBe("");
    });
  });

  describe("syncFromPRD", () => {
    it("does not throw when no PRD exists", () => {
      onSessionStart(TEST_SESSION);
      expect(() => syncFromPRD(TEST_SESSION)).not.toThrow();
    });

    it("does not throw with empty session ID", () => {
      expect(() => syncFromPRD("")).not.toThrow();
    });
  });

  describe("syncFromPRD skips completed PRDs", () => {
    let tmpPAIDir: string;
    let origPAIDir: string | undefined;

    beforeEach(() => {
      // Create a temp PAI directory with a MEMORY/WORK structure
      tmpPAIDir = join(tmpdir(), `pai-test-prd-skip-${Date.now()}`);
      mkdirSync(join(tmpPAIDir, "MEMORY", "WORK", "20260329-120000_completed-task"), { recursive: true });

      // Save and override PAI_DIR
      origPAIDir = process.env.PAI_DIR;
      process.env.PAI_DIR = tmpPAIDir;
    });

    afterEach(() => {
      // Restore PAI_DIR
      if (origPAIDir !== undefined) {
        process.env.PAI_DIR = origPAIDir;
      } else {
        delete process.env.PAI_DIR;
      }
      // Clean up temp dir
      try { rmSync(tmpPAIDir, { recursive: true, force: true }); } catch {}
    });

    it("does not update status fields when PRD phase is complete", () => {
      const prdContent = [
        "---",
        "task: Auto-allow claude access and bump to v0.2.0",
        "slug: 20260329-120000_completed-task",
        "effort: standard",
        "phase: complete",
        "progress: 10/10",
        "mode: interactive",
        "started: 2026-03-29T12:00:00Z",
        "updated: 2026-03-29T12:30:00Z",
        "---",
        "",
        "## Criteria",
        "- [x] ISC-1: Something done",
        "- [x] ISC-2: Something else done",
      ].join("\n");

      writeFileSync(
        join(tmpPAIDir, "MEMORY", "WORK", "20260329-120000_completed-task", "PRD.md"),
        prdContent,
      );

      onSessionStart(TEST_SESSION);
      syncFromPRD(TEST_SESSION);

      const status = getStatus(TEST_SESSION);
      // Status should NOT have been updated from the completed PRD
      expect(status?.taskDescription).toBe("");
      expect(status?.algorithmPhase).toBe("");
      expect(status?.effortLevel).toBe("");
      expect(status?.iscProgress).toEqual({ checked: 0, total: 0 });
    });

    it("does not update status fields when PRD phase is cancelled", () => {
      const prdContent = [
        "---",
        "task: Cancelled task",
        "slug: 20260329-120000_completed-task",
        "effort: extended",
        "phase: cancelled",
        "progress: 3/8",
        "mode: interactive",
        "started: 2026-03-29T12:00:00Z",
        "updated: 2026-03-29T12:30:00Z",
        "---",
        "",
        "## Criteria",
        "- [x] ISC-1: Done",
        "- [ ] ISC-2: Not done",
      ].join("\n");

      writeFileSync(
        join(tmpPAIDir, "MEMORY", "WORK", "20260329-120000_completed-task", "PRD.md"),
        prdContent,
      );

      onSessionStart(TEST_SESSION);
      syncFromPRD(TEST_SESSION);

      const status = getStatus(TEST_SESSION);
      expect(status?.taskDescription).toBe("");
      expect(status?.algorithmPhase).toBe("");
    });

    it("updates status fields when PRD phase is active (e.g. execute)", () => {
      // Use a recent timestamp so the staleness guard (30m) doesn't reject it
      const recentTimestamp = new Date().toISOString();
      const prdContent = [
        "---",
        "task: Build new feature",
        "slug: 20260329-120000_completed-task",
        "effort: standard",
        "phase: execute",
        "progress: 3/8",
        "mode: interactive",
        "started: 2026-03-29T12:00:00Z",
        `updated: ${recentTimestamp}`,
        "---",
        "",
        "## Criteria",
        "- [x] ISC-1: Done",
        "- [x] ISC-2: Done",
        "- [x] ISC-3: Done",
        "- [ ] ISC-4: Not done",
        "- [ ] ISC-5: Not done",
        "- [ ] ISC-6: Not done",
        "- [ ] ISC-7: Not done",
        "- [ ] ISC-8: Not done",
        "",
      ].join("\n");

      writeFileSync(
        join(tmpPAIDir, "MEMORY", "WORK", "20260329-120000_completed-task", "PRD.md"),
        prdContent,
      );

      onSessionStart(TEST_SESSION);
      syncFromPRD(TEST_SESSION);

      const status = getStatus(TEST_SESSION);
      // Status SHOULD have been updated from the active PRD
      expect(status?.taskDescription).toBe("Build new feature");
      expect(status?.algorithmPhase).toBe("EXECUTE");
      expect(status?.effortLevel).toBe("STANDARD");
      expect(status?.iscProgress).toEqual({ checked: 3, total: 8 });
    });
  });
});
