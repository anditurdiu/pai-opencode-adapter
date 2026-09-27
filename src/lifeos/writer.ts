/** Delegates persistence to the installed canonical Cortex command; never writes its own hot layer. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";

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

export const MISSING_CANONICAL_DIGEST = createHash("sha256").update("canonical-target-missing-v1").digest("hex");

/** The supported LifeOS resolver supplies the path; this helper reads only its current bytes. */
export function canonicalBeforeDigest(target: string): string {
  if (!target || !target.startsWith("/")) throw new Error("canonical target must be absolute");
  if (existsSync(target) && !lstatSync(target).isFile()) throw new Error("canonical target is not a regular file");
  return existsSync(target) ? createHash("sha256").update(readFileSync(target)).digest("hex") : MISSING_CANONICAL_DIGEST;
}

export async function prepareCanonicalItem(resolveItem: (item: unknown) => Promise<{ path: string; ok: boolean }>, item: unknown) {
  const resolved = await resolveItem(item);
  if (!resolved.ok || typeof resolved.path !== "string") throw new Error("canonical writer refused to resolve target");
  return { target: resolved.path, beforeDigest: canonicalBeforeDigest(resolved.path) };
}
