/** Isolated SDK carrier candidate. No production scheduler calls this before host probes. */
export interface ReviewerClient {
  session: {
    create(options: { body: { parentID: string; title: string } }): Promise<{ data?: { id: string }; error?: unknown }>;
    prompt(options: { path: { id: string }; body: { agent: string; model: { providerID: string; modelID: string }; tools: Record<string, boolean>; parts: [{ type: "text"; text: string }] } }): Promise<{
      data?: { info: { providerID: string; modelID: string; error?: unknown; time: { completed?: number } }; parts: { type: string; text?: string }[] };
      error?: unknown;
    }>;
    abort(options: { path: { id: string } }): Promise<unknown>;
    delete(options: { path: { id: string } }): Promise<unknown>;
  };
}
export type Review = { disposition: "noop" } | { disposition: "candidate"; item: Record<string, unknown> };
export type ReviewResult = { ok: true; result: Review; providerID: string; modelID: string } | { ok: false; reason: string };
const INPUT_LIMIT = 12_000, OUTPUT_LIMIT = 2_048, TIMEOUT_MS = 30_000;

/** Same private-span semantics as the canonical capture boundary: unmatched open tag suppresses the rest. */
export function stripPrivate(text: string): string {
  let depth = 0, position = 0, out = "";
  const tags = /<\s*(\/?)\s*private\b[^>]*>/gi;
  for (const match of text.matchAll(tags)) {
    const start = match.index!;
    if (depth === 0) out += text.slice(position, start);
    if (match[1]) depth = Math.max(0, depth - 1);
    else depth++;
    position = start + match[0].length;
  }
  return depth === 0 ? out + text.slice(position) : out;
}

function parseReview(raw: string): Review | null {
  if (raw.length > OUTPUT_LIMIT) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (row.disposition === "noop" && Object.keys(row).length === 1) return { disposition: "noop" };
    if (row.disposition !== "candidate" || Object.keys(row).sort().join(",") !== "disposition,item" || !row.item || typeof row.item !== "object" || Array.isArray(row.item)) return null;
    const item = row.item as Record<string, unknown>;
    const type = item.type;
    const allowed: Record<string, string[]> = {
      memory: ["type", "actor", "content", "op", "provenance", "confidence"],
      idea: ["type", "title", "content", "source_session", "confidence"],
      knowledge: ["type", "entity_type", "name", "content", "source_session", "confidence"],
      proposal: ["type", "target_file", "target_kind", "edit", "confidence", "rationale", "source_session"],
    };
    if (typeof type !== "string" || !allowed[type] || Object.keys(item).some(key => !allowed[type]!.includes(key))) return null;
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(item)) {
      if (typeof val === "string") {
        if (val.length > 1024) return null;
        cleaned[key] = stripPrivate(val).trim();
      } else if (typeof val === "number" && Number.isFinite(val)) cleaned[key] = val;
      else return null;
    }
    if (typeof cleaned.content === "string" && !cleaned.content || typeof cleaned.edit === "string" && !cleaned.edit) return null;
    if (type === "memory" && (cleaned.actor !== "principal" && cleaned.actor !== "assistant" || typeof cleaned.content !== "string" || !cleaned.content || cleaned.op === "set")) return null;
    if (type === "idea" && (typeof cleaned.title !== "string" || !cleaned.title || typeof cleaned.content !== "string" || !cleaned.content)) return null;
    if (type === "knowledge" && (!["person", "company", "research"].includes(String(cleaned.entity_type)) || typeof cleaned.name !== "string" || !cleaned.name || typeof cleaned.content !== "string" || !cleaned.content)) return null;
    if (type === "proposal" && (typeof cleaned.target_file !== "string" || typeof cleaned.edit !== "string" || typeof cleaned.rationale !== "string" || typeof cleaned.confidence !== "number")) return null;
    return { disposition: "candidate", item: cleaned };
  } catch { return null; }
}

/** Return typed inference only; governance must validate/build typed items separately. */
export async function reviewFixture(client: ReviewerClient, input: {
  sessionID: string; exchange: string; memory: string; model: { providerID: string; modelID: string };
}, onSession: (id: string) => void): Promise<ReviewResult> {
  if (!input.sessionID || !input.model.providerID || !input.model.modelID) return { ok: false, reason: "invalid-input" };
  const sanitized = stripPrivate(input.exchange) + "\nMemory:\n" + stripPrivate(input.memory);
  if (!sanitized.trim() || sanitized.length > INPUT_LIMIT) return { ok: false, reason: "input-bound" };
  let sessionID: string | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const created = await client.session.create({ body: { parentID: input.sessionID, title: "LifeOS fixture reviewer" } });
    if (created.error || !created.data?.id || created.data.id === input.sessionID) return { ok: false, reason: "session-create-failed" };
    sessionID = created.data.id;
    onSession(sessionID); // synchronous registry before prompt can emit reviewer events
    const result = await Promise.race([
      client.session.prompt({ path: { id: sessionID }, body: {
        agent: "build", model: input.model,
        tools: { "*": false },
        parts: [{ type: "text", text: `Return only JSON: {"disposition":"noop"} or {"disposition":"candidate","item":{...}}. Item shapes: memory {"type":"memory","actor":"principal","content":"PREFERENCE: durable fact"}; idea {"type":"idea","title":"short title","content":"fact"}; knowledge {"type":"knowledge","entity_type":"research","name":"title","content":"fact"}; proposal {"type":"proposal","target_kind":"identity","target_file":"canonical file","edit":"proposal","rationale":"source","confidence":0.5}. Use noop when nothing new is justified. Never emit a memory set-overwrite.\n${sanitized}` }],
      } }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, TIMEOUT_MS); timeout.unref?.(); }),
    ]);
    if (result.error || !result.data || result.data.info.error || !result.data.info.time.completed) return { ok: false, reason: "review-incomplete" };
    const { providerID, modelID } = result.data.info;
    if (providerID !== input.model.providerID || modelID !== input.model.modelID) return { ok: false, reason: "provider-mismatch" };
    const text = result.data.parts.filter(part => part.type === "text").map(part => part.text ?? "").join("");
    const parsed = parseReview(text);
    return parsed ? { ok: true, result: parsed, providerID, modelID } : { ok: false, reason: "malformed-response" };
  } catch { return { ok: false, reason: "provider-or-timeout" }; }
  finally {
    if (timeout) clearTimeout(timeout);
    if (sessionID) {
      if (timedOut) try { await client.session.abort({ path: { id: sessionID } }); } catch { /* session cleanup below remains required */ }
      try { await client.session.delete({ path: { id: sessionID } }); } catch { /* cleanup failure must be tracked by host operational health */ }
    }
  }
}
