import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import PaiPlugin, { healthCheck, _subagentSessionsForTest } from "../plugin/pai-unified.js";

// The plugin is now a function — call it once to get the hooks object
let hooks: Record<string, unknown>;

beforeAll(async () => {
  hooks = await PaiPlugin({});
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
});

describe("tool registration", () => {
  it("tool block is present", () => {
    const tools = hooks["tool"] as Record<string, unknown>;
    expect(typeof tools).toBe("object");
  });

  it("each tool has description and execute", () => {
    const tools = hooks["tool"] as Record<string, { description: string; execute: unknown }>;
    for (const tool of Object.values(tools)) {
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.execute).toBe("function");
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
    expect(result.version).toBe("0.7.0");
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
  });

  it("blocks Task tool for subagent session", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    const output: { block?: boolean; reason?: string } = {};
    await fn(
      { tool: "Task", sessionID: subagentSid, args: { subagent_type: "engineer", description: "test" } },
      output,
    );
    expect(output.block).toBe(true);
    expect(output.reason).toContain("Subagents cannot use");
  });

  it("blocks task tool (lowercase) for subagent session", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    const output: { block?: boolean; reason?: string } = {};
    await fn(
      { tool: "task", sessionID: subagentSid, args: { subagent_type: "explorer" } },
      output,
    );
    expect(output.block).toBe(true);
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

  it("blocked Task call returns helpful message mentioning Skill as alternative", async () => {
    const fn = hooks["tool.execute.before"] as (i: unknown, o: unknown) => Promise<void>;
    const output: { block?: boolean; reason?: string } = {};
    await fn(
      { tool: "Task", sessionID: subagentSid, args: { subagent_type: "thinker" } },
      output,
    );
    expect(output.reason).toContain("Skill tool");
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
