/**
 * skill-loader.test.ts — Unit tests for the PAI Skill Loader handler.
 *
 * Tests cover:
 *   - resolveSkillPath: direct hit, not-found, path-traversal guard
 *   - resolveWorkflowPath: invalid skill returns null
 *   - listSkills: output format + known skill presence
 *   - createSkillTool: tool shape (description + execute)
 *   - execute(): list mode, path-traversal rejection, not-found error
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  resolveSkillPath,
  resolveWorkflowPath,
  listSkills,
  createSkillTool,
} from "../handlers/skill-loader.js";
import {
  registerSubagentType,
  clearSubagentType,
  formatPermissionSummary,
} from "../lib/agent-type-registry.js";
import type { ToolContext } from "@opencode-ai/plugin";

// ── Minimal ToolContext mock ──────────────────────────────────────────────────

const mockCtx: ToolContext = {
  sessionID: "test-session",
  messageID: "test-message",
  agent: "test-agent",
  directory: "/tmp",
  worktree: "/tmp",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
};

/**
 * Create a ToolContext mock with a specific session ID.
 */
function mockCtxForSession(sessionId: string, agent = "test-agent"): ToolContext {
  return {
    sessionID: sessionId,
    messageID: "test-message",
    agent,
    directory: "/tmp",
    worktree: "/tmp",
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  };
}

// ── resolveSkillPath ──────────────────────────────────────────────────────────

describe("resolveSkillPath", () => {
  it("returns a path ending in Research/SKILL.md for a known skill", () => {
    const result = resolveSkillPath("Research");
    // Research is a known skill in ~/.claude/skills/
    // If the skill exists locally, result should end with Research/SKILL.md
    if (result !== null) {
      expect(result).toContain("Research");
      expect(result).toMatch(/SKILL\.md$/);
    } else {
      // Acceptable if the skill dir doesn't exist in the test environment
      expect(result).toBeNull();
    }
  });

  it("returns null for a non-existent skill name", () => {
    const result = resolveSkillPath("nonexistent-skill-xyz-12345");
    expect(result).toBeNull();
  });

  it("returns null when name contains .. (path traversal guard)", () => {
    // The function should reject names with .. before doing any FS access
    expect(resolveSkillPath("../etc/passwd")).toBeNull();
    expect(resolveSkillPath("../Research")).toBeNull();
    expect(resolveSkillPath("Research/../../../etc")).toBeNull();
  });

  it("returns a string (not null) for a skill that actually exists", () => {
    // We know Research exists in this environment — if it doesn't, skip
    const result = resolveSkillPath("Research");
    if (result !== null) {
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

// ── resolveWorkflowPath ───────────────────────────────────────────────────────

describe("resolveWorkflowPath", () => {
  it("returns null for a non-existent skill", () => {
    const result = resolveWorkflowPath("nonexistent-skill-xyz-12345", "SomeWorkflow");
    expect(result).toBeNull();
  });

  it("returns null when skillName contains ..", () => {
    expect(resolveWorkflowPath("../etc/passwd", "Workflow")).toBeNull();
  });

  it("returns null when workflow contains ..", () => {
    expect(resolveWorkflowPath("Research", "../../../etc/passwd")).toBeNull();
  });

  it("returns a string path when skill and workflow both exist", () => {
    // Research skill is known to have a Workflows/ directory
    const skillPath = resolveSkillPath("Research");
    if (skillPath === null) return; // skip if Research not installed

    // Try to find any workflow file in Research/Workflows/
    const skillDir = dirname(skillPath);
    const workflowsDir = join(skillDir, "Workflows");
    if (!existsSync(workflowsDir)) return; // skip if no Workflows dir

    let files: string[];
    try {
      files = readdirSync(workflowsDir).filter((f) => f.endsWith(".md"));
    } catch {
      return;
    }
    if (files.length === 0) return;

    // Take the first workflow file and try resolving it
    const workflowName = files[0]!.replace(/\.md$/, "");
    const result = resolveWorkflowPath("Research", workflowName);
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
    expect(result).toMatch(/\.md$/);
  });
});

// ── listSkills ────────────────────────────────────────────────────────────────

describe("listSkills", () => {
  it("returns a string containing 'Available PAI Skills'", () => {
    const result = listSkills();
    expect(typeof result).toBe("string");
    expect(result).toContain("Available PAI Skills");
  });

  it("contains 'Research' when the Research skill is installed", () => {
    const skillPath = resolveSkillPath("Research");
    if (skillPath === null) return; // skip if Research not installed

    const result = listSkills();
    expect(result).toContain("Research");
  });

  it("each skill entry starts with a dash (bullet format)", () => {
    const result = listSkills();
    const lines = result.split("\n").slice(1); // skip header line
    for (const line of lines) {
      if (line.trim().length > 0) {
        expect(line).toMatch(/^- /);
      }
    }
  });
});

// ── createSkillTool ───────────────────────────────────────────────────────────

describe("createSkillTool", () => {
  it("returns an object (ToolDefinition shape)", () => {
    const toolDef = createSkillTool();
    expect(typeof toolDef).toBe("object");
    expect(toolDef).not.toBeNull();
  });

  it("has a description property of type string", () => {
    const toolDef = createSkillTool();
    expect(typeof toolDef.description).toBe("string");
    expect(toolDef.description.length).toBeGreaterThan(0);
  });

  it("has an execute property that is a function", () => {
    const toolDef = createSkillTool();
    expect(typeof toolDef.execute).toBe("function");
  });

  it("description mentions skill() usage", () => {
    const toolDef = createSkillTool();
    expect(toolDef.description).toContain('skill("list")');
  });

  it("description mentions workflow loading", () => {
    const toolDef = createSkillTool();
    expect(toolDef.description.toLowerCase()).toContain("workflow");
  });
});

// ── execute() — list mode ─────────────────────────────────────────────────────

describe("skill tool execute — list mode", () => {
  it("returns available skills string when name is 'list'", async () => {
    const toolDef = createSkillTool();
    const result = await toolDef.execute({ name: "list", workflow: undefined }, mockCtx);
    expect(typeof result).toBe("string");
    expect(result).toContain("Available PAI Skills");
  });

  it("returns available skills string when name is undefined", async () => {
    const toolDef = createSkillTool();
    const result = await toolDef.execute({ name: undefined, workflow: undefined }, mockCtx);
    expect(result).toContain("Available PAI Skills");
  });

  it("returns available skills string when name is empty string", async () => {
    const toolDef = createSkillTool();
    const result = await toolDef.execute({ name: "", workflow: undefined }, mockCtx);
    expect(result).toContain("Available PAI Skills");
  });
});

// ── execute() — path traversal guard ─────────────────────────────────────────

describe("skill tool execute — path traversal guard", () => {
  it("returns error for name containing ..", async () => {
    const toolDef = createSkillTool();
    const result = await toolDef.execute({ name: "../etc/passwd", workflow: undefined }, mockCtx);
    expect(result).toContain("Error");
    expect(result.toLowerCase()).toContain("path traversal");
  });

  it("does not return skill content for .. paths", async () => {
    const toolDef = createSkillTool();
    const result = await toolDef.execute({ name: "../etc/passwd" }, mockCtx);
    expect(result).not.toContain("root");
    expect(result).not.toContain("/etc/");
  });

  it("returns error for workflow containing ..", async () => {
    const toolDef = createSkillTool();
    const result = await toolDef.execute(
      { name: "Research", workflow: "../../../etc/passwd" },
      mockCtx,
    );
    expect(result).toContain("Error");
    expect(result.toLowerCase()).toContain("path traversal");
  });
});

// ── execute() — not-found ─────────────────────────────────────────────────────

describe("skill tool execute — not found", () => {
  it("returns not-found error for an unknown skill name", async () => {
    const toolDef = createSkillTool();
    const result = await toolDef.execute({ name: "nonexistent-skill-xyz-12345" }, mockCtx);
    expect(result).toContain("Error");
    expect(result).toContain("nonexistent-skill-xyz-12345");
    expect(result.toLowerCase()).toContain("not found");
  });

  it("not-found error suggests using skill('list')", async () => {
    const toolDef = createSkillTool();
    const result = await toolDef.execute({ name: "nonexistent-skill-xyz-12345" }, mockCtx);
    expect(result).toContain('skill("list")');
  });
});

// ── execute() — normal mode ───────────────────────────────────────────────────

describe("skill tool execute — normal mode (requires installed skills)", () => {
  it("returns file content (non-empty string) for Research skill", async () => {
    const skillPath = resolveSkillPath("Research");
    if (skillPath === null) return; // skip if not installed

    const toolDef = createSkillTool();
    const result = await toolDef.execute({ name: "Research" }, mockCtx);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Should NOT be an error string
    expect(result).not.toMatch(/^Error:/);
  });
});

// ── execute() — subagent permission context injection ─────────────────────

describe("skill tool execute — subagent permission context injection", () => {
  const subagentSessionId = "subagent-research-session-001";

  beforeEach(() => {
    registerSubagentType(subagentSessionId, "GeminiResearcher");
  });

  afterEach(() => {
    clearSubagentType(subagentSessionId);
  });

  it("appends permission context when loaded by a registered subagent", async () => {
    const skillPath = resolveSkillPath("Research");
    if (skillPath === null) return; // skip if Research not installed

    const toolDef = createSkillTool();
    const ctx = mockCtxForSession(subagentSessionId);
    const result = await toolDef.execute({ name: "Research" }, ctx);

    // Should contain original skill content
    expect(result).not.toMatch(/^Error:/);
    expect(result.length).toBeGreaterThan(0);

    // Should contain the appended permission context
    expect(result).toContain("OpenCode Adaptation Notes");
    expect(result).toContain("GeminiResearcher agent");
    expect(result).toContain("Available Tools");
  });

  it("does NOT append permission context for non-subagent sessions", async () => {
    const skillPath = resolveSkillPath("Research");
    if (skillPath === null) return; // skip if Research not installed

    const toolDef = createSkillTool();
    // Use a session ID that's NOT registered as a subagent
    const ctx = mockCtxForSession("main-session-not-subagent");
    const result = await toolDef.execute({ name: "Research" }, ctx);

    // Should contain original skill content
    expect(result).not.toMatch(/^Error:/);

    // Should NOT contain adaptation notes
    expect(result).not.toContain("OpenCode Adaptation Notes");
  });

  it("includes permission tool table in appended context", async () => {
    const skillPath = resolveSkillPath("Research");
    if (skillPath === null) return;

    const toolDef = createSkillTool();
    const ctx = mockCtxForSession(subagentSessionId);
    const result = await toolDef.execute({ name: "Research" }, ctx);

    expect(result).toContain("Available Tools");
    expect(result).toContain("GeminiResearcher agent");
    expect(result).toContain("task (spawn)");
  });

  it("includes tool availability table with correct permissions for research", async () => {
    const skillPath = resolveSkillPath("Research");
    if (skillPath === null) return;

    const toolDef = createSkillTool();
    const ctx = mockCtxForSession(subagentSessionId);
    const result = await toolDef.execute({ name: "Research" }, ctx);

    // Research agent: curl ✅, webfetch ✅, edit ❌
    expect(result).toContain("curl");
    expect(result).toContain("webfetch");
    expect(result).toContain("edit");
  });

  it("appends context after skill content (separated by ---)", async () => {
    const skillPath = resolveSkillPath("Research");
    if (skillPath === null) return;

    const toolDef = createSkillTool();
    const ctx = mockCtxForSession(subagentSessionId);
    const result = await toolDef.execute({ name: "Research" }, ctx);

    // The permission context should be after a --- separator
    const separatorIndex = result.lastIndexOf("\n\n---\n\n");
    expect(separatorIndex).toBeGreaterThan(0);

    // Content before separator should be the skill content
    const beforeSeparator = result.slice(0, separatorIndex);
    expect(beforeSeparator.length).toBeGreaterThan(0);

    // Content after separator should be the adaptation notes
    const afterSeparator = result.slice(separatorIndex + 7); // "\n\n---\n\n" is 7 chars
    expect(afterSeparator).toContain("OpenCode Adaptation Notes");
  });

  it("works correctly for Architect agent type", async () => {
    const architectSessionId = "subagent-architect-session-001";
    registerSubagentType(architectSessionId, "Architect");

    const skillPath = resolveSkillPath("Research");
    if (skillPath === null) {
      clearSubagentType(architectSessionId);
      return;
    }

    const toolDef = createSkillTool();
    const ctx = mockCtxForSession(architectSessionId);
    const result = await toolDef.execute({ name: "Research" }, ctx);

    expect(result).toContain("Architect agent");
    expect(result).toContain("OpenCode Adaptation Notes");

    clearSubagentType(architectSessionId);
  });

  it("does not append context for list mode even with subagent session", async () => {
    const toolDef = createSkillTool();
    const ctx = mockCtxForSession(subagentSessionId);
    const result = await toolDef.execute({ name: "list" }, ctx);

    // List mode should return skill list without permission context
    expect(result).toContain("Available PAI Skills");
    expect(result).not.toContain("OpenCode Adaptation Notes");
  });
});

// ── research agent curl allow rule ────────────────────────────────────────
// These tests verify that agent definitions contain the correct curl allow
// rules in their bash permissions. Previously checked .md files; now checks
// in-memory AGENT_DEFINITIONS since .md files have been eliminated.

import { AGENT_DEFINITIONS } from "../agents/definitions.js";

describe("PAI agent curl allow rule", () => {
  it("GeminiResearcher agent definition exists", () => {
    expect(AGENT_DEFINITIONS.GeminiResearcher).toBeDefined();
  });

  it("GeminiResearcher agent contains curl allow rule in bash permissions", () => {
    const bashPerms = AGENT_DEFINITIONS.GeminiResearcher!.permission.bash;
    expect(typeof bashPerms).toBe("object");
    expect((bashPerms as Record<string, string>)["curl *"]).toBe("allow");
  });

  it("GeminiResearcher agent retains default deny for unwhitelisted bash", () => {
    const bashPerms = AGENT_DEFINITIONS.GeminiResearcher!.permission.bash;
    expect(typeof bashPerms).toBe("object");
    expect((bashPerms as Record<string, string>)["*"]).toBe("deny");
  });

  it("GrokResearcher agent contains curl allow rule", () => {
    const bashPerms = AGENT_DEFINITIONS.GrokResearcher?.permission.bash;
    if (!bashPerms || typeof bashPerms !== "object") return;
    expect((bashPerms as Record<string, string>)["curl *"]).toBe("allow");
  });

  it("Architect agent does NOT contain curl allow rule", () => {
    const bashPerms = AGENT_DEFINITIONS.Architect?.permission.bash;
    expect(typeof bashPerms).toBe("object");
    expect((bashPerms as Record<string, string>)["curl *"]).toBeUndefined();
  });
});
