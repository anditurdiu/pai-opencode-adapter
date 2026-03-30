import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { tool } from "@opencode-ai/plugin";
import { fileLog } from "../lib/file-logger.js";
import { emit as eventBusEmit } from "../core/event-bus.js";
import { isDuplicate, clearSessionDedup } from "../core/dedup-cache.js";

import {
  permissionGateHandler,
  inputValidationHandler,
} from "../handlers/security-validator.js";
import { contextLoaderHandler, clearContextCache } from "../handlers/context-loader.js";
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
} from "../lib/model-resolver.js";
import { syncAgentModels } from "../lib/agent-model-sync.js";

const PLUGIN_NAME = "pai-adapter";
const PLUGIN_VERSION = "0.1.0";

/**
 * Detect whether a session event belongs to a sub-agent (not the main session).
 *
 * OpenCode sub-agent sessions carry a `parentSessionId` property or an
 * `agentId` that indicates they were spawned by a parent.  We also check
 * the `OPENCODE_AGENT_TASK_ID` env var which mirrors Claude Code's
 * `CLAUDE_CODE_AGENT_TASK_ID` convention.
 */
function isSubagentSession(evt: Record<string, unknown>): boolean {
  // 1. Explicit parent reference in the event payload
  if (evt.parentSessionId || evt.parentSessionID || evt.parent_session_id) {
    return true;
  }

  // 2. Agent metadata on the event (subagent sessions carry agentId/agentType)
  if (evt.agentId || evt.agentType || evt.agent_id) {
    return true;
  }

  // 3. Properties nested inside event.properties (OpenCode wraps some metadata)
  const props = evt.properties as Record<string, unknown> | undefined;
  if (props) {
    if (props.parentSessionId || props.parentSessionID || props.agentId || props.agentType) {
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

// Export for testing
export { subagentSessions as _subagentSessionsForTest };

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
export const PaiPlugin = async (_ctx: unknown) => {
  fileLog(`[pai-unified] plugin initialized: ${PLUGIN_NAME}@${PLUGIN_VERSION}`);

  // Sync agent model assignments from pai-adapter.json into agent .md files.
  // This ensures the `model:` field in each agent's YAML frontmatter matches
  // the configured role→model mapping, so OpenCode spawns agents with the
  // correct models instead of using stale hardcoded values.
  safeHandler("agentModelSync", () => {
    const result = syncAgentModels();
    if (result.synced.length > 0) {
      fileLog(`[pai-unified] Agent models synced: ${result.synced.join(", ")}`);
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
      const toolError = String(input.error ?? output.error ?? "");
      const toolName = String(input.tool ?? input.toolName ?? "");
      if (toolError && sid && (toolName === "Task" || toolName === "task" || toolName.startsWith("agent"))) {
        safeHandler("modelRouting.errorDetect", () => {
          const errorType = classifyProviderError(toolError);
          if (errorType !== "unknown") {
            const failedModel = String(input.model ?? input.modelId ?? "");
            setFallbackSuggestion(sid, failedModel || toolName, errorType);
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
        if (!isSubagentSession(evt)) {
          safeHandler("voice.greeting", () => {
            const greeting = getStartupGreeting();
            if (greeting) {
              speakText(greeting);
            }
          });
        } else {
          // Register this session as a sub-agent so tool.execute.before can
          // block voice curls from it later.
          subagentSessions.add(sid);
          fileLog(`[pai-unified] sub-agent session registered (${sid}), voice curls will be blocked`);
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
          safeHandler("cleanup.prdBinding", () => statuslineClearPRDBinding(sid));
        }
      }

      safeHandler("eventBus.publish", () => eventBusEmit(eventType, evt));
    },

    // ── tool (custom tools exposed to the LLM) ──────────────
    tool: {},
  };
};

// Keep healthCheck for internal use / testing
export function healthCheck(): { status: "ok"; plugin: string; version: string } {
  return { status: "ok", plugin: PLUGIN_NAME, version: PLUGIN_VERSION };
}

// Default export is the Plugin function (what OpenCode imports)
export default PaiPlugin;
