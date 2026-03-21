import { fileLog } from "../lib/file-logger.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const MAX_CONCURRENT_DISPATCHES = 5;
const AGENTS_DIR = join(homedir(), ".claude", "agents");

export type DispatchStatus = "running" | "completed" | "failed" | "collected";

export interface AgentDispatch {
  dispatchId: string;
  agent: string;
  task: string;
  context?: string;
  status: DispatchStatus;
  startTime: number;
  endTime?: number;
  result?: string;
}

interface AgentDefinition {
  name: string;
  systemPrompt: string;
}

const sessionDispatches = new Map<string, AgentDispatch[]>();

function makeDispatchId(): string {
  return `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadAgentDefinition(agentName: string): AgentDefinition | null {
  const agentFile = join(AGENTS_DIR, `${agentName}.md`);
  if (!existsSync(agentFile)) {
    fileLog(`[agent-teams] agent definition not found: ${agentName}`);
    return null;
  }
  try {
    const content = readFileSync(agentFile, "utf-8");
    return { name: agentName, systemPrompt: content };
  } catch (err) {
    fileLog(`[agent-teams] failed to load agent ${agentName}: ${String(err)}`);
    return null;
  }
}

function getActiveDispatches(sessionId: string): AgentDispatch[] {
  return (sessionDispatches.get(sessionId) ?? []).filter((d) => d.status === "running");
}

export interface DispatchResult {
  success: boolean;
  dispatchId?: string;
  error?: string;
}

export function agentTeamDispatch(
  sessionId: string,
  agent: string,
  task: string,
  context?: string
): DispatchResult {
  try {
    const active = getActiveDispatches(sessionId);
    if (active.length >= MAX_CONCURRENT_DISPATCHES) {
      return { success: false, error: "maximum concurrent dispatches reached" };
    }

    const definition = loadAgentDefinition(agent);
    if (!definition) {
      return { success: false, error: `agent definition not found: ${agent}` };
    }

    const dispatchId = makeDispatchId();
    const dispatch: AgentDispatch = {
      dispatchId,
      agent,
      task,
      context,
      status: "running",
      startTime: Date.now(),
    };

    const existing = sessionDispatches.get(sessionId) ?? [];
    existing.push(dispatch);
    sessionDispatches.set(sessionId, existing);

    fileLog(`[agent-teams] dispatched agent=${agent} dispatchId=${dispatchId} session=${sessionId}`);
    return { success: true, dispatchId };
  } catch (err) {
    fileLog(`[agent-teams] dispatch error: ${String(err)}`);
    return { success: false, error: String(err) };
  }
}

export interface StatusResult {
  dispatches: Array<{
    dispatchId: string;
    agent: string;
    task: string;
    status: DispatchStatus;
    durationMs: number;
  }>;
}

export function agentTeamStatus(sessionId: string): StatusResult {
  const dispatches = sessionDispatches.get(sessionId) ?? [];
  return {
    dispatches: dispatches.map((d) => ({
      dispatchId: d.dispatchId,
      agent: d.agent,
      task: d.task,
      status: d.status,
      durationMs: (d.endTime ?? Date.now()) - d.startTime,
    })),
  };
}

export interface CollectResult {
  collected: Array<{
    dispatchId: string;
    agent: string;
    task: string;
    result: string;
  }>;
}

export function agentTeamCollect(sessionId: string): CollectResult {
  const dispatches = sessionDispatches.get(sessionId) ?? [];
  const completed = dispatches.filter((d) => d.status === "completed");

  for (const d of completed) {
    d.status = "collected";
  }

  return {
    collected: completed.map((d) => ({
      dispatchId: d.dispatchId,
      agent: d.agent,
      task: d.task,
      result: d.result ?? "(no result)",
    })),
  };
}

export function completeDispatch(sessionId: string, dispatchId: string, result: string): void {
  const dispatches = sessionDispatches.get(sessionId) ?? [];
  const dispatch = dispatches.find((d) => d.dispatchId === dispatchId);
  if (dispatch) {
    dispatch.status = "completed";
    dispatch.endTime = Date.now();
    dispatch.result = result;
    fileLog(`[agent-teams] completed dispatchId=${dispatchId}`);
  }
}

export function failDispatch(sessionId: string, dispatchId: string, error: string): void {
  const dispatches = sessionDispatches.get(sessionId) ?? [];
  const dispatch = dispatches.find((d) => d.dispatchId === dispatchId);
  if (dispatch) {
    dispatch.status = "failed";
    dispatch.endTime = Date.now();
    dispatch.result = `ERROR: ${error}`;
    fileLog(`[agent-teams] failed dispatchId=${dispatchId}: ${error}`);
  }
}

export function clearAgentTeamsState(sessionId: string): void {
  sessionDispatches.delete(sessionId);
}

export function getSessionDispatches(sessionId: string): AgentDispatch[] {
  return sessionDispatches.get(sessionId) ?? [];
}
