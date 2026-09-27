import type { Disposition } from "./journal.js";

export type OperationalState = "not-running" | "waiting-for-cadence" | "in-progress" | "succeeded" | "noop" | "failed-retryable" | "blocked-governance" | "uncertain-write";
export interface HealthEvidence {
  initializedAt?: string;
  lastCapturedFeedback?: string;
  lastAttemptedReview?: string;
  lastSuccessfulReview?: string;
  lastWrite?: string;
  lastRetrieval?: string;
  proposalBacklog?: number;
  latestError?: string;
  counts: Record<Disposition, number>;
}

/** No green without a terminal reviewer row; failed or uncertain writes outrank prior success. */
export function operationalHealth(evidence: HealthEvidence): { state: OperationalState; evidence: HealthEvidence } {
  const counts = evidence.counts;
  if (!evidence.initializedAt) return { state: "not-running", evidence };
  if (counts["uncertain-write"]) return { state: "uncertain-write", evidence };
  if (counts["blocked-governance"]) return { state: "blocked-governance", evidence };
  if (counts["failed-retryable"] || evidence.latestError) return { state: "failed-retryable", evidence };
  if (counts.reviewing || counts.applying) return { state: "in-progress", evidence };
  if (evidence.lastSuccessfulReview && counts.succeeded) return { state: "succeeded", evidence };
  if (evidence.lastSuccessfulReview && counts.noop) return { state: "noop", evidence };
  return { state: "waiting-for-cadence", evidence };
}

export function healthFromJournal(journal: {
  statusCounts(): Record<Disposition, number>;
  latestStatus(): { at: string; event: string; code: string } | undefined;
}) {
  const row = journal.latestStatus();
  const counts = journal.statusCounts();
  const evidence: HealthEvidence = { counts, ...(row ? { initializedAt: row.at } : {}) };
  if (!row) return operationalHealth(evidence);
  if (row.event === "review-result" && row.code === "failed-retryable") evidence.latestError = "review-failed";
  if (row.event === "review-result" && ["succeeded", "noop"].includes(row.code)) evidence.lastSuccessfulReview = row.at;
  return operationalHealth(evidence);
}
