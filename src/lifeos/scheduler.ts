import { completeExchanges, type MessageRow } from "./exchanges.js";
import { ReviewJournal, spanKey } from "./journal.js";
import { stripPrivate, type ReviewResult } from "./reviewer.js";

export interface SessionAuthority {
  session: {
    get(options: { path: { id: string } }): Promise<{ data?: { parentID?: string }; error?: unknown }>;
    messages(options: { path: { id: string }; query: { limit: number } }): Promise<{ data?: MessageRow[]; error?: unknown }>;
  };
}

export interface SchedulerResult { state: "child" | "failed-fetch" | "waiting" | "backlog" | "reviewed" | "blocked"; attempts: number; olderUnreviewed: boolean }

/** Primary-session idle only. No mutation is dispatched until the host supplies a governed writer. */
export async function reviewPrimaryIdle(input: {
  sessionID: string; client: SessionAuthority; journal: ReviewJournal; reviewerIDs: ReadonlySet<string>;
  review: (exchange: { user: string; assistant: string }, sessionID: string) => Promise<ReviewResult>;
  apply: (item: unknown) => Promise<{ ok: boolean; code?: string }>;
}): Promise<SchedulerResult> {
  if (input.reviewerIDs.has(input.sessionID)) return { state: "child", attempts: 0, olderUnreviewed: false };
  const session = await input.client.session.get({ path: { id: input.sessionID } });
  if (session.error || !session.data) return { state: "failed-fetch", attempts: 0, olderUnreviewed: false };
  if (session.data.parentID) return { state: "child", attempts: 0, olderUnreviewed: false };
  const messages = await input.client.session.messages({ path: { id: input.sessionID }, query: { limit: 80 } });
  if (messages.error || !messages.data) return { state: "failed-fetch", attempts: 0, olderUnreviewed: false };
  const projection = completeExchanges(input.sessionID, messages.data, input.reviewerIDs);
  let attempts = 0, blocked = false;
  for (const exchange of projection.exchanges) {
    // Review only a completed exchange. Signal classification is per message;
    // it never supplies a fabricated numeric score for a correction.
    const key = spanKey(input.sessionID, exchange.userID, exchange.assistantIDs);
    if (input.journal.read(key)?.status === "succeeded" || input.journal.read(key)?.status === "noop") continue;
    const outcome = await input.journal.process({ sessionID: input.sessionID, userID: exchange.userID, assistantIDs: exchange.assistantIDs }, async () => {
      const reviewed = await input.review({ user: stripPrivate(exchange.user), assistant: stripPrivate(exchange.assistant) }, input.sessionID);
      if (!reviewed.ok) throw new Error(reviewed.reason);
      if (reviewed.result.disposition === "noop") return { type: "noop" };
      return { type: "item", item: reviewed.result.item };
    }, input.apply);
    attempts++;
    if (outcome.status === "blocked-governance" || outcome.status === "uncertain-write") blocked = true;
  }
  return { state: blocked ? "blocked" : projection.skippedOlder ? "backlog" : attempts ? "reviewed" : "waiting", attempts, olderUnreviewed: projection.skippedOlder };
}
