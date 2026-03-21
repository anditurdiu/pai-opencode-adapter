import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  compareSemver,
  classifyPaiChange,
  detectOpenCodeApiChanges,
  extractEventsFromSource,
  buildDraftPrBody,
  checkWorkaroundRetirements,
  formatReport,
  runUpdater,
  type DetectedChange,
  type UpdateReport,
  type FetchFn,
} from "../updater/self-updater.js";

describe("compareSemver", () => {
  test("returns false when installed equals latest", () => {
    expect(compareSemver("4.0.3", "4.0.3")).toBe(false);
  });

  test("returns true when patch is newer", () => {
    expect(compareSemver("4.0.3", "4.0.4")).toBe(true);
  });

  test("returns true when minor is newer", () => {
    expect(compareSemver("4.0.3", "4.1.0")).toBe(true);
  });

  test("returns true when major is newer", () => {
    expect(compareSemver("4.0.3", "5.0.0")).toBe(true);
  });

  test("returns false when installed is newer patch", () => {
    expect(compareSemver("4.0.5", "4.0.3")).toBe(false);
  });

  test("handles v-prefix in latest version string", () => {
    expect(compareSemver("4.0.3", "v4.0.4")).toBe(true);
  });
});

describe("classifyPaiChange", () => {
  test("patch update classified as auto-fixable", () => {
    expect(classifyPaiChange("4.0.3", "4.0.4")).toBe("auto-fixable");
  });

  test("major version change classified as manual-review", () => {
    expect(classifyPaiChange("4.0.3", "5.0.0")).toBe("manual-review");
  });

  test("minor update without patch classified as auto-fixable", () => {
    expect(classifyPaiChange("4.0.3", "4.1.0")).toBe("auto-fixable");
  });
});

describe("detectOpenCodeApiChanges", () => {
  const baseline = ["tool.execute.after", "tool.execute.before", "chat.message", "event"];

  test("empty when no changes", () => {
    const changes = detectOpenCodeApiChanges(baseline, baseline);
    expect(changes).toHaveLength(0);
  });

  test("detects removed event as manual-review breaking change", () => {
    const current = ["tool.execute.after", "tool.execute.before", "event"];
    const changes = detectOpenCodeApiChanges(baseline, current);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.classification).toBe("manual-review");
    expect(changes[0]?.type).toBe("breaking-change");
    expect(changes[0]?.description).toContain("chat.message");
  });

  test("detects new event as auto-fixable", () => {
    const current = [...baseline, "new.event.type"];
    const changes = detectOpenCodeApiChanges(baseline, current);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.type).toBe("new-event");
    expect(changes[0]?.classification).toBe("auto-fixable");
  });

  test("includes affected handlers for removed known events", () => {
    const current = ["tool.execute.before", "chat.message", "event"];
    const changes = detectOpenCodeApiChanges(baseline, current);
    const removed = changes.find((c) => c.description.includes("tool.execute.after"));
    expect(removed?.affectedHandlers).toBeDefined();
    expect(removed?.affectedHandlers?.length).toBeGreaterThan(0);
  });

  test("detects multiple simultaneous changes", () => {
    const current = ["tool.execute.after", "event", "brand.new.event"];
    const changes = detectOpenCodeApiChanges(baseline, current);
    expect(changes.length).toBeGreaterThanOrEqual(3);

    const removed = changes.filter((c) => c.type === "breaking-change");
    const added = changes.filter((c) => c.type === "new-event");
    expect(removed.length).toBeGreaterThanOrEqual(2);
    expect(added.length).toBeGreaterThanOrEqual(1);
  });
});

describe("extractEventsFromSource", () => {
  test("extracts known OpenCode events from source code", () => {
    const source = `
      hooks.on('tool.execute.after', handler);
      hooks.on('chat.message', other);
      hooks.register('permission.ask', check);
    `;
    const events = extractEventsFromSource(source);
    expect(events).toContain("tool.execute.after");
    expect(events).toContain("chat.message");
    expect(events).toContain("permission.ask");
  });

  test("returns empty array for empty source", () => {
    expect(extractEventsFromSource("")).toHaveLength(0);
  });

  test("deduplicates repeated events", () => {
    const source = `
      hooks.on('event', h1);
      hooks.on('event', h2);
    `;
    const events = extractEventsFromSource(source);
    expect(events.filter((e) => e === "event")).toHaveLength(1);
  });
});

describe("buildDraftPrBody", () => {
  const changes: DetectedChange[] = [
    {
      source: "opencode",
      type: "breaking-change",
      classification: "manual-review",
      description: "Event removed: chat.message",
      affectedHandlers: ["learning-tracker"],
    },
    {
      source: "opencode",
      type: "new-event",
      classification: "auto-fixable",
      description: "New event: agent.start",
    },
  ];

  test("includes auto-fixable section when present", () => {
    const body = buildDraftPrBody(changes, "update");
    expect(body).toContain("Auto-Fixable");
    expect(body).toContain("agent.start");
  });

  test("includes manual-review section when present", () => {
    const body = buildDraftPrBody(changes, "update");
    expect(body).toContain("Manual Review");
    expect(body).toContain("chat.message");
  });

  test("includes affected handlers in manual-review section", () => {
    const body = buildDraftPrBody(changes, "update");
    expect(body).toContain("learning-tracker");
  });

  test("includes DRAFT PR warning", () => {
    const body = buildDraftPrBody(changes, "update");
    expect(body).toContain("DRAFT PR");
    expect(body).toContain("do NOT apply without human review");
  });

  test("never contains auto-merge language", () => {
    const body = buildDraftPrBody(changes, "update");
    expect(body).not.toContain("auto-merge");
    expect(body).not.toContain("automatically merge");
  });
});

describe("checkWorkaroundRetirements", () => {
  test("returns empty for unrelated changes", () => {
    const changes: DetectedChange[] = [
      {
        source: "opencode",
        type: "new-event",
        classification: "auto-fixable",
        description: "New event: unrelated.thing",
        retirementCandidate: false,
      },
    ];
    const retirements = checkWorkaroundRetirements(changes);
    expect(retirements).toHaveLength(0);
  });

  test("returns retirement candidate for dedup feature", () => {
    const changes: DetectedChange[] = [
      {
        source: "opencode",
        type: "new-event",
        classification: "auto-fixable",
        description: "New event: message.dedup.native",
        retirementCandidate: true,
      },
    ];
    const retirements = checkWorkaroundRetirements(changes);
    expect(retirements.length).toBeGreaterThanOrEqual(1);
    expect(retirements[0]).toContain("dedup");
  });
});

describe("formatReport", () => {
  test("includes timestamp and mode", () => {
    const report: UpdateReport = {
      timestamp: "2026-03-21T12:00:00Z",
      mode: "check",
      paiVersion: null,
      opencodeChanges: [],
      allChanges: [],
      draftPrsCreated: [],
      workaroundRetirements: [],
    };
    const formatted = formatReport(report);
    expect(formatted).toContain("2026-03-21");
    expect(formatted).toContain("check");
  });

  test("shows PAI update available", () => {
    const report: UpdateReport = {
      timestamp: "2026-03-21T12:00:00Z",
      mode: "check",
      paiVersion: { installed: "4.0.3", latest: "4.0.4", hasUpdate: true },
      opencodeChanges: [],
      allChanges: [],
      draftPrsCreated: [],
      workaroundRetirements: [],
    };
    const formatted = formatReport(report);
    expect(formatted).toContain("4.0.3 → 4.0.4");
    expect(formatted).toContain("update available");
  });

  test("shows up to date when no PAI update", () => {
    const report: UpdateReport = {
      timestamp: "2026-03-21T12:00:00Z",
      mode: "check",
      paiVersion: { installed: "4.0.3", latest: "4.0.3", hasUpdate: false },
      opencodeChanges: [],
      allChanges: [],
      draftPrsCreated: [],
      workaroundRetirements: [],
    };
    const formatted = formatReport(report);
    expect(formatted).toContain("up to date");
  });

  test("lists draft PRs when created", () => {
    const report: UpdateReport = {
      timestamp: "2026-03-21T12:00:00Z",
      mode: "update",
      paiVersion: null,
      opencodeChanges: [],
      allChanges: [],
      draftPrsCreated: ["https://github.com/pr/1"],
      workaroundRetirements: [],
    };
    const formatted = formatReport(report);
    expect(formatted).toContain("Draft PRs created");
    expect(formatted).toContain("https://github.com/pr/1");
  });
});

describe("runUpdater (mocked fetch)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pai-updater-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeFetchFn = (overrides: {
    paiRelease?: Record<string, unknown> | null;
    ocSource?: string;
    ocCommits?: unknown[];
  }): FetchFn => {
    return async (url: string) => {
      if (url.includes("/releases/latest")) {
        if (overrides.paiRelease === null) {
          return { ok: false, json: async () => ({}), text: async () => "" };
        }
        const release = overrides.paiRelease ?? {
          tag_name: "v4.0.3",
          name: "PAI v4.0.3",
          body: "No changes",
          published_at: "2026-03-21T00:00:00Z",
          html_url: "https://github.com",
        };
        return { ok: true, json: async () => release, text: async () => JSON.stringify(release) };
      }
      if (url.includes("/commits")) {
        const commits = overrides.ocCommits ?? [{ sha: "abc12345", commit: { message: "chore", author: { date: "2026-03-21" } }, html_url: "" }];
        return { ok: true, json: async () => commits, text: async () => JSON.stringify(commits) };
      }
      if (url.includes("raw.githubusercontent.com")) {
        const src = overrides.ocSource ?? "";
        return { ok: !!src, json: async () => ({}), text: async () => src };
      }
      return { ok: false, json: async () => ({}), text: async () => "" };
    };
  };

  test("check mode: PAI up to date reports no update", async () => {
    const fetchFn = makeFetchFn({ paiRelease: { tag_name: "v4.0.3", name: "PAI v4.0.3", body: "", published_at: "", html_url: "" } });
    const report = await runUpdater({ mode: "check", fetchFn, repoDir: tmpDir });
    expect(report.paiVersion?.hasUpdate).toBe(false);
    expect(report.draftPrsCreated).toHaveLength(0);
  });

  test("check mode: PAI update available (4.0.3 → 4.0.4)", async () => {
    const fetchFn = makeFetchFn({ paiRelease: { tag_name: "v4.0.4", name: "PAI v4.0.4", body: "Patch notes", published_at: "", html_url: "" } });
    const report = await runUpdater({ mode: "check", fetchFn, repoDir: tmpDir });
    expect(report.paiVersion?.hasUpdate).toBe(true);
    expect(report.paiVersion?.latest).toBe("4.0.4");
    const change = report.allChanges.find((c) => c.source === "pai");
    expect(change).toBeDefined();
    expect(change!.description).toContain("4.0.3 → 4.0.4");
  });

  test("check mode: no PRs created even when update available", async () => {
    const fetchFn = makeFetchFn({ paiRelease: { tag_name: "v4.0.4", name: "", body: "", published_at: "", html_url: "" } });
    const report = await runUpdater({ mode: "check", fetchFn, repoDir: tmpDir });
    expect(report.draftPrsCreated).toHaveLength(0);
  });

  test("check mode: OC breaking change classified as manual-review", async () => {
    const srcWithRemovedEvent = `
      hooks.on('tool.execute.before', h);
      hooks.on('permission.ask', h);
    `;
    const fetchFn = makeFetchFn({ paiRelease: null, ocSource: srcWithRemovedEvent });
    const report = await runUpdater({ mode: "check", fetchFn, repoDir: tmpDir });
    const manualChanges = report.opencodeChanges.filter((c) => c.classification === "manual-review");
    expect(manualChanges.length).toBeGreaterThan(0);
    expect(manualChanges[0]?.type).toBe("breaking-change");
  });

  test("update mode: draft PR created for auto-fixable change", async () => {
    const fetchFn = makeFetchFn({ paiRelease: { tag_name: "v4.0.4", name: "", body: "", published_at: "", html_url: "" } });
    let branchCreated = "";
    let prCreated = "";
    const mockRunCmd = (cmd: string): string => {
      if (cmd.includes("checkout -b")) {
        branchCreated = cmd;
        return "";
      }
      if (cmd.includes("pr create")) {
        prCreated = cmd;
        return "https://github.com/draft/pr/1";
      }
      return "";
    };
    const report = await runUpdater({ mode: "update", fetchFn, repoDir: tmpDir, runCmd: mockRunCmd });
    expect(report.paiVersion?.hasUpdate).toBe(true);
    expect(prCreated).toContain("--draft");
    expect(prCreated).not.toContain("--merge");
    expect(branchCreated).toContain("update/pai-4.0.4");
  });

  test("update mode: draft PR branch name matches pattern update/{source}-{version}", async () => {
    const fetchFn = makeFetchFn({ paiRelease: { tag_name: "v4.0.4", name: "", body: "", published_at: "", html_url: "" } });
    let branchName = "";
    const mockRunCmd = (cmd: string): string => {
      if (cmd.includes("checkout -b")) {
        const m = cmd.match(/checkout -b "([^"]+)"/);
        if (m) branchName = m[1] ?? "";
      }
      if (cmd.includes("pr create")) return "https://github.com/pr";
      return "";
    };
    await runUpdater({ mode: "update", fetchFn, repoDir: tmpDir, runCmd: mockRunCmd });
    expect(branchName).toMatch(/^update\/pai-/);
  });

  test("update mode: no --merge flag in any git/gh command", async () => {
    const fetchFn = makeFetchFn({ paiRelease: { tag_name: "v4.0.4", name: "", body: "", published_at: "", html_url: "" } });
    const cmds: string[] = [];
    const mockRunCmd = (cmd: string): string => {
      cmds.push(cmd);
      if (cmd.includes("pr create")) return "https://github.com/pr";
      return "";
    };
    await runUpdater({ mode: "update", fetchFn, repoDir: tmpDir, runCmd: mockRunCmd });
    for (const cmd of cmds) {
      expect(cmd).not.toContain("--merge");
      expect(cmd).not.toContain("git merge");
    }
  });

  test("update mode: report contains total change count", async () => {
    const fetchFn = makeFetchFn({ paiRelease: { tag_name: "v4.0.4", name: "", body: "", published_at: "", html_url: "" } });
    const report = await runUpdater({ mode: "check", fetchFn, repoDir: tmpDir });
    const formatted = formatReport(report);
    expect(formatted).toContain("Total changes:");
  });

  test("update mode: no auto-merge anywhere in execution", async () => {
    const fetchFn = makeFetchFn({ paiRelease: { tag_name: "v4.0.4", name: "", body: "", published_at: "", html_url: "" } });
    const cmds: string[] = [];
    const mockRunCmd = (cmd: string): string => {
      cmds.push(cmd);
      if (cmd.includes("pr create")) return "https://github.com/pr";
      return "";
    };
    await runUpdater({ mode: "update", fetchFn, repoDir: tmpDir, runCmd: mockRunCmd });
    for (const cmd of cmds) {
      expect(cmd).not.toContain("merge");
    }
  });

  test("check mode: handles GitHub API unavailable gracefully", async () => {
    const fetchFn = makeFetchFn({ paiRelease: null, ocSource: "" });
    const report = await runUpdater({ mode: "check", fetchFn, repoDir: tmpDir });
    expect(report.paiVersion).toBeNull();
    expect(report.allChanges).toHaveLength(0);
  });
});
