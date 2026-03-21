/**
 * StatusLine Writer
 *
 * Writes session status to /tmp/pai-opencode-status-{sessionId}.json
 * AND a fallback /tmp/pai-opencode-status.json (session-less).
 * Read by statusline.sh every 2s via tmux status-right.
 *
 * Uses atomic writes (tmp + rename) to prevent partial reads.
 */

import { writeFileSync, renameSync, existsSync, rmSync, readdirSync } from "node:fs";
import { fileLog } from "../lib/file-logger.js";

const STATUS_PREFIX = "/tmp/pai-opencode-status";

export interface StatusLineData {
  phase: string;
  messageCount: number;
  learningSignals: { positive: number; negative: number };
  tokenUsage: { used: number; limit: number };
  planMode: boolean;
  activeAgent: string;
  duration: number;
}

// Model context window sizes (tokens)
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-sonnet-4-20250514": 200000,
  "claude-opus-4-20250514": 200000,
  "claude-haiku-3.5": 200000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4.1": 1048576,
  "o3": 200000,
  "o4-mini": 200000,
  "gemini-2.5-pro": 1048576,
  "gemini-2.5-flash": 1048576,
};
const DEFAULT_CONTEXT_LIMIT = 200000;

const sessionStatus = new Map<string, StatusLineData>();
let activeSessionId: string | null = null;

function defaultStatus(): StatusLineData {
  return {
    phase: "ACTIVE",
    messageCount: 0,
    learningSignals: { positive: 0, negative: 0 },
    tokenUsage: { used: 0, limit: 200000 },
    planMode: false,
    activeAgent: "",
    duration: 0,
  };
}

function atomicWrite(filePath: string, data: string): void {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    writeFileSync(tmpPath, data, "utf-8");
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (existsSync(tmpPath)) rmSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

function writeStatus(sessionId: string, status: StatusLineData): void {
  try {
    const json = JSON.stringify(status, null, 2);

    // Write session-specific file
    const sessionFile = `${STATUS_PREFIX}-${sessionId}.json`;
    atomicWrite(sessionFile, json);

    // Also write fallback file (no session ID) for when PAI_SESSION_ID is not set
    const fallbackFile = `${STATUS_PREFIX}.json`;
    atomicWrite(fallbackFile, json);

    fileLog(`[statusline-writer] status written for ${sessionId}: phase=${status.phase}`, "debug");
  } catch (err) {
    fileLog(`[statusline-writer] write error: ${String(err)}`, "error");
  }
}

export function onSessionStart(sessionId: string): void {
  if (!sessionId) return;

  // Clean up stale status files from previous sessions that didn't end cleanly
  try {
    const fallbackFile = `${STATUS_PREFIX}.json`;
    if (existsSync(fallbackFile)) rmSync(fallbackFile);

    // Remove stale session-specific files (not ours — ours hasn't been written yet)
    const tmpDir = "/tmp";
    const prefix = "pai-opencode-status-";
    const entries = readdirSync(tmpDir);
    for (const entry of entries) {
      if (entry.startsWith(prefix) && entry.endsWith(".json")) {
        try {
          rmSync(`${tmpDir}/${entry}`);
        } catch {
          // ignore — file may have been removed by another process
        }
      }
    }
  } catch (err) {
    fileLog(`[statusline-writer] stale file cleanup error: ${String(err)}`, "warn");
  }

  activeSessionId = sessionId;
  const status = defaultStatus();
  sessionStatus.set(sessionId, status);
  writeStatus(sessionId, status);
}

export function onMessageReceived(sessionId: string): void {
  const sid = sessionId || activeSessionId;
  if (!sid) return;

  let status = sessionStatus.get(sid);
  if (!status) {
    status = defaultStatus();
    sessionStatus.set(sid, status);
  }

  status.messageCount++;

  // Update duration from session start
  const startEntry = sessionStatus.get(sid);
  if (startEntry) {
    // Duration is managed externally — we just increment message count
  }

  writeStatus(sid, status);
}

export function onPhaseChange(sessionId: string, phase: string): void {
  const sid = sessionId || activeSessionId;
  if (!sid) return;

  let status = sessionStatus.get(sid);
  if (!status) {
    status = defaultStatus();
    sessionStatus.set(sid, status);
  }

  status.phase = phase.toUpperCase();
  writeStatus(sid, status);
}

export function onPlanModeChange(sessionId: string, enabled: boolean): void {
  const sid = sessionId || activeSessionId;
  if (!sid) return;

  let status = sessionStatus.get(sid);
  if (!status) {
    status = defaultStatus();
    sessionStatus.set(sid, status);
  }

  status.planMode = enabled;
  writeStatus(sid, status);
}

export function onToolExecuted(sessionId: string, toolName: string, durationSec: number): void {
  const sid = sessionId || activeSessionId;
  if (!sid) return;

  let status = sessionStatus.get(sid);
  if (!status) {
    status = defaultStatus();
    sessionStatus.set(sid, status);
  }

  status.duration += durationSec;
  status.activeAgent = toolName;
  writeStatus(sid, status);
}

export function onTokenUsage(sessionId: string, _messageId: string, inputTokens: number, _outputTokens: number): void {
  const sid = sessionId || activeSessionId;
  if (!sid) return;

  let status = sessionStatus.get(sid);
  if (!status) {
    status = defaultStatus();
    sessionStatus.set(sid, status);
  }

  // inputTokens = tokens sent to the model on this turn = current context size.
  // We always take the latest value (not cumulative) since each API call sends
  // the full conversation context. This tells us how full the context window is.
  if (inputTokens > 0) {
    status.tokenUsage.used = inputTokens;
    writeStatus(sid, status);
  }
}

export function setContextLimit(sessionId: string, model: string): void {
  const sid = sessionId || activeSessionId;
  if (!sid) return;

  let status = sessionStatus.get(sid);
  if (!status) {
    status = defaultStatus();
    sessionStatus.set(sid, status);
  }

  // Try exact match first, then prefix match for versioned model names
  let limit = MODEL_CONTEXT_LIMITS[model];
  if (!limit) {
    for (const [key, val] of Object.entries(MODEL_CONTEXT_LIMITS)) {
      if (model.startsWith(key) || model.includes(key)) {
        limit = val;
        break;
      }
    }
  }

  status.tokenUsage.limit = limit ?? DEFAULT_CONTEXT_LIMIT;
  writeStatus(sid, status);
}

export function onSessionEnd(sessionId: string): void {
  const sid = sessionId || activeSessionId;
  if (!sid) return;

  sessionStatus.delete(sid);

  // Clean up status files
  try {
    const sessionFile = `${STATUS_PREFIX}-${sid}.json`;
    if (existsSync(sessionFile)) rmSync(sessionFile);
    const fallbackFile = `${STATUS_PREFIX}.json`;
    if (existsSync(fallbackFile)) rmSync(fallbackFile);
  } catch (err) {
    fileLog(`[statusline-writer] cleanup error: ${String(err)}`, "error");
  }

  if (activeSessionId === sid) {
    activeSessionId = null;
  }
}

export function getStatus(sessionId: string): StatusLineData | undefined {
  return sessionStatus.get(sessionId);
}

export function getActiveSessionId(): string | null {
  return activeSessionId;
}
