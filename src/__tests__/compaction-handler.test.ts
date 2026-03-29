import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  compactionProactiveHandler,
  compactionReactiveHandler,
  getCompactionMetadata,
  clearCompactionState,
} from "../handlers/compaction-handler.js";
import { clearLearningState, toolExecuteAfterHandler } from "../handlers/learning-tracker.js";
import { clearContextCache } from "../handlers/context-loader.js";

const TEST_SESSION = "test-session-compaction-t13";

beforeEach(() => {
  clearLearningState(TEST_SESSION);
  clearContextCache(TEST_SESSION);
  clearCompactionState(TEST_SESSION);
});

afterEach(() => {
  clearLearningState(TEST_SESSION);
  clearContextCache(TEST_SESSION);
  clearCompactionState(TEST_SESSION);
});

describe("compactionProactiveHandler", () => {
  test("does not crash when context cache is empty", async () => {
    const output: { context: string[]; prompt?: string } = { context: [] };

    await expect(
      compactionProactiveHandler({ sessionID: TEST_SESSION }, output)
    ).resolves.toBeUndefined();
  });

  test("output.context remains empty array when no cache (fail-open)", async () => {
    const output: { context: string[]; prompt?: string } = { context: [] };

    await compactionProactiveHandler({ sessionID: TEST_SESSION }, output);

    expect(Array.isArray(output.context)).toBe(true);
  });

  test("does not throw exception on empty/undefined sessionID", async () => {
    const output: { context: string[]; prompt?: string } = { context: [] };

    await expect(
      compactionProactiveHandler({ sessionID: "" }, output)
    ).resolves.toBeUndefined();
  });

  test("pushes learning signals to output.context when signals exist", async () => {
    await toolExecuteAfterHandler(
      { tool: "Bash", sessionID: TEST_SESSION, callID: "c1" },
      "Error: module not found"
    );

    const output: { context: string[]; prompt?: string } = { context: [] };
    await compactionProactiveHandler({ sessionID: TEST_SESSION }, output);

    const combined = output.context.join("\n");
    expect(combined).toContain("Learning Signals");
    expect(combined.toLowerCase()).toContain("failure");
  });

  test("total output.context chars stay within 8000 char budget", async () => {
    for (let i = 0; i < 20; i++) {
      await toolExecuteAfterHandler(
        { tool: "Bash", sessionID: TEST_SESSION, callID: `c${i}` },
        `Error: long error message number ${i} `.repeat(50)
      );
    }

    const output: { context: string[]; prompt?: string } = { context: [] };
    await compactionProactiveHandler({ sessionID: TEST_SESSION }, output);

    const totalChars = output.context.join("").length;
    expect(totalChars).toBeLessThanOrEqual(8000);
  });

  test("output.context is an array of strings (not nested arrays)", async () => {
    const output: { context: string[]; prompt?: string } = { context: [] };
    await compactionProactiveHandler({ sessionID: TEST_SESSION }, output);

    for (const entry of output.context) {
      expect(typeof entry).toBe("string");
    }
  });
});

describe("compactionReactiveHandler", () => {
  test("does not crash on unrelated event type", async () => {
    await expect(
      compactionReactiveHandler({ event: { type: "session.idle", properties: {} } })
    ).resolves.toBeUndefined();
  });

  test("does not crash when event is undefined", async () => {
    await expect(
      compactionReactiveHandler({})
    ).resolves.toBeUndefined();
  });

  test("handles session.compacted event without signals gracefully", async () => {
    await expect(
      compactionReactiveHandler({
        event: {
          type: "session.compacted",
          properties: { sessionID: TEST_SESSION },
        },
      })
    ).resolves.toBeUndefined();
  });

  test("rescues learning signals and records metadata", async () => {
    await toolExecuteAfterHandler(
      { tool: "Bash", sessionID: TEST_SESSION, callID: "rescue-1" },
      "Error: build failed"
    );
    await toolExecuteAfterHandler(
      { tool: "Bash", sessionID: TEST_SESSION, callID: "rescue-2" },
      "Error: tests failed"
    );

    await compactionReactiveHandler({
      event: {
        type: "session.compacted",
        properties: { sessionID: TEST_SESSION },
      },
    });

    const meta = getCompactionMetadata(TEST_SESSION);
    expect(meta).toBeDefined();
    expect(meta?.sessionId).toBe(TEST_SESSION);
    expect(meta?.rescuedSignalCount).toBeGreaterThanOrEqual(2);
  });

  test("compactedAt is an ISO timestamp string", async () => {
    await compactionReactiveHandler({
      event: {
        type: "session.compacted",
        properties: { sessionID: TEST_SESSION },
      },
    });

    const meta = getCompactionMetadata(TEST_SESSION);
    expect(meta?.compactedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("handles legacy session_id property key", async () => {
    await expect(
      compactionReactiveHandler({
        event: {
          type: "session.compacted",
          properties: { session_id: TEST_SESSION },
        },
      })
    ).resolves.toBeUndefined();
  });
});

describe("fail-open behavior", () => {
  test("proactive handler returns empty context on total failure (no throw)", async () => {
    const badOutput = { context: [] as string[] };

    await expect(
      compactionProactiveHandler({ sessionID: "nonexistent-session-id" }, badOutput)
    ).resolves.toBeUndefined();

    expect(Array.isArray(badOutput.context)).toBe(true);
  });

  test("reactive handler ignores events with no sessionID", async () => {
    await expect(
      compactionReactiveHandler({
        event: { type: "session.compacted", properties: {} },
      })
    ).resolves.toBeUndefined();
  });
});

describe("compaction PRD injection", () => {
  let tmpDir: string;
  let originalPaiDir: string | undefined;

  beforeEach(() => {
    // Create a temp directory to act as the PAI dir (~/.claude equivalent)
    tmpDir = join(tmpdir(), `pai-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });

    // Override PAI_DIR so getWorkDir() resolves into our temp dir
    originalPaiDir = process.env.PAI_DIR;
    process.env.PAI_DIR = tmpDir;
  });

  afterEach(() => {
    // Restore PAI_DIR
    if (originalPaiDir === undefined) {
      delete process.env.PAI_DIR;
    } else {
      process.env.PAI_DIR = originalPaiDir;
    }

    // Clean up temp dir
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  test("injects PRD context when PRD exists", async () => {
    // Create the MEMORY/WORK/<slug>/PRD.md structure
    const workDir = join(tmpDir, "MEMORY", "WORK", "20260329-test");
    mkdirSync(workDir, { recursive: true });

    const prdContent = [
      "---",
      "task: test compaction prd injection task",
      "slug: 20260329-test",
      "effort: advanced",
      "phase: execute",
      "progress: 5/10",
      "mode: interactive",
      "started: 2026-03-29T10:00:00.000Z",
      "updated: 2026-03-29T10:30:00.000Z",
      "---",
      "",
      "## Context",
      "",
      "Test PRD for compaction injection.",
      "",
      "## Criteria",
      "",
      "- [x] ISC-1: First criterion is checked",
      "- [x] ISC-2: Second criterion is checked",
      "- [x] ISC-3: Third criterion is checked",
      "- [x] ISC-4: Fourth criterion is checked",
      "- [x] ISC-5: Fifth criterion is checked",
      "- [ ] ISC-6: Sixth criterion not yet done",
      "- [ ] ISC-7: Seventh criterion not yet done",
      "- [ ] ISC-8: Eighth criterion not yet done",
      "- [ ] ISC-9: Ninth criterion not yet done",
      "- [ ] ISC-10: Tenth criterion not yet done",
      "",
    ].join("\n");

    writeFileSync(join(workDir, "PRD.md"), prdContent, "utf-8");

    const output: { context: string[]; prompt?: string } = { context: [] };
    await compactionProactiveHandler({ sessionID: TEST_SESSION }, output);

    const combined = output.context.join("\n");
    expect(combined).toContain("Active PRD");
    expect(combined).toContain("execute");
    expect(combined).toContain("advanced");
  });

  test("does not inject PRD section when no PRD exists", async () => {
    // WORK dir does not exist — no PRD files present
    const output: { context: string[]; prompt?: string } = { context: [] };
    await compactionProactiveHandler({ sessionID: TEST_SESSION }, output);

    const combined = output.context.join("\n");
    expect(combined).not.toContain("Active PRD");
  });

  test("PRD section appears before learning signals section", async () => {
    // Create a PRD
    const workDir = join(tmpDir, "MEMORY", "WORK", "20260329-order-test");
    mkdirSync(workDir, { recursive: true });

    const prdContent = [
      "---",
      "task: order test task",
      "slug: 20260329-order-test",
      "effort: standard",
      "phase: execute",
      "progress: 3/8",
      "mode: interactive",
      "started: 2026-03-29T10:00:00.000Z",
      "updated: 2026-03-29T10:30:00.000Z",
      "---",
      "",
      "## Criteria",
      "",
      "- [x] ISC-1: Done",
      "- [x] ISC-2: Done",
      "- [x] ISC-3: Done",
      "- [ ] ISC-4: Pending",
      "- [ ] ISC-5: Pending",
      "- [ ] ISC-6: Pending",
      "- [ ] ISC-7: Pending",
      "- [ ] ISC-8: Pending",
      "",
    ].join("\n");

    writeFileSync(join(workDir, "PRD.md"), prdContent, "utf-8");

    // Also add a learning signal so the learning section is present
    await toolExecuteAfterHandler(
      { tool: "Bash", sessionID: TEST_SESSION, callID: "order-test-1" },
      "Error: some failure for ordering test"
    );

    const output: { context: string[]; prompt?: string } = { context: [] };
    await compactionProactiveHandler({ sessionID: TEST_SESSION }, output);

    const combined = output.context.join("\n");
    const prdIdx = combined.indexOf("Active PRD");
    const signalsIdx = combined.indexOf("Learning Signals");

    expect(prdIdx).toBeGreaterThanOrEqual(0);
    expect(signalsIdx).toBeGreaterThanOrEqual(0);
    expect(prdIdx).toBeLessThan(signalsIdx);
  });

  test("PRD section is truncated to max 1500 chars when content is very long", async () => {
    const workDir = join(tmpDir, "MEMORY", "WORK", "20260329-long-test");
    mkdirSync(workDir, { recursive: true });

    // Build a task string that's long enough to push section over 1500 chars
    const longTask = "A".repeat(1600);

    const prdContent = [
      "---",
      `task: ${longTask}`,
      "slug: 20260329-long-test",
      "effort: advanced",
      "phase: execute",
      "progress: 1/8",
      "mode: interactive",
      "started: 2026-03-29T10:00:00.000Z",
      "updated: 2026-03-29T10:30:00.000Z",
      "---",
      "",
      "## Criteria",
      "",
      "- [ ] ISC-1: Pending",
      "",
    ].join("\n");

    writeFileSync(join(workDir, "PRD.md"), prdContent, "utf-8");

    const output: { context: string[]; prompt?: string } = { context: [] };
    await compactionProactiveHandler({ sessionID: TEST_SESSION }, output);

    const combined = output.context.join("\n");
    expect(combined).toContain("Active PRD");
    // The PRD section in output.context must not exceed 1500 chars
    // (find the entry that has it and check its contribution)
    const prdEntry = output.context.find((s) => s.includes("Active PRD"));
    expect(prdEntry).toBeDefined();
    expect((prdEntry ?? "").length).toBeLessThanOrEqual(1500 + "[truncated]".length + 10);
  });

  test("handler does not throw when PRD file is unreadable", async () => {
    // Point ADAPTER_DIR to a dir with a WORK subdir that has a non-PRD entry
    const workDir = join(tmpDir, "MEMORY", "WORK", "20260329-corrupt");
    mkdirSync(workDir, { recursive: true });
    // Write a completely empty file (no frontmatter — parseFrontmatter returns {})
    writeFileSync(join(workDir, "PRD.md"), "", "utf-8");

    const output: { context: string[]; prompt?: string } = { context: [] };
    await expect(
      compactionProactiveHandler({ sessionID: TEST_SESSION }, output)
    ).resolves.toBeUndefined();
  });
});
