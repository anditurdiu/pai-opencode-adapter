import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const TEST_AGENTS_DIR = join(homedir(), ".claude", "agents");

function ensureAgentsDir() {
  mkdirSync(TEST_AGENTS_DIR, { recursive: true });
}

function writeAgentFile(name: string, content: string) {
  ensureAgentsDir();
  writeFileSync(join(TEST_AGENTS_DIR, `${name}.md`), content);
}

function removeAgentFile(name: string) {
  try {
    rmSync(join(TEST_AGENTS_DIR, `${name}.md`), { force: true });
  } catch {}
}

import {
  agentTeamDispatch,
  agentTeamStatus,
  agentTeamCollect,
  completeDispatch,
  failDispatch,
  clearAgentTeamsState,
  getSessionDispatches,
  type AgentDispatch,
  type DispatchResult,
  type StatusResult,
  type CollectResult,
} from "../handlers/agent-teams.js";

const SESSION = "test-agent-teams-session";
const AGENT_NAME = "test-researcher";
const AGENT_CONTENT = "# Test Researcher\nYou are a test research agent.";

describe("agentTeamDispatch", () => {
  beforeEach(() => {
    clearAgentTeamsState(SESSION);
    writeAgentFile(AGENT_NAME, AGENT_CONTENT);
  });

  afterEach(() => {
    clearAgentTeamsState(SESSION);
    removeAgentFile(AGENT_NAME);
  });

  it("successfully dispatches a known agent", () => {
    const result = agentTeamDispatch(SESSION, AGENT_NAME, "research topic X");
    expect(result.success).toBe(true);
    expect(result.dispatchId).toBeDefined();
    expect(typeof result.dispatchId).toBe("string");
    expect(result.dispatchId!.startsWith("dispatch-")).toBe(true);
  });

  it("returns error for unknown agent", () => {
    const result = agentTeamDispatch(SESSION, "nonexistent-agent", "task");
    expect(result.success).toBe(false);
    expect(result.error).toContain("agent definition not found");
  });

  it("records dispatch in session state", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "my task");
    const dispatches = getSessionDispatches(SESSION);
    expect(dispatches.length).toBe(1);
    expect(dispatches[0]!.agent).toBe(AGENT_NAME);
    expect(dispatches[0]!.task).toBe("my task");
    expect(dispatches[0]!.status).toBe("running");
  });

  it("includes optional context in dispatch", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task with ctx", "some context");
    const dispatches = getSessionDispatches(SESSION);
    expect(dispatches[0]!.context).toBe("some context");
  });

  it("enforces max 5 concurrent dispatches", () => {
    // Dispatch 5 — all should succeed
    for (let i = 0; i < 5; i++) {
      const r = agentTeamDispatch(SESSION, AGENT_NAME, `task ${i}`);
      expect(r.success).toBe(true);
    }
    const sixth = agentTeamDispatch(SESSION, AGENT_NAME, "task 6");
    expect(sixth.success).toBe(false);
    expect(sixth.error).toBe("maximum concurrent dispatches reached");
  });

  it("allows new dispatch after one completes", () => {
    for (let i = 0; i < 5; i++) {
      agentTeamDispatch(SESSION, AGENT_NAME, `task ${i}`);
    }
    const dispatches = getSessionDispatches(SESSION);
    completeDispatch(SESSION, dispatches[0]!.dispatchId, "done");
    const r = agentTeamDispatch(SESSION, AGENT_NAME, "task 6");
    expect(r.success).toBe(true);
  });

  it("separate sessions have independent state", () => {
    const sessionB = "agent-teams-session-b";
    clearAgentTeamsState(sessionB);
    for (let i = 0; i < 5; i++) {
      agentTeamDispatch(SESSION, AGENT_NAME, `task ${i}`);
    }
    const r = agentTeamDispatch(sessionB, AGENT_NAME, "task in B");
    expect(r.success).toBe(true);
    clearAgentTeamsState(sessionB);
  });
});

describe("agentTeamStatus", () => {
  beforeEach(() => {
    clearAgentTeamsState(SESSION);
    writeAgentFile(AGENT_NAME, AGENT_CONTENT);
  });

  afterEach(() => {
    clearAgentTeamsState(SESSION);
    removeAgentFile(AGENT_NAME);
  });

  it("returns empty dispatches for fresh session", () => {
    const status = agentTeamStatus(SESSION);
    expect(status.dispatches).toEqual([]);
  });

  it("lists all dispatched agents", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task A");
    agentTeamDispatch(SESSION, AGENT_NAME, "task B");
    const status = agentTeamStatus(SESSION);
    expect(status.dispatches.length).toBe(2);
    expect(status.dispatches[0]!.agent).toBe(AGENT_NAME);
    expect(status.dispatches[1]!.agent).toBe(AGENT_NAME);
  });

  it("reports running status for active dispatch", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "running task");
    const status = agentTeamStatus(SESSION);
    expect(status.dispatches[0]!.status).toBe("running");
  });

  it("reports completed status after completeDispatch", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task");
    const { dispatchId } = getSessionDispatches(SESSION)[0]!;
    completeDispatch(SESSION, dispatchId, "result");
    const status = agentTeamStatus(SESSION);
    expect(status.dispatches[0]!.status).toBe("completed");
  });

  it("reports failed status after failDispatch", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task");
    const { dispatchId } = getSessionDispatches(SESSION)[0]!;
    failDispatch(SESSION, dispatchId, "something went wrong");
    const status = agentTeamStatus(SESSION);
    expect(status.dispatches[0]!.status).toBe("failed");
  });

  it("includes task description in status", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "specific task description");
    const status = agentTeamStatus(SESSION);
    expect(status.dispatches[0]!.task).toBe("specific task description");
  });

  it("durationMs is a non-negative number", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task");
    const status = agentTeamStatus(SESSION);
    expect(status.dispatches[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("agentTeamCollect", () => {
  beforeEach(() => {
    clearAgentTeamsState(SESSION);
    writeAgentFile(AGENT_NAME, AGENT_CONTENT);
  });

  afterEach(() => {
    clearAgentTeamsState(SESSION);
    removeAgentFile(AGENT_NAME);
  });

  it("returns empty collected for no completed dispatches", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task");
    const result = agentTeamCollect(SESSION);
    expect(result.collected).toEqual([]);
  });

  it("collects completed dispatch results", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task");
    const { dispatchId } = getSessionDispatches(SESSION)[0]!;
    completeDispatch(SESSION, dispatchId, "my result");

    const result = agentTeamCollect(SESSION);
    expect(result.collected.length).toBe(1);
    expect(result.collected[0]!.result).toBe("my result");
    expect(result.collected[0]!.agent).toBe(AGENT_NAME);
    expect(result.collected[0]!.task).toBe("task");
    expect(result.collected[0]!.dispatchId).toBe(dispatchId);
  });

  it("marks collected dispatches as collected (not re-collected)", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task");
    const { dispatchId } = getSessionDispatches(SESSION)[0]!;
    completeDispatch(SESSION, dispatchId, "result");

    agentTeamCollect(SESSION);
    const second = agentTeamCollect(SESSION);
    expect(second.collected).toEqual([]);
  });

  it("does not collect failed dispatches", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task");
    const { dispatchId } = getSessionDispatches(SESSION)[0]!;
    failDispatch(SESSION, dispatchId, "error");

    const result = agentTeamCollect(SESSION);
    expect(result.collected).toEqual([]);
  });

  it("collects only completed, not running, from mixed set", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task A");
    agentTeamDispatch(SESSION, AGENT_NAME, "task B");
    const dispatches = getSessionDispatches(SESSION);
    completeDispatch(SESSION, dispatches[0]!.dispatchId, "result A");

    const result = agentTeamCollect(SESSION);
    expect(result.collected.length).toBe(1);
    expect(result.collected[0]!.task).toBe("task A");
  });
});

describe("completeDispatch / failDispatch", () => {
  beforeEach(() => {
    clearAgentTeamsState(SESSION);
    writeAgentFile(AGENT_NAME, AGENT_CONTENT);
  });

  afterEach(() => {
    clearAgentTeamsState(SESSION);
    removeAgentFile(AGENT_NAME);
  });

  it("completeDispatch sets result and endTime", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task");
    const { dispatchId } = getSessionDispatches(SESSION)[0]!;
    completeDispatch(SESSION, dispatchId, "done!");
    const dispatch = getSessionDispatches(SESSION)[0];
    expect(dispatch!.status).toBe("completed");
    expect(dispatch!.result).toBe("done!");
    expect(dispatch!.endTime).toBeDefined();
  });

  it("failDispatch sets error message and endTime", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task");
    const { dispatchId } = getSessionDispatches(SESSION)[0]!;
    failDispatch(SESSION, dispatchId, "timeout");
    const dispatch = getSessionDispatches(SESSION)[0];
    expect(dispatch!.status).toBe("failed");
    expect(dispatch!.result).toContain("timeout");
    expect(dispatch!.endTime).toBeDefined();
  });

  it("completeDispatch with unknown dispatchId does not throw", () => {
    expect(() => completeDispatch(SESSION, "nonexistent-id", "result")).not.toThrow();
  });

  it("failDispatch with unknown dispatchId does not throw", () => {
    expect(() => failDispatch(SESSION, "nonexistent-id", "error")).not.toThrow();
  });
});

describe("clearAgentTeamsState", () => {
  beforeEach(() => {
    writeAgentFile(AGENT_NAME, AGENT_CONTENT);
  });

  afterEach(() => {
    clearAgentTeamsState(SESSION);
    removeAgentFile(AGENT_NAME);
  });

  it("clears all dispatches for session", () => {
    agentTeamDispatch(SESSION, AGENT_NAME, "task 1");
    agentTeamDispatch(SESSION, AGENT_NAME, "task 2");
    clearAgentTeamsState(SESSION);
    expect(getSessionDispatches(SESSION)).toEqual([]);
  });

  it("clear on empty session does not throw", () => {
    expect(() => clearAgentTeamsState("never-used-session")).not.toThrow();
  });
});
