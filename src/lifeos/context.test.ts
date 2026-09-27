import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTurnContext, relevantContext, searchCanonical } from "./context.js";

test("read-side identity, populated goals and canonical hot memory have strict bounds", () => {
  const root = mkdtempSync(join(tmpdir(), "lifeos-turn-"));
  const userRoot = join(root, "USER"), memoryRoot = join(root, "MEMORY");
  mkdirSync(join(userRoot, "PRINCIPAL"), { recursive: true });
  mkdirSync(join(userRoot, "TELOS")); mkdirSync(join(userRoot, "DIGITAL_ASSISTANT")); mkdirSync(memoryRoot);
  writeFileSync(join(userRoot, "PRINCIPAL", "PRINCIPAL_IDENTITY.md"), "- **Name:** Example\n- **Focus:** fixture");
  writeFileSync(join(userRoot, "TELOS", "PRINCIPAL_TELOS.md"), "## Missions\nSynthetic mission\n## Active Goals\nTest goals\n");
  writeFileSync(join(userRoot, "PRINCIPAL", "PRINCIPAL_MEMORY.md"), "Synthetic memory");
  const result = readTurnContext({ userRoot, memoryRoot });
  expect(result.blocks.join("\n")).toContain("Synthetic mission");
  expect(result.blocks.join("\n")).toContain("Synthetic memory");
  expect(result.blocks.join("\n")).toContain("Example");
  expect(result.ratingTimestamp).toBeUndefined();
});

test("stale, future and test-only scores cannot become fresh evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "lifeos-ratings-"));
  const signals = join(root, "memory", "LEARNING", "SIGNALS"); mkdirSync(signals, { recursive: true });
  const userRoot = join(root, "user"); mkdirSync(userRoot);
  const now = Date.parse("2026-09-27T12:00:00Z");
  const file = join(signals, "ratings.jsonl");
  writeFileSync(file, [
    { timestamp: "2026-09-01T12:00:00Z", rating: 10 },
    { timestamp: "2026-09-27T13:00:00Z", rating: 10 },
    { timestamp: "2026-09-27T11:00:00Z", rating: 9, source: "test" },
  ].map(x => JSON.stringify(x)).join("\n"));
  const roots = { userRoot, memoryRoot: join(root, "memory") };
  expect(readTurnContext(roots, now).ratingTimestamp).toBeUndefined();
  writeFileSync(file, JSON.stringify({ timestamp: "2026-09-27T10:00:00Z", rating: 8, source: "explicit" }));
  expect(readTurnContext(roots, now).ratingTimestamp).toBe("2026-09-27T10:00:00Z");
});

test("canonical relevance selects only scored records within a strict budget", () => {
  const records = [{ id: "note-a", content: "---\nid: note-a\n---\nA durable fixture fact", provenance: { path: "KNOWLEDGE/Research/a.md" }, score: 1 },
    { id: "unmatched", content: "Must never surface", provenance: { path: "KNOWLEDGE/Research/b.md" }, score: 0 }];
  expect(relevantContext(records, 15)).toEqual([{ id: "note-a", path: "KNOWLEDGE/Research/a.md", text: "A durable fixtu" }]);
});

test("canonical search retrieves by record ID before selecting bounded context", async () => {
  const calls: string[][] = [];
  const cortex = { run: async (args: string[]) => {
    calls.push(args);
    return { exitCode: 0, envelope: { ok: true, data: args[0] === "search" ? { items: [{ id: "note-a", score: 1 }] }
      : { items: [{ id: "note-a", content: "Durable fixture", provenance: { path: "KNOWLEDGE/Ideas/fixture.md" } }] } } };
  } };
  expect(await searchCanonical(cortex, "durable fixture")).toEqual([{ id: "note-a", path: "KNOWLEDGE/Ideas/fixture.md", text: "Durable fixture" }]);
  expect(calls.map(call => call[0])).toEqual(["search", "get"]);
});
