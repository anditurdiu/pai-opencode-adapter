import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReviewJournal } from "./journal.js";
import { reviewPrimaryIdle, catchUpSessions } from "./scheduler.js";
import type { MessageRow } from "./exchanges.js";

const user = (id: string): MessageRow => ({ info: { id, sessionID: "main", role: "user", time: { created: 1 } }, parts: [{ type: "text", text: "I prefer short summaries <private>hidden</private>" }] });
const assistant = (id: string, complete = true): MessageRow => ({ info: { id, sessionID: "main", role: "assistant", parentID: "u1", finish: "stop", time: { created: 2, ...(complete ? { completed: 3 } : {}) } }, parts: [{ type: "text", text: "Acknowledged." }] });
const setup = (messages: MessageRow[], parentID?: string) => ({ session: { get: async () => ({ data: { parentID } }), messages: async () => ({ data: messages }) } });

test("only completed primary exchanges review; replay yields no extra write", async () => {
  const journal = new ReviewJournal(mkdtempSync(join(tmpdir(), "lifeos-scheduler-")));
  const client = setup([user("u1"), assistant("a1"), user("u2"), assistant("a2", false)]);
  let reviews = 0, writes = 0;
  const params = { sessionID: "main", client, journal, reviewerIDs: new Set<string>(),
    review: async () => { reviews++; return { ok: true as const, result: { disposition: "noop" as const }, providerID: "fixture", modelID: "fixture" }; },
    apply: async () => { writes++; return { ok: true }; } };
  expect((await reviewPrimaryIdle(params)).attempts).toBe(1);
  expect((await reviewPrimaryIdle(params)).attempts).toBe(0);
  expect([reviews, writes]).toEqual([1, 0]);
  expect((await reviewPrimaryIdle({ ...params, client: setup([user("u1"), assistant("a1")], "parent") })).state).toBe("child");
});

test("failed review retries; a candidate is dispatched only to the supplied governed writer", async () => {
  const journal = new ReviewJournal(mkdtempSync(join(tmpdir(), "lifeos-scheduler-")));
  const client = setup([user("u1"), assistant("a1")]); let writes = 0, count = 0;
  const params = { sessionID: "main", client, journal, reviewerIDs: new Set<string>(),
    review: async () => { count++; return count === 1 ? { ok: false as const, reason: "provider-failed" }
      : { ok: true as const, result: { disposition: "candidate" as const, item: { type: "memory", actor: "principal", content: "PREFERENCE: short" } }, providerID: "fixture", modelID: "fixture" }; },
    apply: async () => { writes++; return { ok: true }; } };
  await reviewPrimaryIdle(params); await reviewPrimaryIdle(params);
  expect(count).toBe(2);
  expect(writes).toBe(1);
});

test("private spans are stripped from reviewer input", async () => {
  const journal = new ReviewJournal(mkdtempSync(join(tmpdir(), "lifeos-scheduler-")));
  let seen = "";
  await reviewPrimaryIdle({ sessionID: "main", client: setup([user("u1"), assistant("a1")]), journal, reviewerIDs: new Set(),
    review: async exchange => { seen = exchange.user; return { ok: true, result: { disposition: "noop" }, providerID: "fixture", modelID: "fixture" }; },
    apply: async () => ({ ok: true }) });
  expect(seen).not.toContain("hidden");
});

test("a 80-message window reports older unreviewed work rather than marking all caught up", async () => {
  const journal = new ReviewJournal(mkdtempSync(join(tmpdir(), "lifeos-window-")));
  const messages: MessageRow[] = [];
  for (let i = 0; i < 41; i++) messages.push(user(`u${i}`), assistant(`a${i}`));
  const result = await reviewPrimaryIdle({ sessionID: "main", client: setup(messages), journal, reviewerIDs: new Set(),
    review: async () => ({ ok: true, result: { disposition: "noop" }, providerID: "fixture", modelID: "fixture" }),
    apply: async () => ({ ok: true }) });
  expect(result.olderUnreviewed).toBe(true);
  expect(result.state).toBe("backlog");
});

test("startup catch-up bounds session count and reports overflow", async () => {
  const journal = new ReviewJournal(mkdtempSync(join(tmpdir(), "lifeos-catchup-")));
  const client = { session: { list: async () => ({ data: [{ id: "main" }, { id: "child", parentID: "main" }, { id: "main2" }] }),
    get: async () => ({ data: {} }), messages: async () => ({ data: [] }) } };
  const result = await catchUpSessions({ client, journal, reviewerIDs: new Set(), maxSessions: 1,
    review: async () => ({ ok: true, result: { disposition: "noop" }, providerID: "fixture", modelID: "fixture" }), apply: async () => ({ ok: true }) });
  expect(result).toEqual({ state: "attempted", sessions: 1, truncated: true });
});

test("a bare rating never creates a durable memory candidate", async () => {
  const journal = new ReviewJournal(mkdtempSync(join(tmpdir(), "lifeos-rating-only-")));
  const rating = user("rating"); rating.parts = [{ type: "text", text: "8" }];
  let called = 0;
  const result = await reviewPrimaryIdle({ sessionID: "main", client: setup([rating, assistant("answer")]), journal, reviewerIDs: new Set(),
    review: async () => { called++; return { ok: true, result: { disposition: "noop" }, providerID: "fixture", modelID: "fixture" }; },
    apply: async () => ({ ok: true }) });
  expect(result.attempts).toBe(0);
  expect(called).toBe(0);
});

test("governance refusal is recorded once and repeated idle does not reapply a proposal", async () => {
  const journal = new ReviewJournal(mkdtempSync(join(tmpdir(), "lifeos-governance-")));
  let writes = 0;
  const params = { sessionID: "main", client: setup([user("u1"), assistant("a1")]), journal, reviewerIDs: new Set<string>(),
    review: async () => ({ ok: true as const, result: { disposition: "candidate" as const, item: { type: "proposal", target_file: "/forbidden", edit: "fixture" } }, providerID: "fixture", modelID: "fixture" }),
    apply: async () => { writes++; return { ok: false, code: "governance_refused" }; } };
  expect((await reviewPrimaryIdle(params)).state).toBe("blocked");
  await reviewPrimaryIdle(params);
  expect(writes).toBe(1);
});

test("review receives the actual selected model from the completed user's message", async () => {
  const journal = new ReviewJournal(mkdtempSync(join(tmpdir(), "lifeos-model-")));
  const message = user("model-turn"); message.info.model = { providerID: "fixture-provider", modelID: "fixture-model" };
  let observed: unknown;
  await reviewPrimaryIdle({ sessionID: "main", client: setup([message, assistant("answer")]), journal, reviewerIDs: new Set(),
    review: async exchange => { observed = exchange.model; return { ok: true, result: { disposition: "noop" }, providerID: "fixture", modelID: "fixture" }; },
    apply: async () => ({ ok: true }) });
  expect(observed).toEqual({ providerID: "fixture-provider", modelID: "fixture-model" });
});
