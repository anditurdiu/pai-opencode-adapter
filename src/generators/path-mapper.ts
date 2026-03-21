import { join } from "node:path";
import { existsSync } from "node:fs";

export const PATHS = {
  PAI_ROOT: () => join(process.env.HOME!, ".claude"),
  PAI_AGENTS: () => join(process.env.HOME!, ".claude", "agents"),
  PAI_HOOKS: () => join(process.env.HOME!, ".claude", "hooks"),
  PAI_TELOS: () => join(process.env.HOME!, ".claude", "PAI", "USER", "TELOS"),
  PAI_ALGORITHM: () => join(process.env.HOME!, ".claude", "PAI", "Algorithm"),
  PAI_MEMORY: () => join(process.env.HOME!, ".claude", "MEMORY"),
  PAI_SETTINGS: () => join(process.env.HOME!, ".claude", "settings.json"),
  OPENCODE_CONFIG_DIR: () => join(process.env.HOME!, ".config", "opencode"),
  OPENCODE_CONFIG: () => join(process.env.HOME!, ".config", "opencode", "opencode.json"),
  OPENCODE_TUI_CONFIG: () => join(process.env.HOME!, ".config", "opencode", "tui.json"),
  OPENCODE_AGENTS_DIR: () => join(process.env.HOME!, ".config", "opencode", "agents"),
  OPENCODE_THEMES_DIR: () => join(process.env.HOME!, ".config", "opencode", "themes"),
  OPENCODE_COMMANDS_DIR: () => join(process.env.HOME!, ".config", "opencode", "commands"),
  PAI_ADAPTER_CONFIG: () => join(process.env.HOME!, ".config", "opencode", "pai-adapter.json"),
  OPENCODE_ROOT: () => join(process.env.HOME!, ".opencode"),
  OPENCODE_STATE: () => join(process.env.HOME!, ".opencode", "pai-state"),
  LOG_FILE: "/tmp/pai-opencode-debug.log",
  AUDIT_LOG: () => join(process.env.HOME!, ".opencode", "pai-state", "security-audit.jsonl"),
} as const;

export function resolvePAIPath(relativePath: string): string {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    throw new Error("HOME environment variable not set");
  }
  
  const cleanPath = relativePath.replace(/^[/~]/, "");
  return join(homeDir, ".claude", cleanPath);
}

export function isPAIInstalled(): boolean {
  return existsSync(PATHS.PAI_SETTINGS());
}
