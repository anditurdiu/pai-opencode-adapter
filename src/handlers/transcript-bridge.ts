import { appendFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "../lib/file-logger.js";
import { getISOTimestamp } from "../lib/time.js";
import { getMemoryPath, getTimestamp } from "../lib/paths.js";

interface TranscriptEntry {
  timestamp: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: {
    model?: string;
    tokens?: { input: number; output: number };
    tools?: string[];
  };
}

const RAW_DIR = () => getMemoryPath("RAW", "transcripts");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function recordTranscriptEntry(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
  metadata?: TranscriptEntry["metadata"],
): void {
  try {
    const entry: TranscriptEntry = {
      timestamp: getISOTimestamp(),
      sessionId,
      role,
      content: content.slice(0, 10000),
      ...(metadata ? { metadata } : {}),
    };

    const dir = RAW_DIR();
    ensureDir(dir);

    const date = new Date().toISOString().slice(0, 10);
    const file = join(dir, `${date}.jsonl`);
    appendFileSync(file, JSON.stringify(entry) + "\n", "utf-8");

    fileLog(
      `[transcript-bridge] Recorded ${role} entry for session ${sessionId.slice(0, 8)} (${content.length} chars)`,
      "debug",
    );
  } catch (err) {
    fileLog(`[transcript-bridge] Failed to record entry: ${err}`, "warn");
  }
}

export async function captureFullTranscript(
  client: { session: { messages: (opts: Record<string, unknown>) => Promise<Array<Record<string, unknown>>> } },
  sessionId: string,
): Promise<number> {
  try {
    const messages = await client.session.messages({ sessionId });

    const dir = RAW_DIR();
    ensureDir(dir);

    const ts = getTimestamp();
    const filename = `${ts}_transcript_${sessionId.slice(0, 8)}.jsonl`;
    const file = join(dir, filename);

    let count = 0;
    for (const msg of messages) {
      const entry: TranscriptEntry = {
        timestamp: getISOTimestamp(),
        sessionId,
        role: (msg.role as "user" | "assistant" | "system") ?? "unknown",
        content: typeof msg.content === "string" ? msg.content.slice(0, 10000) : JSON.stringify(msg.content).slice(0, 10000),
      };
      appendFileSync(file, JSON.stringify(entry) + "\n", "utf-8");
      count++;
    }

    fileLog(
      `[transcript-bridge] Full transcript captured: ${count} messages for session ${sessionId.slice(0, 8)}`,
      "info",
    );

    return count;
  } catch (err) {
    fileLog(`[transcript-bridge] Full transcript capture failed: ${err}`, "warn");
    return 0;
  }
}

export function writeSessionTranscriptSummary(
  sessionId: string,
  messageCount: number,
  durationSec: number,
  tools: string[],
): void {
  try {
    const dir = RAW_DIR();
    ensureDir(dir);

    const ts = getTimestamp();
    const filename = `${ts}_summary_${sessionId.slice(0, 8)}.md`;
    const file = join(dir, filename);

    const lines = [
      `# Transcript Summary — ${sessionId.slice(0, 8)}`,
      ``,
      `**Session:** ${sessionId}`,
      `**Messages:** ${messageCount}`,
      `**Duration:** ${durationSec}s`,
      `**Tools Used:** ${tools.length > 0 ? tools.join(", ") : "none"}`,
      `**Captured:** ${getISOTimestamp()}`,
      ``,
      `---`,
      `*Auto-captured by PAI transcript bridge*`,
    ];

    const tmp = `${file}.tmp`;
    writeFileSync(tmp, lines.join("\n") + "\n", "utf-8");
    renameSync(tmp, file);

    fileLog(`[transcript-bridge] Summary written: ${filename}`, "debug");
  } catch (err) {
    fileLog(`[transcript-bridge] Summary write failed: ${err}`, "warn");
  }
}
