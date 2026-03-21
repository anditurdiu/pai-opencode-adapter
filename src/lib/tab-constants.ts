/**
 * tab-constants.ts - Tab-related constants
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 * Ported from PAI v4.0.3 hooks/lib/tab-constants.ts
 *
 * Exports:
 *   TAB_COLORS - Tab color definitions by state
 *   ACTIVE_TAB_BG - Active tab background color
 *   ACTIVE_TAB_FG - Active tab foreground color
 *   INACTIVE_TAB_FG - Inactive tab foreground color
 *   PHASE_TAB_CONFIG - Phase-specific tab configuration
 *   TabState - Tab state type
 *   AlgorithmTabPhase - Algorithm phase type
 */

export const TAB_COLORS = {
  thinking: { inactiveBg: "#1E0A3C", label: "purple" },
  working: { inactiveBg: "#804000", label: "orange" },
  question: { inactiveBg: "#0D4F4F", label: "teal" },
  completed: { inactiveBg: "#022800", label: "green" },
  error: { inactiveBg: "#804000", label: "orange" },
  idle: { inactiveBg: "none", label: "default" },
} as const;

export const ACTIVE_TAB_BG = "#002B80";
export const ACTIVE_TAB_FG = "#FFFFFF";
export const INACTIVE_TAB_FG = "#A0A0A0";

export type TabState = keyof typeof TAB_COLORS;

export const PHASE_TAB_CONFIG: Record<
  string,
  { symbol: string; inactiveBg: string; label: string; gerund: string }
> = {
  OBSERVE: { symbol: "👁️", inactiveBg: "#0C2D48", label: "observe", gerund: "Observing the user request." },
  THINK: { symbol: "🧠", inactiveBg: "#2D1B69", label: "think", gerund: "Analyzing the problem space." },
  PLAN: { symbol: "📋", inactiveBg: "#1E1B4B", label: "plan", gerund: "Planning the execution approach." },
  BUILD: { symbol: "🔨", inactiveBg: "#78350F", label: "build", gerund: "Building the solution artifacts." },
  EXECUTE: { symbol: "⚡", inactiveBg: "#713F12", label: "execute", gerund: "Executing the planned work." },
  VERIFY: { symbol: "✅", inactiveBg: "#14532D", label: "verify", gerund: "Verifying ideal state criteria." },
  LEARN: { symbol: "📚", inactiveBg: "#134E4A", label: "learn", gerund: "Recording the session learnings." },
  COMPLETE: { symbol: "✅", inactiveBg: "#022800", label: "complete", gerund: "Complete." },
  IDLE: { symbol: "", inactiveBg: "none", label: "idle", gerund: "" },
};

export type AlgorithmTabPhase = keyof typeof PHASE_TAB_CONFIG;

/**
 * Get tab config for a phase
 */
export function getPhaseTabConfig(phase: string): (typeof PHASE_TAB_CONFIG)[string] | undefined {
  return PHASE_TAB_CONFIG[phase.toUpperCase()];
}

/**
 * Get tab color for a state
 */
export function getTabColor(state: TabState): (typeof TAB_COLORS)[TabState] {
  return TAB_COLORS[state] || TAB_COLORS.idle;
}
