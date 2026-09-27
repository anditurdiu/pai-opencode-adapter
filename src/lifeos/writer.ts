/** Delegates persistence to the installed canonical Cortex command; never writes its own hot layer. */
export interface CanonicalCortex {
  run(args: string[]): Promise<{ exitCode: number; envelope: { ok: boolean; error: null | { code: string }; data: unknown } }>;
}

export async function applyThroughCortex(cortex: CanonicalCortex, item: unknown): Promise<{ ok: boolean; code?: string }> {
  if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, code: "invalid-item" };
  const type = (item as Record<string, unknown>).type;
  if (typeof type !== "string" || !["memory", "idea", "knowledge", "proposal"].includes(type)) return { ok: false, code: "invalid-item" };
  const result = await cortex.run([type === "proposal" ? "propose" : "remember", JSON.stringify(item), "--adapter", "opencode", "--allow-write"]);
  return result.exitCode === 0 && result.envelope.ok ? { ok: true } : { ok: false, code: result.envelope.error?.code ?? "invalid-envelope" };
}
