/**
 * tab-setter.ts - Terminal tab title/color management via escape sequences
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 * Ported from PAI v4.0.3 hooks/lib/tab-setter.ts
 *
 * Functions:
 *   setTabTitle() - Set tab title via ANSI escape sequence
 *   setTabColor() - Set tab color via ANSI escape sequence
 *   resetTab() - Reset tab to default state
 *
 * NOTE: This is the ONE place where stdout writes are allowed (for ANSI escapes).
 * All other logging should use fileLog().
 */

import { fileLog } from "./file-logger.js";
import { TAB_COLORS, PHASE_TAB_CONFIG, type TabState, type AlgorithmTabPhase } from "./tab-constants.js";

const OSC = "\x1b]";
const BEL = "\x07";
const ANSI_RESET = "\x1b[0m";

const KITTY_TAB_TITLE = "1337;SetUserVar";
const KITTY_TAB_COLOR_PREFIX = "1337;SetTabColor";

/**
 * Set terminal tab title via ANSI escape sequence
 * Works with Kitty terminal and compatible terminals
 */
export function setTabTitle(title: string): void {
  try {
    // OSC 0 ; title BEL - Set window title
    const setTitle = `${OSC}0;${title}${BEL}`;
    process.stdout.write(setTitle);

    // Kitty-specific: Set tab title via base64 encoded variable
    const encodedTitle = Buffer.from(title).toString("base64");
    const kittySet = `${OSC}${KITTY_TAB_TITLE}=tab_title=${encodedTitle}${BEL}`;
    process.stdout.write(kittySet);

    fileLog(`Set tab title: ${title}`, "debug");
  } catch (error) {
    fileLog(`Failed to set tab title: ${error}`, "warn");
  }
}

/**
 * Set terminal tab color via ANSI escape sequence
 * Works with Kitty terminal
 */
export function setTabColor(color: string): void {
  try {
    // Kitty tab color format: 1337;SetTabColor=RRGGBB
    if (color && color !== "none") {
      const hex = color.replace("#", "");
      const setColor = `${OSC}${KITTY_TAB_COLOR_PREFIX}=${hex}${BEL}`;
      process.stdout.write(setColor);
      fileLog(`Set tab color: ${color}`, "debug");
    }
  } catch (error) {
    fileLog(`Failed to set tab color: ${error}`, "warn");
  }
}

/**
 * Reset tab to default state
 */
export function resetTab(): void {
  try {
    // Reset title
    setTabTitle("");

    // Reset color (Kitty)
    process.stdout.write(`${OSC}${KITTY_TAB_COLOR_PREFIX}${BEL}`);

    fileLog("Reset tab to default state", "debug");
  } catch (error) {
    fileLog(`Failed to reset tab: ${error}`, "warn");
  }
}

/**
 * Set tab state (title + color) based on state type
 */
export function setTabState(title: string, state: TabState): void {
  const colors = TAB_COLORS[state];

  setTabTitle(title);
  if (colors.inactiveBg !== "none") {
    setTabColor(colors.inactiveBg);
  }
}

/**
 * Set tab for an Algorithm phase
 */
export function setPhaseTab(phase: AlgorithmTabPhase, summary?: string): void {
  const config = PHASE_TAB_CONFIG[phase];
  if (!config) return;

  let title: string;
  if (phase === "COMPLETE" && summary) {
    title = `${config.symbol} ${summary}`;
  } else if (phase === "COMPLETE") {
    title = `${config.symbol} Done`;
  } else if (phase === "IDLE") {
    title = "";
  } else {
    title = `${config.symbol} ${config.gerund}`;
  }

  setTabTitle(title);
  if (config.inactiveBg !== "none") {
    setTabColor(config.inactiveBg);
  }
}

/**
 * Strip emoji prefix from a tab title to get raw text
 */
export function stripPrefix(title: string): string {
  return title.replace(/^(?:🧠|⚙️|⚙|✓|❓|👁️|📋|🔨|⚡|✅|📚)\s*/, "").trim();
}

/**
 * Set tab for working state (orange, gerund title)
 */
export function setWorkingTab(description: string): void {
  setTabState(`⚙️ ${description}`, "working");
}

/**
 * Set tab for thinking state (purple)
 */
export function setThinkingTab(description: string): void {
  setTabState(`🧠 ${description}`, "thinking");
}

/**
 * Set tab for question state (teal)
 */
export function setQuestionTab(question: string): void {
  setTabState(`❓ ${question}`, "question");
}

/**
 * Set tab for completed state (green)
 */
export function setCompletedTab(summary: string): void {
  setTabState(`✓ ${summary}`, "completed");
}

/**
 * Set tab for error state (orange)
 */
export function setErrorTab(message: string): void {
  setTabState(`❌ ${message}`, "error");
}
