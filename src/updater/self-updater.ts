import { fileLog } from "../lib/file-logger.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export type ChangeClassification = "auto-fixable" | "manual-review" | "info-only";
export type UpdateMode = "check" | "update";
export type ChangeSource = "pai" | "opencode";

export interface VersionInfo {
  installed: string;
  latest: string;
  hasUpdate: boolean;
}

export interface DetectedChange {
  source: ChangeSource;
  type: "new-release" | "api-change" | "breaking-change" | "new-event" | "deprecation";
  classification: ChangeClassification;
  description: string;
  detail?: string;
  affectedHandlers?: string[];
  retirementCandidate?: boolean;
}

export interface UpdateReport {
  timestamp: string;
  mode: UpdateMode;
  paiVersion: VersionInfo | null;
  opencodeChanges: DetectedChange[];
  allChanges: DetectedChange[];
  draftPrsCreated: string[];
  workaroundRetirements: string[];
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

export interface GitHubCommit {
  sha: string;
  commit: { message: string; author: { date: string } };
  html_url: string;
}

export type FetchFn = (url: string, options?: Record<string, unknown>) => Promise<{ ok: boolean; json: () => Promise<unknown>; text: () => Promise<string> }>;

const GITHUB_API = "https://api.github.com";
const PAI_REPO = "danielmiessler/Personal_AI_Infrastructure";
const OC_REPO = "sst/opencode";
const OC_PLUGIN_PATH = "packages/plugin/src/index.ts";

const PAI_VERSION_INSTALLED = "4.0.3";

const OC_BASELINE_EVENTS = [
  "event", "config", "tool", "auth", "chat.message", "chat.params",
  "chat.headers", "permission.ask", "command.execute.before",
  "tool.execute.before", "shell.env", "tool.execute.after",
  "experimental.chat.messages.transform", "experimental.chat.system.transform",
  "experimental.session.compacting", "experimental.text.complete", "tool.definition",
];

const KNOWN_WORKAROUNDS = [
  { workaround: "dedup-cache", feature: "message.dedup", retireWhen: "OpenCode adds native dedup" },
  { workaround: "plan-mode", feature: "native-plan-mode", retireWhen: "OpenCode adds plan/edit mode toggle" },
];

export function compareSemver(installed: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [iMaj = 0, iMin = 0, iPatch = 0] = parse(installed);
  const [lMaj = 0, lMin = 0, lPatch = 0] = parse(latest);
  if (lMaj !== iMaj) return lMaj > iMaj;
  if (lMin !== iMin) return lMin > iMin;
  return lPatch > iPatch;
}

export function classifyPaiChange(installed: string, latest: string): ChangeClassification {
  const parseVer = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [iMaj = 0] = parseVer(installed);
  const [lMaj = 0, , lPatch = 0] = parseVer(latest);
  if (lMaj > iMaj) return "manual-review";
  if (lPatch > 0) return "auto-fixable";
  return "auto-fixable";
}

export function detectOpenCodeApiChanges(
  baseline: string[],
  current: string[]
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  const removed = baseline.filter((e) => !current.includes(e));
  for (const event of removed) {
    changes.push({
      source: "opencode",
      type: "breaking-change",
      classification: "manual-review",
      description: `Event removed from OpenCode plugin API: ${event}`,
      detail: `Handlers registered on '${event}' will no longer fire. Review and remove or migrate.`,
      affectedHandlers: findAffectedHandlers(event),
    });
  }

  const added = current.filter((e) => !baseline.includes(e));
  for (const event of added) {
    const isWorkaroundRetirement = KNOWN_WORKAROUNDS.some((w) =>
      event.includes(w.feature.split("-")[0] ?? "")
    );
    changes.push({
      source: "opencode",
      type: "new-event",
      classification: isWorkaroundRetirement ? "manual-review" : "auto-fixable",
      description: `New event available in OpenCode plugin API: ${event}`,
      detail: isWorkaroundRetirement
        ? `This new event may allow retiring an existing workaround.`
        : `Optional: add a handler for '${event}' to extend adapter functionality.`,
      retirementCandidate: isWorkaroundRetirement,
    });
  }

  return changes;
}

function findAffectedHandlers(event: string): string[] {
  const mapping: Record<string, string[]> = {
    "tool.execute.after": ["learning-tracker"],
    "tool.execute.before": ["security-validator", "plan-mode"],
    "permission.ask": ["security-validator"],
    "chat.message": ["learning-tracker", "compaction-handler"],
    "experimental.chat.system.transform": ["context-loader", "session-lifecycle"],
    "experimental.chat.messages.transform": ["secret-scrubber"],
    "experimental.session.compacting": ["compaction-handler"],
    "event": ["session-lifecycle", "compaction-handler"],
    // chat.params — DEFERRED. Evaluated 2026-04-04.
    // SDK signature: input { sessionID, agent, model, provider, message }
    //                output { temperature, topP, topK, options }
    // Viable for dynamic per-agent temperature overrides at runtime.
    // Not implemented yet — adapter-level temperature is set statically via
    // definitions.ts. Implement here when dynamic temperature is needed.
  };
  return mapping[event] ?? [];
}

export function extractEventsFromSource(source: string): string[] {
  // Pattern 1: Claude Code style — hooks.on("event") / hooks.register("event")
  const pattern = /hooks\s*\.\s*(on|register)\s*\(\s*["']([^"']+)["']/g;
  // Pattern 2: OpenCode object-key style — "event.name": async (...)
  const objectKeyPattern = /["']([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+)["']\s*:\s*async/g;
  // Pattern 3: OpenCode single-word key — event: async (...) (unquoted)
  const unquotedKeyPattern = /\b([a-z][a-z0-9]+)\s*:\s*async\s*\(/g;
  // Pattern 4: Fallback — quoted dotted identifiers that look like known events
  const hookPattern = /["']([a-z][a-z0-9.]+[a-z0-9])["']/g;
  const found = new Set<string>();

  let match: RegExpExecArray | null = pattern.exec(source);
  while (match !== null) {
    const eventName = match[2];
    if (eventName) {
      found.add(eventName);
    }
    match = pattern.exec(source);
  }

  // Object-key pattern: "tool.execute.after": async
  let objMatch: RegExpExecArray | null = objectKeyPattern.exec(source);
  while (objMatch !== null) {
    const eventName = objMatch[1];
    if (eventName) {
      found.add(eventName);
    }
    objMatch = objectKeyPattern.exec(source);
  }

  // Unquoted single-word keys that are known events: event: async (...)
  const knownEvents = OC_BASELINE_EVENTS;
  let unquotedMatch: RegExpExecArray | null = unquotedKeyPattern.exec(source);
  while (unquotedMatch !== null) {
    const candidate = unquotedMatch[1];
    if (candidate && knownEvents.includes(candidate)) {
      found.add(candidate);
    }
    unquotedMatch = unquotedKeyPattern.exec(source);
  }

  // Fallback: quoted identifiers matching known events or containing dots
  let hookMatch: RegExpExecArray | null = hookPattern.exec(source);
  while (hookMatch !== null) {
    const candidate = hookMatch[1];
    if (candidate && (knownEvents.includes(candidate) || candidate.includes("."))) {
      found.add(candidate);
    }
    hookMatch = hookPattern.exec(source);
  }

  return Array.from(found);
}

function buildAuthHeaders(fetchFn: FetchFn): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "pai-opencode-adapter/0.1.0",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchLatestPaiRelease(fetchFn: FetchFn): Promise<GitHubRelease | null> {
  try {
    const url = `${GITHUB_API}/repos/${PAI_REPO}/releases/latest`;
    const res = await fetchFn(url, { headers: buildAuthHeaders(fetchFn) });
    if (!res.ok) {
      fileLog(`GitHub API returned non-OK for PAI release check`, "warn");
      return null;
    }
    return (await res.json()) as GitHubRelease;
  } catch (err) {
    fileLog(`Failed to fetch PAI release: ${err}`, "warn");
    return null;
  }
}

export async function fetchOpenCodePluginCommits(fetchFn: FetchFn): Promise<GitHubCommit[]> {
  try {
    const url = `${GITHUB_API}/repos/${OC_REPO}/commits?path=${OC_PLUGIN_PATH}&per_page=10`;
    const res = await fetchFn(url, { headers: buildAuthHeaders(fetchFn) });
    if (!res.ok) {
      fileLog(`GitHub API returned non-OK for OpenCode commits`, "warn");
      return [];
    }
    return (await res.json()) as GitHubCommit[];
  } catch (err) {
    fileLog(`Failed to fetch OpenCode commits: ${err}`, "warn");
    return [];
  }
}

export async function fetchOpenCodePluginSource(fetchFn: FetchFn): Promise<string> {
  try {
    const url = `https://raw.githubusercontent.com/${OC_REPO}/main/${OC_PLUGIN_PATH}`;
    const res = await fetchFn(url);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function loadStoredBaseline(repoDir: string): string | null {
  const baselinePath = join(repoDir, ".opencode-api-baseline");
  if (existsSync(baselinePath)) {
    return readFileSync(baselinePath, "utf-8").trim();
  }
  return null;
}

function saveBaseline(repoDir: string, sha: string): void {
  const baselinePath = join(repoDir, ".opencode-api-baseline");
  writeFileSync(baselinePath, sha, "utf-8");
}

export function buildDraftPrBody(changes: DetectedChange[], mode: UpdateMode): string {
  const autoFix = changes.filter((c) => c.classification === "auto-fixable");
  const manual = changes.filter((c) => c.classification === "manual-review");
  const info = changes.filter((c) => c.classification === "info-only");

  const sections: string[] = [
    "## Automated Update Analysis",
    "",
    `Generated by: \`bun run src/updater/self-updater.ts --update\``,
    `Date: ${new Date().toISOString()}`,
    "",
  ];

  if (autoFix.length > 0) {
    sections.push("### ✅ Auto-Fixable Changes");
    for (const c of autoFix) {
      sections.push(`- **${c.type}** (${c.source}): ${c.description}`);
      if (c.detail) sections.push(`  - ${c.detail}`);
    }
    sections.push("");
  }

  if (manual.length > 0) {
    sections.push("### ⚠️ Manual Review Required");
    for (const c of manual) {
      sections.push(`- **${c.type}** (${c.source}): ${c.description}`);
      if (c.detail) sections.push(`  - ${c.detail}`);
      if (c.affectedHandlers?.length) {
        sections.push(`  - Affected handlers: ${c.affectedHandlers.join(", ")}`);
      }
    }
    sections.push("");
  }

  if (info.length > 0) {
    sections.push("### ℹ️ Info Only");
    for (const c of info) {
      sections.push(`- ${c.description}`);
    }
    sections.push("");
  }

  sections.push("### 📋 Next Steps");
  sections.push("1. Review each change above");
  sections.push("2. Run `bun test` to verify nothing broken");
  sections.push("3. Apply this PR only after manual verification");
  sections.push("");
  sections.push("**This is a DRAFT PR — do NOT apply without human review.**");

  return sections.join("\n");
}

export async function createDraftPr(
  changes: DetectedChange[],
  source: ChangeSource,
  version: string,
  repoDir: string,
  runCmd: (cmd: string) => string
): Promise<string> {
  const branchName = `update/${source}-${version}`;
  const prTitle = `[${source.toUpperCase()}] Update adapter for ${source === "pai" ? `PAI v${version}` : `OpenCode API changes (${version})`}`;
  const body = buildDraftPrBody(changes, "update");

  try {
    runCmd(`git -C "${repoDir}" checkout -b "${branchName}"`);
    runCmd(`git -C "${repoDir}" commit --allow-empty -m "chore: placeholder for ${branchName} update"`);
    const prUrl = runCmd(
      `gh pr create --draft --title "${prTitle}" --body "${body.replace(/"/g, '\\"').replace(/\n/g, "\\n")}" --repo "${PAI_REPO}"`
    ).trim();
    return prUrl || branchName;
  } catch (err) {
    fileLog(`Draft PR creation failed: ${err}`, "warn");
    return `branch:${branchName}`;
  }
}

export function checkWorkaroundRetirements(changes: DetectedChange[]): string[] {
  const retirements: string[] = [];
  for (const change of changes) {
    if (change.retirementCandidate && change.type === "new-event") {
      for (const w of KNOWN_WORKAROUNDS) {
        if (change.description.includes(w.feature.split("-")[0] ?? "")) {
          retirements.push(
            `Workaround '${w.workaround}' may be retirable: ${w.retireWhen}`
          );
        }
      }
    }
  }
  return retirements;
}

export async function runUpdater(options: {
  mode: UpdateMode;
  repoDir?: string;
  fetchFn?: FetchFn;
  runCmd?: (cmd: string) => string;
}): Promise<UpdateReport> {
  const {
    mode,
    repoDir = process.cwd(),
    fetchFn = async (url, opts) => {
      const res = await fetch(url, opts as RequestInit);
      return {
        ok: res.ok,
        json: () => res.json(),
        text: () => res.text(),
      };
    },
    runCmd = (cmd) => execSync(cmd, { encoding: "utf-8" }),
  } = options;

  const report: UpdateReport = {
    timestamp: new Date().toISOString(),
    mode,
    paiVersion: null,
    opencodeChanges: [],
    allChanges: [],
    draftPrsCreated: [],
    workaroundRetirements: [],
  };

  fileLog(`Self-updater running in ${mode} mode`, "info");

  const paiRelease = await fetchLatestPaiRelease(fetchFn);
  if (paiRelease) {
    const latestTag = paiRelease.tag_name.replace(/^v/, "");
    const hasUpdate = compareSemver(PAI_VERSION_INSTALLED, latestTag);
    report.paiVersion = {
      installed: PAI_VERSION_INSTALLED,
      latest: latestTag,
      hasUpdate,
    };

    if (hasUpdate) {
      const classification = classifyPaiChange(PAI_VERSION_INSTALLED, latestTag);
      const paiChange: DetectedChange = {
        source: "pai",
        type: "new-release",
        classification,
        description: `PAI update available: ${PAI_VERSION_INSTALLED} → ${latestTag}`,
        detail: paiRelease.body?.slice(0, 500) ?? "",
      };
      report.allChanges.push(paiChange);

      if (mode === "update" && classification === "auto-fixable") {
        const prUrl = await createDraftPr([paiChange], "pai", latestTag, repoDir, runCmd);
        report.draftPrsCreated.push(prUrl);
      }
    }
  }

  const ocSource = await fetchOpenCodePluginSource(fetchFn);
  if (ocSource) {
    const currentEvents = extractEventsFromSource(ocSource);
    const storedBaseline = loadStoredBaseline(repoDir);
    const baselineEvents = storedBaseline
      ? storedBaseline.split(",").filter(Boolean)
      : OC_BASELINE_EVENTS;

    const ocChanges = detectOpenCodeApiChanges(baselineEvents, currentEvents);
    report.opencodeChanges = ocChanges;
    report.allChanges.push(...ocChanges);

    if (ocChanges.length > 0) {
      const commits = await fetchOpenCodePluginCommits(fetchFn);
      const latestSha = commits[0]?.sha?.slice(0, 8) ?? "unknown";

      if (mode === "update") {
        const hasManual = ocChanges.some((c) => c.classification === "manual-review");
        if (hasManual) {
          const prUrl = await createDraftPr(ocChanges, "opencode", latestSha, repoDir, runCmd);
          report.draftPrsCreated.push(prUrl);
        }
      }

      if (mode === "check") {
        saveBaseline(repoDir, currentEvents.join(","));
      }
    }
  }

  report.workaroundRetirements = checkWorkaroundRetirements(report.allChanges);

  fileLog(
    `Self-updater complete: ${report.allChanges.length} changes, ${report.draftPrsCreated.length} PRs`,
    "info"
  );

  return report;
}

export function formatReport(report: UpdateReport): string {
  const lines: string[] = [
    `PAI OpenCode Adapter — Update Report`,
    `Timestamp: ${report.timestamp}`,
    `Mode: ${report.mode}`,
    "",
  ];

  if (report.paiVersion) {
    if (report.paiVersion.hasUpdate) {
      lines.push(`PAI: ${report.paiVersion.installed} → ${report.paiVersion.latest} (update available)`);
    } else {
      lines.push(`PAI: ${report.paiVersion.installed} (up to date)`);
    }
  } else {
    lines.push(`PAI: could not fetch latest release`);
  }

  if (report.opencodeChanges.length > 0) {
    lines.push(`OpenCode API: ${report.opencodeChanges.length} change(s) detected`);
    for (const c of report.opencodeChanges) {
      lines.push(`  [${c.classification}] ${c.description}`);
    }
  } else {
    lines.push(`OpenCode API: no changes detected`);
  }

  if (report.workaroundRetirements.length > 0) {
    lines.push("", "Workaround Retirements:");
    for (const r of report.workaroundRetirements) {
      lines.push(`  - ${r}`);
    }
  }

  if (report.draftPrsCreated.length > 0) {
    lines.push("", "Draft PRs created:");
    for (const pr of report.draftPrsCreated) {
      lines.push(`  - ${pr}`);
    }
  }

  lines.push("", `Total changes: ${report.allChanges.length}`);
  return lines.join("\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const mode: UpdateMode = args.includes("--update") ? "update" : "check";

  runUpdater({ mode }).then((report) => {
    process.stdout.write(formatReport(report) + "\n");
    process.exit(0);
  }).catch((err) => {
    process.stderr.write(`Self-updater error: ${err}\n`);
    process.exit(1);
  });
}
