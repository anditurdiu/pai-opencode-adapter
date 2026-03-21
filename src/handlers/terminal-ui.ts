import { fileLog } from "../lib/file-logger.js";

export type TerminalType = "kitty" | "iterm2" | "basic" | "none";
export type TabColorState = "active" | "plan" | "error" | "idle";

const OSC = "\x1b]";
const BEL = "\x07";

const COLOR_MAP: Record<TabColorState, string> = {
  active: "00ff88",
  plan: "ffcc00",
  error: "ff4444",
  idle: "888888",
};

export function detectTerminal(): TerminalType {
  if (process.env.KITTY_WINDOW_ID) return "kitty";
  if (process.env.TERM_PROGRAM === "iTerm.app") return "iterm2";
  if (process.env.TERM) return "basic";
  return "none";
}

export function generateTabTitle(taskSummary: string): string {
  const truncated = taskSummary.slice(0, 60);
  return `${OSC}2;PAI: ${truncated}${BEL}`;
}

export function generateTabColor(state: TabColorState): string {
  const hex = COLOR_MAP[state] ?? COLOR_MAP.active;
  return `${OSC}1337;SetTabColor=${hex}${BEL}`;
}

export function updateTabTitle(taskSummary: string): void {
  try {
    const terminal = detectTerminal();
    if (terminal === "none") return;

    const seq = generateTabTitle(taskSummary);
    process.stdout.write(seq);
    fileLog(`[terminal-ui] tab title set: ${taskSummary.slice(0, 40)}`);
  } catch (err) {
    fileLog(`[terminal-ui] updateTabTitle error: ${String(err)}`);
  }
}

export function updateTabColor(state: TabColorState): void {
  try {
    const terminal = detectTerminal();
    if (terminal !== "kitty") return;

    const colorSeq = generateTabColor(state);
    process.stdout.write(colorSeq);
    fileLog(`[terminal-ui] tab color set: ${state}`);
  } catch (err) {
    fileLog(`[terminal-ui] updateTabColor error: ${String(err)}`);
  }
}

export function resetTab(): void {
  try {
    const terminal = detectTerminal();
    if (terminal === "none") return;

    process.stdout.write(`${OSC}2;OpenCode${BEL}`);
    if (terminal === "kitty") {
      process.stdout.write(`${OSC}1337;SetTabColor=${COLOR_MAP.idle}${BEL}`);
    }
  } catch (err) {
    fileLog(`[terminal-ui] resetTab error: ${String(err)}`);
  }
}

export function onTaskStart(taskSummary: string): void {
  updateTabTitle(taskSummary);
  updateTabColor("active");
}

export function onPlanModeActivated(): void {
  updateTabColor("plan");
}

export function onError(): void {
  updateTabColor("error");
}

export function onSessionEnd(): void {
  resetTab();
}
