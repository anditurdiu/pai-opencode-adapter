import { test, expect, describe, beforeEach, afterEach } from "bun:test";
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
