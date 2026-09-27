import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readTurnContext, type ContextRoots } from "./context.js";

interface Part { type: string; text?: string }
const SKIP = new Set(["LifeOS"]);
const MATCH_LIMIT = 3, COOLDOWN_MS = 60 * 60 * 1000;

/** Read-only core for the one-plugin replacement; no plugin registration occurs here. */
export function createReadBridge(roots: ContextRoots & { skillRoot: string }, now = () => Date.now()) {
  const latest = new Map<string, string>();
  const cooldown = new Map<string, number>();
  const routes = new Map<string, string[]>();
  if (existsSync(roots.skillRoot)) for (const entry of readdirSync(roots.skillRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
    let text = "";
    try { text = readFileSync(join(roots.skillRoot, entry.name, "SKILL.md"), "utf8"); } catch { continue; }
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
    const description = /^description:[ \t]*(.*)$/m.exec(front)?.[1]?.replace(/^['"]|['"]$/g, "") ?? "";
    const match = /USE WHEN\s+(.+?)(?:\s+NOT FOR\b|\.|$)/i.exec(description);
    if (!match) continue;
    routes.set(entry.name, match[1]!.split(/[,;]/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 3 && x.length <= 48));
  }
  return {
    capture(sessionID: string, parts: Part[]) {
      const message = parts.filter(p => p?.type === "text" && typeof p.text === "string").map(p => p.text).join("\n").trim();
      if (sessionID && message) latest.set(sessionID, message.slice(0, 4096));
    },
    context(sessionID: string): string[] {
      const blocks = readTurnContext(roots, now()).blocks;
      const message = latest.get(sessionID)?.toLowerCase();
      if (!message) return blocks;
      const matches: string[] = [];
      for (const [name, terms] of routes) {
        if (matches.length === MATCH_LIMIT) break;
        if (cooldown.has(name) && (cooldown.get(name) ?? 0) + COOLDOWN_MS > now()) continue;
        if (terms.some(term => new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(message))) {
          matches.push(name); cooldown.set(name, now());
        }
      }
      if (matches.length) blocks.push(`LifeOS skill route: ${matches.join(", ")}. Invoke the installed skill workflow when it matches.`);
      return blocks;
    },
    forget(sessionID: string) { latest.delete(sessionID); },
    indexedSkills: [...routes.keys()],
  };
}
