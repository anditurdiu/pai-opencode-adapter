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
  const invalid = fixture('{"disposition":"candidate","type":"memory","content":""}');
  expect(await reviewFixture(invalid.client, request, () => {})).toEqual({ ok: false, reason: "malformed-response" });
  const incomplete = fixture('{"disposition":"noop"}', false);
  expect(await reviewFixture(incomplete.client, request, () => {})).toEqual({ ok: false, reason: "review-incomplete" });
  expect(await reviewFixture(invalid.client, { ...request, exchange: "x".repeat(12_001) }, () => {})).toEqual({ ok: false, reason: "input-bound" });
});
