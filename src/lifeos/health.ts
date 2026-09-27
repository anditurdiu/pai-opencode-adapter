import type { Disposition } from "./journal.js";

export type OperationalState = "not-running" | "waiting-for-cadence" | "in-progress" | "succeeded" | "noop" | "failed-retryable" | "blocked-governance";
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
  if (counts["blocked-governance"] || counts["uncertain-write"]) return { state: "blocked-governance", evidence };
  if (counts["failed-retryable"] || evidence.latestError) return { state: "failed-retryable", evidence };
  if (counts.reviewing || counts.applying) return { state: "in-progress", evidence };
  if (evidence.lastSuccessfulReview && counts.succeeded) return { state: "succeeded", evidence };
  if (evidence.lastSuccessfulReview && counts.noop) return { state: "noop", evidence };
  return { state: "waiting-for-cadence", evidence };
}
