/** Pure OpenCode message-authority projection; caller supplies a primary session from session.get. */
export interface MessageRow {
  info: { id: string; role: "user" | "assistant"; sessionID: string; time: { created: number; completed?: number }; error?: unknown; finish?: string; parentID?: string };
  parts: { type: string; text?: string }[];
}
export interface Exchange { userID: string; assistantIDs: string[]; user: string; assistant: string }
export function completeExchanges(sessionID: string, messages: MessageRow[], reviewerIDs: ReadonlySet<string>, limit = 80) {
  if (!sessionID || reviewerIDs.has(sessionID) || !Number.isInteger(limit) || limit < 2 || limit > 160) throw new Error("invalid exchange window");
  const window = messages.slice(-limit);
  const skippedOlder = messages.length > window.length;
  const exchanges: Exchange[] = [];
  let user: MessageRow | undefined;
  let assistants: MessageRow[] = [];
  let invalid = false;
  function flush() {
    if (user && !invalid && assistants.length && assistants.every(a => a.info.time.completed && !a.info.error && a.info.finish && a.info.finish !== "abort")) {
      exchanges.push({ userID: user.info.id, assistantIDs: assistants.map(a => a.info.id), user: plain(user), assistant: assistants.map(plain).filter(Boolean).join("\n") });
    }
  }
  for (const message of window) {
    if (message.info.sessionID !== sessionID) continue;
    if (message.info.role === "user") { flush(); user = message; assistants = []; invalid = false; }
    else if (user) {
      if (!message.info.time.completed || message.info.error || !message.info.finish || message.info.finish === "abort") invalid = true;
      assistants.push(message);
    }
  }
  flush();
  return { exchanges: exchanges.filter(x => x.user && x.assistant), skippedOlder };
}
const plain = (message: MessageRow) => message.parts.filter(x => x.type === "text" && typeof x.text === "string").map(x => x.text).join("\n").trim().slice(0, 12_000);
