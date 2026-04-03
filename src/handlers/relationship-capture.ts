import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "../lib/file-logger.js";
import { getISOTimestamp } from "../lib/time.js";
import { getMemoryPath, getDateString } from "../lib/paths.js";

interface RelationshipSignal {
  timestamp: string;
  sessionId: string;
  signalType: "praise" | "criticism" | "preference" | "correction" | "trust_signal" | "frustration";
  content: string;
}

const RELATIONSHIP_DIR = () => getMemoryPath("LEARNING", "RELATIONSHIP");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const SIGNAL_PATTERNS: Array<{ pattern: RegExp; signalType: RelationshipSignal["signalType"] }> = [
  { pattern: /\b(great job|well done|nailed it|perfect|exactly|that's right|yes exactly)\b/i, signalType: "praise" },
  { pattern: /\b(wrong|no that's not|incorrect|bad answer|not what i|stop doing)\b/i, signalType: "criticism" },
  { pattern: /\b(i prefer|i always|i never|i like|i don't like|in the future|from now on|always use|never use)\b/i, signalType: "preference" },
  { pattern: /\b(actually|instead|no use|correction|let me clarify|what i meant)\b/i, signalType: "correction" },
  { pattern: /\b(trust you|rely on you|you always|you're the best|go ahead|your call)\b/i, signalType: "trust_signal" },
  { pattern: /\b(this is (taking|ridiculous)|again\?|still not|keep (making|getting)|frustrating|annoying)\b/i, signalType: "frustration" },
];

export function extractRelationshipSignal(
  sessionId: string,
  message: string,
): RelationshipSignal | null {
  for (const { pattern, signalType } of SIGNAL_PATTERNS) {
    if (pattern.test(message)) {
      return {
        timestamp: getISOTimestamp(),
        sessionId,
        signalType,
        content: message.slice(0, 500),
      };
    }
  }
  return null;
}

export function persistRelationshipSignal(signal: RelationshipSignal): void {
  try {
    const dir = RELATIONSHIP_DIR();
    ensureDir(dir);

    const date = getDateString();
    const file = join(dir, `${date}.jsonl`);

    appendFileSync(file, JSON.stringify(signal) + "\n", "utf-8");

    fileLog(
      `[relationship-capture] ${signal.signalType} signal captured for session ${signal.sessionId.slice(0, 8)}`,
      "debug",
    );
  } catch (err) {
    fileLog(`[relationship-capture] Persist failed: ${err}`, "warn");
  }
}
