import { fileLog } from "../lib/file-logger.js";
import { emit } from "../core/event-bus.js";

interface PlanModeState {
  active: boolean;
}

const planStates = new Map<string, PlanModeState>();

const PLAN_TRIGGERS = ["/plan", "plan mode", "planning mode", "enter plan mode", "start planning"];
const DEACTIVATE_TRIGGERS = ["/build", "/execute", "exit plan mode", "leave plan mode", "start building", "/implement"];

const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep", "lsp_diagnostics", "lsp_symbols", "lsp_find_references", "lsp_goto_definition"]);
const SAFE_BASH_PREFIXES = ["ls", "cat ", "head ", "tail ", "echo ", "pwd", "which ", "type ", "git log", "git diff", "git status", "git show", "find "];
const DESTRUCTIVE_TERMS = ["rm ", "del ", "rmdir", "mv ", "cp ", "write", "create", "mkdir", "touch ", "chmod", "chown", "curl", "wget", "npm ", "bun ", "pip ", "apt", "brew", "git commit", "git push", "git add"];

function isPlanTrigger(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return PLAN_TRIGGERS.some((t) => lower.includes(t));
}

function isDeactivateTrigger(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return DEACTIVATE_TRIGGERS.some((t) => lower.includes(t));
}

function isBashSafe(command: string): boolean {
  const cmd = command.trimStart();
  return SAFE_BASH_PREFIXES.some((prefix) => cmd.startsWith(prefix));
}

function isBashDestructive(command: string): boolean {
  const cmd = command.toLowerCase();
  return DESTRUCTIVE_TERMS.some((d) => cmd.includes(d));
}

export function planModeMessageHandler(sessionId: string, message: string): void {
  try {
    if (isDeactivateTrigger(message)) {
      planStates.set(sessionId, { active: false });
      emit("adapter:plan:deactivated", { sessionId });
      fileLog(`[plan-mode] deactivated for session: ${sessionId}`);
    } else if (isPlanTrigger(message)) {
      planStates.set(sessionId, { active: true });
      emit("adapter:plan:activated", { sessionId });
      fileLog(`[plan-mode] activated for session: ${sessionId}`);
    }
  } catch (err) {
    fileLog(`[plan-mode] message handler error: ${String(err)}`);
  }
}

export function planModePermissionHandler(
  sessionId: string,
  toolName: string,
  bashCommand: string,
  output: { status?: "ask" | "deny" | "allow" }
): void {
  try {
    const state = planStates.get(sessionId);
    if (!state?.active) return;

    if (READ_ONLY_TOOLS.has(toolName)) {
      return;
    }

    if (toolName === "Bash" || toolName === "bash") {
      if (isBashSafe(bashCommand) && !isBashDestructive(bashCommand)) {
        return;
      }
      output.status = "deny";
      fileLog(`[plan-mode] blocked Bash in plan mode: ${bashCommand.slice(0, 60)}`);
      return;
    }

    output.status = "deny";
    fileLog(`[plan-mode] blocked tool "${toolName}" in plan mode`);
  } catch (err) {
    fileLog(`[plan-mode] permission handler error: ${String(err)}`);
  }
}

export function isPlanModeActive(sessionId: string): boolean {
  return planStates.get(sessionId)?.active === true;
}

export function clearPlanModeState(sessionId: string): void {
  planStates.delete(sessionId);
}

export function getPlanModeDenyReason(): string {
  return "Plan mode active — read-only operations only";
}
