import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "bun:test";
import type { PluginInput } from "@opencode-ai/plugin";
import PaiPlugin, {
  healthCheck,
  __testInternals,
} from "../plugin/pai-unified.js";

// Destructure test internals from the bundled object
const {
  subagentSessions: _subagentSessionsForTest,
  pendingSubagentSpawns: _pendingSubagentSpawnsForTest,
  subagentTracking: _subagentTrackingForTest,
  SPAWN_TIMEOUT_MS: _SPAWN_TIMEOUT_MS_FOR_TEST,
  STALL_TIMEOUT_MS: _STALL_TIMEOUT_MS_FOR_TEST,
  getStalledSubagentWarnings: _getStalledSubagentWarningsForTest,
  loopDetectionState: _loopDetectionStateForTest,
  LOOP_WINDOW_SIZE: _LOOP_WINDOW_SIZE_FOR_TEST,
  LOOP_REPEAT_THRESHOLD: _LOOP_REPEAT_THRESHOLD_FOR_TEST,
  LOOP_CHUNK_MIN_LENGTH: _LOOP_CHUNK_MIN_LENGTH_FOR_TEST,
  recordReasoningChunk: _recordReasoningChunkForTest,
  getLoopingSubagentWarnings: _getLoopingSubagentWarningsForTest,
  hashReasoningChunk: _hashReasoningChunkForTest,
} = __testInternals;

// Mock PluginInput — tests only exercise hooks, not the full plugin client
const mockPluginInput = {
  client: { instance: { dispose: async () => {} } },
  project: { root: "/tmp/test-project" },
  directory: "/tmp/test-project",
  worktree: "/tmp/test-project",
  serverUrl: new URL("http://localhost:3000"),
  $: (() => {}) as unknown,
} as unknown as PluginInput;

// The plugin is now a function — call it once to get the hooks object
let hooks: Record<string, unknown>;

beforeAll(async () => {
  hooks = await PaiPlugin(mockPluginInput);
});

describe("plugin function", () => {
  it("default export is a function (Plugin type)", () => {
    expect(typeof PaiPlugin).toBe("function");
  });

  it("returns an object when called", () => {
    expect(typeof hooks).toBe("object");
    expect(hooks).not.toBeNull();
  });
});

describe("hook registration", () => {
  it("registers permission.ask hook", () => {
    expect(typeof hooks["permission.ask"]).toBe("function");
  });

  it("registers experimental.chat.system.transform hook", () => {
    expect(typeof hooks["experimental.chat.system.transform"]).toBe("function");
  });

  it("registers tool.execute.before hook", () => {
    expect(typeof hooks["tool.execute.before"]).toBe("function");
  });

  it("registers tool.execute.after hook", () => {
    expect(typeof hooks["tool.execute.after"]).toBe("function");
  });

  it("registers chat.message hook", () => {
    expect(typeof hooks["chat.message"]).toBe("function");
  });

  it("registers experimental.session.compacting hook", () => {
    expect(typeof hooks["experimental.session.compacting"]).toBe("function");
  });

  it("registers event hook", () => {
    expect(typeof hooks["event"]).toBe("function");
  });

  it("registers config hook", () => {
    expect(typeof hooks["config"]).toBe("function");
  });
});

// ── config hook agent injection ──────────────────────────
// ISC-27: Tests that the config hook injects all PAI agents (auto-discovered), disables
// algorithm/native, reads model assignments from pai-adapter.json,
// and merges definitions with config properly.

import { AGENT_DEFINITIONS, AGENT_NAMES, PAI_AGENT_REGISTRY, clearPromptCache } from "../agents/definitions.js";

describe("config hook agent injection", () => {
  it("injects all PAI agents into config.agent", async () => {
    const configHook = hooks["config"] as (input: Record<string, unknown>) => Promise<void>;
    const input: Record<string, unknown> = { agent: {} };
    await configHook(input);

    const agentConfig = input.agent as Record<string, Record<string, unknown>>;
    for (const name of AGENT_NAMES) {
      expect(agentConfig[name]).toBeDefined();
    }
  });

  it("injected agents have prompts from definitions.ts", async () => {
    const configHook = hooks["config"] as (input: Record<string, unknown>) => Promise<void>;
    const input: Record<string, unknown> = { agent: {} };
    await configHook(input);

    const agentConfig = input.agent as Record<string, Record<string, unknown>>;
    for (const name of AGENT_NAMES) {
      const def = AGENT_DEFINITIONS[name];
      if (def) {
        expect(agentConfig[name]?.prompt).toBe(def.prompt);
      }
    }
  });

  it("injected agents have permissions from definitions.ts", async () => {
    const configHook = hooks["config"] as (input: Record<string, unknown>) => Promise<void>;
    const input: Record<string, unknown> = { agent: {} };
    await configHook(input);

    const agentConfig = input.agent as Record<string, Record<string, unknown>>;
    for (const name of AGENT_NAMES) {
      const def = AGENT_DEFINITIONS[name];
      if (def) {
        expect(agentConfig[name]?.permission).toEqual(def.permission);
      }
    }
  });

  it("disables algorithm agent via disable: true", async () => {
    const configHook = hooks["config"] as (input: Record<string, unknown>) => Promise<void>;
    const input: Record<string, unknown> = { agent: {} };
    await configHook(input);

    const agentConfig = input.agent as Record<string, Record<string, unknown>>;
    expect(agentConfig["algorithm"]?.disable).toBe(true);
  });

  it("disables native agent via disable: true", async () => {
    const configHook = hooks["config"] as (input: Record<string, unknown>) => Promise<void>;
    const input: Record<string, unknown> = { agent: {} };
    await configHook(input);

    const agentConfig = input.agent as Record<string, Record<string, unknown>>;
    expect(agentConfig["native"]?.disable).toBe(true);
  });

  it("injected agents have defaults (description, color, mode, etc.)", async () => {
    const configHook = hooks["config"] as (input: Record<string, unknown>) => Promise<void>;
    const input: Record<string, unknown> = { agent: {} };
    await configHook(input);

    const agentConfig = input.agent as Record<string, Record<string, unknown>>;
    for (const name of AGENT_NAMES) {
      const def = AGENT_DEFINITIONS[name];
      if (def) {
        expect(agentConfig[name]?.description).toBe(def.defaults.description);
        expect(agentConfig[name]?.color).toBe(def.defaults.color);
        expect(agentConfig[name]?.mode).toBe(def.defaults.mode);
        expect(agentConfig[name]?.maxSteps).toBe(def.defaults.steps);
        expect(agentConfig[name]?.temperature).toBe(def.defaults.temperature);
      }
    }
  });

  it("creates agent object if input.agent is missing", async () => {
    const configHook = hooks["config"] as (input: Record<string, unknown>) => Promise<void>;
    const input: Record<string, unknown> = {};
    await configHook(input);

    expect(input.agent).toBeDefined();
    const agentConfig = input.agent as Record<string, Record<string, unknown>>;
    expect(Object.keys(agentConfig).length).toBeGreaterThan(0);
  });

  it("preserves existing agent config entries", async () => {
    const configHook = hooks["config"] as (input: Record<string, unknown>) => Promise<void>;
    const input: Record<string, unknown> = {
      agent: { build: { model: "test/model", prompt: "test prompt" } },
    };
    await configHook(input);

    const agentConfig = input.agent as Record<string, Record<string, unknown>>;
    expect(agentConfig["build"]?.model).toBe("test/model");
    expect(agentConfig["build"]?.prompt).toBe("test prompt");
  });
});

// ── Dynamic PAI prompt resolution ──────────────────────────

describe("dynamic PAI prompt resolution", () => {
  afterEach(() => {
    clearPromptCache();
  });

  it("AGENT_NAMES has all PAI agents (Context.md + phantoms)", () => {
    expect(AGENT_NAMES.length).toBeGreaterThanOrEqual(13);
    expect(AGENT_NAMES).toContain("Architect");
    expect(AGENT_NAMES).toContain("Engineer");
    expect(AGENT_NAMES).toContain("GeminiResearcher");
    expect(AGENT_NAMES).toContain("ClaudeResearcher");
    expect(AGENT_NAMES).toContain("QATester");
    expect(AGENT_NAMES).toContain("GeneralPurpose");
    expect(AGENT_NAMES).toContain("Plan");
    expect(AGENT_NAMES).toContain("Pentester");
  });

  it("PAI_AGENT_REGISTRY maps all 10 agents to context files", () => {
    expect(PAI_AGENT_REGISTRY["Architect"]?.contextFile).toBe("ArchitectContext.md");
    expect(PAI_AGENT_REGISTRY["Engineer"]?.contextFile).toBe("EngineerContext.md");
    expect(PAI_AGENT_REGISTRY["GeminiResearcher"]?.contextFile).toBe("GeminiResearcherContext.md");
    expect(PAI_AGENT_REGISTRY["ClaudeResearcher"]?.contextFile).toBe("ClaudeResearcherContext.md");
    expect(PAI_AGENT_REGISTRY["QATester"]?.contextFile).toBe("QATesterContext.md");
  });

  it("all PAI agents get non-empty prompts from Context.md files", () => {
    for (const name of AGENT_NAMES) {
      const def = AGENT_DEFINITIONS[name];
      expect(def).toBeDefined();
      expect(def!.prompt.length).toBeGreaterThan(50);
    }
  });

  it("no adapter-only agents exist (intern, explorer, thinker)", () => {
    expect(AGENT_NAMES).not.toContain("intern");
    expect(AGENT_NAMES).not.toContain("explorer");
    expect(AGENT_NAMES).not.toContain("thinker");
    expect(AGENT_NAMES).not.toContain("research");
    expect(AGENT_NAMES).not.toContain("research-claude");
    expect(AGENT_NAMES).not.toContain("research-bailian");
  });

  it("prompt getter returns string content (not undefined)", () => {
    for (const name of AGENT_NAMES) {
      const def = AGENT_DEFINITIONS[name];
      expect(typeof def!.prompt).toBe("string");
    }
  });
});

describe("tool registration", () => {
  it("no custom tool block registered (native OpenCode skill tool used instead)", () => {
    // OpenCode v1.3.0 has a native skill tool built-in that reads SKILL.md files.
    // The adapter no longer registers a custom skill tool — it relies on the native one.
    // The `tool` key should either be absent or an empty object.
    const tools = hooks["tool"] as Record<string, unknown> | undefined;
    if (tools !== undefined) {
      expect(Object.keys(tools).length).toBe(0);
    } else {
      expect(tools).toBeUndefined();
    }
  });
});

describe("healthCheck", () => {
  it("returns status ok", () => {
    const result = healthCheck();
    expect(result.status).toBe("ok");
  });

  it("returns plugin name", () => {
    const result = healthCheck();
    expect(result.plugin).toBe("pai-adapter");
  });

  it("returns version", () => {
    const result = healthCheck();
    expect(result.version).toBe("0.10.0");
  });
});

describe("error isolation — hooks do not throw on malformed input", () => {
  it("permission.ask does not throw on empty input", async () => {
    const fn = hooks["permission.ask"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(fn({}, {})).resolves.toBeUndefined();
  });

  it("tool.execute.before does not throw on empty input", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(fn({}, {})).resolves.toBeUndefined();
  });

  it("tool.execute.after does not throw on empty input", async () => {
    const fn = hooks["tool.execute.after"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(fn({}, {})).resolves.toBeUndefined();
  });

  it("chat.message does not throw on empty input", async () => {
    const fn = hooks["chat.message"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(fn({}, {})).resolves.toBeUndefined();
  });

  it("experimental.session.compacting does not throw on empty input", async () => {
    const fn = hooks["experimental.session.compacting"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(fn({}, {})).resolves.toBeUndefined();
  });

  it("event does not throw on unknown event type", async () => {
    const fn = hooks["event"] as (i: unknown) => Promise<void>;
    await expect(fn({ event: { type: "totally.unknown.event", sessionId: "x" } })).resolves.toBeUndefined();
  });

  it("event does not throw on session.idle", async () => {
    const fn = hooks["event"] as (i: unknown) => Promise<void>;
    await expect(fn({ event: { type: "session.idle", sessionId: "x", durationMs: 60000 } })).resolves.toBeUndefined();
  });

  it("event does not throw on session.compacted", async () => {
    const fn = hooks["event"] as (i: unknown) => Promise<void>;
    await expect(fn({ event: { type: "session.compacted", sessionId: "x" } })).resolves.toBeUndefined();
  });

  it("event does not throw on session.end", async () => {
    const fn = hooks["event"] as (i: unknown) => Promise<void>;
    await expect(fn({ event: { type: "session.end", sessionId: "x" } })).resolves.toBeUndefined();
  });

  it("event does not throw on session.start", async () => {
    const fn = hooks["event"] as (i: unknown) => Promise<void>;
    await expect(fn({ event: { type: "session.start", sessionId: "test-event-start" } })).resolves.toBeUndefined();
  });
});

describe("hook behavior", () => {
  it("hooks are async (return promises)", async () => {
    const fn = hooks["permission.ask"] as (i: unknown, o: unknown) => unknown;
    const result = fn({}, {});
    expect(result).toBeInstanceOf(Promise);
  });

  it("experimental.chat.system.transform is async", async () => {
    const fn = hooks["experimental.chat.system.transform"] as (i: unknown, o: unknown) => unknown;
    const result = fn({}, { system: [] });
    expect(result).toBeInstanceOf(Promise);
  });
});

describe("permission.ask — external_directory auto-allow", () => {
  const home = process.env.HOME ?? "";
  const fn = () => hooks["permission.ask"] as (i: unknown, o: unknown) => Promise<void>;

  it("auto-allows ~/.claude/ paths", async () => {
    const output: { status?: string } = {};
    await fn()({ permission: "external_directory", patterns: [`${home}/.claude/PAI/Algorithm/*`] }, output);
    expect(output.status).toBe("allow");
  });

  it("auto-allows ~/.config/opencode/ paths", async () => {
    const output: { status?: string } = {};
    await fn()({ permission: "external_directory", patterns: [`${home}/.config/opencode/agents/*`] }, output);
    expect(output.status).toBe("allow");
  });

  it("auto-allows ~/.config/opencode/ root path", async () => {
    const output: { status?: string } = {};
    await fn()({ permission: "external_directory", patterns: [`${home}/.config/opencode/*`] }, output);
    expect(output.status).toBe("allow");
  });

  it("does NOT auto-allow unknown external directories", async () => {
    const output: { status?: string } = {};
    await fn()({ permission: "external_directory", patterns: ["/tmp/some-random-dir/*"] }, output);
    expect(output.status).toBeUndefined();
  });

  it("does NOT auto-allow if ANY pattern is outside PAI paths", async () => {
    const output: { status?: string } = {};
    await fn()({
      permission: "external_directory",
      patterns: [`${home}/.claude/PAI/*`, "/etc/shadow/*"],
    }, output);
    expect(output.status).not.toBe("allow");
  });

  it("does not interfere with empty patterns array", async () => {
    const output: { status?: string } = {};
    await fn()({ permission: "external_directory", patterns: [] }, output);
    expect(output.status).toBeUndefined();
  });
});

describe("skill invocation logging", () => {
  it("tool.execute.before does not throw when tool is 'skill'", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({ tool: "skill", sessionID: "test-skill-session", args: { name: "Research" } }, {}),
    ).resolves.toBeUndefined();
  });

  it("tool.execute.before does not throw when tool is 'Skill' (capitalized)", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({ tool: "Skill", sessionID: "test-skill-session", args: { name: "FirstPrinciples" } }, {}),
    ).resolves.toBeUndefined();
  });

  it("tool.execute.after does not throw when tool is 'skill'", async () => {
    const fn = hooks["tool.execute.after"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({ tool: "skill", sessionID: "test-skill-session", args: { name: "Research" } }, {}),
    ).resolves.toBeUndefined();
  });

  it("tool.execute.after does not throw when tool is 'Skill' (capitalized)", async () => {
    const fn = hooks["tool.execute.after"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({ tool: "Skill", sessionID: "test-skill-session", args: { name: "Council" } }, {}),
    ).resolves.toBeUndefined();
  });

  it("skill logging handles missing args gracefully", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({ tool: "skill", sessionID: "test-skill-session" }, {}),
    ).resolves.toBeUndefined();
  });

  it("skill logging handles empty args gracefully", async () => {
    const fn = hooks["tool.execute.after"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({ tool: "skill", sessionID: "test-skill-session", args: {} }, {}),
    ).resolves.toBeUndefined();
  });
});

describe("task invocation logging", () => {
  afterEach(() => {
    // Clean up pending spawns created by Task tool.execute.before calls
    _pendingSubagentSpawnsForTest.delete("test-task-session");
  });

  it("tool.execute.before does not throw when tool is 'task'", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({
        tool: "task",
        sessionID: "test-task-session",
        args: { subagent_type: "engineer", description: "Build feature X" },
      }, {}),
    ).resolves.toBeUndefined();
  });

  it("tool.execute.before does not throw when tool is 'Task' (capitalized)", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({
        tool: "Task",
        sessionID: "test-task-session",
        args: { subagent_type: "research", description: "Research topic" },
      }, {}),
    ).resolves.toBeUndefined();
  });

  it("tool.execute.after does not throw when tool is 'task'", async () => {
    const fn = hooks["tool.execute.after"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({
        tool: "task",
        sessionID: "test-task-session",
        args: { subagent_type: "thinker", description: "Analyze approach" },
      }, {}),
    ).resolves.toBeUndefined();
  });

  it("tool.execute.after does not throw when tool is 'Task' (capitalized)", async () => {
    const fn = hooks["tool.execute.after"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({
        tool: "Task",
        sessionID: "test-task-session",
        args: { subagent_type: "explorer", description: "Explore codebase" },
      }, {}),
    ).resolves.toBeUndefined();
  });

  it("task logging handles missing args gracefully", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({ tool: "Task", sessionID: "test-task-session" }, {}),
    ).resolves.toBeUndefined();
  });

  it("task logging handles empty args gracefully", async () => {
    const fn = hooks["tool.execute.after"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({ tool: "task", sessionID: "test-task-session", args: {} }, {}),
    ).resolves.toBeUndefined();
  });

  it("non-skill non-task tools do not trigger skill-tracker logging (no throw)", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    await expect(
      fn({ tool: "bash", sessionID: "test-session", args: { command: "ls" } }, {}),
    ).resolves.toBeUndefined();
  });
});

describe("subagent Task tool blocking", () => {
  const subagentSid = "test-subagent-block-session";

  beforeAll(() => {
    // Register the session as a subagent
    _subagentSessionsForTest.add(subagentSid);
  });

  afterAll(() => {
    _subagentSessionsForTest.delete(subagentSid);
    // Clean up pending spawns from Task tool tests
    _pendingSubagentSpawnsForTest.delete("primary-session-xyz");
    _pendingSubagentSpawnsForTest.delete(subagentSid);
  });

  it("allows Task tool for subagent session (registers pending spawn)", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    const output: { block?: boolean; reason?: string } = {};
    await fn(
      { tool: "Task", sessionID: subagentSid, args: { subagent_type: "explorer", description: "test" } },
      output,
    );
    expect(output.block).toBeUndefined();
    // Should register a pending spawn since Task is now allowed for subagents
    const pending = _pendingSubagentSpawnsForTest.get(subagentSid);
    expect(pending).toBeDefined();
    expect(pending!.length).toBeGreaterThanOrEqual(1);
    // Clean up
    _pendingSubagentSpawnsForTest.delete(subagentSid);
  });

  it("allows task tool (lowercase) for subagent session", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    const output: { block?: boolean; reason?: string } = {};
    await fn(
      { tool: "task", sessionID: subagentSid, args: { subagent_type: "intern" } },
      output,
    );
    expect(output.block).toBeUndefined();
    // Clean up
    _pendingSubagentSpawnsForTest.delete(subagentSid);
  });

  it("does NOT block Skill tool for subagent session", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    const output: { block?: boolean; reason?: string } = {};
    await fn(
      { tool: "Skill", sessionID: subagentSid, args: { name: "Research" } },
      output,
    );
    expect(output.block).toBeUndefined();
  });

  it("does NOT block skill tool (lowercase) for subagent session", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    const output: { block?: boolean; reason?: string } = {};
    await fn(
      { tool: "skill", sessionID: subagentSid, args: { name: "FirstPrinciples" } },
      output,
    );
    expect(output.block).toBeUndefined();
  });

  it("Task from subagent session registers pending spawn for sub-subagent detection", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    const output: { block?: boolean; reason?: string } = {};
    await fn(
      { tool: "Task", sessionID: subagentSid, args: { subagent_type: "explorer" } },
      output,
    );
    // Task is now allowed for subagents — no block
    expect(output.block).toBeUndefined();
    // Pending spawn should be registered for sub-subagent tracking
    const pending = _pendingSubagentSpawnsForTest.get(subagentSid);
    expect(pending).toBeDefined();
    expect(pending!.length).toBeGreaterThanOrEqual(1);
    expect(pending![0]!.subagentType).toBe("explorer");
    // Clean up
    _pendingSubagentSpawnsForTest.delete(subagentSid);
  });

  it("does NOT block Task tool for primary (non-subagent) session", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    const output: { block?: boolean; reason?: string } = {};
    await fn(
      { tool: "Task", sessionID: "primary-session-xyz", args: { subagent_type: "engineer" } },
      output,
    );
    expect(output.block).toBeUndefined();
  });

  it("does NOT block bash tool for subagent session (non-voice)", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    const output: { block?: boolean; reason?: string } = {};
    await fn(
      { tool: "bash", sessionID: subagentSid, args: { command: "ls -la" } },
      output,
    );
    expect(output.block).toBeUndefined();
  });
});

describe("subagent preamble injection in system.transform", () => {
  const subagentSid = "test-subagent-preamble-session";

  beforeAll(() => {
    _subagentSessionsForTest.add(subagentSid);
  });

  afterAll(() => {
    _subagentSessionsForTest.delete(subagentSid);
  });

  it("subagent session receives preamble in output.system", async () => {
    const fn = hooks["experimental.chat.system.transform"] as (i: unknown, o: unknown) => Promise<void>;
    const output = { system: [] as string[] };
    await fn({ sessionID: subagentSid, model: "test-model" }, output);
    const combined = output.system.join("\n");
    expect(combined).toContain("You Are a Subagent");
  });

  it("primary session does NOT receive preamble", async () => {
    const fn = hooks["experimental.chat.system.transform"] as (i: unknown, o: unknown) => Promise<void>;
    const output = { system: [] as string[] };
    await fn({ sessionID: "primary-session-no-preamble", model: "test-model" }, output);
    const combined = output.system.join("\n");
    expect(combined).not.toContain("You Are a Subagent");
  });

  it("preamble appears before PAI context in output.system", async () => {
    const fn = hooks["experimental.chat.system.transform"] as (i: unknown, o: unknown) => Promise<void>;
    const output = { system: [] as string[] };
    await fn({ sessionID: subagentSid, model: "test-model" }, output);
    // Preamble should be the first element that contains "Subagent"
    const preambleIdx = output.system.findIndex(s => s.includes("You Are a Subagent"));
    expect(preambleIdx).toBeGreaterThanOrEqual(0);
    // Any Algorithm context should come after
    const algoIdx = output.system.findIndex(s => s.includes("Algorithm"));
    if (algoIdx >= 0) {
      expect(preambleIdx).toBeLessThan(algoIdx);
    }
  });
});

describe("Task-call timing registry — subagent detection", () => {
  const toolBeforeFn = () => hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
  const eventFn = () => hooks["event"] as (i: unknown) => Promise<void>;

  afterEach(() => {
    // Clean up all test sessions introduced by this describe block
    const testSessionPrefixes = [
      "primary-timing-test",
      "primary-timing-abc",
      "primary-timing-multi",
      "primary-timing-fifo",
    ];
    for (const prefix of testSessionPrefixes) {
      _pendingSubagentSpawnsForTest.delete(prefix);
      _subagentSessionsForTest.delete(prefix);
    }
    _subagentSessionsForTest.delete("spawned-sub-123");
    _subagentSessionsForTest.delete("spawned-sub-456");
    _subagentSessionsForTest.delete("spawned-fifo-1");
    _subagentSessionsForTest.delete("spawned-fifo-2");
  });

  it("Task tool.execute.before registers pending spawn for primary session", async () => {
    await toolBeforeFn()(
      { tool: "Task", sessionID: "primary-timing-test", args: { subagent_type: "engineer" } },
      {},
    );
    const pending = _pendingSubagentSpawnsForTest.get("primary-timing-test");
    expect(pending).toBeDefined();
    expect(Array.isArray(pending)).toBe(true);
    expect(pending!.length).toBeGreaterThanOrEqual(1);
  });

  it("session.created after Task call registers new session as subagent", async () => {
    // Fire Task from primary session
    await toolBeforeFn()(
      { tool: "Task", sessionID: "primary-timing-abc", args: { subagent_type: "engineer" } },
      {},
    );
    // Fire session.created for the newly spawned session
    await eventFn()({
      event: {
        type: "session.created",
        properties: { info: { id: "spawned-sub-123" } },
      },
    });
    expect(_subagentSessionsForTest.has("spawned-sub-123")).toBe(true);
  });

  it("pending spawn entry is consumed after matching", async () => {
    // Clean up any stale state first
    _pendingSubagentSpawnsForTest.delete("primary-timing-abc");
    // Fire Task from primary session to queue a pending spawn
    await toolBeforeFn()(
      { tool: "Task", sessionID: "primary-timing-abc", args: { subagent_type: "engineer" } },
      {},
    );
    // Fire session.created to consume it
    await eventFn()({
      event: {
        type: "session.created",
        properties: { info: { id: "spawned-sub-456" } },
      },
    });
    // The entry should be consumed (queue empty or key removed)
    const pending = _pendingSubagentSpawnsForTest.get("primary-timing-abc");
    const isEmpty = pending === undefined || pending.length === 0;
    expect(isEmpty).toBe(true);
  });

  it("Task from subagent session DOES register pending spawn (for sub-subagent detection)", async () => {
    const subSid = "test-subagent-pending-spawn";
    _subagentSessionsForTest.add(subSid);
    try {
      await toolBeforeFn()(
        { tool: "Task", sessionID: subSid, args: { subagent_type: "explorer" } },
        {},
      );
      // Subagent Task calls now register pending spawns for sub-subagent tracking
      const pending = _pendingSubagentSpawnsForTest.get(subSid);
      expect(pending).toBeDefined();
      expect(pending!.length).toBe(1);
      expect(pending![0]!.subagentType).toBe("explorer");
    } finally {
      _subagentSessionsForTest.delete(subSid);
      _pendingSubagentSpawnsForTest.delete(subSid);
    }
  });

  it("multiple Task calls queue multiple pending spawns", async () => {
    await toolBeforeFn()(
      { tool: "Task", sessionID: "primary-timing-multi", args: { subagent_type: "engineer" } },
      {},
    );
    await toolBeforeFn()(
      { tool: "Task", sessionID: "primary-timing-multi", args: { subagent_type: "explorer" } },
      {},
    );
    const pending = _pendingSubagentSpawnsForTest.get("primary-timing-multi");
    expect(pending).toBeDefined();
    expect(pending!.length).toBe(2);
  });

  it("multiple spawned sessions consume pending spawns in FIFO order", async () => {
    // Queue two pending spawns from the same primary session
    await toolBeforeFn()(
      { tool: "Task", sessionID: "primary-timing-fifo", args: { subagent_type: "engineer" } },
      {},
    );
    await toolBeforeFn()(
      { tool: "Task", sessionID: "primary-timing-fifo", args: { subagent_type: "explorer" } },
      {},
    );
    // Two session.created events consume both pending entries
    await eventFn()({
      event: {
        type: "session.created",
        properties: { info: { id: "spawned-fifo-1" } },
      },
    });
    await eventFn()({
      event: {
        type: "session.created",
        properties: { info: { id: "spawned-fifo-2" } },
      },
    });
    expect(_subagentSessionsForTest.has("spawned-fifo-1")).toBe(true);
    expect(_subagentSessionsForTest.has("spawned-fifo-2")).toBe(true);
  });
});

describe("Task-call timing registry — spawn expiry", () => {
  const eventFn = () => hooks["event"] as (i: unknown) => Promise<void>;

  afterEach(() => {
    _pendingSubagentSpawnsForTest.delete("primary-expired-test");
    _pendingSubagentSpawnsForTest.delete("primary-fresh-test");
    _subagentSessionsForTest.delete("session-after-expired");
    _subagentSessionsForTest.delete("session-after-fresh");
  });

  it("expired pending spawn is NOT matched to session.created", async () => {
    // Manually inject a spawn entry that is already past the 30s timeout
    const expiredTimestamp = Date.now() - (_SPAWN_TIMEOUT_MS_FOR_TEST + 1000);
    _pendingSubagentSpawnsForTest.set("primary-expired-test", [{ timestamp: expiredTimestamp, subagentType: "engineer", description: "expired test" }]);

    await eventFn()({
      event: {
        type: "session.created",
        properties: { info: { id: "session-after-expired" } },
      },
    });

    // The expired entry should NOT have caused the new session to be registered as a subagent
    expect(_subagentSessionsForTest.has("session-after-expired")).toBe(false);
  });

  it("non-expired pending spawn IS matched to session.created", async () => {
    // Manually inject a spawn entry that is within the timeout window (1s ago)
    const recentTimestamp = Date.now() - 1000;
    _pendingSubagentSpawnsForTest.set("primary-fresh-test", [{ timestamp: recentTimestamp, subagentType: "engineer", description: "fresh test" }]);

    await eventFn()({
      event: {
        type: "session.created",
        properties: { info: { id: "session-after-fresh" } },
      },
    });

    // The fresh entry SHOULD have caused the new session to be registered as a subagent
    expect(_subagentSessionsForTest.has("session-after-fresh")).toBe(true);
  });
});

// ── Concurrency Guard Tests ─────────────────────────────────

describe("max concurrent subagent guard", () => {
  const toolBeforeFn = () => hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
  const eventFn = () => hooks["event"] as (i: unknown) => Promise<void>;
  const parentSid = "primary-concurrency-test";

  afterEach(() => {
    // Clean up all tracking entries created by these tests
    _pendingSubagentSpawnsForTest.delete(parentSid);
    for (const sid of ["conc-sub-1", "conc-sub-2", "conc-sub-3"]) {
      _subagentSessionsForTest.delete(sid);
      _subagentTrackingForTest.delete(sid);
    }
  });

  it("allows first two Task calls from the same session", async () => {
    // First Task call
    const output1: Record<string, unknown> = {};
    await toolBeforeFn()(
      { tool: "Task", sessionID: parentSid, args: { subagent_type: "engineer", description: "Build feature" } },
      output1,
    );
    expect(output1.block).toBeUndefined();

    // Simulate the first subagent being created
    await eventFn()({
      event: { type: "session.created", properties: { info: { id: "conc-sub-1" } } },
    });
    expect(_subagentTrackingForTest.has("conc-sub-1")).toBe(true);

    // Second Task call
    const output2: Record<string, unknown> = {};
    await toolBeforeFn()(
      { tool: "Task", sessionID: parentSid, args: { subagent_type: "explorer", description: "Search codebase" } },
      output2,
    );
    expect(output2.block).toBeUndefined();

    // Simulate the second subagent being created
    await eventFn()({
      event: { type: "session.created", properties: { info: { id: "conc-sub-2" } } },
    });
    expect(_subagentTrackingForTest.has("conc-sub-2")).toBe(true);
  });

  it("blocks third Task call when two subagents are already active for the same parent", async () => {
    // Set up two active subagents for the parent session
    _subagentTrackingForTest.set("conc-sub-1", {
      parentSessionId: parentSid,
      subagentType: "engineer",
      description: "Build feature",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _subagentTrackingForTest.set("conc-sub-2", {
      parentSessionId: parentSid,
      subagentType: "explorer",
      description: "Search codebase",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });

    // Third Task call should be blocked
    const output3: Record<string, unknown> = {};
    await toolBeforeFn()(
      { tool: "Task", sessionID: parentSid, args: { subagent_type: "thinker", description: "Analyze approach" } },
      output3,
    );
    expect(output3.block).toBe(true);
    expect(typeof output3.reason).toBe("string");
    expect((output3.reason as string)).toContain("Max concurrent subagent limit");
    expect((output3.reason as string)).toContain("known OpenCode bug");
  });

  it("does NOT block Task calls from a different session even if another session has 2 active", async () => {
    // Set up two active subagents for the parent session
    _subagentTrackingForTest.set("conc-sub-1", {
      parentSessionId: parentSid,
      subagentType: "engineer",
      description: "Build feature",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _subagentTrackingForTest.set("conc-sub-2", {
      parentSessionId: parentSid,
      subagentType: "explorer",
      description: "Search codebase",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });

    // Task call from a DIFFERENT session should NOT be blocked
    const otherSid = "other-session-conc-test";
    const output: Record<string, unknown> = {};
    await toolBeforeFn()(
      { tool: "Task", sessionID: otherSid, args: { subagent_type: "intern", description: "Simple task" } },
      output,
    );
    expect(output.block).toBeUndefined();

    // Clean up
    _pendingSubagentSpawnsForTest.delete(otherSid);
  });

  it("allows Task call after a subagent completes (session.end reduces count)", async () => {
    // Set up two active subagents
    _subagentTrackingForTest.set("conc-sub-1", {
      parentSessionId: parentSid,
      subagentType: "engineer",
      description: "Build feature",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _subagentTrackingForTest.set("conc-sub-2", {
      parentSessionId: parentSid,
      subagentType: "explorer",
      description: "Search codebase",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _subagentSessionsForTest.add("conc-sub-1");

    // Simulate first subagent ending
    await eventFn()({
      event: { type: "session.end", properties: { sessionID: "conc-sub-1" } },
    });

    // Now only 1 active subagent — the next Task call should succeed
    const output: Record<string, unknown> = {};
    await toolBeforeFn()(
      { tool: "Task", sessionID: parentSid, args: { subagent_type: "thinker", description: "Analyze" } },
      output,
    );
    expect(output.block).toBeUndefined();
  });

});

// ── Enhanced Error Detection Tests ──────────────────────────

describe("enhanced error detection — provider errors in Task output body", () => {
  const toolAfterFn = () => hooks["tool.execute.after"] as (i: unknown, o: unknown) => Promise<void>;

  it("does not throw when Task output body contains a rate limit error", async () => {
    await expect(
      toolAfterFn()(
        {
          tool: "Task",
          sessionID: "test-error-detect-1",
          args: { subagent_type: "explorer", description: "Research topic" },
        },
        { result: "Error: 429 Too many requests - rate limit exceeded for model" },
      ),
    ).resolves.toBeUndefined();
  });

  it("does not throw when Task output body contains an overloaded error", async () => {
    await expect(
      toolAfterFn()(
        {
          tool: "Task",
          sessionID: "test-error-detect-2",
          args: { subagent_type: "engineer", description: "Build feature" },
        },
        { error: "server overloaded, please retry later" },
      ),
    ).resolves.toBeUndefined();
  });

  it("does not throw when Task output body contains model not found", async () => {
    await expect(
      toolAfterFn()(
        {
          tool: "task",
          sessionID: "test-error-detect-3",
          args: { subagent_type: "intern" },
        },
        { message: "model not found: github-copilot/nonexistent-model" },
      ),
    ).resolves.toBeUndefined();
  });

  it("does not throw when Task output body contains provider unavailable", async () => {
    await expect(
      toolAfterFn()(
        {
          tool: "Task",
          sessionID: "test-error-detect-4",
          args: { subagent_type: "architect" },
        },
        { status: 503, body: "service unavailable" },
      ),
    ).resolves.toBeUndefined();
  });

  it("does not throw when output has no errors (normal Task completion)", async () => {
    await expect(
      toolAfterFn()(
        {
          tool: "Task",
          sessionID: "test-error-detect-5",
          args: { subagent_type: "explorer", description: "Explore codebase" },
        },
        { result: "Successfully explored the codebase and found 12 relevant files." },
      ),
    ).resolves.toBeUndefined();
  });

  it("does not throw for non-Task tools even with error-like output", async () => {
    await expect(
      toolAfterFn()(
        {
          tool: "bash",
          sessionID: "test-error-detect-6",
          args: { command: "curl http://localhost" },
        },
        { error: "connection refused" },
      ),
    ).resolves.toBeUndefined();
  });
});

// ── Subagent Activity Tracking Tests ────────────────────────

describe("subagent activity tracking — lastActivityAt updates", () => {
  const toolBeforeFn = () => hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
  const toolAfterFn = () => hooks["tool.execute.after"] as (i: unknown, o: unknown) => Promise<void>;
  const eventFn = () => hooks["event"] as (i: unknown) => Promise<void>;
  const primarySid = "primary-activity-test";
  const subSid = "sub-activity-test-1";

  beforeEach(async () => {
    // Set up: spawn a subagent via the timing registry
    await toolBeforeFn()(
      { tool: "Task", sessionID: primarySid, args: { subagent_type: "engineer", description: "Build" } },
      {},
    );
    await eventFn()({
      event: { type: "session.created", properties: { info: { id: subSid } } },
    });
  });

  afterEach(() => {
    _subagentSessionsForTest.delete(subSid);
    _subagentTrackingForTest.delete(subSid);
    _pendingSubagentSpawnsForTest.delete(primarySid);
  });

  it("registers SubagentTrackingInfo on session.created for spawned subagent", () => {
    const tracking = _subagentTrackingForTest.get(subSid);
    expect(tracking).toBeDefined();
    expect(tracking!.parentSessionId).toBe(primarySid);
    expect(tracking!.subagentType).toBe("engineer");
    expect(tracking!.description).toBe("Build");
    expect(tracking!.stallWarned).toBe(false);
  });

  it("sets spawnedAt and lastActivityAt to approximately now on creation", () => {
    const tracking = _subagentTrackingForTest.get(subSid);
    expect(tracking).toBeDefined();
    const now = Date.now();
    // Should be within 5 seconds of now
    expect(Math.abs(tracking!.spawnedAt - now)).toBeLessThan(5000);
    expect(Math.abs(tracking!.lastActivityAt - now)).toBeLessThan(5000);
  });

  it("updates lastActivityAt on tool.execute.after for subagent session", async () => {
    const trackingBefore = _subagentTrackingForTest.get(subSid);
    expect(trackingBefore).toBeDefined();
    const initialActivity = trackingBefore!.lastActivityAt;

    // Simulate a small delay then tool execution
    await new Promise((r) => setTimeout(r, 10));

    await toolAfterFn()(
      { tool: "Read", sessionID: subSid, args: { filePath: "/tmp/test" } },
      { content: "file contents" },
    );

    const trackingAfter = _subagentTrackingForTest.get(subSid);
    expect(trackingAfter!.lastActivityAt).toBeGreaterThanOrEqual(initialActivity);
  });

  it("does NOT create tracking for primary (non-subagent) sessions on tool.execute.after", async () => {
    await toolAfterFn()(
      { tool: "Read", sessionID: "primary-no-tracking", args: {} },
      {},
    );
    expect(_subagentTrackingForTest.has("primary-no-tracking")).toBe(false);
  });
});

// ── Stall Detection Tests ───────────────────────────────────

describe("stall detection — getStalledSubagentWarnings", () => {
  const primarySid = "primary-stall-test";

  afterEach(() => {
    // Clean up all stall test sessions
    for (const [sid] of _subagentTrackingForTest.entries()) {
      if (sid.startsWith("sub-stall-")) {
        _subagentTrackingForTest.delete(sid);
        _subagentSessionsForTest.delete(sid);
      }
    }
  });

  it("returns null when no subagents are tracked for the primary session", () => {
    const result = _getStalledSubagentWarningsForTest("nonexistent-primary");
    expect(result).toBeNull();
  });

  it("returns null when subagent is still active (within timeout)", () => {
    _subagentTrackingForTest.set("sub-stall-active", {
      parentSessionId: primarySid,
      subagentType: "engineer",
      description: "Build feature",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(), // Active right now
      stallWarned: false,
    });

    const result = _getStalledSubagentWarningsForTest(primarySid);
    expect(result).toBeNull();
  });

  it("returns warning when subagent is inactive beyond STALL_TIMEOUT_MS", () => {
    const stalledTime = Date.now() - (_STALL_TIMEOUT_MS_FOR_TEST + 1000);
    _subagentTrackingForTest.set("sub-stall-inactive", {
      parentSessionId: primarySid,
      subagentType: "explorer",
      description: "Explore codebase structure",
      spawnedAt: stalledTime - 10_000,
      lastActivityAt: stalledTime,
      stallWarned: false,
    });

    const result = _getStalledSubagentWarningsForTest(primarySid);
    expect(result).not.toBeNull();
    expect(result).toContain("Stalled Subagent Detected");
    expect(result).toContain("explorer");
    expect(result).toContain("Explore codebase structure");
    expect(result).toContain("Action Required");
    expect(result).toContain("Do NOT wait");
  });

  it("sets stallWarned to true after warning once", () => {
    const stalledTime = Date.now() - (_STALL_TIMEOUT_MS_FOR_TEST + 1000);
    _subagentTrackingForTest.set("sub-stall-warn-once", {
      parentSessionId: primarySid,
      subagentType: "intern",
      description: "Simple task",
      spawnedAt: stalledTime - 10_000,
      lastActivityAt: stalledTime,
      stallWarned: false,
    });

    // First call should warn
    const first = _getStalledSubagentWarningsForTest(primarySid);
    expect(first).not.toBeNull();

    // Second call should NOT warn again
    const second = _getStalledSubagentWarningsForTest(primarySid);
    expect(second).toBeNull();

    // Verify stallWarned is set
    const tracking = _subagentTrackingForTest.get("sub-stall-warn-once");
    expect(tracking!.stallWarned).toBe(true);

    // Clean up
    _subagentTrackingForTest.delete("sub-stall-warn-once");
  });

  it("does not warn about subagents belonging to a different primary session", () => {
    const stalledTime = Date.now() - (_STALL_TIMEOUT_MS_FOR_TEST + 1000);
    _subagentTrackingForTest.set("sub-stall-other-parent", {
      parentSessionId: "some-other-primary",
      subagentType: "thinker",
      description: "Deep analysis",
      spawnedAt: stalledTime - 10_000,
      lastActivityAt: stalledTime,
      stallWarned: false,
    });

    const result = _getStalledSubagentWarningsForTest(primarySid);
    expect(result).toBeNull();

    // Clean up
    _subagentTrackingForTest.delete("sub-stall-other-parent");
  });

  it("includes warnings for multiple stalled subagents", () => {
    const stalledTime = Date.now() - (_STALL_TIMEOUT_MS_FOR_TEST + 1000);

    _subagentTrackingForTest.set("sub-stall-multi-1", {
      parentSessionId: primarySid,
      subagentType: "engineer",
      description: "Build component A",
      spawnedAt: stalledTime - 10_000,
      lastActivityAt: stalledTime,
      stallWarned: false,
    });
    _subagentTrackingForTest.set("sub-stall-multi-2", {
      parentSessionId: primarySid,
      subagentType: "explorer",
      description: "Search for patterns",
      spawnedAt: stalledTime - 10_000,
      lastActivityAt: stalledTime,
      stallWarned: false,
    });

    const result = _getStalledSubagentWarningsForTest(primarySid);
    expect(result).not.toBeNull();
    expect(result).toContain("engineer");
    expect(result).toContain("explorer");
    expect(result).toContain("Build component A");
    expect(result).toContain("Search for patterns");

    // Clean up
    _subagentTrackingForTest.delete("sub-stall-multi-1");
    _subagentTrackingForTest.delete("sub-stall-multi-2");
  });
});

// ── Stall Warning Injection in system.transform ─────────────

describe("stall warning injection in experimental.chat.system.transform", () => {
  const systemTransformFn = () =>
    hooks["experimental.chat.system.transform"] as (i: unknown, o: unknown) => Promise<void>;
  const primarySid = "primary-stall-inject-test";

  afterEach(() => {
    for (const [sid] of _subagentTrackingForTest.entries()) {
      if (sid.startsWith("sub-stall-inject-")) {
        _subagentTrackingForTest.delete(sid);
        _subagentSessionsForTest.delete(sid);
      }
    }
  });

  it("injects stall warning into system prompt for primary session with stalled subagent", async () => {
    const stalledTime = Date.now() - (_STALL_TIMEOUT_MS_FOR_TEST + 1000);
    _subagentTrackingForTest.set("sub-stall-inject-1", {
      parentSessionId: primarySid,
      subagentType: "architect",
      description: "Design system",
      spawnedAt: stalledTime - 10_000,
      lastActivityAt: stalledTime,
      stallWarned: false,
    });

    const output = { system: [] as string[] };
    await systemTransformFn()({ sessionID: primarySid, model: "test-model" }, output);

    const combined = output.system.join("\n");
    expect(combined).toContain("Stalled Subagent Detected");
    expect(combined).toContain("architect");

    // Clean up
    _subagentTrackingForTest.delete("sub-stall-inject-1");
  });

  it("does NOT inject stall warning for subagent sessions (only primary)", async () => {
    const subSid = "sub-stall-inject-2";
    _subagentSessionsForTest.add(subSid);
    const stalledTime = Date.now() - (_STALL_TIMEOUT_MS_FOR_TEST + 1000);
    _subagentTrackingForTest.set("sub-stall-inject-nested", {
      parentSessionId: subSid,
      subagentType: "intern",
      description: "Nested task",
      spawnedAt: stalledTime - 10_000,
      lastActivityAt: stalledTime,
      stallWarned: false,
    });

    const output = { system: [] as string[] };
    await systemTransformFn()({ sessionID: subSid, model: "test-model" }, output);

    const combined = output.system.join("\n");
    // Stall warnings should NOT appear for subagent sessions
    expect(combined).not.toContain("Stalled Subagent Detected");

    // Clean up
    _subagentSessionsForTest.delete(subSid);
    _subagentTrackingForTest.delete("sub-stall-inject-nested");
  });

  it("does NOT inject stall warning when all subagents are active", async () => {
    _subagentTrackingForTest.set("sub-stall-inject-3", {
      parentSessionId: primarySid,
      subagentType: "engineer",
      description: "Active work",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(), // Active right now
      stallWarned: false,
    });

    const output = { system: [] as string[] };
    await systemTransformFn()({ sessionID: primarySid, model: "test-model" }, output);

    const combined = output.system.join("\n");
    expect(combined).not.toContain("Stalled Subagent Detected");

    // Clean up
    _subagentTrackingForTest.delete("sub-stall-inject-3");
  });
});

// ── Cleanup on session.end Tests ────────────────────────────

describe("session.end cleanup — subagent tracking state", () => {
  const eventFn = () => hooks["event"] as (i: unknown) => Promise<void>;
  const toolBeforeFn = () => hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;

  it("cleans up subagentTracking on session.end", async () => {
    const sid = "test-cleanup-tracking";
    // Manually add tracking info
    _subagentTrackingForTest.set(sid, {
      parentSessionId: "parent-x",
      subagentType: "engineer",
      description: "test",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _subagentSessionsForTest.add(sid);

    // Trigger session.end
    await eventFn()({
      event: { type: "session.end", properties: { sessionID: sid } },
    });

    expect(_subagentTrackingForTest.has(sid)).toBe(false);
    expect(_subagentSessionsForTest.has(sid)).toBe(false);
  });

  it("cleans up pendingSubagentSpawns on session.end", async () => {
    const sid = "test-cleanup-spawns";
    _pendingSubagentSpawnsForTest.set(sid, [
      { timestamp: Date.now(), subagentType: "engineer", description: "test" },
    ]);

    await eventFn()({
      event: { type: "session.end", properties: { sessionID: sid } },
    });

    expect(_pendingSubagentSpawnsForTest.has(sid)).toBe(false);
  });
});

// ── Subagent Tracking Registration on session.created ───────

describe("subagent tracking registration on session.created", () => {
  const toolBeforeFn = () => hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
  const eventFn = () => hooks["event"] as (i: unknown) => Promise<void>;
  const primarySid = "primary-tracking-reg-test";
  const subSid = "sub-tracking-reg-test";

  afterEach(() => {
    _subagentSessionsForTest.delete(subSid);
    _subagentTrackingForTest.delete(subSid);
    _pendingSubagentSpawnsForTest.delete(primarySid);
  });

  it("captures subagentType from Task args in tracking info", async () => {
    await toolBeforeFn()(
      {
        tool: "Task",
        sessionID: primarySid,
        args: { subagent_type: "architect", description: "Design the API" },
      },
      {},
    );
    await eventFn()({
      event: { type: "session.created", properties: { info: { id: subSid } } },
    });

    const tracking = _subagentTrackingForTest.get(subSid);
    expect(tracking).toBeDefined();
    expect(tracking!.subagentType).toBe("architect");
    expect(tracking!.description).toBe("Design the API");
    expect(tracking!.parentSessionId).toBe(primarySid);
  });

  it("captures description truncated to 80 chars in tracking info", async () => {
    const longDesc = "A".repeat(120);
    await toolBeforeFn()(
      {
        tool: "Task",
        sessionID: primarySid,
        args: { subagent_type: "explorer", description: longDesc },
      },
      {},
    );
    await eventFn()({
      event: { type: "session.created", properties: { info: { id: subSid } } },
    });

    const tracking = _subagentTrackingForTest.get(subSid);
    expect(tracking).toBeDefined();
    expect(tracking!.description.length).toBeLessThanOrEqual(80);
  });
});

// ── Reasoning Loop Detection Tests ──────────────────────────

describe("hashReasoningChunk — normalization", () => {
  it("produces identical hashes for text differing only in whitespace", () => {
    const a = _hashReasoningChunkForTest("Let me think about this problem carefully and methodically");
    const b = _hashReasoningChunkForTest("Let me  think  about  this  problem  carefully  and  methodically");
    expect(a).toBe(b);
  });

  it("produces identical hashes for text differing only in case", () => {
    const a = _hashReasoningChunkForTest("Let me think about this problem carefully and methodically");
    const b = _hashReasoningChunkForTest("LET ME THINK ABOUT THIS PROBLEM CAREFULLY AND METHODICALLY");
    expect(a).toBe(b);
  });

  it("produces identical hashes for text with leading/trailing whitespace", () => {
    const a = _hashReasoningChunkForTest("Let me think about this problem carefully and methodically");
    const b = _hashReasoningChunkForTest("  Let me think about this problem carefully and methodically  ");
    expect(a).toBe(b);
  });

  it("produces different hashes for meaningfully different text", () => {
    const a = _hashReasoningChunkForTest("Let me think about this problem carefully and methodically");
    const b = _hashReasoningChunkForTest("I should explore the codebase to find the relevant files first");
    expect(a).not.toBe(b);
  });

  it("returns a 12-character hex string", () => {
    const hash = _hashReasoningChunkForTest("Let me think about this problem carefully and methodically");
    expect(hash.length).toBe(12);
    expect(/^[0-9a-f]{12}$/.test(hash)).toBe(true);
  });
});

describe("recordReasoningChunk — loop detection logic", () => {
  const testSid = "sub-loop-record-test";

  afterEach(() => {
    _loopDetectionStateForTest.delete(testSid);
  });

  it("ignores chunks shorter than LOOP_CHUNK_MIN_LENGTH", () => {
    const result = _recordReasoningChunkForTest(testSid, "short");
    expect(result).toBe(false);
    expect(_loopDetectionStateForTest.has(testSid)).toBe(false);
  });

  it("creates state on first chunk for a new session", () => {
    const chunk = "A".repeat(_LOOP_CHUNK_MIN_LENGTH_FOR_TEST + 10);
    _recordReasoningChunkForTest(testSid, chunk);
    expect(_loopDetectionStateForTest.has(testSid)).toBe(true);
    expect(_loopDetectionStateForTest.get(testSid)!.hashes.length).toBe(1);
  });

  it("does NOT detect a loop with only 1-2 identical chunks", () => {
    const chunk = "Let me think about this problem carefully and methodically step by step";
    // Only 2 repetitions (below threshold of 3)
    const r1 = _recordReasoningChunkForTest(testSid, chunk);
    const r2 = _recordReasoningChunkForTest(testSid, chunk);
    expect(r1).toBe(false);
    expect(r2).toBe(false);
    expect(_loopDetectionStateForTest.get(testSid)!.loopDetected).toBe(false);
  });

  it("detects a loop when LOOP_REPEAT_THRESHOLD identical chunks are recorded", () => {
    const chunk = "Let me think about this problem carefully and methodically step by step";
    let detected = false;
    for (let i = 0; i < _LOOP_REPEAT_THRESHOLD_FOR_TEST; i++) {
      if (_recordReasoningChunkForTest(testSid, chunk)) detected = true;
    }
    expect(detected).toBe(true);
    expect(_loopDetectionStateForTest.get(testSid)!.loopDetected).toBe(true);
  });

  it("returns false after loop is already detected (no repeated true)", () => {
    const chunk = "Let me think about this problem carefully and methodically step by step";
    // Trigger detection
    for (let i = 0; i < _LOOP_REPEAT_THRESHOLD_FOR_TEST; i++) {
      _recordReasoningChunkForTest(testSid, chunk);
    }
    // Additional calls should return false
    const extra = _recordReasoningChunkForTest(testSid, chunk);
    expect(extra).toBe(false);
  });

  it("does NOT detect a loop when chunks are all different", () => {
    for (let i = 0; i < _LOOP_WINDOW_SIZE_FOR_TEST; i++) {
      const chunk = `Thinking about aspect number ${i} of the problem in great detail and depth`;
      const result = _recordReasoningChunkForTest(testSid, chunk);
      expect(result).toBe(false);
    }
    expect(_loopDetectionStateForTest.get(testSid)!.loopDetected).toBe(false);
  });

  it("maintains rolling window — old hashes are evicted", () => {
    // Fill window with unique chunks
    for (let i = 0; i < _LOOP_WINDOW_SIZE_FOR_TEST; i++) {
      _recordReasoningChunkForTest(
        testSid,
        `Unique reasoning chunk number ${i} with enough text to be above minimum`,
      );
    }
    const state = _loopDetectionStateForTest.get(testSid)!;
    expect(state.hashes.length).toBeLessThanOrEqual(_LOOP_WINDOW_SIZE_FOR_TEST);
  });
});

describe("getLoopingSubagentWarnings — warning generation", () => {
  const primarySid = "primary-loop-warn-test";
  const subSid = "sub-loop-warn-1";

  afterEach(() => {
    _subagentTrackingForTest.delete(subSid);
    _subagentSessionsForTest.delete(subSid);
    _loopDetectionStateForTest.delete(subSid);
  });

  it("returns null when no subagents have loops detected", () => {
    _subagentTrackingForTest.set(subSid, {
      parentSessionId: primarySid,
      subagentType: "engineer",
      description: "Build feature",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    // No loop detection state at all
    const result = _getLoopingSubagentWarningsForTest(primarySid);
    expect(result).toBeNull();
  });

  it("returns null when loop state exists but loopDetected is false", () => {
    _subagentTrackingForTest.set(subSid, {
      parentSessionId: primarySid,
      subagentType: "engineer",
      description: "Build feature",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _loopDetectionStateForTest.set(subSid, {
      hashes: ["abc123abc123"],
      loopDetected: false,
      loopWarned: false,
    });
    const result = _getLoopingSubagentWarningsForTest(primarySid);
    expect(result).toBeNull();
  });

  it("returns warning when loop is detected and not yet warned", () => {
    _subagentTrackingForTest.set(subSid, {
      parentSessionId: primarySid,
      subagentType: "thinker",
      description: "Analyze architecture",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _loopDetectionStateForTest.set(subSid, {
      hashes: ["aaa", "aaa", "aaa"],
      loopDetected: true,
      loopWarned: false,
    });

    const result = _getLoopingSubagentWarningsForTest(primarySid);
    expect(result).not.toBeNull();
    expect(result).toContain("Reasoning Loop Detected");
    expect(result).toContain("thinker");
    expect(result).toContain("Analyze architecture");
    expect(result).toContain("Action Required");
    expect(result).toContain("Cancel the stalled subagent");
  });

  it("sets loopWarned to true after warning once (warn-once)", () => {
    _subagentTrackingForTest.set(subSid, {
      parentSessionId: primarySid,
      subagentType: "explorer",
      description: "Search codebase",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _loopDetectionStateForTest.set(subSid, {
      hashes: ["bbb", "bbb", "bbb"],
      loopDetected: true,
      loopWarned: false,
    });

    // First call should warn
    const first = _getLoopingSubagentWarningsForTest(primarySid);
    expect(first).not.toBeNull();

    // Second call should NOT warn again
    const second = _getLoopingSubagentWarningsForTest(primarySid);
    expect(second).toBeNull();

    expect(_loopDetectionStateForTest.get(subSid)!.loopWarned).toBe(true);
  });

  it("does not warn about subagents belonging to a different primary", () => {
    _subagentTrackingForTest.set(subSid, {
      parentSessionId: "some-other-primary",
      subagentType: "intern",
      description: "Other task",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _loopDetectionStateForTest.set(subSid, {
      hashes: ["ccc", "ccc", "ccc"],
      loopDetected: true,
      loopWarned: false,
    });

    const result = _getLoopingSubagentWarningsForTest(primarySid);
    expect(result).toBeNull();
  });
});

describe("loop warning injection in experimental.chat.system.transform", () => {
  const systemTransformFn = () =>
    hooks["experimental.chat.system.transform"] as (i: unknown, o: unknown) => Promise<void>;
  const primarySid = "primary-loop-inject-test";
  const subSid = "sub-loop-inject-1";

  afterEach(() => {
    _subagentTrackingForTest.delete(subSid);
    _subagentSessionsForTest.delete(subSid);
    _loopDetectionStateForTest.delete(subSid);
  });

  it("injects loop warning into system prompt for primary session", async () => {
    _subagentTrackingForTest.set(subSid, {
      parentSessionId: primarySid,
      subagentType: "architect",
      description: "Design API",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _loopDetectionStateForTest.set(subSid, {
      hashes: ["ddd", "ddd", "ddd"],
      loopDetected: true,
      loopWarned: false,
    });

    const output = { system: [] as string[] };
    await systemTransformFn()({ sessionID: primarySid, model: "test-model" }, output);

    const combined = output.system.join("\n");
    expect(combined).toContain("Reasoning Loop Detected");
    expect(combined).toContain("architect");
  });

  it("does NOT inject loop warning for subagent sessions", async () => {
    _subagentSessionsForTest.add(subSid);
    _subagentTrackingForTest.set("sub-nested-loop", {
      parentSessionId: subSid,
      subagentType: "intern",
      description: "Nested task",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    _loopDetectionStateForTest.set("sub-nested-loop", {
      hashes: ["eee", "eee", "eee"],
      loopDetected: true,
      loopWarned: false,
    });

    const output = { system: [] as string[] };
    await systemTransformFn()({ sessionID: subSid, model: "test-model" }, output);

    const combined = output.system.join("\n");
    expect(combined).not.toContain("Reasoning Loop Detected");

    // Clean up
    _subagentTrackingForTest.delete("sub-nested-loop");
    _loopDetectionStateForTest.delete("sub-nested-loop");
  });

  it("does NOT inject loop warning when no loops detected", async () => {
    _subagentTrackingForTest.set(subSid, {
      parentSessionId: primarySid,
      subagentType: "engineer",
      description: "Active work",
      spawnedAt: Date.now(),
      lastActivityAt: Date.now(),
      stallWarned: false,
    });
    // No loop detection state

    const output = { system: [] as string[] };
    await systemTransformFn()({ sessionID: primarySid, model: "test-model" }, output);

    const combined = output.system.join("\n");
    expect(combined).not.toContain("Reasoning Loop Detected");
  });
});

describe("loop detection via message.part.updated event", () => {
  const eventFn = () => hooks["event"] as (i: unknown) => Promise<void>;
  const toolBeforeFn = () => hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
  const primarySid = "primary-loop-event-test";
  const subSid = "sub-loop-event-1";

  beforeEach(async () => {
    // Set up: spawn a subagent via the timing registry
    await toolBeforeFn()(
      { tool: "Task", sessionID: primarySid, args: { subagent_type: "thinker", description: "Think deeply" } },
      {},
    );
    await eventFn()({
      event: { type: "session.created", properties: { info: { id: subSid } } },
    });
  });

  afterEach(() => {
    _subagentSessionsForTest.delete(subSid);
    _subagentTrackingForTest.delete(subSid);
    _loopDetectionStateForTest.delete(subSid);
    _pendingSubagentSpawnsForTest.delete(primarySid);
  });

  it("processes message.part.updated with reasoning part for subagent session", async () => {
    const reasoningText = "I need to think about this more carefully, considering all the angles of the problem";
    await eventFn()({
      event: {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-1",
            sessionID: subSid,
            messageID: "msg-1",
            type: "reasoning",
            text: reasoningText,
            time: { start: Date.now() },
          },
        },
      },
    });

    // Loop detection state should be created
    expect(_loopDetectionStateForTest.has(subSid)).toBe(true);
    expect(_loopDetectionStateForTest.get(subSid)!.hashes.length).toBe(1);
  });

  it("ignores message.part.updated for non-reasoning part types", async () => {
    await eventFn()({
      event: {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-2",
            sessionID: subSid,
            messageID: "msg-2",
            type: "text",
            text: "Some output text that is definitely long enough to pass the minimum length check",
            time: { start: Date.now() },
          },
        },
      },
    });

    // No loop detection state should be created for text parts
    expect(_loopDetectionStateForTest.has(subSid)).toBe(false);
  });

  it("ignores message.part.updated for primary (non-subagent) sessions", async () => {
    await eventFn()({
      event: {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-3",
            sessionID: primarySid,
            messageID: "msg-3",
            type: "reasoning",
            text: "Primary session reasoning that is long enough to pass the minimum length check easily",
            time: { start: Date.now() },
          },
        },
      },
    });

    // No loop detection state for primary session
    expect(_loopDetectionStateForTest.has(primarySid)).toBe(false);
  });

  it("detects loop after repeated identical reasoning in message.part.updated events", async () => {
    const repeatedThought = "Let me reconsider this approach by going back to first principles and analyzing the requirements";

    for (let i = 0; i < _LOOP_REPEAT_THRESHOLD_FOR_TEST; i++) {
      await eventFn()({
        event: {
          type: "message.part.updated",
          properties: {
            part: {
              id: `part-loop-${i}`,
              sessionID: subSid,
              messageID: `msg-loop-${i}`,
              type: "reasoning",
              text: repeatedThought,
              time: { start: Date.now() },
            },
          },
        },
      });
    }

    expect(_loopDetectionStateForTest.get(subSid)!.loopDetected).toBe(true);
  });

  it("does not throw on malformed message.part.updated event", async () => {
    await expect(
      eventFn()({
        event: {
          type: "message.part.updated",
          properties: {},
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("does not throw on message.part.updated with missing text", async () => {
    await expect(
      eventFn()({
        event: {
          type: "message.part.updated",
          properties: {
            part: {
              id: "part-no-text",
              sessionID: subSid,
              messageID: "msg-no-text",
              type: "reasoning",
              // no text field
              time: { start: Date.now() },
            },
          },
        },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("session.end cleanup — loop detection state", () => {
  const eventFn = () => hooks["event"] as (i: unknown) => Promise<void>;

  it("cleans up loopDetectionState on session.end", async () => {
    const sid = "test-cleanup-loop";
    _loopDetectionStateForTest.set(sid, {
      hashes: ["abc", "abc", "abc"],
      loopDetected: true,
      loopWarned: true,
    });
    _subagentSessionsForTest.add(sid);

    await eventFn()({
      event: { type: "session.end", properties: { sessionID: sid } },
    });

    expect(_loopDetectionStateForTest.has(sid)).toBe(false);
    _subagentSessionsForTest.delete(sid);
  });
});
