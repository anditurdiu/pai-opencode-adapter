import { expect, test } from "bun:test";
import { reviewFixture, stripPrivate, type ReviewerClient } from "./reviewer.js";

function fixture(response: string, completed = true) {
  const invoked: { prompt?: Parameters<ReviewerClient["session"]["prompt"]>[0]; deleted?: string } = {};
  const client: ReviewerClient = { session: {
    create: async () => ({ data: { id: "review-1" } }),
    prompt: async options => {
      invoked.prompt = options;
      return { data: { info: { providerID: "fixture", modelID: "other", time: { ...(completed ? { completed: 1 } : {}) } }, parts: [{ type: "text", text: response }] } };
    },
    abort: async () => {},
    delete: async options => { invoked.deleted = options.path.id; },
  } };
  return { client, invoked };
}
const request = { sessionID: "primary", exchange: "Public <private>never send</private> message", memory: "Fact", model: { providerID: "fixture", modelID: "other" } };

test("private tags strip before inference, malformed and unterminated tags fail closed", () => {
  expect(stripPrivate("a <private reason='x'>secret<private>nested</private>end</private> b")).toBe("a  b");
  expect(stripPrivate("a <private>secret until end")).toBe("a ");
});

test("isolated fixture uses selected model, disabled tools, registered child and deletion", async () => {
  const { client, invoked } = fixture('{"disposition":"noop"}');
  const created: string[] = [];
  expect(await reviewFixture(client, request, id => { created.push(id); })).toEqual({ ok: true, result: { disposition: "noop" }, providerID: "fixture", modelID: "other" });
  expect(created).toEqual(["review-1"]);
  expect(invoked.deleted).toBe("review-1");
  expect(Object.values(invoked.prompt!.body.tools).every(enabled => !enabled)).toBe(true);
  expect(invoked.prompt!.body.parts[0].text).not.toContain("never send");
});

test("incomplete, oversized and malformed responses never become writes", async () => {
  const invalid = fixture('{"disposition":"candidate","item":{"type":"memory","actor":"principal","content":""}}');
  expect(await reviewFixture(invalid.client, request, () => {})).toEqual({ ok: false, reason: "malformed-response" });
  const incomplete = fixture('{"disposition":"noop"}', false);
  expect(await reviewFixture(incomplete.client, request, () => {})).toEqual({ ok: false, reason: "review-incomplete" });
  expect(await reviewFixture(invalid.client, { ...request, exchange: "x".repeat(12_001) }, () => {})).toEqual({ ok: false, reason: "input-bound" });
});

test("reviewer item is typed, and memory set-overwrite is not inferred", async () => {
  const { client } = fixture('{"disposition":"candidate","item":{"type":"memory","actor":"principal","content":"PREFERENCE: short summaries"}}');
  expect(await reviewFixture(client, request, () => {})).toEqual({ ok: true, result: { disposition: "candidate", item: { type: "memory", actor: "principal", content: "PREFERENCE: short summaries" } }, providerID: "fixture", modelID: "other" });
  const overwrite = fixture('{"disposition":"candidate","item":{"type":"memory","actor":"principal","op":"set","content":"PREFERENCE: short summaries"}}');
  expect(await reviewFixture(overwrite.client, request, () => {})).toEqual({ ok: false, reason: "malformed-response" });
});

test("cleanup failure cannot report a successful review", async () => {
  const { client } = fixture('{"disposition":"noop"}');
  client.session.delete = async () => { throw Error("cleanup unavailable"); };
  expect(await reviewFixture(client, request, () => {})).toEqual({ ok: false, reason: "session-cleanup-failed" });
});

test("create that never resolves is bounded and cannot prompt the visible session", async () => {
  const { client } = fixture('{"disposition":"noop"}');
  client.session.create = async () => new Promise(() => {});
  const started = Date.now();
  expect(await reviewFixture(client, request, () => {}, 20)).toEqual({ ok: false, reason: "provider-or-timeout" });
  expect(Date.now() - started).toBeLessThan(1000);
});
