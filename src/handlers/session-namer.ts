import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "../lib/file-logger.js";
import { getISOTimestamp } from "../lib/time.js";
import { getMemoryPath, getTimestamp, slugify } from "../lib/paths.js";
import { StateManager } from "../lib/state-manager.js";

interface NamingState {
  firstUserMessage: string;
  namedAt: number;
  name: string;
}

const stateManager = new StateManager<NamingState>(undefined, "naming");
const SESSION_NAMES_DIR = () => getMemoryPath("RAW", "session-names");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const TOPIC_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(fix|bug|broken|error|crash|issue|debug)\b/i, label: "fix" },
  { pattern: /\b(add|create|implement|build|new|feature)\b/i, label: "add" },
  { pattern: /\b(refactor|clean|restructure|reorganize|rewrite)\b/i, label: "refactor" },
  { pattern: /\b(test|spec|coverage|unit.?test)\b/i, label: "test" },
  { pattern: /\b(review|audit|check|inspect|analyze)\b/i, label: "review" },
  { pattern: /\b(deploy|release|publish|ship)\b/i, label: "deploy" },
  { pattern: /\b(config|setup|install|configure)\b/i, label: "config" },
  { pattern: /\b(doc|readme|comment|document)\b/i, label: "docs" },
  { pattern: /\b(security|vuln|pentest|OWASP)\b/i, label: "security" },
  { pattern: /\b(performance|optim|speed|fast|slow)\b/i, label: "perf" },
  { pattern: /\b(design|architect|plan|scheme)\b/i, label: "design" },
  { pattern: /\b(research|investigate|explore|learn)\b/i, label: "research" },
];

function extractTopic(message: string): string {
  for (const { pattern, label } of TOPIC_PATTERNS) {
    if (pattern.test(message)) return label;
  }
  return "work";
}

function extractSubject(message: string): string {
  const cleaned = message
    .replace(/^(please|can you|could you|i want|i need|let's|help me)\s+/i, "")
    .replace(/[?!.,;]+$/, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const subject = words.slice(0, 5).join("-");
  return slugify(subject).slice(0, 40);
}

function generateName(firstMessage: string): string {
  const topic = extractTopic(firstMessage);
  const subject = extractSubject(firstMessage);
  return subject ? `${topic}-${subject}` : topic;
}

export function nameSession(sessionId: string, userMessage: string): string | null {
  try {
    const existing = stateManager.get(sessionId);
    if (existing?.name) return null;

    const name = generateName(userMessage);

    stateManager.set(sessionId, {
      firstUserMessage: userMessage.slice(0, 200),
      namedAt: Date.now(),
      name,
    });

    persistSessionName(sessionId, name);

    fileLog(
      `[session-namer] Named session ${sessionId.slice(0, 8)}: "${name}"`,
      "info",
    );

    return name;
  } catch (err) {
    fileLog(`[session-namer] Failed: ${err}`, "warn");
    return null;
  }
}

function persistSessionName(sessionId: string, name: string): void {
  try {
    const dir = SESSION_NAMES_DIR();
    ensureDir(dir);

    const ts = getTimestamp();
    const filename = `${ts}_${name}.json`;
    const file = join(dir, filename);

    const entry = {
      sessionId,
      name,
      namedAt: getISOTimestamp(),
    };

    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(entry, null, 2) + "\n", "utf-8");
    renameSync(tmp, file);
  } catch (err) {
    fileLog(`[session-namer] Persist failed: ${err}`, "warn");
  }
}

export function getSessionName(sessionId: string): string | null {
  const state = stateManager.get(sessionId);
  return state?.name ?? null;
}

export function clearNamingState(sessionId: string): void {
  stateManager.delete(sessionId);
}
