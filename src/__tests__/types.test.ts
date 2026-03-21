/**
 * Tests for types and constants
 *
 * Validates:
 * - PAIHookEvent enum has all 20 hooks
 * - OpenCodePluginEvent enum is complete
 * - Constants use $HOME-relative paths (no hardcoded /Users or /home)
 */

import { test, expect, describe } from "bun:test";
import * as path from "path";

import {
  PAIHookEvent,
  PAIHookFile,
  type OpenCodePluginEvent,
  type HookMapping,
  type SessionState,
  type AdapterConfig,
  type CompactionContext,
  type WorkaroundEntry,
  type AdaptationPlan,
  type SecurityResult,
} from "../types/index.js";

import {
  PAI_DIR,
  PAI_HOOKS_DIR,
  PAI_AGENTS_DIR,
  PAI_TELOS_DIR,
  PAI_ALGORITHM_DIR,
  PAI_MEMORY_DIR,
  OPENCODE_DIR,
  OPENCODE_CONFIG_DIR,
  OPENCODE_CONFIG_PATH,
  OPENCODE_STATE_DIR,
  LOG_PATH,
  AUDIT_LOG_PATH,
  MESSAGE_DEDUP_TTL_MS,
  STATE_CACHE_TTL_MS,
  CONTEXT_BUDGET_RATIO,
  COMPACTION_SURVIVAL_MARKER,
  ADAPTER_VERSION,
} from "../lib/constants.js";

// ============================================================================
// PAIHookEvent Tests
// ============================================================================

describe("PAIHookEvent", () => {
  test("has exactly 9 semantic events", () => {
    const eventCount = Object.keys(PAIHookEvent).length;
    expect(eventCount).toBe(9);
  });

  test("contains core required events", () => {
    const requiredEvents = [
      "SessionStart",
      "PreToolUse",
      "PostToolUse",
      "Stop",
      "SessionEnd",
    ];

    for (const event of requiredEvents) {
      expect(Object.values(PAIHookEvent) as string[]).toContain(event);
    }
  });

  test("all event names are valid PascalCase strings", () => {
    const pascalCaseRegex = /^[A-Z][a-zA-Z0-9]*$/;

    for (const eventName of Object.values(PAIHookEvent)) {
      expect(pascalCaseRegex.test(eventName)).toBe(true);
    }
  });

  test("no duplicate event names", () => {
    const values = Object.values(PAIHookEvent);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });
});

describe("PAIHookFile", () => {
  test("has exactly 20 hook files", () => {
    const fileCount = Object.keys(PAIHookFile).length;
    expect(fileCount).toBe(20);
  });

  test("contains core required hook files", () => {
    const requiredFiles = [
      "AgentExecutionGuard",
      "SecurityValidator",
      "SessionCleanup",
      "VoiceCompletion",
      "WorkCompletionLearning",
    ];

    for (const file of requiredFiles) {
      expect(Object.values(PAIHookFile) as string[]).toContain(file);
    }
  });
});

// ============================================================================
// OpenCodePluginEvent Tests
// ============================================================================

describe("OpenCodePluginEvent", () => {
  test("type accepts all expected OpenCode hooks", () => {
    const expectedEvents: OpenCodePluginEvent[] = [
      "event",
      "config",
      "tool",
      "auth",
      "chat.message",
      "chat.params",
      "chat.headers",
      "permission.ask",
      "command.execute.before",
      "tool.execute.before",
      "shell.env",
      "tool.execute.after",
      "experimental.chat.messages.transform",
      "experimental.chat.system.transform",
      "experimental.session.compacting",
      "experimental.text.complete",
      "tool.definition",
    ];

    expect(expectedEvents.length).toBe(17);
  });

  test("event names use kebab-case or dot notation", () => {
    const kebabCaseRegex = /^[a-z]+(\.[a-z]+)*(-[a-z]+)*$/;

    const eventNames: OpenCodePluginEvent[] = [
      "event",
      "chat.message",
      "permission.ask",
      "tool.execute.before",
      "experimental.chat.system.transform",
    ];

    for (const eventName of eventNames) {
      expect(kebabCaseRegex.test(eventName)).toBe(true);
    }
  });
});

// ============================================================================
// Constants Path Tests
// ============================================================================

describe("Constants - Path Safety", () => {
  test("paths are constructed from process.env.HOME (not hardcoded)", () => {
    const home = process.env.HOME || "~";
    
    const paiPaths = [
      PAI_DIR,
      PAI_HOOKS_DIR,
      PAI_AGENTS_DIR,
      PAI_TELOS_DIR,
      PAI_ALGORITHM_DIR,
      PAI_MEMORY_DIR,
    ];

    for (const p of paiPaths) {
      expect(p.startsWith(home)).toBe(true);
    }
  });

  test("OpenCode paths are constructed from process.env.HOME", () => {
    const home = process.env.HOME || "~";
    
    const ocPaths = [
      OPENCODE_DIR,
      OPENCODE_CONFIG_DIR,
      OPENCODE_CONFIG_PATH,
      OPENCODE_STATE_DIR,
    ];

    for (const p of ocPaths) {
      expect(p.startsWith(home)).toBe(true);
    }
  });

  test("PAI_DIR uses HOME environment variable", () => {
    const home = process.env.HOME || "~";
    expect(PAI_DIR).toBe(path.join(home, ".claude"));
  });

  test("PAI hooks path is relative to PAI_DIR", () => {
    expect(PAI_HOOKS_DIR).toBe(path.join(PAI_DIR, "hooks"));
  });

  test("PAI agents path is correct (~/.claude/agents/)", () => {
    const home = process.env.HOME || "~";
    expect(PAI_AGENTS_DIR).toBe(path.join(home, ".claude", "agents"));
  });

  test("PAI TELOS path is correct (~/.claude/PAI/USER/TELOS/)", () => {
    const home = process.env.HOME || "~";
    expect(PAI_TELOS_DIR).toBe(path.join(home, ".claude", "PAI", "USER", "TELOS"));
  });

  test("log paths use /tmp/ (acceptable exception)", () => {
    expect(LOG_PATH).toBe("/tmp/pai-opencode-debug.log");
    expect(AUDIT_LOG_PATH).toBe("/tmp/pai-opencode-audit.log");
  });
});

// ============================================================================
// Constants - Value Tests
// ============================================================================

describe("Constants - Values", () => {
  test("MESSAGE_DEDUP_TTL_MS is 5000 (5 seconds)", () => {
    expect(MESSAGE_DEDUP_TTL_MS).toBe(5000);
  });

  test("STATE_CACHE_TTL_MS is 1800000 (30 minutes)", () => {
    expect(STATE_CACHE_TTL_MS).toBe(1800000);
  });

  test("CONTEXT_BUDGET_RATIO is 0.8 (80%)", () => {
    expect(CONTEXT_BUDGET_RATIO).toBe(0.8);
  });

  test("COMPACTION_SURVIVAL_MARKER is correct", () => {
    expect(COMPACTION_SURVIVAL_MARKER).toBe("<!-- PAI_SURVIVAL_CONTEXT -->");
  });

  test("ADAPTER_VERSION is set", () => {
    expect(ADAPTER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ============================================================================
// Type Structure Tests
// ============================================================================

describe("Type Structures", () => {
  test("SessionState has required fields", () => {
    const state: SessionState = {
      sessionId: "test-123",
      phase: "active",
      durationMs: 1000,
      turns: 5,
      ratings: [5, 4, 5],
      model: "claude-sonnet-4-5-20250929",
      learnings: ["test learning"],
      startedAt: Date.now(),
    };

    expect(state.sessionId).toBe("test-123");
    expect(state.phase).toBe("active");
    expect(state.ratings).toHaveLength(3);
  });

  test("AdapterConfig has required fields", () => {
    const config: AdapterConfig = {
      paiDir: "~/.claude",
      ocConfigPath: "~/.opencode/config.json",
      loggingLevel: "info",
    };

    expect(config.loggingLevel).toBe("info");
    expect(["debug", "info", "warn", "error"]).toContain(config.loggingLevel);
  });

  test("CompactionContext has required fields", () => {
    const context: CompactionContext = {
      sessionId: "test-123",
      phase: "compacting",
      activeGoals: ["goal1", "goal2"],
      pendingLearnings: ["learning1"],
      injectedAt: Date.now(),
    };

    expect(context.activeGoals).toHaveLength(2);
    expect(context.pendingLearnings).toHaveLength(1);
  });

  test("WorkaroundEntry has valid status values", () => {
    const entries: WorkaroundEntry[] = [
      { feature: "test", workaround: "test", status: "active", retireWhen: "v1.0", addedVersion: "0.1.0" },
      { feature: "test2", workaround: "test2", status: "retired", retireWhen: "v0.5", addedVersion: "0.0.1" },
      { feature: "test3", workaround: "test3", status: "pending", retireWhen: "v2.0", addedVersion: "0.1.0" },
    ];

    expect(entries.map(e => e.status)).toEqual(["active", "retired", "pending"]);
  });

  test("AdaptationPlan has valid classification", () => {
    const plan: AdaptationPlan = {
      changes: ["change1"],
      actions: [{ type: "auto-fixable", description: "test" }],
      classification: "minor",
    };

    expect(["minor", "breaking", "additive"]).toContain(plan.classification);
    expect(plan.actions[0]?.type).toBe("auto-fixable");
  });

  test("SecurityResult has valid action values", () => {
    const results: SecurityResult[] = [
      { action: "block", reason: "dangerous" },
      { action: "confirm", reason: "warning" },
      { action: "allow", reason: "safe" },
    ];

    expect(results.map(r => r.action)).toEqual(["block", "confirm", "allow"]);
  });

  test("HookMapping structure is valid", () => {
    const mapping: HookMapping = {
      paiEvent: PAIHookEvent.PreToolUse,
      ocEvents: ["tool.execute.before"],
      description: "test mapping",
      notes: "test notes",
    };

    expect(mapping.paiEvent).toBe(PAIHookEvent.PreToolUse);
    expect(mapping.ocEvents).toHaveLength(1);
    expect(mapping.description).toBe("test mapping");
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration", () => {
  test("all PAI paths are properly nested under PAI_DIR", () => {
    const allPaths = [
      PAI_HOOKS_DIR,
      PAI_AGENTS_DIR,
      PAI_TELOS_DIR,
      PAI_ALGORITHM_DIR,
      PAI_MEMORY_DIR,
    ];

    for (const p of allPaths) {
      expect(p.startsWith(PAI_DIR)).toBe(true);
    }
  });

  test("all OpenCode state paths are properly nested under OPENCODE_DIR", () => {
    const ocStatePaths = [OPENCODE_STATE_DIR];

    for (const p of ocStatePaths) {
      expect(p.startsWith(OPENCODE_DIR)).toBe(true);
    }
  });

  test("all OpenCode config paths are properly nested under OPENCODE_CONFIG_DIR", () => {
    const ocConfigPaths = [OPENCODE_CONFIG_PATH];

    for (const p of ocConfigPaths) {
      expect(p.startsWith(OPENCODE_CONFIG_DIR)).toBe(true);
    }
  });
});
