/**
 * Event Adapter - Reference mapping layer between PAI hooks and OpenCode plugin events
 *
 * This module provides the 9 validated event mappings from PAI's hook system
 * to OpenCode's plugin event interface, plus payload translation utilities.
 *
 * NOTE: The registerHook() function was removed because it used hook-object
 * mutation which is architecturally incompatible with pai-unified.ts's
 * return-object pattern. All event wiring is done directly in pai-unified.ts.
 * The HOOK_MAPPINGS, translatePayload, and response helpers are retained
 * as reference/utility exports.
 *
 * CRITICAL API FACTS:
 * - session.idle is NOT a direct hook - received via event wildcard, filter by type
 * - session.compacted is ALSO via event wildcard
 * - permission.ask return: output.status = "ask" | "deny" | "allow" (NOT { allow: boolean })
 * - experimental.chat.user.transform DOES NOT EXIST - use chat.message
 * - experimental.chat.system.transform: PUSH to output.system[] (mutation, NOT return)
 */

import { fileLog } from "../lib/file-logger.js";
import {
  PAIHookEvent,
  type HookMapping,
  type PAIPayload,
  type OpenCodePluginEvent,
  type OpenCodeEventInput,
  type SecurityVerdict,
} from "../types/index.js";

/**
 * The 9 validated event mappings from PAI to OpenCode
 *
 * These mappings were validated against the OpenCode plugin API specification.
 * DO NOT modify without re-validation against OpenCode Hooks interface.
 */
export const HOOK_MAPPINGS: HookMapping[] = [
  {
    paiEvent: PAIHookEvent.SessionStart,
    ocEvents: ["experimental.chat.system.transform"],
    description: "Inject PAI context at session start",
    notes: "Push to output.system[] to inject context",
  },
  {
    paiEvent: PAIHookEvent.PreToolUse,
    ocEvents: ["tool.execute.before", "permission.ask"],
    description: "Validate tool execution and block if needed",
    notes: "DUAL registration: tool.execute.before for validation, permission.ask for blocking",
  },
  {
    paiEvent: PAIHookEvent.PreToolUseBlock,
    ocEvents: ["permission.ask"],
    description: "Block tool execution by setting output.status = 'deny'",
    notes: "Set output.status = 'deny' to block",
  },
  {
    paiEvent: PAIHookEvent.PostToolUse,
    ocEvents: ["tool.execute.after"],
    description: "Process after tool execution",
  },
  {
    paiEvent: PAIHookEvent.Stop,
    ocEvents: ["event"],
    description: "Handle session stop events",
    notes: "Use event wildcard, filter by type for specific stop events",
  },
  {
    paiEvent: PAIHookEvent.SubagentStop,
    ocEvents: ["tool.execute.after"],
    description: "Handle subagent (Task tool) completion",
    notes: "Filter for toolName === 'Task' or 'mcp_task'",
  },
  {
    paiEvent: PAIHookEvent.SessionEnd,
    ocEvents: ["event"],
    description: "Handle session end/idle events",
    filter: { type: "session.idle" },
    notes: "session.idle is an Event TYPE, not a direct hook - use event wildcard",
  },
  {
    paiEvent: PAIHookEvent.UserPromptSubmit,
    ocEvents: ["chat.message"],
    description: "Process user messages",
    notes: "Use chat.message, NOT experimental.chat.user.transform (doesn't exist)",
  },
  {
    paiEvent: PAIHookEvent.Compaction,
    ocEvents: ["experimental.session.compacting", "event"],
    description: "Handle session compaction",
    filter: { type: "session.compacted" },
    notes: "DUAL registration: experimental.session.compacting for before, event wildcard for after",
  },
];

/**
 * Get all event mappings
 * Used primarily in tests to verify mapping count and structure.
 */
export function getMappings(): HookMapping[] {
  return [...HOOK_MAPPINGS];
}

/**
 * Get mappings for a specific PAI event
 */
export function getMappingsForEvent(paiEvent: PAIHookEvent): HookMapping[] {
  return HOOK_MAPPINGS.filter((m) => m.paiEvent === paiEvent);
}

/**
 * Translate OpenCode event payload to PAI-shaped payload
 *
 * Normalizes the various OpenCode event input shapes into a consistent
 * PAIPayload structure that PAI handlers can work with.
 */
export function translatePayload(
  ocEvent: OpenCodePluginEvent,
  ocPayload: OpenCodeEventInput
): PAIPayload {
  const raw = ocPayload as Record<string, unknown>;

  const payload: PAIPayload = {
    session_id: ocPayload.sessionID || "",
    event: PAIHookEvent.Stop, // Default, will be overridden
    raw,
  };

  // Extract tool info for tool events
  if ("tool" in ocPayload) {
    payload.tool_name = ocPayload.tool;
  }

  // Extract args for tool events
  if ("args" in ocPayload) {
    payload.tool_input = ocPayload.args as Record<string, unknown>;
  }

  // Extract message info for chat events
  if ("messageID" in ocPayload) {
    payload.raw.messageID = ocPayload.messageID;
  }

  // Extract event type for wildcard events
  if ("event" in ocPayload && ocPayload.event) {
    payload.raw.eventType = ocPayload.event.type;
  }

  return payload;
}

/**
 * Create a blocking response for permission.ask
 * Helper for handlers that need to block tool execution.
 */
export function createBlockResponse(reason: string): { status: SecurityVerdict } {
  fileLog(`Blocking tool execution: ${reason}`, "warn");
  return { status: "deny" };
}

/**
 * Create an allow response for permission.ask
 */
export function createAllowResponse(): { status: SecurityVerdict } {
  return { status: "allow" };
}

/**
 * Create an ask/confirm response for permission.ask
 */
export function createAskResponse(): { status: SecurityVerdict } {
  return { status: "ask" };
}
