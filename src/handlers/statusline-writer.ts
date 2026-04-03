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
import { findLatestPRD, readPRD, countCriteria } from "../lib/prd-utils.js";

const STATUS_PREFIX = "/tmp/pai-opencode-status";

export interface StatusLineData {
  phase: string;
  messageCount: number;
  learningSignals: { positive: number; negative: number };
  tokenUsage: { used: number; limit: number };
  activeAgent: string;
  duration: number;
  // PRD-enriched fields
  effortLevel: string;
  taskDescription: string;
  iscProgress: { checked: number; total: number };
  algorithmPhase: string;
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
    activeAgent: "",
    duration: 0,
    effortLevel: "",
    taskDescription: "",
    iscProgress: { checked: 0, total: 0 },
    algorithmPhase: "",
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

// Track which PRD slug is bound to the current session so we only
// display PRD state for work started during THIS session.
const sessionPRDBinding = new Map<string, string>();

/**
 * Bind a PRD slug to a session.  Called when the AI creates a new PRD
 * during this session (detected by seeing a new slug appear that wasn't
 * there at session start).
 */
export function bindPRDToSession(sessionId: string, slug: string): void {
  sessionPRDBinding.set(sessionId, slug);
}

/**
 * Clear the PRD binding for a session.  Called on session.end to
 * prevent memory leaks and stale bindings.
 */
export function clearPRDBinding(sessionId: string): void {
  sessionPRDBinding.delete(sessionId);
}

/**
 * Parse an ISO-8601 timestamp from PRD frontmatter into epoch ms.
 * Returns 0 if unparseable.
 */
function parseTimestamp(ts: string | undefined): number {
  if (!ts) return 0;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Max age (ms) for a PRD to be considered "current" — 30 minutes */
const PRD_STALE_MS = 30 * 60 * 1000;

/**
 * Sync status from the latest PRD file.
 * Reads the most recently modified PRD from the PAI directory
 * (~/.claude/MEMORY/WORK/), extracts frontmatter fields (phase, effort,
 * progress, task) and ISC criteria counts, then merges them into the
 * in-memory status and writes to disk.
 *
 * Guards against stale PRDs from previous sessions:
 *   1. Skips completed/cancelled PRDs (they're done)
 *   2. Skips stub PRDs (progress 0/0 with no criteria in body)
 *   3. Skips PRDs whose `updated` timestamp is older than 30 minutes
 *   4. If the session already has a bound PRD slug, only syncs from that PRD
 *
 * When a stale/invalid PRD is detected, the PRD-enriched status fields
 * are cleared so the tmux bar shows a clean state.
 *
 * Called on every tool.execute.after to keep the tmux status bar in sync
 * with Algorithm state.
 */
export function syncFromPRD(sessionId: string): void {
  const sid = sessionId || activeSessionId;
  if (!sid) return;

  try {
    // findLatestPRD() scans ~/.claude/MEMORY/WORK/ for the most recent PRD
    const latestPath = findLatestPRD();
    if (!latestPath) return;

    const prd = readPRD(latestPath);
    if (!prd) return;

    const fm = prd.frontmatter;
    const phase = (fm.phase ?? "") as string;
    const slug = (fm.slug ?? fm.id ?? "") as string;
    const progress = (fm.progress ?? "") as string;
    const updated = (fm.updated ?? "") as string;

    // Skip completed/cancelled PRDs — they're not active work
    if (phase.toLowerCase() === "complete" || phase.toLowerCase() === "cancelled") {
      return;
    }

    const criteria = countCriteria(prd.content);

    // ── Staleness guards ──────────────────────────────────
    // Guard 1: Stub PRDs — progress "0/0" with no criteria in the body
    if (progress === "0/0" && criteria.total === 0) {
      fileLog(`[statusline-writer] PRD sync: skipping stub PRD (${slug || "unknown"})`, "debug");
      clearPRDStatus(sid);
      return;
    }

    // Guard 2: Stale timestamp — PRD not updated in last 30 minutes
    const updatedMs = parseTimestamp(updated);
    if (updatedMs > 0 && (Date.now() - updatedMs) > PRD_STALE_MS) {
      fileLog(`[statusline-writer] PRD sync: skipping stale PRD (${slug || "unknown"}, last updated ${updated})`, "debug");
      clearPRDStatus(sid);
      return;
    }

    // Guard 3: Session binding — if this session has a bound PRD, only
    // sync from that specific PRD (ignore PRDs from other sessions)
    const boundSlug = sessionPRDBinding.get(sid);
    if (boundSlug && slug && slug !== boundSlug) {
      fileLog(`[statusline-writer] PRD sync: ignoring PRD ${slug} (session bound to ${boundSlug})`, "debug");
      return;
    }

    // If no binding exists yet and this PRD looks active, bind it
    if (!boundSlug && slug && criteria.total > 0) {
      sessionPRDBinding.set(sid, slug);
    }

    let status = sessionStatus.get(sid);
    if (!status) {
      status = defaultStatus();
      sessionStatus.set(sid, status);
    }

    // Map PRD frontmatter to status fields
    // PRD uses both 'task' and 'title' keys
    const task = (fm.task ?? fm.title ?? "") as string;
    const effort = (fm.effort_level ?? fm.effort ?? "") as string;

    if (task) status.taskDescription = task;
    if (phase) status.algorithmPhase = phase.toUpperCase();
    if (effort) status.effortLevel = effort.toUpperCase();
    status.iscProgress = criteria;

    writeStatus(sid, status);
    fileLog(`[statusline-writer] PRD sync: phase=${phase} effort=${effort} isc=${criteria.checked}/${criteria.total}`, "debug");
  } catch (err) {
    fileLog(`[statusline-writer] PRD sync error: ${String(err)}`, "warn");
  }
}

/**
 * Clear PRD-enriched status fields when the PRD is stale or invalid.
 * Resets algorithmPhase, effortLevel, taskDescription, and iscProgress
 * so the tmux bar shows a clean state instead of stale data.
 */
function clearPRDStatus(sessionId: string): void {
  const status = sessionStatus.get(sessionId);
  if (!status) return;

  status.algorithmPhase = "";
  status.effortLevel = "";
  status.taskDescription = "";
  status.iscProgress = { checked: 0, total: 0 };

  writeStatus(sessionId, status);
}
