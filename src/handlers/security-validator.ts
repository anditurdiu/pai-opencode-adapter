/**
 * security-validator.ts — Input validation security for PAI-OpenCode adapter.
 *
 * inputValidationHandler: tool.execute.before (blocking)
 *   4-step sanitization pipeline → 7-category injection detection
 *
 * MIT License — Custom implementation for PAI-OpenCode Hybrid Adapter
 */

import { fileLog } from "../lib/file-logger.js";
import { auditLog } from "../lib/audit-logger.js";

// ─── Injection Categories ────────────────────────────────────────────────────

export type InjectionCategory =
  | "instruction_override"
  | "role_hijacking"
  | "system_prompt_extraction"
  | "safety_bypass"
  | "context_separator"
  | "mcp_tool_injection"
  | "pii_credential_leak";

export type InjectionSeverity = "BLOCK" | "WARN" | "IGNORE";

interface InjectionPattern {
  pattern: RegExp;
  category: InjectionCategory;
  severity: InjectionSeverity;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  // Category 5: Context Separator Injection (checked first — structural, high-priority)
  { pattern: /```\s*system/i, category: "context_separator", severity: "BLOCK" },
  { pattern: /---+SYSTEM---+/i, category: "context_separator", severity: "BLOCK" },
  { pattern: /\[SYSTEM\]/i, category: "context_separator", severity: "BLOCK" },
  { pattern: /<system>[\s\S]{0,500}<\/system>/i, category: "context_separator", severity: "BLOCK" },

  // Category 1: Instruction Override
  { pattern: /ignore\s+(all\s+)?previous\s+instructions?/i, category: "instruction_override", severity: "BLOCK" },
  { pattern: /you\s+are\s+now\s+/i, category: "instruction_override", severity: "BLOCK" },
  { pattern: /new\s+system\s+prompt/i, category: "instruction_override", severity: "BLOCK" },
  { pattern: /disregard\s+(your\s+)?(previous|prior|above)\s+(instructions?|rules?|context)/i, category: "instruction_override", severity: "BLOCK" },
  { pattern: /forget\s+(your\s+)?(previous|prior|above)\s+(instructions?|rules?|guidelines?)/i, category: "instruction_override", severity: "BLOCK" },

  // Category 2: Role Hijacking
  { pattern: /\bact\s+as\s+/i, category: "role_hijacking", severity: "BLOCK" },
  { pattern: /pretend\s+(you\s+are|to\s+be)\s+/i, category: "role_hijacking", severity: "BLOCK" },
  { pattern: /roleplay\s+as\s+/i, category: "role_hijacking", severity: "BLOCK" },
  { pattern: /you\s+are\s+(an?\s+)?unrestricted/i, category: "role_hijacking", severity: "BLOCK" },

  // Category 3: System Prompt Extraction
  { pattern: /show\s+(me\s+)?your\s+instructions?/i, category: "system_prompt_extraction", severity: "BLOCK" },
  { pattern: /reveal\s+(your\s+)?system\s+prompt/i, category: "system_prompt_extraction", severity: "BLOCK" },
  { pattern: /output\s+your\s+(rules?|instructions?|guidelines?|system)/i, category: "system_prompt_extraction", severity: "BLOCK" },
  { pattern: /print\s+your\s+(initial\s+|system\s+)?prompt/i, category: "system_prompt_extraction", severity: "BLOCK" },
  { pattern: /repeat\s+(every\s+word|verbatim|exactly)\s+(above|before|prior)/i, category: "system_prompt_extraction", severity: "BLOCK" },

  // Category 4: Safety Bypass
  { pattern: /\bjailbreak\b/i, category: "safety_bypass", severity: "BLOCK" },
  { pattern: /\bDAN\b/, category: "safety_bypass", severity: "BLOCK" },
  { pattern: /without\s+(any\s+)?restrictions?/i, category: "safety_bypass", severity: "BLOCK" },
  { pattern: /no\s+limitations?\s+(at\s+all|whatsoever)/i, category: "safety_bypass", severity: "BLOCK" },
  { pattern: /bypass\s+(safety|security|content)\s+(filter|check|policy)/i, category: "safety_bypass", severity: "BLOCK" },

  // Category 6: MCP Tool Injection (crafted tool names/args attempting code exec)
  { pattern: /;\s*(rm|dd|mkfs|chmod|chown|curl|wget|bash|sh|python|node|eval)\s/i, category: "mcp_tool_injection", severity: "BLOCK" },
  { pattern: /\$\([^)]{0,100}\)/i, category: "mcp_tool_injection", severity: "BLOCK" },
  { pattern: /`[^`]{0,100}`/i, category: "mcp_tool_injection", severity: "BLOCK" },

  // Category 7: PII/Credential Leaks (WARN only — detect, don't block)
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/, category: "pii_credential_leak", severity: "WARN" },
  { pattern: /\bsk-ant-[A-Za-z0-9\-_]{10,}\b/, category: "pii_credential_leak", severity: "WARN" },
  { pattern: /\bsk-[a-zA-Z0-9]{20,}\b/, category: "pii_credential_leak", severity: "WARN" },
  { pattern: /\bpassword\s*[:=]\s*\S+/i, category: "pii_credential_leak", severity: "WARN" },
  { pattern: /\bapi[_-]?key\s*[:=]\s*\S+/i, category: "pii_credential_leak", severity: "WARN" },
];

// ─── 4-Step Sanitization Pipeline ────────────────────────────────────────────

export function sanitizeInput(text: string): string {
  let result = text;

  // Step 1: Decode base64 (look for large base64 blobs and decode)
  // Guard: only attempt decoding if the string contains + or / — real base64-encoded
  // binary data always includes these characters, while plain identifiers never do.
  // Without this guard, long alphanumeric identifiers (e.g. "secretScrubberHandler")
  // are incorrectly decoded into garbage bytes that trigger injection false positives.
  result = result.replace(/([A-Za-z0-9+/]{20,}={0,2})/g, (match) => {
    if (!match.includes("+") && !match.includes("/")) return match;
    try {
      const decoded = Buffer.from(match, "base64").toString("utf-8");
      const hasControl = decoded.split("").some((ch) => {
        const code = ch.charCodeAt(0);
        return (code >= 0 && code <= 8) || (code >= 14 && code <= 31) || code === 127;
      });
      if (hasControl) return match;
      return decoded;
    } catch {
      return match;
    }
  });

  // Step 2: Normalize Unicode — collapse homoglyphs, strip zero-width chars
  result = result.normalize("NFC");
  result = result.replace(/[\u200B-\u200D\uFEFF\u2060]/g, "");
  result = result
    .replace(/\u0456/g, "i")   // Cyrillic і → i
    .replace(/\u0430/g, "a")   // Cyrillic а → a
    .replace(/\u0435/g, "e")   // Cyrillic е → e
    .replace(/\u043E/g, "o")   // Cyrillic о → o
    .replace(/\u0440/g, "r")   // Cyrillic р → r
    .replace(/\u0441/g, "c");  // Cyrillic с → c

  // Step 3: Collapse spacing — normalize whitespace, strip excessive newlines
  result = result.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  result = result.replace(/\t/g, " ").replace(/[ ]{2,}/g, " ");
  result = result.replace(/\n{3,}/g, "\n\n");

  // Step 4: Strip HTML — remove tags, decode common entities
  result = result.replace(/<[^>]{0,200}>/g, "");
  result = result
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");

  return result;
}

// ─── Injection Detection ─────────────────────────────────────────────────────

export interface DetectionResult {
  category: InjectionCategory;
  severity: InjectionSeverity;
  pattern: string;
  matched: string;
}

export function detectInjection(text: string): DetectionResult | null {
  const sanitized = sanitizeInput(text);

  for (const ip of INJECTION_PATTERNS) {
    const target = sanitized;
    const m = target.match(ip.pattern);
    if (m) {
      return {
        category: ip.category,
        severity: ip.severity,
        pattern: ip.pattern.toString(),
        matched: m[0].slice(0, 100),
      };
    }
  }
  return null;
}

// ─── Audit Logging ───────────────────────────────────────────────────────────
// Uses the centralized auditLog from audit-logger.ts (single audit path)

function writeAuditEvent(
  sessionId: string,
  tool: string,
  action: "blocked" | "warned" | "allowed",
  reason: string,
  category?: InjectionCategory
): void {
  auditLog({
    timestamp: new Date().toISOString(),
    sessionId,
    event: `security.${action}`,
    verdict: action,
    details: `tool=${tool}${category ? ` category=${category}` : ""} reason=${reason}`,
  });
}

// ─── Layer 2: Input Validation ─────────────────────────────────────────────────
//
// NOTE on SDK signature (tool.execute.before):
//   input: { tool: string; sessionID: string; callID: string }
//   output: { args: any }
//
// Args are in output.args — NOT in input. Blocking is done by throwing an Error
// (OpenCode cancels tool execution when the hook throws). There is no output.block
// field in the real SDK.

export async function inputValidationHandler(
  input: { tool?: string; sessionID?: string },
  output: { args?: Record<string, unknown> | null | undefined }
): Promise<void> {
  const tool = input.tool ?? "unknown";
  const sessionId = input.sessionID ?? "unknown";

  try {
    const args = output.args ?? {};
    const scanFields = ["command", "content", "prompt", "message", "input", "query", "text"];

    for (const field of scanFields) {
      const value = args[field];
      if (typeof value !== "string" || value.length === 0) continue;

      const result = detectInjection(value);
      if (!result) continue;

      if (result.severity === "BLOCK") {
        const reason = `Injection detected in field "${field}": ${result.category}`;
        fileLog(`inputValidationHandler: BLOCKED injection in field "${field}" (${result.category})`, "error");
        writeAuditEvent(sessionId, tool, "blocked", reason, result.category);
        throw new Error(reason);
      }

      if (result.severity === "WARN") {
        fileLog(`inputValidationHandler: WARN — possible PII/credential in field "${field}" (${result.category})`, "warn");
        writeAuditEvent(sessionId, tool, "warned", `Possible PII in field "${field}"`, result.category);
      }
    }
  } catch (err) {
    // Re-throw if this is our own BLOCK error, otherwise fail-open
    if (err instanceof Error && err.message.startsWith("Injection detected")) {
      throw err;
    }
    fileLog(`inputValidationHandler error (fail-open): ${err}`, "error");
  }
}
