/**
 * PAI-OpenCode Adapter - Shared Types
 *
 * Common TypeScript types, interfaces, and enums for the adapter.
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 */

/**
 * Enum of PAI semantic event names (used in the 9 validated mappings)
 * These represent the logical events that PAI hooks respond to.
 */
export enum PAIHookEvent {
  // Core lifecycle events (9 validated mappings)
  SessionStart = "SessionStart",
  PreToolUse = "PreToolUse",
  PreToolUseBlock = "PreToolUseBlock",
  PostToolUse = "PostToolUse",
  Stop = "Stop",
  SubagentStop = "SubagentStop",
  SessionEnd = "SessionEnd",
  UserPromptSubmit = "UserPromptSubmit",
  Compaction = "Compaction",
}

/**
 * Enum of PAI hook file names (for reference/mapping)
 * Extracted from Releases/v4.0.3/.claude/hooks/*.hook.ts filenames
 */
export enum PAIHookFile {
  AgentExecutionGuard = "AgentExecutionGuard",
  DocIntegrity = "DocIntegrity",
  IntegrityCheck = "IntegrityCheck",
  KittyEnvPersist = "KittyEnvPersist",
  LastResponseCache = "LastResponseCache",
  LoadContext = "LoadContext",
  PRDSync = "PRDSync",
  QuestionAnswered = "QuestionAnswered",
  RatingCapture = "RatingCapture",
  RelationshipMemory = "RelationshipMemory",
  ResponseTabReset = "ResponseTabReset",
  SecurityValidator = "SecurityValidator",
  SessionAutoName = "SessionAutoName",
  SessionCleanup = "SessionCleanup",
  SetQuestionTab = "SetQuestionTab",
  SkillGuard = "SkillGuard",
  UpdateCounts = "UpdateCounts",
  UpdateTabTitle = "UpdateTabTitle",
  VoiceCompletion = "VoiceCompletion",
  WorkCompletionLearning = "WorkCompletionLearning",
}

/**
 * Mapping from PAI hook files to semantic events
 */
export const HOOK_FILE_TO_EVENT: Record<PAIHookFile, PAIHookEvent> = {
  [PAIHookFile.LoadContext]: PAIHookEvent.SessionStart,
  [PAIHookFile.KittyEnvPersist]: PAIHookEvent.SessionStart,
  [PAIHookFile.SecurityValidator]: PAIHookEvent.PreToolUse,
  [PAIHookFile.AgentExecutionGuard]: PAIHookEvent.PreToolUse,
  [PAIHookFile.SkillGuard]: PAIHookEvent.PreToolUse,
  [PAIHookFile.SetQuestionTab]: PAIHookEvent.PreToolUse,
  [PAIHookFile.PRDSync]: PAIHookEvent.PostToolUse,
  [PAIHookFile.QuestionAnswered]: PAIHookEvent.PostToolUse,
  [PAIHookFile.LastResponseCache]: PAIHookEvent.Stop,
  [PAIHookFile.ResponseTabReset]: PAIHookEvent.Stop,
  [PAIHookFile.VoiceCompletion]: PAIHookEvent.Stop,
  [PAIHookFile.DocIntegrity]: PAIHookEvent.Stop,
  [PAIHookFile.WorkCompletionLearning]: PAIHookEvent.SessionEnd,
  [PAIHookFile.SessionCleanup]: PAIHookEvent.SessionEnd,
  [PAIHookFile.RelationshipMemory]: PAIHookEvent.SessionEnd,
  [PAIHookFile.UpdateCounts]: PAIHookEvent.SessionEnd,
  [PAIHookFile.IntegrityCheck]: PAIHookEvent.SessionEnd,
  [PAIHookFile.RatingCapture]: PAIHookEvent.UserPromptSubmit,
  [PAIHookFile.UpdateTabTitle]: PAIHookEvent.UserPromptSubmit,
  [PAIHookFile.SessionAutoName]: PAIHookEvent.UserPromptSubmit,
} as const;

/**
 * OpenCode plugin event names (from OpenCode Hooks interface)
 * These are string literal types matching the actual hook names in OpenCode.
 */
export type OpenCodePluginEvent =
  | "event"
  | "config"
  | "tool"
  | "auth"
  | "chat.message"
  | "chat.params"
  | "chat.headers"
  | "permission.ask"
  | "command.execute.before"
  | "tool.execute.before"
  | "shell.env"
  | "tool.execute.after"
  | "experimental.chat.messages.transform"
  | "experimental.chat.system.transform"
  | "experimental.session.compacting"
  | "experimental.text.complete"
  | "tool.definition";

/**
 * Maps PAIHookEvent → OpenCodePluginEvent(s) (1:many mapping)
 */
export interface HookMapping {
  paiEvent: PAIHookEvent;
  ocEvents: OpenCodePluginEvent[];
  description: string;
  filter?: EventFilter;
  notes?: string;
}

export interface EventFilter {
  type: string;
}

/**
 * Per-session state tracking
 */
export interface SessionState {
  sessionId: string;
  phase: string;
  durationMs: number;
  turns: number;
  ratings: number[];
  model: string;
  learnings: string[];
  startedAt: number;
}

/**
 * Adapter configuration
 */
export interface AdapterConfig {
  paiDir: string;
  ocConfigPath: string;
  loggingLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Security verdict from security validator
 */
export type SecurityVerdict = "allow" | "deny" | "ask";

/**
 * Compaction context shape for session compaction
 */
export interface CompactionContext {
  sessionId: string;
  phase: string;
  activeGoals: string[];
  pendingLearnings: string[];
  injectedAt: number;
}

/**
 * Workaround entry for COMPATIBILITY.md registry
 */
export interface WorkaroundEntry {
  feature: string;
  workaround: string;
  status: "active" | "retired" | "pending";
  retireWhen: string;
  addedVersion: string;
}

/**
 * Adaptation plan for self-updater diff analysis
 */
export interface AdaptationPlan {
  changes: string[];
  actions: Array<{ type: "auto-fixable" | "manual-review"; description: string }>;
  classification: "minor" | "breaking" | "additive";
}

/**
 * Event mapping registry - maps PAI events to OpenCode events
 */
export interface EventMappingRegistry {
  mappings: Map<PAIHookEvent, HookMapping>;
  registerMapping(mapping: HookMapping): void;
  getMapping(paiEvent: PAIHookEvent): HookMapping | undefined;
}

/**
 * Message deduplication cache entry
 */
export interface DedupCacheEntry {
  messageId: string;
  timestamp: number;
  content: string;
}

/**
 * Log level enumeration
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Log entry structure for file logging
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Tool execution input (from OpenCode plugin API)
 */
export interface ToolInput {
  tool: string;
  args: Record<string, unknown>;
  sessionId?: string;
}

/**
 * Permission check input (from OpenCode plugin API)
 */
export interface PermissionInput {
  tool: string;
  args: Record<string, unknown>;
  permission?: string;
}

/**
 * Security validation result
 */
export interface SecurityResult {
  action: "block" | "confirm" | "allow";
  reason: string;
  message?: string;
}

export interface PAIPayload {
  session_id: string;
  event: PAIHookEvent;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  prompt?: string;
  raw: Record<string, unknown>;
}

export type PAIHandler = (
  payload: PAIPayload
) => Promise<void | { status?: SecurityVerdict }>;

export interface OpenCodePermissionInput {
  tool?: string;
  args?: Record<string, unknown>;
  sessionID?: string;
}

export interface OpenCodePermissionOutput {
  status: SecurityVerdict;
}

export interface Hooks {
  event?: (input: { event: { type: string; [key: string]: unknown } }) => Promise<void>;
  "chat.message"?: (input: { sessionID: string; messageID?: string }, output: unknown) => Promise<void>;
  "permission.ask"?: (input: OpenCodePermissionInput, output: OpenCodePermissionOutput) => Promise<void>;
  "tool.execute.before"?: (input: { tool: string; sessionID: string; callID: string }, output: { args: unknown }) => Promise<void>;
  "tool.execute.after"?: (input: { tool: string; sessionID: string; callID: string; args: unknown }, output: unknown) => Promise<void>;
  "experimental.chat.system.transform"?: (input: { sessionID?: string }, output: { system: string[] }) => Promise<void>;
  "experimental.session.compacting"?: (input: { sessionID: string }, output: { context: string[]; prompt?: string }) => Promise<void>;
}

export interface OpenCodeEventInput {
  tool?: string;
  sessionID?: string;
  callID?: string;
  args?: unknown;
  messageID?: string;
  event?: { type: string; [key: string]: unknown };
}
