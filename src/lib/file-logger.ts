import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const LOG_PATH = "/tmp/pai-opencode-debug.log";

export function fileLog(
  message: string,
  level: "info" | "warn" | "error" | "debug" = "info"
): void {
  try {
    const timestamp = new Date().toISOString();
    const levelPrefix = level.toUpperCase().padEnd(5, " ");
    const logLine = `[${timestamp}] [${levelPrefix}] ${message}\n`;

    const dir = dirname(LOG_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    appendFileSync(LOG_PATH, logLine);
  } catch {
  }
}

export function clearLog(): void {
  try {
    writeFileSync(LOG_PATH, "");
  } catch {
  }
}

export function getLogPath(): string {
  return LOG_PATH;
}
