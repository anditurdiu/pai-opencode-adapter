/**
 * learning-tracker.ts - Learning Signal Capture, Rating Extraction, and Work Tracking
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 *
 * Maps PAI v4.0.3 learning hooks to OpenCode plugin API (Schicht 2 — fire-and-forget):
 *   tool.execute.after  → implicit signal capture + work item tracking
 *   chat.message        → explicit rating extraction + PRD sync detection
 *
 * Persists to ~/.opencode/MEMORY/:
 *   LEARNING/SIGNALS/ratings.jsonl
 *   LEARNING/{ALGORITHM|SYSTEM}/{YYYY-MM}/{datetime}_LEARNING_{slug}.md
 *   WORK/{date}-{sessionId}.md
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "../lib/file-logger.js";
import { StateManager } from "../lib/state-manager.js";
import { getLearningDir, getMemoryPath, getDateString, getYearMonth, getTimestamp, slugify } from "../lib/paths.js";
import { getLearningCategory } from "../lib/learning-utils.js";
import { getISOTimestamp } from "../lib/time.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LearningSignalEntry {
  timestamp: string;
  sessionId: string;
  type: "tool_success" | "tool_failure" | "explicit_rating" | "implicit_rating" | "work_item" | "prd_sync";
  category?: "ALGORITHM" | "SYSTEM";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RatingEntry {
  timestamp: string;
  sessionId: string;
  rating: number;
  source: "explicit" | "implicit";
  comment?: string;
}

export interface WorkItem {
  sessionId: string;
  tool: string;
  file?: string;
  action: "created" | "modified" | "deleted" | "executed";
  timestamp: string;
}

interface LearningSessionState {
  signals: LearningSignalEntry[];
  workItems: WorkItem[];
  ratings: RatingEntry[];
  flushCount: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SIGNALS_DIR_NAME = "SIGNALS";
const RATINGS_FILE = "ratings.jsonl";

// Patterns to extract explicit ratings from user messages
// Matches: "7", "8 - good", "rate: 9", "9/10", "👍", "👎", "great", "terrible", "thumbs up"
const EXPLICIT_RATING_PATTERNS: Array<{ pattern: RegExp; ratingFn: (m: RegExpMatchArray) => number }> = [
  // Numeric: standalone number 1-10 (not followed by more digits)
  { pattern: /^(10|[1-9])(?:[/:]10)?\s*(?:[-:]\s*(.*))?$/, ratingFn: (m) => parseInt(m[1] ?? "0", 10) },
  // "rate: N"
  { pattern: /\brate[:\s]+(\d{1,2})\b/i, ratingFn: (m) => parseInt(m[1] ?? "0", 10) },
  // "N/10"
  { pattern: /\b(\d{1,2})\s*\/\s*10\b/, ratingFn: (m) => parseInt(m[1] ?? "0", 10) },
  // thumbs up
  { pattern: /👍/, ratingFn: () => 8 },
  // thumbs down
  { pattern: /👎/, ratingFn: () => 2 },
  // positive words
  { pattern: /\b(great|excellent|perfect|awesome|amazing|fantastic|love it|well done|good job|nice work|nailed it)\b/i, ratingFn: () => 8 },
  // negative words
  { pattern: /\b(terrible|awful|horrible|bad|wrong|broken|failed|disappointing|useless|garbage)\b/i, ratingFn: () => 2 },
];

// File tools that indicate work items
const FILE_TOOLS = new Set(["write_file", "edit_file", "create_file", "delete_file", "patch_file", "str_replace_editor", "Write", "Edit"]);
const DELETE_TOOLS = new Set(["delete_file", "remove_file"]);

// PRD sync prefixes
const PRD_PREFIXES = /^(plan:|objective:|requirement:|goal:|task:|milestone:)/i;

// ── Session State ──────────────────────────────────────────────────────────

const sessionState = new StateManager<LearningSessionState>(undefined, "learning");

function getOrCreateState(sessionId: string): LearningSessionState {
  const existing = sessionState.get(sessionId);
  if (existing) return existing;
  const fresh: LearningSessionState = { signals: [], workItems: [], ratings: [], flushCount: 0 };
  sessionState.set(sessionId, fresh);
  return fresh;
}

// ── Rating Extraction ──────────────────────────────────────────────────────

/**
 * Extract explicit rating from a user message.
 * Returns { rating, comment } or null if no rating detected.
 * Clamps rating to [1, 10].
 */
export function extractRating(message: string): { rating: number; comment?: string } | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 1) return null;

  for (const { pattern, ratingFn } of EXPLICIT_RATING_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m) {
      const raw = ratingFn(m);
      if (raw < 1 || raw > 10) continue;
      const comment = m[2]?.trim() || undefined;
      return { rating: raw, comment };
    }
  }

  return null;
}

// ── Implicit Signal Extraction ─────────────────────────────────────────────

/**
 * Extract learning signal from a tool execution result.
 * Positive: tool succeeded (exit 0, no error in output).
 * Negative: tool failed (non-zero exit, error keywords in output).
 */
export function extractToolSignal(
  tool: string,
  args: Record<string, unknown>,
  output: unknown
): { type: "tool_success" | "tool_failure"; content: string } | null {
  const outputStr = typeof output === "string" ? output : JSON.stringify(output ?? "");

  // Detect failure signals
  const isFailure =
    /\b(error|failed|failure|exception|cannot|unable|not found|undefined|null pointer|stack trace|traceback)\b/i.test(outputStr) ||
    /exit.*code.*[1-9]/i.test(outputStr) ||
    (typeof output === "object" && output !== null && "error" in output);

  if (isFailure) {
    const excerpt = outputStr.slice(0, 200);
    return {
      type: "tool_failure",
      content: `Tool ${tool} failed: ${excerpt}`,
    };
  }

  // Only capture success for meaningful tools (not trivial reads)
  const meaningfulSuccessTools = new Set(["Bash", "bash", ...FILE_TOOLS]);
  if (meaningfulSuccessTools.has(tool)) {
    const pathArg =
      (args["file_path"] as string) ||
      (args["path"] as string) ||
      (args["command"] as string | undefined)?.slice(0, 60) ||
      "";
    return {
      type: "tool_success",
      content: `Tool ${tool} succeeded${pathArg ? `: ${pathArg}` : ""}`,
    };
  }

  return null;
}

/**
 * Extract work item (file change) from tool execution.
 */
export function extractWorkItem(
  sessionId: string,
  tool: string,
  args: Record<string, unknown>
): WorkItem | null {
  if (!FILE_TOOLS.has(tool)) return null;

  const filePath =
    (args["file_path"] as string) ||
    (args["path"] as string) ||
    (args["target_file"] as string) ||
    null;

  if (!filePath) return null;

  const action: WorkItem["action"] = DELETE_TOOLS.has(tool)
    ? "deleted"
    : args["content"] !== undefined || args["new_str"] !== undefined
    ? "modified"
    : "created";

  return {
    sessionId,
    tool,
    file: filePath,
    action,
    timestamp: getISOTimestamp(),
  };
}

// ── Persistence Helpers ────────────────────────────────────────────────────

/**
 * Ensure directory exists, creating it if needed.
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Append a JSONL entry atomically.
 */
function appendJsonl(filePath: string, entry: unknown): void {
  ensureDir(join(filePath, ".."));
  appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

/**
 * Write a learning signal markdown file.
 */
function writeLearningFile(signal: LearningSignalEntry): void {
  try {
    const category = signal.category ?? getLearningCategory(signal.content);
    const yearMonth = getYearMonth();
    const dir = join(getLearningDir(), category, yearMonth);
    ensureDir(dir);

    const ts = getTimestamp();
    const slug = slugify(signal.content.slice(0, 30));
    const filename = `${ts}_LEARNING_${slug}.md`;
    const filePath = join(dir, filename);

    const content = `---
type: ${category}
session: ${signal.sessionId}
timestamp: ${signal.timestamp}
signal_type: ${signal.type}
---

# Learning Signal: ${signal.type}

**Category:** ${category}
**Session:** ${signal.sessionId.slice(0, 8)}

**Content:**
${signal.content}

${signal.metadata ? `**Metadata:**\n\`\`\`json\n${JSON.stringify(signal.metadata, null, 2)}\n\`\`\`` : ""}

---
*Auto-captured by PAI-OpenCode learning tracker*
`;

    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, content, "utf-8");
    renameSync(tmp, filePath);

    fileLog(`Learning file written: ${filename}`, "debug");
  } catch (err) {
    fileLog(`Failed to write learning file: ${err}`, "warn");
  }
}

/**
 * Write work summary markdown for a session.
 */
export function writeWorkSummary(sessionId: string, workItems: WorkItem[]): void {
  try {
    if (workItems.length === 0) return;

    const workDir = getMemoryPath("WORK");
    ensureDir(workDir);

    const date = getDateString();
    const filename = `${date}-${sessionId.slice(0, 8)}.md`;
    const filePath = join(workDir, filename);

    const byAction: Record<string, string[]> = { created: [], modified: [], deleted: [], executed: [] };
    for (const item of workItems) {
      byAction[item.action] = byAction[item.action] ?? [];
      byAction[item.action]?.push(item.file ?? item.tool);
    }

    const lines = [
      `# Work Summary — ${date}`,
      ``,
      `**Session:** ${sessionId}`,
      `**Items:** ${workItems.length}`,
      ``,
      `## Files Modified`,
      ...byAction.modified?.map((f) => `- modified: \`${f}\``) ?? [],
      ...byAction.created?.map((f) => `- created: \`${f}\``) ?? [],
      ...byAction.deleted?.map((f) => `- deleted: \`${f}\``) ?? [],
      ``,
      `## Commands Executed`,
      ...byAction.executed?.map((c) => `- \`${c}\``) ?? [],
      ``,
      `---`,
      `*Auto-captured by PAI-OpenCode learning tracker*`,
    ];

    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, lines.join("\n") + "\n", "utf-8");
    renameSync(tmp, filePath);

    fileLog(`Work summary written: ${filename}`, "debug");
  } catch (err) {
    fileLog(`Failed to write work summary: ${err}`, "warn");
  }
}

// ── OpenCode Hook Handlers ─────────────────────────────────────────────────

/**
 * tool.execute.after handler — capture implicit signals + work items.
 * Schicht 2: fire-and-forget, never blocks.
 */
export async function toolExecuteAfterHandler(
  input: { tool: string; sessionID?: string; callID?: string; args?: unknown },
  _output: unknown
): Promise<void> {
  try {
    const sessionId = input.sessionID ?? "unknown";
    const tool = input.tool ?? "unknown";
    const args = (input.args as Record<string, unknown>) ?? {};
    const state = getOrCreateState(sessionId);

    // Extract implicit learning signal
    const signal = extractToolSignal(tool, args, _output);
    if (signal) {
      const entry: LearningSignalEntry = {
        timestamp: getISOTimestamp(),
        sessionId,
        type: signal.type,
        category: getLearningCategory(signal.content),
        content: signal.content,
        metadata: { tool, callId: input.callID },
      };
      state.signals.push(entry);
    }

    // Track work items (file changes)
    const workItem = extractWorkItem(sessionId, tool, args);
    if (workItem) {
      state.workItems.push(workItem);
    }

    sessionState.set(sessionId, state);
  } catch (err) {
    // Fire-and-forget — never throw
    fileLog(`learning-tracker toolExecuteAfterHandler error: ${err}`, "warn");
  }
}

/**
 * chat.message handler — explicit rating extraction + PRD sync detection.
 * Schicht 2: fire-and-forget, never blocks.
 */
export async function chatMessageHandler(
  input: { sessionID?: string; messageID?: string; message?: unknown },
  _output: unknown
): Promise<void> {
  try {
    const sessionId = input.sessionID ?? "unknown";
    const state = getOrCreateState(sessionId);

    // Extract message text
    let messageText = "";
    if (typeof input.message === "string") {
      messageText = input.message;
    } else if (input.message && typeof input.message === "object") {
      const msg = input.message as Record<string, unknown>;
      if (typeof msg["content"] === "string") {
        messageText = msg["content"];
      } else if (Array.isArray(msg["content"])) {
        messageText = (msg["content"] as Array<{ type?: string; text?: string }>)
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join(" ");
      }
    }

    if (!messageText) return;

    // Explicit rating capture
    const ratingResult = extractRating(messageText);
    if (ratingResult) {
      const ratingEntry: RatingEntry = {
        timestamp: getISOTimestamp(),
        sessionId,
        rating: ratingResult.rating,
        source: "explicit",
        comment: ratingResult.comment,
      };
      state.ratings.push(ratingEntry);

      // Persist rating to JSONL immediately
      const signalsDir = getMemoryPath("LEARNING", SIGNALS_DIR_NAME);
      const ratingsFile = join(signalsDir, RATINGS_FILE);
      appendJsonl(ratingsFile, ratingEntry);

      fileLog(`Rating captured: ${ratingResult.rating}/10 for session ${sessionId.slice(0, 8)}`, "debug");
    }

    // PRD sync detection
    if (PRD_PREFIXES.test(messageText.trim())) {
      const prdSignal: LearningSignalEntry = {
        timestamp: getISOTimestamp(),
        sessionId,
        type: "prd_sync",
        category: "ALGORITHM",
        content: messageText.slice(0, 500),
        metadata: { messageId: input.messageID },
      };
      state.signals.push(prdSignal);
    }

    sessionState.set(sessionId, state);
  } catch (err) {
    fileLog(`learning-tracker chatMessageHandler error: ${err}`, "warn");
  }
}

/**
 * Flush all buffered signals for a session to disk.
 * Called by session lifecycle manager at session end.
 */
export async function flushSessionLearnings(sessionId: string): Promise<void> {
  try {
    const state = sessionState.get(sessionId);
    if (!state) return;

    // Write learning files for non-trivial signals (tool failures + prd_sync)
    for (const signal of state.signals) {
      if (signal.type === "tool_failure" || signal.type === "prd_sync") {
        writeLearningFile(signal);
      }
    }

    // Write work summary
    writeWorkSummary(sessionId, state.workItems);

    state.flushCount++;
    fileLog(
      `Flushed ${state.signals.length} signals, ${state.workItems.length} work items for session ${sessionId.slice(0, 8)}`,
      "debug"
    );

    // Clear after flush
    sessionState.set(sessionId, { signals: [], workItems: [], ratings: [], flushCount: state.flushCount });
  } catch (err) {
    fileLog(`flushSessionLearnings error: ${err}`, "warn");
  }
}

/**
 * Get current buffered signals for a session (used by T13 compaction handler).
 */
export function getSessionSignals(sessionId: string): LearningSignalEntry[] {
  return sessionState.get(sessionId)?.signals ?? [];
}

/**
 * Get current buffered ratings for a session.
 */
export function getSessionRatings(sessionId: string): RatingEntry[] {
  return sessionState.get(sessionId)?.ratings ?? [];
}

/**
 * Clear session state (called on session end via T10).
 */
export function clearLearningState(sessionId: string): void {
  sessionState.delete(sessionId);
}
