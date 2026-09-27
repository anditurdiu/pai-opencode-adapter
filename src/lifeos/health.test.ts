import { expect, test } from "bun:test";
import { operationalHealth, healthFromJournal } from "./health.js";
import type { Disposition } from "./journal.js";
const counts = (): Record<Disposition, number> => ({ pending: 0, reviewing: 0, applying: 0, succeeded: 0, noop: 0, "failed-retryable": 0, "blocked-governance": 0, "uncertain-write": 0 });

test("missing evidence and failures cannot be painted green by historic success", () => {
  expect(operationalHealth({ counts: counts() }).state).toBe("not-running");
  expect(operationalHealth({ initializedAt: "2026-09-27T00:00:00Z", counts: counts() }).state).toBe("waiting-for-cadence");
  const prior = counts(); prior.succeeded = 1; prior["failed-retryable"] = 1;
  expect(operationalHealth({ initializedAt: "2026-09-27T00:00:00Z", lastSuccessfulReview: "2026-09-27T00:00:00Z", counts: prior }).state).toBe("failed-retryable");
  prior["uncertain-write"] = 1;
  expect(operationalHealth({ initializedAt: "2026-09-27T00:00:00Z", lastSuccessfulReview: "2026-09-27T00:00:00Z", counts: prior }).state).toBe("uncertain-write");
});

test("a journal failure is not green even if an older success exists", () => {
  const prior = counts(); prior.succeeded = 1; prior["failed-retryable"] = 1;
  expect(healthFromJournal({ statusCounts: () => prior, latestStatus: () => ({ at: "2026-09-27T12:00:00Z", event: "review-result", code: "failed-retryable" }) }).state).toBe("failed-retryable");
});
