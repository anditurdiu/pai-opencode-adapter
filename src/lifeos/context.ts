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

/** Caller passes the canonical record ID and content returned by Cortex.get. */
export function relevantContext(records: { id: string; content: string; provenance: { path: string }; score: number }[], maxChars = 1600) {
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > 4096) throw new Error("invalid retrieval budget");
  let remaining = maxChars;
  const selected: { id: string; path: string; text: string }[] = [];
  for (const record of records.slice(0, 3)) {
    if (!Number.isFinite(record.score) || record.score <= 0 || !record.id || !record.provenance.path) continue;
    const text = record.content.replace(/^---[\s\S]*?---\s*/, "").trim().slice(0, Math.min(600, remaining));
    if (!text) continue;
    selected.push({ id: record.id, path: record.provenance.path, text }); remaining -= text.length;
    if (remaining <= 0) break;
  }
  return selected;
}

/** The canonical Cortex read commands provide cards first and selected full records second. */
export async function searchCanonical(cortex: { run(args: string[]): Promise<{ exitCode: number; envelope: { ok: boolean; data: any } }> }, query: string) {
  const text = query.trim().slice(0, 512);
  if (text.length < 3) return [];
  const found = await cortex.run(["search", text, "--adapter", "opencode", "--page-size", "3"]);
  if (found.exitCode !== 0 || !found.envelope.ok) return [];
  const cards = found.envelope.data?.items;
  if (!Array.isArray(cards)) return [];
  const wanted = cards.filter(card => card && typeof card.id === "string" && card.score > 0).slice(0, 3);
  if (!wanted.length) return [];
  const obtained = await cortex.run(["get", ...wanted.map(card => card.id), "--adapter", "opencode"]);
  if (obtained.exitCode !== 0 || !obtained.envelope.ok || !Array.isArray(obtained.envelope.data?.items)) return [];
  return relevantContext(obtained.envelope.data.items.map((record: any) => ({ ...record, score: wanted.find(card => card.id === record.id)?.score ?? 0 })));
}

/** Read-side replacement probe candidate. All supplied roots must have been validated. */
export function readTurnContext(roots: ContextRoots, now = Date.now()): ContextResult {
  const blocks: string[] = [];
  const principal = text(join(roots.userRoot, "PRINCIPAL", "PRINCIPAL_IDENTITY.md"), 16_384);
  const assistant = text(join(roots.userRoot, "DIGITAL_ASSISTANT", "DA_IDENTITY.md"), 16_384);
  const identity = [field(principal, "Name"), field(principal, "Timezone"), field(principal, "Location"), field(principal, "Focus"), field(assistant, "Name")];
  if (identity.some(Boolean)) blocks.push(`LifeOS identity: ${identity.filter(Boolean).join(" | ").slice(0, 1024)}\nYou are the LifeOS Digital Assistant. Speak first person; the principal is "you". Follow the loaded LifeOS constitution.`);
  const telos = text(join(roots.userRoot, "TELOS", "PRINCIPAL_TELOS.md"), 32_768);
  if (telos && !/provenance:\s*template/.test(telos)) {
    const selected = [section(telos, "Missions"), section(telos, "Active Goals")].filter(Boolean).join("\n");
    if (selected) blocks.push(`LifeOS TELOS:\n${selected.slice(0, 2048)}`);
  }
  for (const [actor, file] of [["principal", join(roots.userRoot, "PRINCIPAL", "PRINCIPAL_MEMORY.md")],
    ["assistant", join(roots.userRoot, "DIGITAL_ASSISTANT", "DA_MEMORY.md")]] as const) {
    const hot = text(file, 4096).trim();
    if (hot && !/provenance:\s*template/.test(hot)) blocks.push(`LifeOS ${actor} hot memory:\n${hot}`);
  }
  let reflectionText = "";
  try {
    const path = join(roots.memoryRoot, "LEARNING", "REFLECTIONS", "algorithm-reflections.jsonl");
    reflectionText = existsSync(path) ? readFileSync(path, "utf8").slice(-65_536) : "";
  } catch { /* no reflection evidence */ }
  if (reflectionText.length === 65_536) reflectionText = reflectionText.slice(reflectionText.indexOf("\n") + 1);
  const reflections = reflectionText.trim().split("\n");
  for (const line of reflections.reverse()) {
    try {
      const row = JSON.parse(line);
      const reflection = row?.reflection ?? row?.theme ?? row?.topic;
      if (typeof reflection === "string" && reflection.trim()) { blocks.push(`LifeOS last reflection: ${reflection.slice(0, 300)}`); break; }
    } catch { /* malformed historical rows are not injected */ }
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
