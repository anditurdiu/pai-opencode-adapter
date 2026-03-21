import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  onSessionStart,
  onMessageReceived,
  onPhaseChange,
  onPlanModeChange,
  onToolExecuted,
  onSessionEnd,
  getStatus,
  getActiveSessionId,
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

  describe("onPlanModeChange", () => {
    it("sets planMode to true", () => {
      onSessionStart(TEST_SESSION);
      onPlanModeChange(TEST_SESSION, true);
      const status = getStatus(TEST_SESSION);
      expect(status?.planMode).toBe(true);
    });

    it("sets planMode to false", () => {
      onSessionStart(TEST_SESSION);
      onPlanModeChange(TEST_SESSION, true);
      onPlanModeChange(TEST_SESSION, false);
      const status = getStatus(TEST_SESSION);
      expect(status?.planMode).toBe(false);
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
});
