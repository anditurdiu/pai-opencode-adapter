import { expect, test } from "bun:test";
import { applyThroughCortex, canonicalBeforeDigest, MISSING_CANONICAL_DIGEST, prepareCanonicalItem } from "./writer.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("canonical writer receives typed item and preserves refusal envelope", async () => {
  let sent: string[] = [];
  const cortex = { run: async (args: string[]) => { sent = args; return { exitCode: 0, envelope: { ok: true, error: null, data: {} } }; } };
  expect(await applyThroughCortex(cortex, { type: "memory", actor: "principal", content: "PREFERENCE: fixture" })).toEqual({ ok: true });
  expect(sent[0]).toBe("remember");
  expect(sent.slice(2)).toEqual(["--adapter", "opencode", "--allow-write"]);
  const blocked = { run: async () => ({ exitCode: 5, envelope: { ok: false, error: { code: "governance_refused" }, data: null } }) };
  expect(await applyThroughCortex(blocked, { type: "proposal", edit: "fixture" })).toEqual({ ok: false, code: "governance_refused" });
});

test("pre-write fingerprint records canonical bytes or an explicit missing marker", () => {
  const dir = mkdtempSync(join(tmpdir(), "lifeos-target-")), file = join(dir, "note.md");
  expect(canonicalBeforeDigest(file)).toBe(MISSING_CANONICAL_DIGEST);
  writeFileSync(file, "fixture");
  expect(canonicalBeforeDigest(file)).not.toBe(MISSING_CANONICAL_DIGEST);
});

test("preflight pins the writer-selected target rather than inventing a path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lifeos-preflight-")), file = join(dir, "note.md");
  expect(await prepareCanonicalItem(async () => ({ ok: true, path: file }), { type: "idea" })).toEqual({ target: file, beforeDigest: MISSING_CANONICAL_DIGEST });
  await expect(prepareCanonicalItem(async () => ({ ok: false, path: file }), { type: "idea" })).rejects.toThrow();
});
