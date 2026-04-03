import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { tool } from "@opencode-ai/plugin";
import type { PluginInput } from "@opencode-ai/plugin";
import { fileLog } from "../lib/file-logger.js";
import { emit as eventBusEmit } from "../core/event-bus.js";
import { isDuplicate, clearSessionDedup } from "../core/dedup-cache.js";

import {
  permissionGateHandler,
  inputValidationHandler,
} from "../handlers/security-validator.js";
import { contextLoaderHandler, clearContextCache, getSubagentPreamble } from "../handlers/context-loader.js";
import {
  registerSubagentType,
  clearSubagentType,
} from "../lib/agent-type-registry.js";
import {
  planModePermissionHandler,
  planModeMessageHandler,
  isPlanModeActive,
  clearPlanModeState,
} from "../handlers/plan-mode.js";
import {
  toolExecuteAfterHandler,
  chatMessageHandler,
  flushSessionLearnings,
  clearLearningState,
} from "../handlers/learning-tracker.js";
import {
  compactionProactiveHandler,
  compactionReactiveHandler,
  clearCompactionState,
} from "../handlers/compaction-handler.js";
import { voiceNotificationHandler, speakText, getStartupGreeting, routeNotificationByDuration, recordSessionStart } from "../handlers/voice-notifications.js";
import { onTaskStart, onSessionEnd as terminalSessionEnd, onPlanModeActivated, onError as terminalOnError } from "../handlers/terminal-ui.js";
import {
  onSessionStart as statuslineSessionStart,
  onMessageReceived as statuslineMessageReceived,
  onToolExecuted as statuslineToolExecuted,
  onTokenUsage as statuslineTokenUsage,
  onPhaseChange as statuslinePhaseChange,
  onPlanModeChange as statuslinePlanModeChange,
  onSessionEnd as statuslineSessionEnd,
  setContextLimit as statuslineSetContextLimit,
  syncFromPRD as statuslineSyncFromPRD,
  clearPRDBinding as statuslineClearPRDBinding,
} from "../handlers/statusline-writer.js";

import {
  onLifecycleSessionStart,
  onLifecycleMessage,
  onLifecycleSessionEnd,
} from "../handlers/session-lifecycle.js";
import {
  implicitSentimentHandler,
  clearImplicitSentimentState,
} from "../handlers/implicit-sentiment.js";
import {
  getModelRoutingContext,
  consumeFallbackSuggestion,
  formatFallbackReminder,
  classifyProviderError,
  setFallbackSuggestion,
  clearFallbackState,
  markProviderUnhealthy,
  checkSubagentHealth,
  extractProvider,
} from "../lib/model-resolver.js";
import { loadEnvFile } from "../handlers/env-loader.js";
import { logRawEvent } from "../handlers/raw-event-logger.js";
import { recordTranscriptEntry, captureFullTranscript } from "../handlers/transcript-bridge.js";
import { nameSession, clearNamingState } from "../handlers/session-namer.js";
import { extractRelationshipSignal, persistRelationshipSignal } from "../handlers/relationship-capture.js";
import { AGENT_DEFINITIONS, AGENT_NAMES } from "../agents/definitions.js";
import { readAgentModel } from "../lib/provider-probe.js";

const PLUGIN_NAME = "pai-adapter";
const PLUGIN_VERSION = "0.10.0";

/**
 * Detect whether a session event belongs to a sub-agent (not the main session).
 *
 * Primary detection is via the Task-call timing registry (see pendingSubagentSpawns).
 * This function is a fallback for cases where the timing registry misses a spawn.
 *
 * From diagnostic payload logging, we confirmed OpenCode sends `parentID` nested
 * inside `evt.properties.info` for subagent sessions.  We also check legacy field
 * names and env vars for forward compatibility.
 */
function isSubagentSession(evt: Record<string, unknown>): boolean {
  // 1. Explicit parent reference in the event payload (top-level)
  if (evt.parentSessionId || evt.parentSessionID || evt.parent_session_id || evt.parentID) {
    return true;
  }

  // 2. Agent metadata on the event (subagent sessions carry agentId/agentType)
  if (evt.agentId || evt.agentType || evt.agent_id) {
    return true;
  }

  // 3. Properties nested inside event.properties (OpenCode wraps some metadata)
  const props = evt.properties as Record<string, unknown> | undefined;
  if (props) {
    if (props.parentSessionId || props.parentSessionID || props.agentId || props.agentType || props.parentID) {
      return true;
    }
    // 3b. OpenCode confirmed: parentID is inside event.properties.info
    const info = props.info as Record<string, unknown> | undefined;
    if (info && (info.parentID || info.parentSessionId || info.parentSessionID)) {
      return true;
    }
  }

  // 4. Environment variable set by the host runtime for spawned agents
  if (process.env.OPENCODE_AGENT_TASK_ID || process.env.CLAUDE_CODE_AGENT_TASK_ID) {
    return true;
  }

  return false;
}

// ── Sub-agent session registry ─────────────────────────────────────
// Tracks session IDs that belong to sub-agents so we can block voice
// notifications from them at the tool execution level (bash curl to
// localhost:8888/notify).  Populated on session.created, cleared on
// session.end.
const subagentSessions = new Set<string>();

// ── Sub-agent activity tracking ────────────────────────────────────
// Tracks last activity per subagent session for stall detection.
// When a subagent session has no activity for STALL_TIMEOUT_MS,
// we inject a warning into the primary session's system prompt.
const STALL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

interface SubagentTrackingInfo {
  parentSessionId: string;
  subagentType: string;
  description: string;
  spawnedAt: number;
  lastActivityAt: number;
  stallWarned: boolean; // Only warn once per session
}

const subagentTracking = new Map<string, SubagentTrackingInfo>();

/**
 * Get stalled subagent warnings for a primary session.
 * Returns system-reminder blocks for any subagents that have been
 * inactive for longer than STALL_TIMEOUT_MS.
 */
function getStalledSubagentWarnings(primarySessionId: string): string | null {
  const now = Date.now();
  const warnings: string[] = [];

  for (const [subSid, info] of subagentTracking.entries()) {
    if (info.parentSessionId !== primarySessionId) continue;
    if (info.stallWarned) continue;

    const inactiveMs = now - info.lastActivityAt;
    if (inactiveMs >= STALL_TIMEOUT_MS) {
      info.stallWarned = true;
      const inactiveMin = Math.floor(inactiveMs / 60_000);
      warnings.push(
        `- Subagent \`${info.subagentType}\` (session ${subSid.slice(0, 8)}) has been inactive for ${inactiveMin}+ minutes. ` +
        `Task: "${info.description}". This likely indicates a provider stall or error.`
      );
      fileLog(
        `[stall-detect] Subagent ${subSid.slice(0, 8)} stalled: type=${info.subagentType} inactive=${inactiveMin}min`,
        "warn",
      );
    }
  }

  if (warnings.length === 0) return null;

  const lines = [
    "<system-reminder>",
    "## Stalled Subagent Detected",
    "",
    "The following subagent(s) appear to be stalled (no activity for 3+ minutes):",
    ...warnings,
    "",
    "### Action Required",
    "The stalled subagent is likely stuck due to a provider error or timeout. You should:",
    "1. **Do NOT wait** for the stalled subagent to complete — it will likely never return.",
    "2. **Retry the task** using a different `subagent_type` that uses a different provider/model.",
    "3. If no alternative agent is suitable, **perform the work directly yourself** without delegating.",
    "</system-reminder>",
  ];

  return lines.join("\n");
}

// ── Sub-agent reasoning loop detection ─────────────────────────────
// Detects when a subagent is stuck in a reasoning/thinking loop —
// repeating the same thoughts over and over without making progress.
// We hash chunks of reasoning text and check for repetition in a
// rolling window. If enough hashes repeat, the subagent is looping.
const LOOP_WINDOW_SIZE = 8;     // Rolling window of recent reasoning hashes
const LOOP_REPEAT_THRESHOLD = 3; // If this many hashes in the window match, it's a loop
const LOOP_CHUNK_MIN_LENGTH = 40; // Ignore very short reasoning chunks (noise)

interface LoopDetectionState {
  hashes: string[];       // Rolling window of reasoning text hashes
  loopDetected: boolean;  // Once detected, stays true (warn-once)
  loopWarned: boolean;    // Only inject warning once per session
}

const loopDetectionState = new Map<string, LoopDetectionState>();

/**
 * Hash a reasoning text chunk to a short fingerprint.
 * We normalize whitespace and lowercase before hashing to catch
 * near-identical repetitions that differ only in formatting.
 */
function hashReasoningChunk(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha1").update(normalized).digest("hex").slice(0, 12);
}

/**
 * Record a reasoning text chunk for a subagent session and check
 * for loop detection. Returns true if a loop is newly detected.
 */
function recordReasoningChunk(sessionId: string, text: string): boolean {
  if (text.length < LOOP_CHUNK_MIN_LENGTH) return false;

  let state = loopDetectionState.get(sessionId);
  if (!state) {
    state = { hashes: [], loopDetected: false, loopWarned: false };
    loopDetectionState.set(sessionId, state);
  }

  // Already detected — no need to keep checking
  if (state.loopDetected) return false;

  const hash = hashReasoningChunk(text);
  state.hashes.push(hash);

  // Trim to rolling window size
  if (state.hashes.length > LOOP_WINDOW_SIZE) {
    state.hashes = state.hashes.slice(-LOOP_WINDOW_SIZE);
  }

  // Count how many times the most recent hash appears in the window
  const latestHash = hash;
  let repeatCount = 0;
  for (const h of state.hashes) {
    if (h === latestHash) repeatCount++;
  }

  if (repeatCount >= LOOP_REPEAT_THRESHOLD) {
    state.loopDetected = true;
    fileLog(
      `[loop-detect] Reasoning loop detected for subagent session ${sessionId.slice(0, 8)}: ` +
      `hash=${latestHash} repeated ${repeatCount}/${state.hashes.length} times`,
      "warn",
    );
    return true;
  }

  return false;
}

/**
 * Get looping subagent warnings for a primary session.
 * Returns system-reminder blocks for any subagents that have been
 * detected as stuck in a reasoning loop.
 */
function getLoopingSubagentWarnings(primarySessionId: string): string | null {
  const warnings: string[] = [];

  for (const [subSid, info] of subagentTracking.entries()) {
    if (info.parentSessionId !== primarySessionId) continue;

    const loopState = loopDetectionState.get(subSid);
    if (!loopState || !loopState.loopDetected || loopState.loopWarned) continue;

    loopState.loopWarned = true;
    warnings.push(
      `- Subagent \`${info.subagentType}\` (session ${subSid.slice(0, 8)}) is stuck in a reasoning loop — ` +
      `repeating the same thoughts without making progress. Task: "${info.description}".`
    );
    fileLog(
      `[loop-detect] Warning injected for subagent ${subSid.slice(0, 8)}: type=${info.subagentType}`,
      "warn",
    );
  }

  if (warnings.length === 0) return null;

  const lines = [
    "<system-reminder>",
    "## Reasoning Loop Detected",
    "",
    "The following subagent(s) are stuck in a reasoning loop (repeating the same thinking patterns):",
    ...warnings,
    "",
    "### Action Required",
    "The looping subagent is not making progress — it keeps thinking the same thoughts over and over. You should:",
    "1. **Cancel the stalled subagent** — it will not produce useful output.",
    "2. **Retry the task** using a different `subagent_type` that uses a different provider/model.",
    "3. If no alternative agent is suitable, **perform the work directly yourself** without delegating.",
    "</system-reminder>",
  ];

  return lines.join("\n");
}

// ── Task-call timing registry ──────────────────────────────────────
// When the primary session calls the Task tool, we record a pending
// spawn.  The NEXT session.created event with a new session ID is
// causally the spawned sub-agent — we consume the pending entry and
// register the new session in subagentSessions.
//
// This fixes the root cause: isSubagentSession() checks for fields
// (parentSessionId, agentId, etc.) that OpenCode never sends, so
// sub-agent detection was completely broken.  The timing registry
// provides causal detection based on the spawn→create sequence.
const SPAWN_TIMEOUT_MS = 30_000; // 30 seconds — pending entries expire after this

interface PendingSpawnEntry {
  timestamp: number;
  subagentType: string;
  description: string;
}

const pendingSubagentSpawns = new Map<string, PendingSpawnEntry[]>();

/**
 * Check whether a session ID is a known sub-agent session.
 */
function isKnownSubagent(sessionId: string): boolean {
  return subagentSessions.has(sessionId);
}

/**
 * Detect whether a bash command is a voice notification curl.
 * Matches `curl ... localhost:8888/notify` patterns that sub-agents
 * should never execute.
 */
function isVoiceCurlCommand(command: string): boolean {
  return command.includes("localhost:8888/notify") || command.includes("127.0.0.1:8888/notify");
}

// ── Test internals ─────────────────────────────────────────────────
// Bundled into a single named export so test-only symbols don't pollute
// the module's top-level namespace.  OpenCode's plugin loader iterates
// over all exports looking for plugin functions — exporting Sets, Maps,
// and numbers at the top level caused the loader to call a Set as a
// function: "fn5 is not a function. (In 'fn5(input)', 'fn5' is an
// instance of Set)".
export const __testInternals = {
  subagentSessions,
  pendingSubagentSpawns,
  subagentTracking,
  SPAWN_TIMEOUT_MS,
  STALL_TIMEOUT_MS,
  getStalledSubagentWarnings,
  loopDetectionState,
  LOOP_WINDOW_SIZE,
  LOOP_REPEAT_THRESHOLD,
  LOOP_CHUNK_MIN_LENGTH,
  recordReasoningChunk,
  getLoopingSubagentWarnings,
  hashReasoningChunk,
};

function safeHandler<T>(name: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    fileLog(`[pai-unified] handler error in ${name}: ${String(err)}`);
    return undefined;
  }
}

/**
 * PAI Plugin — matches the @opencode-ai/plugin Plugin type:
 *   export type Plugin = (input: PluginInput) => Promise<Hooks>
 *
 * Each hook key is a single async function (not an array).
 * All sub-handlers are consolidated into one function per hook.
 */
export const PaiPlugin = async (ctx: PluginInput) => {
  const opencodeClient = ctx.client;
  fileLog(`[pai-unified] plugin initialized: ${PLUGIN_NAME}@${PLUGIN_VERSION}`);

  // Load PAI environment variables from ~/.config/PAI/.env into process.env.
  // API keys (SHODAN_API_KEY, APIFY_TOKEN, etc.) are stored there but not
  // sourced by the shell automatically.  Existing env vars are not overwritten.
  safeHandler("envLoader", () => {
    const result = loadEnvFile();
    if (result.loaded > 0) {
      fileLog(`[pai-unified] Env loader: ${result.loaded} vars loaded, ${result.skipped} skipped`);
    }
  });

  return {
    // ── permission.ask ──────────────────────────────────────
    "permission.ask": async (input: Record<string, unknown>, output: Record<string, unknown>) => {
      // ── External directory auto-allow for PAI fundamental paths ──
      // OpenCode sends: { permission: "external_directory", patterns: ["/abs/path/*"], ... }
      // These paths must never prompt the user — they are core PAI infrastructure.
      if (input.permission === "external_directory") {
        const home = homedir();
        const PAI_ALLOWED_PREFIXES = [
          home + "/.claude/",
          home + "/.config/opencode/",
        ];
        const patterns = Array.isArray(input.patterns) ? (input.patterns as string[]) : [];
        const allAllowed = patterns.length > 0 && patterns.every((p) => {
          const normalized = typeof p === "string" ? p.replace(/\\/g, "/") : "";
          return PAI_ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
        });
        if (allAllowed) {
          fileLog(`[permission] auto-allow external_directory for PAI paths: ${patterns.join(", ")}`, "info");
          (output as { status: string }).status = "allow";
          return;
        }
        // Non-PAI external directory — let OpenCode's default ask behaviour show
        return;
      }

      // ── Tool-based security gate (old-style permission requests) ──
      safeHandler("security.permissionGate", () =>
        permissionGateHandler(
          input as { tool?: string; args?: Record<string, unknown>; sessionID?: string },
          output as { status: "ask" | "deny" | "allow" },
        ),
      );

      // Plan mode tool gate
      const sessionId = String(input.sessionId ?? input.sessionID ?? "");
      const toolName = String(input.toolName ?? input.tool ?? "");
      const bashCommand = String(input.bashCommand ?? "");
      safeHandler("planMode.toolGate", () => {
        if (!sessionId || !toolName) return;
        return planModePermissionHandler(
          sessionId,
          toolName,
          bashCommand,
          output as { status?: "ask" | "deny" | "allow" },
        );
      });
    },

    // ── config ───────────────────────────────────────────────
    // Injects PAI agent definitions into the OpenCode config at startup.
    // This is the runtime-safe alternative to deploying static .md files:
    // agents are loaded from PAI's source of truth (Context.md files) and
    // merged into the config without overwriting any existing entries.
    //
    // Also disables the internal adapter shim agents ("algorithm", "native")
    // that exist as static files but should not appear in the UI as user-
    // selectable agents.
    "config": async (input: Record<string, unknown>) => {
      safeHandler("config.agentInjection", () => {
        // Ensure agent map exists
        if (!input.agent || typeof input.agent !== "object") {
          input.agent = {};
        }
        const agentConfig = input.agent as Record<string, Record<string, unknown>>;

        // Inject all PAI agents from definitions.ts (auto-discovered + phantoms)
        for (const name of AGENT_NAMES) {
          if (agentConfig[name]) continue; // Preserve existing entries
          const def = AGENT_DEFINITIONS[name];
          if (!def) continue;
          const entry: Record<string, unknown> = {
            prompt: def.prompt,
            permission: def.permission,
            description: def.defaults.description,
            color: def.defaults.color,
            mode: def.defaults.mode,
            maxSteps: def.defaults.steps,
            temperature: def.defaults.temperature,
          };
          // Overlay model from pai-adapter.json when configured — this is the
          // single source of truth for which model each agent uses, and overrides
          // OpenCode's own defaults.
          const model = readAgentModel(name);
          if (model) entry.model = model;
          agentConfig[name] = entry;
        }

        // Disable internal adapter shim agents — these are thin wrappers that
        // handle routing (algorithm: runs PAI Algorithm; native: uses CLAUDE.md
        // directly) and should not be surfaced to users as selectable agents.
        if (!agentConfig["algorithm"]) agentConfig["algorithm"] = {};
        agentConfig["algorithm"].disable = true;
        if (!agentConfig["native"]) agentConfig["native"] = {};
        agentConfig["native"].disable = true;

        fileLog(
          `[config-hook] Injected ${AGENT_NAMES.length} PAI agents, disabled algorithm/native shims`,
          "info",
        );
      });
    },

    // ── experimental.chat.system.transform ───────────────────
    "experimental.chat.system.transform": async (
      input: Record<string, unknown>,
      output: Record<string, unknown>,
    ) => {
      // Set context limit based on model
      const sid = String(input.sessionID ?? input.sessionId ?? "");
      const model = String(input.model ?? "");
      if (sid && model) {
        safeHandler("statusline.setContextLimit", () => statuslineSetContextLimit(sid, model));
      }

      // ── Subagent preamble injection ──
      // Subagents receive PAI skill instructions that tell them to spawn
      // sub-sub-agents via Task/Skill tools. Since subagents can't spawn
      // further agents, this causes hangs. Inject a preamble BEFORE the
      // PAI context that explicitly overrides spawning instructions.
      if (sid && isKnownSubagent(sid)) {
        safeHandler("subagent.preamble", () => {
          const systemArr = (output as { system: string[] }).system;
          systemArr.push(getSubagentPreamble(sid));
          fileLog(
            `[subagent-context] Injected subagent preamble for session ${sid.slice(0, 8)}`,
            "info",
          );
        });
      }

      safeHandler("contextLoader", () =>
        contextLoaderHandler(
          input as { sessionID?: string; model?: unknown },
          output as { system: string[] },
        ),
      );

      // Inject model routing context (role → model mapping + fallback chains)
      safeHandler("modelRouting.context", () => {
        const systemArr = (output as { system: string[] }).system;
        systemArr.push(getModelRoutingContext());
      });

      // Inject fallback suggestion if one is pending from a previous tool error
      if (sid) {
        safeHandler("modelRouting.fallback", () => {
          const suggestion = consumeFallbackSuggestion(sid);
          if (suggestion) {
            const systemArr = (output as { system: string[] }).system;
            systemArr.push(formatFallbackReminder(suggestion));
          }
        });
      }

      // Inject stall warnings for subagents that belong to this primary session
      if (sid && !isKnownSubagent(sid)) {
        safeHandler("stall.detect", () => {
          const stallWarning = getStalledSubagentWarnings(sid);
          if (stallWarning) {
            const systemArr = (output as { system: string[] }).system;
            systemArr.push(stallWarning);
          }
        });

        // Inject loop detection warnings for subagents stuck in reasoning loops
        safeHandler("loop.detect", () => {
          const loopWarning = getLoopingSubagentWarnings(sid);
          if (loopWarning) {
            const systemArr = (output as { system: string[] }).system;
            systemArr.push(loopWarning);
          }
        });
      }
    },

    // ── tool.execute.before ──────────────────────────────────
    "tool.execute.before": async (
      input: Record<string, unknown>,
      output: Record<string, unknown>,
    ) => {
      safeHandler("security.inputValidation", () =>
        inputValidationHandler(
          input as { tool?: string; args?: Record<string, unknown>; sessionID?: string },
          output as { block?: boolean; reason?: string },
        ),
      );

      // ── Voice curl blocking for sub-agent sessions ──
      // Sub-agents inherit CLAUDE.md instructions that tell the LLM to run
      // voice curl commands (curl -X POST localhost:8888/notify).  Despite
      // instructions saying "subagents must NOT execute voice curls", LLMs
      // routinely ignore this.  We enforce it here at the infrastructure
      // level by blocking bash commands that target the voice proxy.
      const toolNameForVoiceBlock = String(input.tool ?? input.toolName ?? "");
      const sidForVoiceBlock = String(input.sessionID ?? input.sessionId ?? "");
      if (
        (toolNameForVoiceBlock === "bash" || toolNameForVoiceBlock === "Bash") &&
        sidForVoiceBlock &&
        isKnownSubagent(sidForVoiceBlock)
      ) {
        const argsForVoiceBlock = (input.args ?? input.input ?? {}) as Record<string, unknown>;
        const command = String(argsForVoiceBlock.command ?? argsForVoiceBlock.cmd ?? "");
        if (isVoiceCurlCommand(command)) {
          fileLog(
            `[voice-block] Blocked voice curl from sub-agent session ${sidForVoiceBlock.slice(0, 8)}`,
            "info",
          );
          (output as { block?: boolean; reason?: string }).block = true;
          (output as { block?: boolean; reason?: string }).reason =
            "Voice notifications are reserved for the primary coordinator session";
          return;
        }
      }

      // ── Task-call timing registry: record pending spawn ──
      // When ANY session (primary or subagent) calls the Task tool, we
      // record a pending spawn so the next session.created can be matched
      // as the spawned sub/sub-sub-agent.  Delegating subagents (engineer,
      // architect, research, thinker) are allowed to spawn leaf agents
      // (explorer, intern) per the 2-level nesting model.  Permission
      // enforcement is handled by OpenCode's agent permission system, not
      // by runtime blocking here.
      const toolNameForAgentBlock = String(input.tool ?? input.toolName ?? "");
      const sidForAgentBlock = String(input.sessionID ?? input.sessionId ?? "");
      if (
        sidForAgentBlock &&
        (toolNameForAgentBlock === "task" ||
          toolNameForAgentBlock === "Task")
      ) {
        const argsForSpawn = (input.args ?? input.input ?? {}) as Record<string, unknown>;
        const spawnSubagentType = String(argsForSpawn.subagent_type ?? argsForSpawn.type ?? "unknown");
        const spawnDescription = String(argsForSpawn.description ?? argsForSpawn.prompt ?? "").slice(0, 80);
        const queue = pendingSubagentSpawns.get(sidForAgentBlock) ?? [];
        queue.push({
          timestamp: Date.now(),
          subagentType: spawnSubagentType,
          description: spawnDescription,
        });
        pendingSubagentSpawns.set(sidForAgentBlock, queue);
        fileLog(
          `[subagent-timing] Pending spawn registered from session ${sidForAgentBlock.slice(0, 8)} (queue depth: ${queue.length}, type: ${spawnSubagentType})`,
          "info",
        );

        // ── Provider health pre-flight check ──
        // Before spawning a subagent, check if its model's provider is
        // currently unhealthy (recently failed with rate_limit, unavailable,
        // etc.). If so, BLOCK the Task call and return an error with
        // guidance for an alternative subagent_type.
        //
        // This prevents OpenCode's infinite internal retry loop (ROOT CAUSE
        // #2) — instead of spawning a subagent that will retry a broken
        // provider for hours, we fail fast and tell the LLM to use an
        // alternative immediately.
        const healthCheck = safeHandler("provider.healthCheck", () =>
          checkSubagentHealth(spawnSubagentType),
        );
        if (healthCheck) {
          fileLog(
            `[provider-health] BLOCKED Task call for subagent "${spawnSubagentType}": ${healthCheck.reason}`,
            "warn",
          );
          (output as { block?: boolean; reason?: string }).block = true;
          (output as { block?: boolean; reason?: string }).reason = healthCheck.reason;
          // Remove the pending spawn since we blocked it
          queue.pop();
          if (queue.length === 0) {
            pendingSubagentSpawns.delete(sidForAgentBlock);
          }
          return;
        }

        // ── Max concurrent subagent guard ──
        // OpenCode has a known bug where spawning more than 2 concurrent
        // subagents from the same primary session causes stalls, incorrect
        // status tracking, and frozen sessions. We enforce a hard limit of 2
        // concurrent subagents per primary session and fail fast with a clear
        // message so the LLM queues tasks sequentially instead.
        //
        // Only applies to primary sessions — subagent sessions are already
        // blocked from calling Task via the context isolation layer.
        if (!isKnownSubagent(sidForAgentBlock)) {
          const activeSubagentsForParent = [...subagentTracking.values()].filter(
            (info) => info.parentSessionId === sidForAgentBlock,
          ).length;
          if (activeSubagentsForParent >= 2) {
            const reason =
              `Max concurrent subagent limit (2) reached for this session. ` +
              `This is a workaround for a known OpenCode bug where 3+ concurrent subagents ` +
              `cause stalls and frozen sessions. Wait for a running subagent to complete, ` +
              `then spawn the next one.`;
            fileLog(
              `[concurrency-guard] BLOCKED Task call: ${activeSubagentsForParent} active subagents for ${sidForAgentBlock.slice(0, 8)}, max is 2`,
              "warn",
            );
            (output as { block?: boolean; reason?: string }).block = true;
            (output as { block?: boolean; reason?: string }).reason = reason;
            queue.pop();
            if (queue.length === 0) {
              pendingSubagentSpawns.delete(sidForAgentBlock);
            }
            return;
          }
        }
      }

      // ── Skill/Task invocation logging (proves native OC tools are called) ──
      const toolNameBefore = String(input.tool ?? input.toolName ?? "");
      const sidBefore = String(input.sessionID ?? input.sessionId ?? "");
      const argsBefore = (input.args ?? input.input ?? {}) as Record<string, unknown>;

      if (toolNameBefore === "skill" || toolNameBefore === "Skill") {
        const skillName = String(argsBefore.name ?? argsBefore.skill ?? "unknown");
        fileLog(
          `[skill-tracker] BEFORE skill invocation: name="${skillName}" session=${sidBefore.slice(0, 8)}`,
          "info",
        );
      }

      if (toolNameBefore === "task" || toolNameBefore === "Task") {
        const subagentType = String(argsBefore.subagent_type ?? argsBefore.type ?? "unknown");
        const taskDesc = String(argsBefore.description ?? "").slice(0, 60);
        fileLog(
          `[skill-tracker] BEFORE task invocation: subagent_type="${subagentType}" desc="${taskDesc}" session=${sidBefore.slice(0, 8)}`,
          "info",
        );
      }
    },

    // ── tool.execute.after ───────────────────────────────────
    "tool.execute.after": async (
      input: Record<string, unknown>,
      output: Record<string, unknown>,
    ) => {
      // Learning tracker
      safeHandler("learning.postTool", () =>
        toolExecuteAfterHandler(
          input as { tool: string; sessionID?: string; callID?: string; args?: unknown },
          output,
        ),
      );

      // ── Subagent activity tracking ──
      // Update last activity timestamp for subagent sessions.
      // This is the heartbeat signal for stall detection.
      const sidForActivity = String(input.sessionID ?? input.sessionId ?? "");
      if (sidForActivity && isKnownSubagent(sidForActivity)) {
        const tracking = subagentTracking.get(sidForActivity);
        if (tracking) {
          tracking.lastActivityAt = Date.now();
        }
      }

      // ── Skill/Task invocation logging (proves native OC tools are called) ──
      const toolNameAfter = String(input.tool ?? input.toolName ?? "");
      const sidAfter = String(input.sessionID ?? input.sessionId ?? "");
      const argsAfter = (input.args ?? input.input ?? {}) as Record<string, unknown>;

      if (toolNameAfter === "skill" || toolNameAfter === "Skill") {
        const skillName = String(argsAfter.name ?? argsAfter.skill ?? "unknown");
        fileLog(
          `[skill-tracker] AFTER skill invocation: name="${skillName}" session=${sidAfter.slice(0, 8)}`,
          "info",
        );
      }

      if (toolNameAfter === "task" || toolNameAfter === "Task") {
        const subagentType = String(argsAfter.subagent_type ?? argsAfter.type ?? "unknown");
        const taskDesc = String(argsAfter.description ?? "").slice(0, 60);
        fileLog(
          `[skill-tracker] AFTER task invocation: subagent_type="${subagentType}" desc="${taskDesc}" session=${sidAfter.slice(0, 8)}`,
          "info",
        );
      }

      // Voice notification — skip TTS for raw tool names ("bash", "read", etc.)
      // to avoid distracting noise; only route desktop/Discord notifications.
      // Also skip entirely for sub-agent sessions.
      const durationMs = typeof input.durationMs === "number" ? input.durationMs : 0;
      const summary = String(input.tool ?? input.toolName ?? "tool completed");
      const sidForVoice = String(input.sessionID ?? input.sessionId ?? "");
      if (!isKnownSubagent(sidForVoice)) {
        safeHandler("voice.postTool", () =>
          routeNotificationByDuration(Math.floor(durationMs / 1000), summary),
        );
      }

      // Terminal tab title
      const taskSummary = String(input.tool ?? input.toolName ?? "");
      safeHandler("terminal.postTool", () => onTaskStart(taskSummary));

      // Statusline writer
      const sid = String(input.sessionID ?? input.sessionId ?? "");
      const toolNameForStatus = String(input.tool ?? input.toolName ?? "");
      safeHandler("statusline.postTool", () =>
        statuslineToolExecuted(sid, toolNameForStatus, Math.floor(durationMs / 1000)),
      );

      // PRD sync — refresh Algorithm phase/effort/ISC from latest PRD
      safeHandler("statusline.prdSync", () => statuslineSyncFromPRD(sid));

      // Model fallback detection — check if a Task/agent tool failed with a
      // provider error (rate limit, model not found, unavailable). If so, store
      // a fallback suggestion that will be injected into the next system prompt.
      //
      // Detection strategy (defense-in-depth):
      // 1. Top-level error fields (input.error, output.error)
      // 2. Task output body — provider errors are often buried inside the
      //    stringified task result, not in a top-level error field
      // 3. Learning tracker failure pattern (output contains error keywords)
      const toolName = String(input.tool ?? input.toolName ?? "");
      if (sid && (toolName === "Task" || toolName === "task" || toolName.startsWith("agent"))) {
        safeHandler("modelRouting.errorDetect", () => {
          // Collect error signals from multiple sources
          const topLevelError = String(input.error ?? output.error ?? "");
          const outputStr = typeof output === "string"
            ? output
            : JSON.stringify(output ?? "");

          // Check both top-level error and full output body for provider errors
          const errorSources = [topLevelError, outputStr].filter(Boolean);
          for (const source of errorSources) {
            const errorType = classifyProviderError(source);
            if (errorType !== "unknown") {
              const failedModel = String(input.model ?? input.modelId ?? "");
              // Try to extract subagent_type from args for better fallback guidance
              const argsForFallback = (input.args ?? input.input ?? {}) as Record<string, unknown>;
              const subagentType = String(argsForFallback.subagent_type ?? argsForFallback.type ?? "");
              setFallbackSuggestion(sid, failedModel || subagentType || toolName, errorType, undefined, subagentType || undefined);

              // Mark the provider as unhealthy so future Task calls that
              // use this provider get blocked proactively (preventing
              // OpenCode's infinite retry loop).
              const modelForProvider = failedModel || subagentType || "";
              const provider = extractProvider(modelForProvider);
              if (provider) {
                markProviderUnhealthy(provider, errorType, source.slice(0, 200));
              }

              fileLog(
                `[model-fallback] Provider error detected: type=${errorType} model=${failedModel} subagent=${subagentType} source=${source.slice(0, 120)}`,
                "info",
              );
              break; // One suggestion per failure is enough
            }
          }
        });
      }
    },

    // ── chat.message ─────────────────────────────────────────
    "chat.message": async (input: Record<string, unknown>, output: Record<string, unknown>) => {
      const sid = String(input.sessionID ?? input.sessionId ?? "");
      const content = String(
        typeof input.message === "object" && input.message !== null
          ? ((input.message as { content?: string }).content ?? "")
          : String(input.message ?? ""),
      );

      // Extract role from message object or top-level input
      const role = typeof input.message === "object" && input.message !== null
        ? String((input.message as { role?: string }).role ?? "")
        : String(input.role ?? "");

      // Dedup check — skip downstream handlers if duplicate
      const dup = safeHandler("dedupCache.check", () => isDuplicate(sid, content, "chat.message"));
      if (dup) {
        fileLog(`[pai-unified] duplicate message skipped for session=${sid}`);
        return;
      }

      // Learning tracker
      safeHandler("learning.chatMessage", () =>
        chatMessageHandler(
          input as { sessionID?: string; messageID?: string; message?: unknown },
          output,
        ),
      );

      // Transcript recording for user and assistant messages
      if (role === "user" || role === "assistant") {
        safeHandler("transcript.record", () => recordTranscriptEntry(sid, role as "user" | "assistant", content));
      }

      // Auto-name session from first substantive user message
      if (role === "user" && content.trim().length > 10) {
        safeHandler("sessionNaming", () => nameSession(sid, content));
      }

      // Extract relationship signals from user messages
      if (role === "user") {
        safeHandler("relationshipCapture", () => {
          const signal = extractRelationshipSignal(sid, content);
          if (signal) persistRelationshipSignal(signal);
        });
      }

      // Implicit sentiment detection
      safeHandler("sentiment.implicit", () =>
        implicitSentimentHandler(sid, content),
      );

      // Plan mode message handler — detect activation/deactivation
      const wasPlanActive = safeHandler("planMode.checkBefore", () => isPlanModeActive(sid));
      safeHandler("planMode.message", () => planModeMessageHandler(sid, content));
      const isPlanActiveNow = safeHandler("planMode.checkAfter", () => isPlanModeActive(sid));

      // Propagate plan mode changes to terminal-ui and statusline-writer
      if (wasPlanActive !== isPlanActiveNow) {
        if (isPlanActiveNow) {
          safeHandler("terminal.planMode", () => onPlanModeActivated());
        }
        safeHandler("statusline.planMode", () => statuslinePlanModeChange(sid, !!isPlanActiveNow));
      }

      // Statusline message count — only count assistant messages to avoid
      // double-counting (chat.message fires for both user and assistant)
      if (role === "assistant") {
        safeHandler("statusline.message", () => statuslineMessageReceived(sid));
      }

      // Resume from idle on any message (user or assistant)
      safeHandler("statusline.active", () => statuslinePhaseChange(sid, "ACTIVE"));

      // Session lifecycle message tracking
      safeHandler("lifecycle.message", () => onLifecycleMessage(sid));
    },

    // ── experimental.session.compacting ──────────────────────
    "experimental.session.compacting": async (
      input: Record<string, unknown>,
      output: Record<string, unknown>,
    ) => {
      safeHandler("compaction.proactive", () =>
        compactionProactiveHandler(
          input as { sessionID: string },
          output as { context: string[]; prompt?: string },
        ),
      );
    },

    // ── event ────────────────────────────────────────────────
    // OpenCode calls: hook.event?.({ event: busEvent })
    event: async (input: { event?: Record<string, unknown> } & Record<string, unknown>) => {
      // The event object is in input.event (OpenCode wraps it)
      const evt = (input.event ?? input) as Record<string, unknown>;
      const eventType = String(evt.type ?? "");

      fileLog(`[pai-unified] event received: ${eventType}`, "debug");

      // Log all events to raw event log
      safeHandler("rawEventLogger", () => logRawEvent(eventType, evt));

      if (eventType === "session.compacted") {
        safeHandler("compaction.reactive", () =>
          compactionReactiveHandler(
            { event: evt as { type: string; properties?: Record<string, unknown> } },
          ),
        );
      }

      if (eventType === "session.idle") {
        // session.idle payload: { type, properties: { sessionID } }
        const idleProps = (evt.properties ?? evt) as Record<string, unknown>;
        const sid = String(idleProps.sessionID ?? idleProps.sessionId ?? evt.sessionID ?? evt.sessionId ?? "");
        const durationMs = typeof (idleProps.durationMs ?? evt.durationMs) === "number"
          ? (idleProps.durationMs ?? evt.durationMs) as number : 0;
        // Only fire voice notification for the coordinator session
        if (!isKnownSubagent(sid)) {
          safeHandler("voice.idle", () =>
            voiceNotificationHandler(Math.floor(durationMs / 1000), "Session is idle"),
          );
        }
        safeHandler("statusline.idle", () => statuslinePhaseChange(sid, "IDLE"));

        // Flush buffered learnings to disk on idle
        if (sid) {
          safeHandler("learning.flush.idle", () => { flushSessionLearnings(sid); });
        }
      }

      // OpenCode emits "session.created"; Claude Code emits "session.start".
      // Handle both so the greeting fires regardless of runtime.
      if (eventType === "session.start" || eventType === "session.created") {
        // session.created payload: { type, properties: { info: Session } }
        // session.start (Claude Code) payload: { type, sessionID }
        const startProps = (evt.properties ?? evt) as Record<string, unknown>;
        const startInfo = startProps.info as Record<string, unknown> | undefined;
        const sid = String(
          startInfo?.id ?? startInfo?.sessionID ??
          startProps.sessionID ?? startProps.sessionId ??
          evt.sessionID ?? evt.sessionId ?? ""
        );
        safeHandler("statusline.sessionStart", () => statuslineSessionStart(sid));
        safeHandler("lifecycle.sessionStart", () => onLifecycleSessionStart(sid));
        safeHandler("voice.recordStart", () => recordSessionStart());

        // Startup greeting via voice — main session only, skip sub-agents
        //
        // Sub-agent detection strategy (defense-in-depth):
        // 1. Task-call timing registry: if a pending spawn exists from a
        //    recent Task tool call, this session is causally the spawned
        //    sub-agent.  This is the primary detection mechanism.
        // 2. Event payload inspection (isSubagentSession): checks for
        //    parentSessionId, agentId, etc.  Currently inert with OpenCode
        //    but kept as a fallback for future compatibility.
        // 3. Environment variable check (inside isSubagentSession):
        //    OPENCODE_AGENT_TASK_ID / CLAUDE_CODE_AGENT_TASK_ID.

        // Diagnostic: log full session.created payload for debugging
        fileLog(
          `[subagent-timing] session.created payload: ${JSON.stringify(evt).slice(0, 500)}`,
          "debug",
        );

        // Check Task-call timing registry first
        let detectedAsSubagent = false;
        let detectedParentSid = "";
        let detectedSpawnInfo: PendingSpawnEntry | null = null;
        const now = Date.now();
        for (const [parentSid, queue] of pendingSubagentSpawns.entries()) {
          // Filter out expired entries
          const validEntries = queue.filter(e => (now - e.timestamp) < SPAWN_TIMEOUT_MS);
          if (validEntries.length > 0) {
            // Consume the oldest pending spawn (FIFO), capture metadata first
            detectedSpawnInfo = validEntries[0] ?? null;
            validEntries.shift();
            if (validEntries.length === 0) {
              pendingSubagentSpawns.delete(parentSid);
            } else {
              pendingSubagentSpawns.set(parentSid, validEntries);
            }
            // Register this session as a sub-agent
            subagentSessions.add(sid);
            detectedAsSubagent = true;
            detectedParentSid = parentSid;

            // Register activity tracking for stall detection
            subagentTracking.set(sid, {
              parentSessionId: parentSid,
              subagentType: detectedSpawnInfo?.subagentType ?? "unknown",
              description: detectedSpawnInfo?.description ?? "",
              spawnedAt: now,
              lastActivityAt: now,
              stallWarned: false,
            });

            // Register in shared agent-type-registry for cross-module access
            registerSubagentType(sid, detectedSpawnInfo?.subagentType ?? "unknown");

            fileLog(
              `[subagent-timing] Sub-agent session ${sid.slice(0, 8)} detected via Task-call timing from parent ${parentSid.slice(0, 8)} (type: ${detectedSpawnInfo?.subagentType ?? "unknown"})`,
              "info",
            );
            break;
          } else {
            // All entries expired — clean up
            pendingSubagentSpawns.delete(parentSid);
          }
        }

        // Fallback: original event-based detection
        if (!detectedAsSubagent && isSubagentSession(evt)) {
          subagentSessions.add(sid);
          detectedAsSubagent = true;
          fileLog(`[pai-unified] sub-agent session registered via event payload (${sid.slice(0, 8)})`, "info");
        }

        if (!detectedAsSubagent) {
          safeHandler("voice.greeting", () => {
            const greeting = getStartupGreeting();
            if (greeting) {
              speakText(greeting);
            }
          });

          // Defensive re-sync agent models on primary session start.
        } else {
          fileLog(`[pai-unified] sub-agent session registered (${sid.slice(0, 8)}), voice curls will be blocked`);
        }

        // First-run detection: check if PAI agents are deployed
        safeHandler("firstRun.check", () => {
          const home = process.env.HOME ?? "";
          const agentsDir = join(home, ".config", "opencode", "agents");
          const algorithmAgent = join(agentsDir, "algorithm.md");
          if (!existsSync(algorithmAgent)) {
            fileLog(
              `[pai-unified] PAI agents not deployed. Run /pai-setup or re-run install.sh to deploy PAI-native agents, theme, and commands.`,
            );
          }
        });
      }

      // Extract token usage from assistant message updates
      if (eventType === "message.updated") {
        const props = (evt.properties ?? evt) as Record<string, unknown>;
        const info = props.info as Record<string, unknown> | undefined;
        if (info && info.role === "assistant") {
          const tokens = info.tokens as { input?: number; output?: number } | undefined;
          if (tokens) {
            const sid = String(info.sessionID ?? "");
            const msgId = String(info.id ?? "");
            const input = typeof tokens.input === "number" ? tokens.input : 0;
            const output = typeof tokens.output === "number" ? tokens.output : 0;
            if ((input > 0 || output > 0) && msgId) {
              safeHandler("statusline.tokenUsage", () => statuslineTokenUsage(sid, msgId, input, output));
            }
          }
        }
      }

      // ── Reasoning loop detection via message.part.updated ──
      // When a subagent emits reasoning content, hash the text chunk
      // and check for repetitive thinking patterns.
      if (eventType === "message.part.updated") {
        const partProps = (evt.properties ?? evt) as Record<string, unknown>;
        const part = partProps.part as Record<string, unknown> | undefined;
        if (part && part.type === "reasoning" && typeof part.text === "string") {
          const partSessionId = String(part.sessionID ?? part.sessionId ?? "");
          if (partSessionId && isKnownSubagent(partSessionId)) {
            safeHandler("loop.detect.record", () => {
              recordReasoningChunk(partSessionId, part.text as string);
            });
          }
        }
      }

      if (eventType === "session.end") {
        // session.end payload: { type, properties: { sessionID } }
        const endProps = (evt.properties ?? evt) as Record<string, unknown>;
        const sid = String(endProps.sessionID ?? endProps.sessionId ?? evt.sessionID ?? evt.sessionId ?? "");
        safeHandler("terminal.sessionEnd", () => terminalSessionEnd());
        safeHandler("statusline.sessionEnd", () => statuslineSessionEnd(sid));
        safeHandler("lifecycle.sessionEnd", () => onLifecycleSessionEnd(sid));

        // Flush buffered learnings to disk on session end
        if (sid) {
          safeHandler("learning.flush.end", () => { flushSessionLearnings(sid); });
        }

        // Capture full transcript via SDK on session end (non-subagent only)
        if (sid && !isKnownSubagent(sid)) {
          safeHandler("transcript.fullCapture", async () => {
            const count = await captureFullTranscript(opencodeClient as any, sid);
            if (count > 0) {
              fileLog(`[transcript-bridge] Captured full transcript: ${count} messages`, "info");
            }
          });
        }

        // Clean up per-session in-memory state to prevent memory leaks
        if (sid) {
          safeHandler("cleanup.context", () => clearContextCache(sid));
          safeHandler("cleanup.learning", () => clearLearningState(sid));
          safeHandler("cleanup.planMode", () => clearPlanModeState(sid));
          safeHandler("cleanup.compaction", () => clearCompactionState(sid));
          safeHandler("cleanup.dedup", () => clearSessionDedup(sid));
          safeHandler("cleanup.fallbackState", () => clearFallbackState(sid));
          safeHandler("cleanup.implicitSentiment", () => clearImplicitSentimentState(sid));
          safeHandler("cleanup.subagentRegistry", () => subagentSessions.delete(sid));
          safeHandler("cleanup.subagentTracking", () => subagentTracking.delete(sid));
          safeHandler("cleanup.loopDetection", () => loopDetectionState.delete(sid));
          safeHandler("cleanup.pendingSpawns", () => pendingSubagentSpawns.delete(sid));
          safeHandler("cleanup.prdBinding", () => statuslineClearPRDBinding(sid));
          safeHandler("cleanup.agentTypeRegistry", () => clearSubagentType(sid));
          safeHandler("cleanup.namingState", () => clearNamingState(sid));
        }
      }

      safeHandler("eventBus.publish", () => eventBusEmit(eventType, evt));
    },
  };
};

// Keep healthCheck for internal use / testing
export function healthCheck(): { status: "ok"; plugin: string; version: string } {
  return { status: "ok", plugin: PLUGIN_NAME, version: PLUGIN_VERSION };
}

// Default export is the Plugin function (what OpenCode imports)
export default PaiPlugin;
