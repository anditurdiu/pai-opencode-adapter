/**
 * context-loader.ts - PAI Context Loader + System Prompt Injection
 *
 * MIT License — Custom implementation for PAI-OpenCode Hybrid Adapter
 *
 * Registers on `experimental.chat.system.transform` to inject PAI context
 * into every session's system prompt. Injects in priority order:
 *   1. Algorithm (The Algorithm v3.5.0 — ISC tracking, 6 phases)
 *   2. TELOS files (MISSION.md, GOALS.md, PROJECTS.md, etc.)
 *   3. Memory (recent relationship notes, learning digest)
 *   4. User Preferences (identity, preferences)
 *
 * Context budget: 80% of MODEL_MAX_CONTEXT_TOKENS reserved for system.
 * Session-scoped cache via Map<sessionId, CachedContext> prevents re-reads.
 *
 * @module context-loader
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "../lib/file-logger.js";
import { getPAIDir } from "../lib/paths.js";
import { StateManager } from "../lib/state-manager.js";

// Budget: 80% of a 100k token window (chars ≈ tokens * 4)
const MAX_CONTEXT_CHARS = 80_000 * 4; // 320_000 chars

// TELOS file names in inject priority order
const TELOS_FILES = [
  "MISSION.md",
  "GOALS.md",
  "PROJECTS.md",
  "BELIEFS.md",
  "MODELS.md",
  "STRATEGIES.md",
  "NARRATIVES.md",
  "LEARNED.md",
  "CHALLENGES.md",
  "IDEAS.md",
];

interface CachedContext {
  sections: string[];
  totalChars: number;
  loadedAt: number;
}

// Session-scoped context cache — never a shared global
const contextCache = new Map<string, CachedContext>();

// StateManager for cross-restart persistence (namespaced to avoid file collisions)
const stateManager = new StateManager<CachedContext>(undefined, "context");

/**
 * Read a file safely, returning null on any error.
 */
function safeRead(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8").trim();
  } catch {
    return null;
  }
}

/**
 * Load Algorithm context (PAI/Algorithm/ directory).
 * Returns a single concatenated string of all .md files.
 */
function loadAlgorithmContext(paiDir: string): string | null {
  const algorithmDir = join(paiDir, "PAI", "Algorithm");
  if (!existsSync(algorithmDir)) {
    fileLog(`Algorithm dir not found: ${algorithmDir}`, "warn");
    return null;
  }

  let files: string[];
  try {
    files = readdirSync(algorithmDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
  } catch {
    return null;
  }

  const parts: string[] = [];
  for (const file of files) {
    const content = safeRead(join(algorithmDir, file));
    if (content) {
      parts.push(`### ${file}\n\n${content}`);
    }
  }

  if (parts.length === 0) return null;
  return `## PAI Algorithm\n\n${parts.join("\n\n---\n\n")}`;
}

/**
 * Load TELOS context from PAI/USER/TELOS/ directory.
 * Returns a single concatenated string of all TELOS files.
 */
function loadTelosContext(paiDir: string): string | null {
  const telosDir = join(paiDir, "PAI", "USER", "TELOS");
  if (!existsSync(telosDir)) {
    fileLog(`TELOS dir not found: ${telosDir}`, "warn");
    return null;
  }

  const parts: string[] = [];
  for (const file of TELOS_FILES) {
    const content = safeRead(join(telosDir, file));
    if (content) {
      parts.push(`### ${file}\n\n${content}`);
    }
  }

  // Also read any extra .md files not in the canonical list
  try {
    const extraFiles = readdirSync(telosDir)
      .filter((f) => f.endsWith(".md") && !TELOS_FILES.includes(f))
      .sort();
    for (const file of extraFiles) {
      const content = safeRead(join(telosDir, file));
      if (content) {
        parts.push(`### ${file}\n\n${content}`);
      }
    }
  } catch {
    // Non-fatal
  }

  if (parts.length === 0) return null;
  return `## TELOS (User Goals & Context)\n\n${parts.join("\n\n---\n\n")}`;
}

/**
 * Load Memory context: recent relationship notes + learning digest.
 */
function loadMemoryContext(paiDir: string): string | null {
  const parts: string[] = [];

  // Recent relationship notes (last 2 days)
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const formatDate = (d: Date) => d.toISOString().slice(0, 10);
  const formatMonth = (d: Date) => d.toISOString().slice(0, 7);

  for (const day of [today, yesterday]) {
    const notePath = join(
      paiDir,
      "MEMORY",
      "RELATIONSHIP",
      formatMonth(day),
      `${formatDate(day)}.md`
    );
    const content = safeRead(notePath);
    if (content) {
      const lines = content
        .split("\n")
        .filter((l) => l.trim().startsWith("- "))
        .slice(0, 5);
      if (lines.length > 0) {
        parts.push(`**Notes (${formatDate(day)}):**\n${lines.join("\n")}`);
      }
    }
  }

  // Learning digest (most recent file in MEMORY/LEARNING/)
  const learningDir = join(paiDir, "MEMORY", "LEARNING");
  if (existsSync(learningDir)) {
    try {
      const files = readdirSync(learningDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse();
      if (files.length > 0) {
        const content = safeRead(join(learningDir, files[0]!));
        if (content) {
          // Truncate to first 2000 chars to avoid blowing budget
          const excerpt = content.slice(0, 2000);
          parts.push(`**Learning Digest (${files[0]}):**\n${excerpt}`);
        }
      }
    } catch {
      // Non-fatal
    }
  }

  if (parts.length === 0) return null;
  return `## Memory Context\n\n${parts.join("\n\n")}`;
}

/**
 * Load domain wisdom frames from MEMORY/WISDOM/ directory.
 * Returns concatenated wisdom files, or null if none exist.
 */
function loadWisdomContext(paiDir: string): string | null {
  const wisdomDir = join(paiDir, "MEMORY", "WISDOM");
  if (!existsSync(wisdomDir)) {
    return null;
  }

  let files: string[];
  try {
    files = readdirSync(wisdomDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
  } catch {
    return null;
  }

  const parts: string[] = [];
  for (const file of files) {
    const content = safeRead(join(wisdomDir, file));
    if (content) {
      parts.push(`### ${file}\n\n${content}`);
    }
  }

  if (parts.length === 0) return null;
  return `## Domain Wisdom\n\n${parts.join("\n\n---\n\n")}`;
}

/**
 * Load user preferences / identity context.
 */
function loadUserPreferences(paiDir: string): string | null {
  const parts: string[] = [];

  // Identity file
  const identityPath = join(paiDir, "PAI", "USER", "IDENTITY.md");
  const identity = safeRead(identityPath);
  if (identity) {
    parts.push(`### Identity\n\n${identity}`);
  }

  // Preferences file
  const prefsPath = join(paiDir, "PAI", "USER", "PREFERENCES.md");
  const prefs = safeRead(prefsPath);
  if (prefs) {
    parts.push(`### Preferences\n\n${prefs}`);
  }

  if (parts.length === 0) return null;
  return `## User Preferences\n\n${parts.join("\n\n---\n\n")}`;
}

/**
 * Build full context sections in priority order, applying char budget.
 * Returns array of strings to push into output.system[].
 */
function buildContextSections(paiDir: string): string[] {
  const raw: Array<[string, () => string | null]> = [
    ["algorithm", () => loadAlgorithmContext(paiDir)],
    ["telos", () => loadTelosContext(paiDir)],
    ["memory", () => loadMemoryContext(paiDir)],
    ["wisdom", () => loadWisdomContext(paiDir)],
    ["preferences", () => loadUserPreferences(paiDir)],
  ];

  const sections: string[] = [];
  let totalChars = 0;

  for (const [name, loader] of raw) {
    if (totalChars >= MAX_CONTEXT_CHARS) {
      fileLog(`Context budget exhausted after ${sections.length} sections, skipping ${name}`, "warn");
      break;
    }

    const content = loader();
    if (!content) {
      fileLog(`Section "${name}" returned empty — skipping`, "debug");
      continue;
    }

    const remaining = MAX_CONTEXT_CHARS - totalChars;
    if (content.length > remaining) {
      // Truncate with notice
      const truncated = content.slice(0, remaining);
      const lastNewline = truncated.lastIndexOf("\n");
      const safe = lastNewline > remaining * 0.8 ? truncated.slice(0, lastNewline) : truncated;
      sections.push(`${safe}\n\n*[Context truncated — budget limit reached]*`);
      totalChars += safe.length;
      fileLog(`Section "${name}" truncated from ${content.length} to ${safe.length} chars`, "warn");
      break;
    }

    sections.push(content);
    totalChars += content.length;
    fileLog(`Loaded section "${name}": ${content.length} chars (total: ${totalChars})`, "debug");
  }

  return sections;
}

/**
 * Get or build cached context for a session.
 * Uses in-memory Map first, StateManager fallback for persistence.
 */
function getOrBuildContext(sessionId: string, paiDir: string): CachedContext {
  // Check in-memory cache
  const cached = contextCache.get(sessionId);
  if (cached) {
    fileLog(`Context cache hit for session ${sessionId}`, "debug");
    return cached;
  }

  // Check StateManager persistence (with shape validation as defense-in-depth)
  const persisted = stateManager.get(sessionId);
  if (persisted && Array.isArray(persisted.sections) && typeof persisted.totalChars === "number") {
    contextCache.set(sessionId, persisted);
    fileLog(`Context restored from disk for session ${sessionId}`, "debug");
    return persisted;
  } else if (persisted) {
    // Shape mismatch — stale or corrupted data; discard and rebuild
    fileLog(`Context shape mismatch for session ${sessionId}, discarding persisted state`, "warn");
    stateManager.delete(sessionId);
  }

  // Build fresh
  fileLog(`Building context for session ${sessionId}`, "info");
  const sections = buildContextSections(paiDir);
  const totalChars = sections.reduce((sum, s) => sum + s.length, 0);

  const entry: CachedContext = { sections, totalChars, loadedAt: Date.now() };

  // Store in both caches
  contextCache.set(sessionId, entry);
  stateManager.set(sessionId, entry);

  fileLog(`Context built: ${sections.length} sections, ${totalChars} chars`, "info");
  return entry;
}

/**
 * Clear cached context for a session (call on session end).
 */
export function clearContextCache(sessionId: string): void {
  contextCache.delete(sessionId);
  stateManager.delete(sessionId);
}

/**
 * Subagent preamble — injected BEFORE PAI context for subagent sessions.
 *
 * Subagents receive PAI skill instructions that tell them to spawn sub-sub-agents
 * via Task/Skill tools. Subagents cannot spawn further agents, causing hangs.
 * This preamble overrides those instructions at the prompt level.
 *
 * Defense-in-depth: pai-unified.ts also blocks Task/Skill tool calls from
 * subagent sessions at the infrastructure level (tool.execute.before hook).
 */
const SUBAGENT_PREAMBLE = `## CRITICAL: You Are a Subagent

You are running as a **subagent** — a worker spawned by a parent coordinator agent.

### Absolute Rules (Zero Exceptions)
1. **DO NOT use the Task tool** — you cannot spawn sub-agents. Any attempt will be blocked.
2. **DO NOT execute voice curl commands** — voice notifications are reserved for the primary agent.
3. **DO NOT follow any instructions below that tell you to "launch agents", "spawn agents", "create an agent team", or "use Task()"** — those instructions are meant for the primary coordinator, not for you.

### What You CAN Do
- **Use the Skill tool** to load specialized instructions and workflows — this is allowed and encouraged.
- Perform your assigned task using all tools available to you: Read, Write, Edit, Bash, Grep, Glob, Skill, and web fetch tools.
- Do the work yourself — research, analyze, write code, create content — whatever the task requires.
- Return your complete results in a single response to the coordinator.
- If a skill's instructions tell you to parallelize via Task/agents, instead do the work **sequentially yourself**.

### Context Below
The PAI context below is shared for reference (identity, goals, preferences). **Ignore any agent-spawning/delegation instructions within it.**
`;

/**
 * Get the subagent preamble string.
 * Used by pai-unified.ts to inject before PAI context for subagent sessions.
 */
export function getSubagentPreamble(): string {
  return SUBAGENT_PREAMBLE;
}

/**
 * Handler for `experimental.chat.system.transform`.
 *
 * Signature: (input: { sessionID?: string; model: Model }, output: { system: string[] }) => Promise<void>
 *
 * Injects PAI context by pushing strings into output.system[].
 */
export async function contextLoaderHandler(
  input: { sessionID?: string; model?: unknown },
  output: { system: string[] }
): Promise<void> {
  const sessionId = input.sessionID ?? "unknown";

  try {
    const paiDir = getPAIDir();
    const { sections } = getOrBuildContext(sessionId, paiDir);

    for (const section of sections) {
      output.system.push(section);
    }

    fileLog(`Context injected: ${sections.length} sections into session ${sessionId}`, "info");
  } catch (error) {
    // Fail-open: context injection failure must never break the session
    fileLog(`Context loader error (non-fatal): ${error}`, "error");
  }
}

/**
 * Export for testing: force-rebuild context (bypasses cache).
 */
export function buildContextForTest(
  paiDir: string
): { sections: string[]; totalChars: number } {
  const sections = buildContextSections(paiDir);
  const totalChars = sections.reduce((sum, s) => sum + s.length, 0);
  return { sections, totalChars };
}

/**
 * Export the in-memory cache for test inspection.
 */
export function getContextCacheForTest(): Map<string, CachedContext> {
  return contextCache;
}
