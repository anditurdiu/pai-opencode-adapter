import { expect, test } from "bun:test";
import { completeExchanges, type MessageRow } from "./exchanges.js";
const user = (id: string, sessionID = "main"): MessageRow => ({ info: { id, sessionID, role: "user", time: { created: 1 } }, parts: [{ type: "text", text: `ask ${id}` }] });
const assistant = (id: string, options: { sessionID?: string; completed?: boolean; error?: boolean; finish?: string } = {}): MessageRow => ({
  info: { id, sessionID: options.sessionID ?? "main", role: "assistant", time: { created: 2, ...(options.completed === false ? {} : { completed: 3 }) },
    ...(options.error ? { error: { name: "MessageAbortedError" } } : {}), finish: options.finish ?? "stop" },
  parts: [{ type: "text", text: `answer ${id}` }],
});
test("all assistant messages must finish without error; partial, child and idle replay excluded", () => {
  const messages = [user("one"), assistant("a"), assistant("b"), user("two"), assistant("c", { completed: false }), user("three"), assistant("d", { error: true }), user("four"), assistant("e", { sessionID: "child" })];
  expect(completeExchanges("main", messages, new Set()).exchanges).toEqual([{ userID: "one", assistantIDs: ["a", "b"], user: "ask one", assistant: "answer a\nanswer b" }]);
  expect(() => completeExchanges("main", messages, new Set(["main"]))).toThrow();
  expect(completeExchanges("main", messages, new Set(), 2).skippedOlder).toBe(true);
  expect(completeExchanges("main", [user("mixed"), assistant("bad", { completed: false }), assistant("good")], new Set()).exchanges).toHaveLength(0);
});
