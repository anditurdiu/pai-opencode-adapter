import { completeExchanges, type MessageRow } from "./exchanges.js";
import { ReviewJournal, spanKey } from "./journal.js";
import { stripPrivate, type ReviewResult } from "./reviewer.js";

export interface SessionAuthority {
  session: {
    list?(options?: { query?: { directory?: string } }): Promise<{ data?: { id: string; parentID?: string }[]; error?: unknown }>;
    get(options: { path: { id: string } }): Promise<{ data?: { parentID?: string }; error?: unknown }>;
    messages(options: { path: { id: string }; query: { limit: number } }): Promise<{ data?: MessageRow[]; error?: unknown }>;
  };
}

/** Startup pass never pretends that the bounded session-list/window covered older data. */
export async function catchUpSessions(input: Omit<Parameters<typeof reviewPrimaryIdle>[0], "sessionID"> & { directory?: string; maxSessions?: number }) {
  if (!input.client.session.list) return { state: "unavailable" as const, sessions: 0, truncated: true };
  const result = await input.client.session.list({ query: { directory: input.directory } });
  if (result.error || !result.data) return { state: "failed-fetch" as const, sessions: 0, truncated: true };
  const max = input.maxSessions ?? 10;
  if (!Number.isInteger(max) || max < 1 || max > 50) throw new Error("invalid catch-up session bound");
  const primary = result.data.filter(session => !session.parentID && !input.reviewerIDs.has(session.id));
  const selected = primary.slice(-max);
  for (const session of selected) await reviewPrimaryIdle({ ...input, sessionID: session.id });
  return { state: "attempted" as const, sessions: selected.length, truncated: primary.length > selected.length };
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
