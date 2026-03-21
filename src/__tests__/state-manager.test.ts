import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { StateManager } from "../lib/state-manager.js";
import { auditLog } from "../lib/audit-logger.js";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_STORAGE_DIR = join(process.env.HOME || "~", ".opencode", "pai-state-test");

function cleanupTestDir() {
  try {
    if (existsSync(TEST_STORAGE_DIR)) {
      rmSync(TEST_STORAGE_DIR, { recursive: true });
    }
  } catch {
  }
}

describe("StateManager", () => {
  beforeEach(() => {
    cleanupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test("set then get on same session returns correct state", () => {
    const manager = new StateManager<{ count: number; name: string }>(TEST_STORAGE_DIR);
    const sessionId = "test-session-1";
    const testState = { count: 42, name: "test" };

    manager.set(sessionId, testState);
    const retrieved = manager.get(sessionId);

    expect(retrieved).toEqual(testState);
  });

  test("two sessions are isolated - no cross-contamination", () => {
    const manager = new StateManager<{ sessionId: string }>(TEST_STORAGE_DIR);
    const sessionA = "sess-A";
    const sessionB = "sess-B";

    manager.set(sessionA, { sessionId: "A" });
    manager.set(sessionB, { sessionId: "B" });

    const retrievedA = manager.get(sessionA);
    const retrievedB = manager.get(sessionB);

    expect(retrievedA).toEqual({ sessionId: "A" });
    expect(retrievedB).toEqual({ sessionId: "B" });
  });

  test("delete removes session and leaves others intact", () => {
    const manager = new StateManager<{ sessionId: string }>(TEST_STORAGE_DIR);
    const sessionA = "sess-A";
    const sessionB = "sess-B";

    manager.set(sessionA, { sessionId: "A" });
    manager.set(sessionB, { sessionId: "B" });

    manager.delete(sessionA);

    const retrievedA = manager.get(sessionA);
    const retrievedB = manager.get(sessionB);

    expect(retrievedA).toBeUndefined();
    expect(retrievedB).toEqual({ sessionId: "B" });
  });

  test("getAll returns all active sessions", () => {
    const manager = new StateManager<{ value: number }>(TEST_STORAGE_DIR);

    manager.set("session-1", { value: 1 });
    manager.set("session-2", { value: 2 });
    manager.set("session-3", { value: 3 });

    const all = manager.getAll();

    expect(all.size).toBe(3);
    expect(all.get("session-1")).toEqual({ value: 1 });
    expect(all.get("session-2")).toEqual({ value: 2 });
    expect(all.get("session-3")).toEqual({ value: 3 });
  });

  test("get returns undefined for non-existent session", () => {
    const manager = new StateManager<{ data: string }>(TEST_STORAGE_DIR);

    const retrieved = manager.get("non-existent-session");

    expect(retrieved).toBeUndefined();
  });

  test("delete on non-existent session does not throw", () => {
    const manager = new StateManager<{ data: string }>(TEST_STORAGE_DIR);

    expect(() => manager.delete("non-existent")).not.toThrow();
  });
});

describe("auditLog", () => {
  const auditLogPath = join(process.env.HOME || "~", ".opencode", "pai-state", "security-audit.jsonl");

  beforeEach(() => {
    try {
      if (existsSync(auditLogPath)) {
        rmSync(auditLogPath);
      }
    } catch {
    }
  });

  test("auditLog with API key content redacts the secret", () => {
    const testEntry = {
      timestamp: new Date().toISOString(),
      sessionId: "test-session",
      event: "api_call",
      verdict: "allowed",
      details: "Using API key sk-proj-abc123def456ghijklmnopqrstuvwxyz012345 for authentication",
    };

    auditLog(testEntry);

    const content = readFileSync(auditLogPath, "utf-8");
    const parsed = JSON.parse(content.trim());

    expect(content).toContain("[REDACTED]");
    expect(content).not.toContain("sk-proj-abc123def456ghijklmnopqrstuvwxyz012345");
    expect(parsed.details).toContain("[REDACTED]");
  });

  test("auditLog redacts multiple secret patterns", () => {
    const testEntry = {
      timestamp: new Date().toISOString(),
      sessionId: "test-session",
      event: "config_load",
      verdict: "allowed",
      details: "Found Bearer abc123token and password: secret123 in config",
    };

    auditLog(testEntry);

    const content = readFileSync(auditLogPath, "utf-8");

    expect(content).not.toContain("abc123token");
    expect(content).not.toContain("secret123");
    expect(content).toContain("Bearer [REDACTED]");
    expect(content).toContain("password: [REDACTED]");
  });

  test("auditLog without secrets passes through unchanged", () => {
    const testEntry = {
      timestamp: new Date().toISOString(),
      sessionId: "test-session",
      event: "user_action",
      verdict: "confirmed",
      details: "User clicked save button",
    };

    auditLog(testEntry);

    const content = readFileSync(auditLogPath, "utf-8");
    const parsed = JSON.parse(content.trim());

    expect(parsed.details).toBe("User clicked save button");
    expect(parsed.event).toBe("user_action");
    expect(parsed.sessionId).toBe("test-session");
  });
});
