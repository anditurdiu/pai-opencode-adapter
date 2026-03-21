/**
 * paths.ts - PAI path resolution utilities (adapter-specific)
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 * Ported from PAI v4.0.3 hooks/lib/paths.ts
 *
 * Functions:
 *   getPAIPath() - Get path relative to PAI directory
 *   getAdapterPath() - Get path relative to adapter directory
 *   getMemoryPath() - Get path relative to MEMORY directory
 *   expandPath() - Expand shell variables in path
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileLog } from "./file-logger.js";

const HOME = homedir();
const DEFAULT_PAI_DIR = join(HOME, ".claude");
const DEFAULT_ADAPTER_DIR = join(HOME, ".opencode");
const DEFAULT_CONFIG_DIR = join(HOME, ".config", "opencode");

/**
 * Expand shell variables in a path string
 * Supports: $HOME, ${HOME}, ~
 */
export function expandPath(path: string): string {
  return path
    .replace(/^\$HOME(?=\/|$)/, HOME)
    .replace(/^\$\{HOME\}(?=\/|$)/, HOME)
    .replace(/^~(?=\/|$)/, HOME);
}

/**
 * Get the PAI directory (expanded)
 * Priority: PAI_DIR env var (expanded) → ~/.claude
 */
export function getPAIDir(): string {
  const envPaiDir = process.env.PAI_DIR;
  if (envPaiDir) {
    return expandPath(envPaiDir);
  }
  return DEFAULT_PAI_DIR;
}

/**
 * Get the adapter directory (OpenCode)
 * Priority: ADAPTER_DIR env var → ~/.opencode
 */
export function getAdapterDir(): string {
  const envAdapterDir = process.env.ADAPTER_DIR;
  if (envAdapterDir) {
    return expandPath(envAdapterDir);
  }
  return DEFAULT_ADAPTER_DIR;
}

/**
 * Get a path relative to PAI directory
 */
export function getPAIPath(...segments: string[]): string {
  return join(getPAIDir(), ...segments);
}

/**
 * Get a path relative to adapter directory
 */
export function getAdapterPath(...segments: string[]): string {
  return join(getAdapterDir(), ...segments);
}

/**
 * Get a path relative to MEMORY directory
 * Uses adapter's MEMORY directory
 */
export function getMemoryPath(...segments: string[]): string {
  return getAdapterPath("MEMORY", ...segments);
}

/**
 * Get the XDG config directory for OpenCode (~/.config/opencode/)
 * This is where opencode.json and plugin-specific configs live.
 */
export function getConfigDir(): string {
  return DEFAULT_CONFIG_DIR;
}

/**
 * Get the PAI adapter config file path (~/.config/opencode/pai-adapter.json)
 * Plugin-specific config, separate from opencode.json.
 */
export function getAdapterConfigPath(): string {
  return join(DEFAULT_CONFIG_DIR, "pai-adapter.json");
}

/**
 * Get the OpenCode main config file path (~/.config/opencode/opencode.json)
 */
export function getOpenCodeConfigPath(): string {
  return join(DEFAULT_CONFIG_DIR, "opencode.json");
}

/**
 * Get the settings.json path (in adapter directory)
 * @deprecated Use getAdapterConfigPath() instead — settings now live at ~/.config/opencode/pai-adapter.json
 */
export function getSettingsPath(): string {
  return getAdapterConfigPath();
}

/**
 * Get the hooks directory
 */
export function getHooksDir(): string {
  return getAdapterPath("hooks");
}

/**
 * Get the state directory
 */
export function getStateDir(): string {
  return getMemoryPath("STATE");
}

/**
 * Get the work directory
 */
export function getWorkDir(): string {
  return getMemoryPath("WORK");
}

/**
 * Get the learning directory
 */
export function getLearningDir(): string {
  return getMemoryPath("LEARNING");
}

/**
 * Get current year-month string (YYYY-MM)
 */
export function getYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Get date string (YYYY-MM-DD)
 */
export function getDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get timestamp for filenames (no special chars)
 */
export function getTimestamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
  const { mkdirSync, existsSync: exists } = await import("node:fs");
  if (!exists(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get current work session path from state file
 */
export async function getCurrentWorkPath(): Promise<string | null> {
  const stateFile = join(getStateDir(), "current-work.json");
  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(stateFile, "utf-8");
    const state = JSON.parse(content);
    return state.work_dir || null;
  } catch {
    return null;
  }
}

/**
 * Set current work session path in state file
 */
export async function setCurrentWorkPath(workPath: string): Promise<void> {
  const stateDir = getStateDir();
  await ensureDir(stateDir);

  const stateFile = join(stateDir, "current-work.json");
  const state = {
    work_dir: workPath,
    started_at: new Date().toISOString(),
  };

  const { writeFile } = await import("node:fs/promises");
  await writeFile(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Clear current work session
 */
export async function clearCurrentWork(): Promise<void> {
  const stateFile = join(getStateDir(), "current-work.json");
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(stateFile);
  } catch {
    // File doesn't exist, that's fine
  }
}

/**
 * Slugify text for filenames
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Generate session ID from timestamp
 */
export function generateSessionId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}_${random}`;
}
