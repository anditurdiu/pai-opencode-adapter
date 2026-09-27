/** Source of truth is native permissions; this is a narrow extra path guard. */
export function assertAllowedTool(tool: string, args: unknown): void {
  if (!args || typeof args !== "object") return;
  if (tool !== "bash") return;
  const command = (args as { command?: unknown }).command;
  if (typeof command !== "string") return;
  // A command carrying an explicit request to bypass this plugin's state must
  // be refused before execution, even when native Bash permissions allow it.
  if (/\b(?:LIFEOS_CONFIG_ROOT|LIFEOS_USER_ROOT|CORTEX_MEMORY_ROOT)\s*=/.test(command) && /\b(?:Cortex|MemorySystem)\.ts\b/.test(command))
    throw new Error("LifeOS refused a redirected canonical writer command");
}
