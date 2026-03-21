import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractRating,
  extractToolSignal,
  extractWorkItem,
  writeWorkSummary,
  toolExecuteAfterHandler,
  chatMessageHandler,
  flushSessionLearnings,
  getSessionSignals,
  getSessionRatings,
  clearLearningState,
  type LearningSignalEntry,
  type WorkItem,
} from "../handlers/learning-tracker.js";

const TEST_SESSION = "test-session-t12-abc";

beforeEach(() => {
  clearLearningState(TEST_SESSION);
});

afterEach(() => {
  clearLearningState(TEST_SESSION);
});

describe("extractRating", () => {
  test("extracts standalone number 1-10", () => {
    expect(extractRating("7")?.rating).toBe(7);
    expect(extractRating("10")?.rating).toBe(10);
    expect(extractRating("1")?.rating).toBe(1);
  });

  test("extracts number with comment", () => {
    const r = extractRating("8 - good work");
    expect(r?.rating).toBe(8);
    expect(r?.comment).toBe("good work");
  });

  test("extracts N/10 pattern", () => {
    expect(extractRating("9/10")?.rating).toBe(9);
  });

  test("extracts 'rate: N' pattern", () => {
    expect(extractRating("rate: 7")?.rating).toBe(7);
  });

  test("extracts thumbs up as 8", () => {
    expect(extractRating("👍")?.rating).toBe(8);
  });

  test("extracts thumbs down as 2", () => {
    expect(extractRating("👎")?.rating).toBe(2);
  });

  test("extracts positive words as 8", () => {
    expect(extractRating("great")?.rating).toBe(8);
    expect(extractRating("excellent")?.rating).toBe(8);
    expect(extractRating("perfect")?.rating).toBe(8);
  });

  test("extracts negative words as 2", () => {
    expect(extractRating("terrible")?.rating).toBe(2);
    expect(extractRating("broken")?.rating).toBe(2);
  });

  test("returns null for neutral message", () => {
    expect(extractRating("the weather is nice today")).toBeNull();
    expect(extractRating("can you check the logs")).toBeNull();
    expect(extractRating("continue working on it")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(extractRating("")).toBeNull();
  });
});

describe("extractToolSignal", () => {
  test("detects tool_failure from error keyword in output", () => {
    const result = extractToolSignal("Bash", {}, "Error: command not found");
    expect(result?.type).toBe("tool_failure");
    expect(result?.content).toContain("failed");
  });

  test("detects tool_failure from 'failed' keyword", () => {
    const result = extractToolSignal("Bash", {}, "process failed with exit code 1");
    expect(result?.type).toBe("tool_failure");
  });

  test("detects tool_failure from error object", () => {
    const result = extractToolSignal("Bash", {}, { error: "permission denied" });
    expect(result?.type).toBe("tool_failure");
  });

  test("detects tool_success for Bash tool with command", () => {
    const result = extractToolSignal("Bash", { command: "bun test" }, "OK");
    expect(result?.type).toBe("tool_success");
    expect(result?.content).toContain("Bash");
  });

  test("detects tool_success for Write tool", () => {
    const result = extractToolSignal("Write", { file_path: "/tmp/test.ts" }, "written");
    expect(result?.type).toBe("tool_success");
  });

  test("returns null for trivial tools (e.g. Read)", () => {
    const result = extractToolSignal("Read", { file_path: "/tmp/test.ts" }, "some content");
    expect(result).toBeNull();
  });
});

describe("extractWorkItem", () => {
  test("extracts work item for Write tool", () => {
    const item = extractWorkItem(TEST_SESSION, "Write", {
      file_path: "/tmp/output.ts",
      content: "export const x = 1;",
    });
    expect(item).not.toBeNull();
    expect(item?.file).toBe("/tmp/output.ts");
    expect(item?.action).toBe("modified");
    expect(item?.sessionId).toBe(TEST_SESSION);
  });

  test("extracts work item for Edit tool", () => {
    const item = extractWorkItem(TEST_SESSION, "Edit", {
      file_path: "/tmp/edit.ts",
      new_str: "new content",
    });
    expect(item).not.toBeNull();
    expect(item?.file).toBe("/tmp/edit.ts");
  });

  test("returns null for non-file tools", () => {
    const item = extractWorkItem(TEST_SESSION, "Bash", { command: "ls" });
    expect(item).toBeNull();
  });

  test("returns null when no file path in args", () => {
    const item = extractWorkItem(TEST_SESSION, "Write", { content: "something" });
    expect(item).toBeNull();
  });
});

describe("toolExecuteAfterHandler", () => {
  test("captures tool_failure signal from error output", async () => {
    await toolExecuteAfterHandler(
      { tool: "Bash", sessionID: TEST_SESSION, callID: "call-1" },
      "Error: command not found"
    );

    const signals = getSessionSignals(TEST_SESSION);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0]?.type).toBe("tool_failure");
  });

  test("captures tool_success signal from successful Bash", async () => {
    await toolExecuteAfterHandler(
      { tool: "Bash", sessionID: TEST_SESSION, callID: "call-2", args: { command: "bun test" } },
      "5 pass"
    );

    const signals = getSessionSignals(TEST_SESSION);
    expect(signals.some((s) => s.type === "tool_success")).toBe(true);
  });

  test("captures work item from Write tool", async () => {
    await toolExecuteAfterHandler(
      {
        tool: "Write",
        sessionID: TEST_SESSION,
        callID: "call-3",
        args: { file_path: "/tmp/test-file.ts", content: "export {}" },
      },
      "ok"
    );

    const signals = getSessionSignals(TEST_SESSION);
    const hasWorkSignal = signals.some((s) => s.metadata?.["tool"] === "Write");
    expect(hasWorkSignal).toBe(true);
  });

  test("does not throw on malformed input", async () => {
    await expect(
      toolExecuteAfterHandler({ tool: "", sessionID: undefined }, null)
    ).resolves.toBeUndefined();
  });
});

describe("chatMessageHandler", () => {
  test("captures explicit numeric rating", async () => {
    await chatMessageHandler(
      { sessionID: TEST_SESSION, messageID: "msg-1", message: "9 - great job" },
      {}
    );

    const ratings = getSessionRatings(TEST_SESSION);
    expect(ratings.length).toBe(1);
    expect(ratings[0]?.rating).toBe(9);
    expect(ratings[0]?.source).toBe("explicit");
  });

  test("captures thumbs up as rating 8", async () => {
    await chatMessageHandler(
      { sessionID: TEST_SESSION, messageID: "msg-2", message: "👍" },
      {}
    );

    const ratings = getSessionRatings(TEST_SESSION);
    expect(ratings.some((r) => r.rating === 8)).toBe(true);
  });

  test("captures negative rating 'terrible'", async () => {
    await chatMessageHandler(
      { sessionID: TEST_SESSION, messageID: "msg-3", message: "terrible output" },
      {}
    );

    const ratings = getSessionRatings(TEST_SESSION);
    expect(ratings.some((r) => r.rating === 2)).toBe(true);
  });

  test("does NOT capture rating for neutral message", async () => {
    await chatMessageHandler(
      { sessionID: TEST_SESSION, messageID: "msg-4", message: "the weather is nice today" },
      {}
    );

    const ratings = getSessionRatings(TEST_SESSION);
    expect(ratings.length).toBe(0);
  });

  test("captures PRD sync signal for plan: prefix", async () => {
    await chatMessageHandler(
      { sessionID: TEST_SESSION, messageID: "msg-5", message: "plan: build auth system with JWT" },
      {}
    );

    const signals = getSessionSignals(TEST_SESSION);
    expect(signals.some((s) => s.type === "prd_sync")).toBe(true);
  });

  test("handles message as object with content array", async () => {
    await chatMessageHandler(
      {
        sessionID: TEST_SESSION,
        messageID: "msg-6",
        message: { content: [{ type: "text", text: "8 - looks good" }] },
      },
      {}
    );

    const ratings = getSessionRatings(TEST_SESSION);
    expect(ratings.some((r) => r.rating === 8)).toBe(true);
  });

  test("does not throw on empty message", async () => {
    await expect(
      chatMessageHandler({ sessionID: TEST_SESSION, messageID: "msg-7", message: "" }, {})
    ).resolves.toBeUndefined();
  });
});

describe("flushSessionLearnings + JSONL output", () => {
  test("flush writes nothing when no signals", async () => {
    await expect(flushSessionLearnings("empty-session-xyz")).resolves.toBeUndefined();
  });

  test("flush clears session state after writing", async () => {
    await toolExecuteAfterHandler(
      { tool: "Bash", sessionID: TEST_SESSION, callID: "flush-test" },
      "Error: some error"
    );

    expect(getSessionSignals(TEST_SESSION).length).toBeGreaterThan(0);

    await flushSessionLearnings(TEST_SESSION);

    expect(getSessionSignals(TEST_SESSION).length).toBe(0);
  });
});

describe("writeWorkSummary", () => {
  test("does not throw on empty work items", () => {
    expect(() => writeWorkSummary("empty-session", [])).not.toThrow();
  });

  test("creates work summary file", () => {
    const workItems: WorkItem[] = [
      {
        sessionId: TEST_SESSION,
        tool: "Write",
        file: "/tmp/auth.ts",
        action: "created",
        timestamp: new Date().toISOString(),
      },
      {
        sessionId: TEST_SESSION,
        tool: "Edit",
        file: "/tmp/config.ts",
        action: "modified",
        timestamp: new Date().toISOString(),
      },
    ];

    expect(() => writeWorkSummary(TEST_SESSION, workItems)).not.toThrow();
  });
});
