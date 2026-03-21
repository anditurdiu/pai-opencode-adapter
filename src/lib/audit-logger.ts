import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "./file-logger.js";

const DEFAULT_STORAGE_DIR = join(process.env.HOME || "~", ".opencode", "pai-state");
const AUDIT_LOG_FILE = "security-audit.jsonl";

export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  event: string;
  verdict: string;
  details?: string;
}

const REDACTION_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /sk-ant-[A-Za-z0-9\-_]{20,}/g, replacement: "sk-ant-[REDACTED]" },
  { pattern: /sk-proj-[a-zA-Z0-9]{32,}/g, replacement: "sk-proj-[REDACTED]" },
  { pattern: /sk-[a-zA-Z0-9]{32,}/g, replacement: "sk-[REDACTED]" },
  { pattern: /gh[pousr]_[a-zA-Z0-9]{36,}/g, replacement: "gh[REDACTED]" },
  { pattern: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g, replacement: "$1[REDACTED]" },
  { pattern: /gsk_[a-zA-Z0-9]{52}/g, replacement: "gsk-[REDACTED]" },
  { pattern: /hf_[a-zA-Z0-9]{34,}/g, replacement: "hf-[REDACTED]" },
  { pattern: /Bearer\s+[a-zA-Z0-9\-_\.]+/g, replacement: "Bearer [REDACTED]" },
  { pattern: /token:\s*[a-zA-Z0-9\-_\.]+/g, replacement: "token: [REDACTED]" },
  { pattern: /password:\s*[^\s,]+/g, replacement: "password: [REDACTED]" },
  { pattern: /api_key:\s*[a-zA-Z0-9\-_\.]+/g, replacement: "api_key: [REDACTED]" },
];

function redactSecrets(text: string): string {
  let redacted = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

function getAuditLogPath(): string {
  const storageDir = DEFAULT_STORAGE_DIR;

  try {
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }
  } catch (error) {
    fileLog(`Failed to create audit log directory: ${error}`, "error");
  }

  return join(storageDir, AUDIT_LOG_FILE);
}

export function auditLog(entry: AuditEntry): void {
  try {
    const auditPath = getAuditLogPath();

    const redactedEntry: AuditEntry = {
      ...entry,
      details: entry.details ? redactSecrets(entry.details) : undefined,
    };

    const logLine = `${JSON.stringify(redactedEntry)}\n`;
    appendFileSync(auditPath, logLine, "utf-8");
  } catch (error) {
    fileLog(`Failed to write audit log: ${error}`, "error");
  }
}
