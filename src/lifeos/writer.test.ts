import { expect, test } from "bun:test";
import { applyThroughCortex } from "./writer.js";

test("canonical writer receives typed item and preserves refusal envelope", async () => {
  let sent: string[] = [];
  const cortex = { run: async (args: string[]) => { sent = args; return { exitCode: 0, envelope: { ok: true, error: null, data: {} } }; } };
  expect(await applyThroughCortex(cortex, { type: "memory", actor: "principal", content: "PREFERENCE: fixture" })).toEqual({ ok: true });
  expect(sent[0]).toBe("remember");
  expect(sent.slice(2)).toEqual(["--adapter", "opencode", "--allow-write"]);
  const blocked = { run: async () => ({ exitCode: 5, envelope: { ok: false, error: { code: "governance_refused" }, data: null } }) };
  expect(await applyThroughCortex(blocked, { type: "proposal", edit: "fixture" })).toEqual({ ok: false, code: "governance_refused" });
});
