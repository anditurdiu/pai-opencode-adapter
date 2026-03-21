import { test, expect, describe, beforeEach } from "bun:test";
import {
  planModeMessageHandler,
  planModePermissionHandler,
  isPlanModeActive,
  clearPlanModeState,
  getPlanModeDenyReason,
} from "../handlers/plan-mode.js";

describe("plan-mode", () => {
  const SESSION = "test-session-plan";

  beforeEach(() => {
    clearPlanModeState(SESSION);
  });

  describe("activation", () => {
    test("/plan triggers plan mode", () => {
      planModeMessageHandler(SESSION, "/plan");
      expect(isPlanModeActive(SESSION)).toBe(true);
    });

    test("'plan mode' phrase triggers plan mode", () => {
      planModeMessageHandler(SESSION, "let's enter plan mode now");
      expect(isPlanModeActive(SESSION)).toBe(true);
    });

    test("planning mode phrase triggers plan mode", () => {
      planModeMessageHandler(SESSION, "switch to planning mode");
      expect(isPlanModeActive(SESSION)).toBe(true);
    });

    test("unrelated message does not activate plan mode", () => {
      planModeMessageHandler(SESSION, "hello, how are you?");
      expect(isPlanModeActive(SESSION)).toBe(false);
    });
  });

  describe("deactivation", () => {
    test("/build deactivates plan mode", () => {
      planModeMessageHandler(SESSION, "/plan");
      planModeMessageHandler(SESSION, "/build");
      expect(isPlanModeActive(SESSION)).toBe(false);
    });

    test("'exit plan mode' deactivates plan mode", () => {
      planModeMessageHandler(SESSION, "/plan");
      planModeMessageHandler(SESSION, "exit plan mode");
      expect(isPlanModeActive(SESSION)).toBe(false);
    });

    test("/implement deactivates plan mode", () => {
      planModeMessageHandler(SESSION, "/plan");
      planModeMessageHandler(SESSION, "/implement");
      expect(isPlanModeActive(SESSION)).toBe(false);
    });
  });

  describe("permission handler — plan mode inactive", () => {
    test("allows all tools when plan mode is not active", () => {
      const output: { status?: "ask" | "deny" | "allow" } = {};
      planModePermissionHandler(SESSION, "Write", "", output);
      expect(output.status).toBeUndefined();
    });
  });

  describe("permission handler — plan mode active", () => {
    beforeEach(() => {
      planModeMessageHandler(SESSION, "/plan");
    });

    test("allows Read tool", () => {
      const output: { status?: "ask" | "deny" | "allow" } = {};
      planModePermissionHandler(SESSION, "Read", "", output);
      expect(output.status).toBeUndefined();
    });

    test("allows Glob tool", () => {
      const output: { status?: "ask" | "deny" | "allow" } = {};
      planModePermissionHandler(SESSION, "Glob", "", output);
      expect(output.status).toBeUndefined();
    });

    test("allows Grep tool", () => {
      const output: { status?: "ask" | "deny" | "allow" } = {};
      planModePermissionHandler(SESSION, "Grep", "", output);
      expect(output.status).toBeUndefined();
    });

    test("blocks Write tool", () => {
      const output: { status?: "ask" | "deny" | "allow" } = {};
      planModePermissionHandler(SESSION, "Write", "", output);
      expect(output.status).toBe("deny");
    });

    test("allows safe Bash command (ls)", () => {
      const output: { status?: "ask" | "deny" | "allow" } = {};
      planModePermissionHandler(SESSION, "Bash", "ls -la src/", output);
      expect(output.status).toBeUndefined();
    });

    test("blocks destructive Bash command (rm)", () => {
      const output: { status?: "ask" | "deny" | "allow" } = {};
      planModePermissionHandler(SESSION, "Bash", "rm -rf dist/", output);
      expect(output.status).toBe("deny");
    });

    test("blocks git commit in Bash", () => {
      const output: { status?: "ask" | "deny" | "allow" } = {};
      planModePermissionHandler(SESSION, "Bash", "git commit -m 'test'", output);
      expect(output.status).toBe("deny");
    });
  });

  describe("getDenyReason", () => {
    test("returns non-empty deny reason", () => {
      const reason = getPlanModeDenyReason();
      expect(reason.length).toBeGreaterThan(0);
      expect(reason).toContain("Plan mode");
    });
  });

  describe("session isolation", () => {
    test("plan mode in one session does not affect another", () => {
      planModeMessageHandler("sess-A", "/plan");
      expect(isPlanModeActive("sess-B")).toBe(false);
    });
  });
});
