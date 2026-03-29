import { existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "../lib/file-logger.js";
import { getMemoryPath, getDateString } from "../lib/paths.js";
import { getISOTimestamp } from "../lib/time.js";
import { getContextCacheForTest } from "./context-loader.js";
import { getSessionSignals } from "./learning-tracker.js";
import { findLatestPRD, readPRD, parseFrontmatter, countCriteria } from "../lib/prd-utils.js";

const MAX_SURVIVAL_CHARS = 8000;
const MAX_PRD_SECTION_CHARS = 1500;

export interface CompactionState {
  sessionId: string;
  compactedAt: string;
  rescuedSignalCount: number;
  injectedSections: number;
}

const compactionMetadata = new Map<string, CompactionState>();

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function buildPRDSurvivalSection(): string | null {
  try {
    const prdPath = findLatestPRD();
    if (!prdPath) return null;

    const prd = readPRD(prdPath);
    if (!prd) return null;

    const fm = parseFrontmatter(prd.content);
    const { checked, total } = countCriteria(prd.content);

    const phase = fm["phase"] ?? "unknown";
    const effort = fm["effort"] ?? fm["effort_level"] ?? "unknown";
    const task = fm["task"] ?? "(no task)";

    const section = [
      "## Active PRD (Survival — Carry Forward)",
      "",
      `**PRD Path:** ${prdPath}`,
      `**Task:** ${task}`,
      `**Phase:** ${phase} | **Effort:** ${effort} | **Progress:** ${checked}/${total}`,
      "",
      `Resume the Algorithm from phase "${phase}". Read the full PRD at the path above for criteria details.`,
    ].join("\n");

    return section.length > MAX_PRD_SECTION_CHARS
      ? section.slice(0, MAX_PRD_SECTION_CHARS) + "\n...[truncated]"
      : section;
  } catch (err) {
    fileLog(`buildPRDSurvivalSection error (fail-open): ${err}`, "warn");
    return null;
  }
}

function buildSurvivalContext(sessionId: string): string[] {
  const sections: string[] = [];

  const cache = getContextCacheForTest();
  const cached = cache.get(sessionId);

  if (cached?.sections && cached.sections.length > 0) {
    const combined = cached.sections.join("\n\n");
    const truncated = combined.length > MAX_SURVIVAL_CHARS
      ? combined.slice(0, MAX_SURVIVAL_CHARS) + "\n...[truncated for compaction budget]"
      : combined;

    sections.push(
      "## Session Context (Survival — Carry Forward)\n\n" +
      "The following context was active before compaction:\n\n" +
      truncated
    );
  }

  const prdSection = buildPRDSurvivalSection();
  if (prdSection !== null) {
    sections.push(prdSection);
  }

  const signals = getSessionSignals(sessionId);
  if (signals.length > 0) {
    const failures = signals.filter((s) => s.type === "tool_failure");
    const successes = signals.filter((s) => s.type === "tool_success");
    const prdSyncs = signals.filter((s) => s.type === "prd_sync");

    const lines = ["## Learning Signals (Survival — Carry Forward)", ""];

    if (failures.length > 0) {
      lines.push(`**Failures this session (${failures.length}):**`);
      for (const f of failures.slice(0, 5)) {
        lines.push(`- ${f.content.slice(0, 120)}`);
      }
    }
    if (successes.length > 0) {
      lines.push(`**Successes this session (${successes.length}):** recorded`);
    }
    if (prdSyncs.length > 0) {
      lines.push(`**PRD sync signals (${prdSyncs.length}):**`);
      for (const p of prdSyncs.slice(0, 3)) {
        lines.push(`- ${p.content.slice(0, 100)}`);
      }
    }

    sections.push(lines.join("\n"));
  }

  return sections;
}

export async function compactionProactiveHandler(
  input: { sessionID: string },
  output: { context: string[]; prompt?: string }
): Promise<void> {
  try {
    const sessionId = input.sessionID;
    if (!sessionId) return;

    const sections = buildSurvivalContext(sessionId);

    let totalChars = 0;
    for (const section of sections) {
      const remaining = MAX_SURVIVAL_CHARS - totalChars;
      if (remaining <= 0) break;

      const toAdd = section.length > remaining ? section.slice(0, remaining) : section;
      output.context.push(toAdd);
      totalChars += toAdd.length;
    }

    fileLog(
      `compaction proactive: injected ${sections.length} sections (${totalChars} chars) for session ${sessionId.slice(0, 8)}`,
      "debug"
    );
  } catch (err) {
    fileLog(`compactionProactiveHandler error (fail-open): ${err}`, "warn");
  }
}

export async function compactionReactiveHandler(
  input: { event?: { type: string; properties?: Record<string, unknown> } }
): Promise<void> {
  try {
    const event = input.event;
    if (!event || event.type !== "session.compacted") return;

    const sessionId =
      (event.properties?.["sessionID"] as string) ||
      (event.properties?.["session_id"] as string);

    if (!sessionId) return;

    const signals = getSessionSignals(sessionId);
    const rescuedCount = signals.length;

    if (rescuedCount > 0) {
      const compactionDir = getMemoryPath("LEARNING", "COMPACTION");
      ensureDir(compactionDir);

      const date = getDateString();
      const filename = `${date}-${sessionId.slice(0, 8)}.md`;
      const filePath = join(compactionDir, filename);

      const lines = [
        `# Compaction Learning Rescue — ${date}`,
        ``,
        `**Session:** ${sessionId}`,
        `**Rescued Signals:** ${rescuedCount}`,
        `**Timestamp:** ${getISOTimestamp()}`,
        ``,
        `## Rescued Signals`,
        ``,
      ];

      for (const signal of signals) {
        lines.push(`### ${signal.type} — ${signal.timestamp}`);
        lines.push(signal.content.slice(0, 300));
        lines.push(``);
      }

      lines.push(`---`);
      lines.push(`*Auto-rescued by PAI-OpenCode compaction handler*`);

      const tmp = `${filePath}.tmp`;
      writeFileSync(tmp, lines.join("\n") + "\n", "utf-8");
      renameSync(tmp, filePath);
    }

    const meta: CompactionState = {
      sessionId,
      compactedAt: getISOTimestamp(),
      rescuedSignalCount: rescuedCount,
      injectedSections: 0,
    };
    compactionMetadata.set(sessionId, meta);

    fileLog(
      `compaction reactive: rescued ${rescuedCount} signals for session ${sessionId.slice(0, 8)}`,
      "debug"
    );
  } catch (err) {
    fileLog(`compactionReactiveHandler error (fail-open): ${err}`, "warn");
  }
}

export function getCompactionMetadata(sessionId: string): CompactionState | undefined {
  return compactionMetadata.get(sessionId);
}

export function clearCompactionState(sessionId: string): void {
  compactionMetadata.delete(sessionId);
}
