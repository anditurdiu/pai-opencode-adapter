import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReviewJournal, spanKey } from "./journal.js";
const root = () => mkdtempSync(join(tmpdir(), "lifeos-journal-"));
const identity = { sessionID: "session-a", userID: "user-1", assistantIDs: ["answer-1", "answer-2"] };

test("no-op and successful outcomes stay terminal across restart", async () => {
  const dir = root(); let reviews = 0, writes = 0;
  const noop = () => { reviews++; return Promise.resolve({ type: "noop" as const }); };
  const apply = async () => { writes++; return { ok: true }; };
  expect((await new ReviewJournal(dir).process(identity, noop, apply)).status).toBe("noop");
  expect((await new ReviewJournal(dir).process(identity, noop, apply)).status).toBe("noop");
  expect([reviews, writes]).toEqual([1, 0]);
  const next = { ...identity, userID: "user-2" };
  const item = async () => { reviews++; return { type: "item" as const, item: { type: "memory", content: "fixture" } }; };
  expect((await new ReviewJournal(dir).process(next, item, apply)).status).toBe("succeeded");
  expect((await new ReviewJournal(dir).process(next, item, apply)).status).toBe("succeeded");
  expect([reviews, writes]).toEqual([2, 1]);
  expect(new ReviewJournal(dir).statusCounts().succeeded).toBe(1);
  expect(new ReviewJournal(dir).statusCounts().noop).toBe(1);
});

test("a crash after intent-to-write cannot accidentally repeat append or curation", async () => {
  const dir = root(), key = spanKey(identity.sessionID, identity.userID, identity.assistantIDs);
  writeFileSync(join(dir, `${key}.json`), JSON.stringify({ ...identity, status: "applying", attempts: 1, itemDigest: "hash", updated: new Date().toISOString() }));
  let called = 0;
  const result = await new ReviewJournal(dir).process(identity, async () => { called++; return { type: "noop" }; }, async () => { called++; return { ok: true }; });
  expect(result.status).toBe("uncertain-write");
  expect(called).toBe(0);
  expect((await new ReviewJournal(dir).process(identity, async () => { called++; return { type: "noop" }; }, async () => ({ ok: true }))).status).toBe("uncertain-write");
});

test("review failure is retryable; write exception is uncertain and never retried", async () => {
  const dir = root(); const journal = new ReviewJournal(dir);
  const failed = await journal.process(identity, async () => { throw Error("provider failed"); }, async () => ({ ok: true }));
  expect(failed.status).toBe("failed-retryable");
  const uncertain = await journal.process(identity, async () => ({ type: "item", item: { content: "test" } }), async () => { throw Error("crash after write"); });
  expect(uncertain.status).toBe("uncertain-write");
  expect(journal.read(spanKey(identity.sessionID, identity.userID, identity.assistantIDs))?.attempts).toBe(2);
});

test("simultaneous claims of one span have a single reviewer", async () => {
  const dir = root(); let calls = 0; let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const first = new ReviewJournal(dir).process(identity, async () => { calls++; await waiting; return { type: "noop" }; }, async () => ({ ok: true }));
  await new Promise(resolve => setTimeout(resolve, 10));
  const second = await new ReviewJournal(dir).process(identity, async () => { calls++; return { type: "noop" }; }, async () => ({ ok: true }));
  expect(second.status).toBe("contended");
  release(); await first;
  expect(calls).toBe(1);
  expect(existsSync(join(dir, `${spanKey(identity.sessionID, identity.userID, identity.assistantIDs)}.json`))).toBe(true);
});

test("feedback persists one classification per session/message, independent across sessions", () => {
  const dir = root(); const journal = new ReviewJournal(dir);
  expect(journal.recordFeedback("one", "message", { kind: "correction", text: "No, please correct this" })).toBe(true);
  expect(new ReviewJournal(dir).recordFeedback("one", "message", { kind: "correction", text: "No, please correct this" })).toBe(false);
  expect(journal.recordFeedback("two", "message", { kind: "correction", text: "No, please correct this" })).toBe(true);
  expect(journal.recordFeedback("one", "other-message", { kind: "rating", value: 8 })).toBe(true);
  const rows = journal.listFeedback();
  expect(rows.find(row => row.messageID === "other-message")?.rating).toBe(8);
  expect(rows.find(row => row.messageID === "message")?.rating).toBeUndefined();
  expect(JSON.stringify(rows)).not.toContain("please correct this");
});

test("health marker logs only bounded codes, not raw transcript text", () => {
  const dir = root(); const journal = new ReviewJournal(dir);
  journal.recordStatus("loaded", "read-side-ready");
  expect(() => journal.recordStatus("error", "private conversation content goes here")).toThrow();
});
