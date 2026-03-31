import { describe, test, expect, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  contextLoaderHandler,
  buildContextForTest,
  getContextCacheForTest,
  clearContextCache,
  getSubagentPreamble,
} from "../handlers/context-loader.js";

// Create a mock PAI directory structure for tests
function createMockPAIDir(): string {
  const dir = join(tmpdir(), `pai-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  mkdirSync(join(dir, "PAI", "Algorithm"), { recursive: true });
  mkdirSync(join(dir, "PAI", "USER", "TELOS"), { recursive: true });
  mkdirSync(join(dir, "PAI", "USER"), { recursive: true });
  mkdirSync(join(dir, "MEMORY", "LEARNING"), { recursive: true });

  writeFileSync(
    join(dir, "PAI", "Algorithm", "algorithm-v3.5.md"),
    "# The Algorithm v3.5\n\nOBSERVE → THINK → PLAN → BUILD → VERIFY → LEARN\n\nISC Tracking enabled."
  );

  writeFileSync(join(dir, "PAI", "USER", "TELOS", "MISSION.md"), "# Mission\n\nActivate humanity.");
  writeFileSync(join(dir, "PAI", "USER", "TELOS", "GOALS.md"), "# Goals\n\n1. Build great software.");
  writeFileSync(join(dir, "PAI", "USER", "IDENTITY.md"), "# Identity\n\nUser: Test User");
  writeFileSync(join(dir, "PAI", "USER", "PREFERENCES.md"), "# Preferences\n\nEditor: vim");

  return dir;
}

function cleanupDir(dir: string): void {
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  } catch {}
}

describe("contextLoaderHandler", () => {
  let mockPAIDir: string;

  beforeEach(() => {
    mockPAIDir = createMockPAIDir();
    // Set env so paths.ts picks up our mock dir
    process.env.PAI_DIR = mockPAIDir;
    // Clear cache between tests
    const cache = getContextCacheForTest();
    cache.clear();
  });

  test("injects context strings into output.system array", async () => {
    const output = { system: [] as string[] };
    await contextLoaderHandler({ sessionID: "test-inject-1" }, output);

    expect(output.system.length).toBeGreaterThan(0);
    const combined = output.system.join("\n");
    expect(combined.length).toBeGreaterThan(0);

    cleanupDir(mockPAIDir);
  });

  test("output.system contains Algorithm content", async () => {
    const output = { system: [] as string[] };
    await contextLoaderHandler({ sessionID: "test-algo-1" }, output);

    const combined = output.system.join("\n");
    // Algorithm section must appear
    expect(combined).toContain("Algorithm");
    // The 6-phase loop must be present
    expect(combined).toContain("OBSERVE");

    cleanupDir(mockPAIDir);
  });

  test("Algorithm content appears before TELOS in output.system (priority ordering)", async () => {
    const output = { system: [] as string[] };
    await contextLoaderHandler({ sessionID: "test-priority-1" }, output);

    const combined = output.system.join("\n");
    const algoIdx = combined.indexOf("Algorithm");
    const telosIdx = combined.indexOf("TELOS");

    // Algorithm section (algoIdx) must come before TELOS section
    expect(algoIdx).toBeGreaterThanOrEqual(0);
    expect(telosIdx).toBeGreaterThanOrEqual(0);
    expect(algoIdx).toBeLessThan(telosIdx);

    cleanupDir(mockPAIDir);
  });

  test("session-scoped cache: second call returns cached, no re-read", async () => {
    const sessionId = "test-cache-1";

    const output1 = { system: [] as string[] };
    await contextLoaderHandler({ sessionID: sessionId }, output1);

    const cache = getContextCacheForTest();
    expect(cache.has(sessionId)).toBe(true);

    const cachedEntry = cache.get(sessionId)!;
    const cachedSections = cachedEntry.sections.length;

    cleanupDir(mockPAIDir);

    const output2 = { system: [] as string[] };
    await contextLoaderHandler({ sessionID: sessionId }, output2);

    // Must return cached data (same section count)
    expect(output2.system.length).toBe(cachedSections);
    // Cache must still have the session
    expect(cache.has(sessionId)).toBe(true);
  });

  test("different sessions have independent caches (no cross-contamination)", async () => {
    // Create two different PAI dirs
    const dirA = createMockPAIDir();
    const dirB = createMockPAIDir();

    // Write distinct content
    writeFileSync(
      join(dirA, "PAI", "Algorithm", "algorithm-v3.5.md"),
      "Session A Algorithm content"
    );
    writeFileSync(
      join(dirB, "PAI", "Algorithm", "algorithm-v3.5.md"),
      "Session B Algorithm content"
    );

    // Load A
    process.env.PAI_DIR = dirA;
    const cache = getContextCacheForTest();
    cache.clear();
    const outputA = { system: [] as string[] };
    await contextLoaderHandler({ sessionID: "sess-A" }, outputA);

    // Load B
    process.env.PAI_DIR = dirB;
    cache.delete("sess-B"); // ensure B is not cached
    const outputB = { system: [] as string[] };
    await contextLoaderHandler({ sessionID: "sess-B" }, outputB);

    // Both sessions in cache independently
    expect(cache.has("sess-A")).toBe(true);
    expect(cache.has("sess-B")).toBe(true);

    // Content must differ
    const combinedA = outputA.system.join("\n");
    const combinedB = outputB.system.join("\n");
    expect(combinedA).toContain("Session A");
    expect(combinedB).toContain("Session B");

    cleanupDir(dirA);
    cleanupDir(dirB);
  });

  test("clearContextCache removes session from cache", async () => {
    const sessionId = "test-clear-1";
    const output = { system: [] as string[] };
    await contextLoaderHandler({ sessionID: sessionId }, output);

    const cache = getContextCacheForTest();
    expect(cache.has(sessionId)).toBe(true);

    clearContextCache(sessionId);
    expect(cache.has(sessionId)).toBe(false);

    cleanupDir(mockPAIDir);
  });

  test("buildContextForTest returns sections and totalChars", () => {
    const { sections, totalChars } = buildContextForTest(mockPAIDir);
    expect(sections.length).toBeGreaterThan(0);
    expect(totalChars).toBeGreaterThan(0);
    expect(totalChars).toBe(sections.reduce((s, c) => s + c.length, 0));
    cleanupDir(mockPAIDir);
  });

  test("fails gracefully when PAI dir does not exist (fail-open)", async () => {
    process.env.PAI_DIR = "/nonexistent/path/that/does/not/exist";
    getContextCacheForTest().clear();

    const output = { system: [] as string[] };
    // Must not throw
    await expect(
      contextLoaderHandler({ sessionID: "test-nodir-1" }, output)
    ).resolves.toBeUndefined();
    // output.system may be empty but handler must not crash
  });
});

describe("WISDOM context loading", () => {
  let mockPAIDir: string;

  beforeEach(() => {
    mockPAIDir = createMockPAIDir();
    process.env.PAI_DIR = mockPAIDir;
    const cache = getContextCacheForTest();
    cache.clear();
  });

  test("loads WISDOM content when wisdom files exist", () => {
    const wisdomDir = join(mockPAIDir, "MEMORY", "WISDOM");
    mkdirSync(wisdomDir, { recursive: true });
    writeFileSync(
      join(wisdomDir, "architecture.md"),
      "# Architecture Wisdom\n\nSome wisdom here"
    );

    const { sections } = buildContextForTest(mockPAIDir);
    const combined = sections.join("\n");

    expect(combined).toContain("Domain Wisdom");
    expect(combined).toContain("architecture.md");

    cleanupDir(mockPAIDir);
  });

  test("handles empty WISDOM directory gracefully", () => {
    const wisdomDir = join(mockPAIDir, "MEMORY", "WISDOM");
    mkdirSync(wisdomDir, { recursive: true });
    // No files written — directory is empty

    const { sections } = buildContextForTest(mockPAIDir);
    const combined = sections.join("\n");

    expect(combined).not.toContain("Domain Wisdom");

    cleanupDir(mockPAIDir);
  });

  test("handles missing WISDOM directory gracefully", () => {
    // WISDOM directory is never created in this test
    let result: ReturnType<typeof buildContextForTest> | undefined;
    expect(() => {
      result = buildContextForTest(mockPAIDir);
    }).not.toThrow();

    expect(result).toBeDefined();

    cleanupDir(mockPAIDir);
  });

  test("WISDOM appears after memory in section order", () => {
    const wisdomDir = join(mockPAIDir, "MEMORY", "WISDOM");
    mkdirSync(wisdomDir, { recursive: true });
    writeFileSync(
      join(wisdomDir, "frames.md"),
      "# Mental Frames\n\nWisdom content here"
    );

    const { sections } = buildContextForTest(mockPAIDir);
    const combined = sections.join("\n");

    const memoryIdx = combined.indexOf("Memory Context");
    const wisdomIdx = combined.indexOf("Domain Wisdom");

    // Wisdom must appear after Memory (if memory is present)
    if (memoryIdx >= 0) {
      expect(wisdomIdx).toBeGreaterThan(memoryIdx);
    } else {
      // If no memory section, wisdom should still be present
      expect(wisdomIdx).toBeGreaterThanOrEqual(0);
    }

    cleanupDir(mockPAIDir);
  });
});

describe("subagent preamble", () => {
  test("getSubagentPreamble returns a non-empty string", () => {
    const preamble = getSubagentPreamble();
    expect(typeof preamble).toBe("string");
    expect(preamble.length).toBeGreaterThan(0);
  });

  test("preamble states agent is a subagent", () => {
    const preamble = getSubagentPreamble();
    expect(preamble).toContain("subagent");
  });

  test("preamble prohibits Task tool usage", () => {
    const preamble = getSubagentPreamble();
    expect(preamble).toContain("DO NOT use the Task tool");
  });

  test("preamble allows Skill tool usage", () => {
    const preamble = getSubagentPreamble();
    expect(preamble).toContain("Use the Skill tool");
    expect(preamble).not.toContain("DO NOT use the Skill tool");
  });

  test("preamble prohibits voice curl execution", () => {
    const preamble = getSubagentPreamble();
    expect(preamble).toContain("voice curl");
  });

  test("preamble instructs direct work with available tools including Skill", () => {
    const preamble = getSubagentPreamble();
    expect(preamble).toContain("Read");
    expect(preamble).toContain("Write");
    expect(preamble).toContain("Edit");
    expect(preamble).toContain("Bash");
    expect(preamble).toContain("Grep");
    expect(preamble).toContain("Glob");
    expect(preamble).toContain("Skill");
  });
});
