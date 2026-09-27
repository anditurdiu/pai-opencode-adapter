import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ContextRoots { userRoot: string; memoryRoot: string }
export interface ContextResult { blocks: string[]; ratingTimestamp?: string }
const text = (path: string, limit: number) => {
  try { return existsSync(path) ? readFileSync(path, "utf8").slice(0, limit) : ""; }
  catch { return ""; }
};
const field = (source: string, label: string) => source.match(new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.+)$`, "m"))?.[1]?.trim();
const section = (source: string, label: string) => source.match(new RegExp(`^## ${label}\\b([^#]*)`, "m"))?.[1]?.trim();

/** Read-side replacement probe candidate. All supplied roots must have been validated. */
export function readTurnContext(roots: ContextRoots, now = Date.now()): ContextResult {
  const blocks: string[] = [];
  const principal = text(join(roots.userRoot, "PRINCIPAL", "PRINCIPAL_IDENTITY.md"), 16_384);
  const assistant = text(join(roots.userRoot, "DIGITAL_ASSISTANT", "DA_IDENTITY.md"), 16_384);
  const identity = [field(principal, "Name"), field(principal, "Timezone"), field(principal, "Location"), field(principal, "Focus"), field(assistant, "Name")];
  if (identity.some(Boolean)) blocks.push(`LifeOS identity: ${identity.filter(Boolean).join(" | ").slice(0, 1024)}`);
  const telos = text(join(roots.userRoot, "TELOS", "PRINCIPAL_TELOS.md"), 32_768);
  if (telos && !/provenance:\s*template/.test(telos)) {
    const selected = [section(telos, "Missions"), section(telos, "Active Goals")].filter(Boolean).join("\n");
    if (selected) blocks.push(`LifeOS TELOS:\n${selected.slice(0, 2048)}`);
  }
  for (const [actor, file] of [["principal", join(roots.userRoot, "PRINCIPAL", "PRINCIPAL_MEMORY.md")],
    ["assistant", join(roots.userRoot, "DIGITAL_ASSISTANT", "DA_MEMORY.md")]] as const) {
    const hot = text(file, 4096).trim();
    if (hot) blocks.push(`LifeOS ${actor} hot memory:\n${hot}`);
  }
  // Tail-bounded: a partial first row cannot become a valid new signal.
  const ratingPath = join(roots.memoryRoot, "LEARNING", "SIGNALS", "ratings.jsonl");
  let ratingText = "";
  try { ratingText = existsSync(ratingPath) ? readFileSync(ratingPath, "utf8").slice(-65_536) : ""; } catch { /* missing evidence */ }
  if (ratingText.length === 65_536) ratingText = ratingText.slice(ratingText.indexOf("\n") + 1);
  const ratings = ratingText.trim().split("\n");
  for (const line of ratings.reverse()) {
    try {
      const row: unknown = JSON.parse(line);
      if (!row || typeof row !== "object") continue;
      const { timestamp, rating, source } = row as Record<string, unknown>;
      const age = typeof timestamp === "string" ? now - Date.parse(timestamp) : NaN;
      if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 1 || rating > 10 || !Number.isFinite(age) || age < 0 || age > 7 * 86_400_000 || source === "test") continue;
      blocks.push(`LifeOS satisfaction signal (${timestamp}): ${rating}`);
      return { blocks, ratingTimestamp: timestamp as string };
    } catch { /* malformed evidence is not a valid rating */ }
  }
  return { blocks };
}
