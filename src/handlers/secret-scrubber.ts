import { fileLog } from "../lib/file-logger.js";
import { auditLog } from "../lib/audit-logger.js";

const REDACTED = "[REDACTED]";
const MIN_SECRET_LENGTH = 8;

const SECRET_KEY_PATTERNS: RegExp[] = [
  /_KEY$/i, /_TOKEN$/i, /_SECRET$/i, /_PASSWORD$/i,
  /_API_KEY$/i, /_APIKEY$/i, /_CREDENTIALS$/i, /_AUTH$/i,
  /^OPENAI_/i, /^ANTHROPIC_/i,
];

function buildSecretValueCache(): Set<string> {
  const secrets = new Set<string>();
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || value.length < MIN_SECRET_LENGTH) continue;
    if (SECRET_KEY_PATTERNS.some((pat) => pat.test(key))) {
      secrets.add(value);
    }
  }
  fileLog(`[secret-scrubber] Cached ${secrets.size} secret value(s) from env at startup`, "debug");
  return secrets;
}

export const SECRET_VALUE_CACHE = buildSecretValueCache();

const API_KEY_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9\-_]{10,}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /ghs_[A-Za-z0-9]{36}/g,
  /ghr_[A-Za-z0-9]{36}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xoxb-\d+-\d+-[A-Za-z0-9]+/g,
  /xoxp-\d+-\d+-\d+-[A-Za-z0-9]+/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
];

export function scrubText(text: string): { scrubbed: string; redactions: number } {
  if (!text) return { scrubbed: text, redactions: 0 };
  let result = text;
  let redactions = 0;

  for (const secret of SECRET_VALUE_CACHE) {
    if (result.includes(secret)) {
      const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
      const re = new RegExp(escaped, "g");
      const replaced = result.replace(re, REDACTED);
      if (replaced !== result) { redactions++; result = replaced; }
    }
  }

  for (const pattern of API_KEY_PATTERNS) {
    pattern.lastIndex = 0;
    const replaced = result.replace(pattern, REDACTED);
    if (replaced !== result) { redactions++; result = replaced; }
  }

  return { scrubbed: result, redactions };
}

type AnyPart = { type: string; text?: string; [key: string]: unknown };

export async function secretScrubberHandler(
  _input: Record<string, never>,
  output: { messages: { info: { id: string }; parts: AnyPart[] }[] }
): Promise<void> {
  try {
    let totalRedactions = 0;

    for (const message of output.messages) {
      for (const part of message.parts) {
        if (
          (part.type === "text" || part.type === "reasoning") &&
          typeof part.text === "string" &&
          part.text.length > 0
        ) {
          const { scrubbed, redactions } = scrubText(part.text);
          if (redactions > 0) {
            part.text = scrubbed;
            totalRedactions += redactions;
            fileLog(
              `[secret-scrubber] Redacted ${redactions} secret(s) from ${part.type} part in msg ${message.info.id.slice(0, 8)}`,
              "warn"
            );
          }
        }
      }
    }

    if (totalRedactions > 0) {
      auditLog({
        timestamp: new Date().toISOString(),
        sessionId: "transform",
        event: "security.scrubbed",
        verdict: "warned",
        details: `secret-scrubber: ${totalRedactions} redaction(s) across ${output.messages.length} message(s)`,
      });
    }
  } catch (err) {
    fileLog(`[secret-scrubber] Error (fail-open): ${err}`, "error");
  }
}
