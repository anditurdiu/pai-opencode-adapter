/** Host-local evidence; callers must keep manifests out of public repositories. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type Verdict = "verified" | "advisory" | "unavailable" | "unverified";
export type Impact = "no evidenced impact" | "review required" | "blocking contract change";
export interface ContractRow { id: string; impact: Impact; reason: string; probe: string }
export interface SkillRow { name: string; path: string; hasDescription: boolean; workflows: string[] }

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const inside = (parent: string, child: string) => child === parent || child.startsWith(parent + sep);

/** Explicit roots only: no legacy harness path is ever inferred as a writable destination. */
export function resolveRoots(configRoot: string, userRoot: string, memoryRoot: string) {
  for (const [label, path] of Object.entries({ configRoot, userRoot, memoryRoot })) {
    if (!path || !isAbsolute(path) || !existsSync(path) || !statSync(path).isDirectory())
      throw new Error(`${label} must be an existing directory`);
  }
  const roots = { configRoot: realpathSync(configRoot), userRoot: realpathSync(userRoot), memoryRoot: realpathSync(memoryRoot) };
  if (roots.configRoot === roots.userRoot || roots.configRoot === roots.memoryRoot)
    throw new Error("Configuration and authority roots must be distinct");
  return roots;
}

/** Scanner models recursive discovery and reports both contenders instead of hiding the shadowed copy. */
export function scanSkills(root: string): SkillRow[] {
  const base = realpathSync(root);
  const rows: SkillRow[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const file = resolve(dir, entry.name);
      if (!inside(base, file)) throw new Error("skill escaped discovery root");
      if (entry.isDirectory()) walk(file);
      else if (entry.name === "SKILL.md") {
        const text = readFileSync(file, "utf8");
        const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
        const name = /^name:\s*["']?([^\r\n"']+)/m.exec(front)?.[1]?.trim() || relative(base, dir).split(sep).at(-1)!;
        const workflow = resolve(dir, "Workflows");
        rows.push({ name, path: relative(base, file), hasDescription: /^description:\s*\S/m.test(front),
          workflows: existsSync(workflow) && statSync(workflow).isDirectory() ? readdirSync(workflow).filter(x => x.endsWith(".md")) : [] });
      }
    }
  }
  walk(base);
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

export function skillFindings(rows: SkillRow[], effective: { name: string; location: string }[], root: string) {
  const byName = new Map<string, SkillRow[]>();
  for (const row of rows) byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
  const chosen = new Map(effective.map(item => [item.name, item.location]));
  return [...byName].flatMap(([name, candidates]) => {
    const findings: string[] = [];
    if (candidates.length > 1) findings.push("duplicate-discovered-name");
    if (candidates.some(s => !s.hasDescription)) findings.push("missing-frontmatter-description");
    if (candidates.every(s => s.workflows.length === 0)) findings.push("no-workflows");
    const location = chosen.get(name);
    if (!location) findings.push("not-effective");
    else if (!candidates.some(s => resolve(root, s.path) === resolve(location))) findings.push("unexpected-effective-location");
    else if (relative(root, location).split(sep).includes("install")) findings.push("nested-payload-effective");
    return findings.map(finding => ({ name, finding }));
  });
}

export interface PinnedContract { version: 1; files: Record<string, string> }
/** Only release-safe relative file names and hashes belong in the pinned baseline. */
export function snapshotContracts(root: string, names: string[]): PinnedContract {
  const base = realpathSync(root);
  const files: Record<string, string> = {};
  for (const name of names) {
    if (!name || name.startsWith("/") || name.split(/[\\/]/).includes("..")) throw new Error("invalid relative contract path");
    const path = resolve(base, name);
    if (!inside(base, path) || !existsSync(path) || !inside(base, realpathSync(path))) throw new Error("missing or escaping contract file");
    files[name] = digest(readFileSync(path, "utf8"));
  }
  return { version: 1, files };
}

export function compareContracts(pinned: PinnedContract, current: PinnedContract): ContractRow[] {
  if (pinned.version !== 1 || current.version !== 1) throw new Error("unknown contract version");
  return [...new Set([...Object.keys(pinned.files), ...Object.keys(current.files)])].sort().map(id => {
    const a = pinned.files[id], b = current.files[id];
    const changed = !a || !b || a !== b;
    const impact: Impact = !changed ? "no evidenced impact"
      : /(?:MemoryTypes|MutationTier|MemorySystem|Cortex|sdk|event|plugin)/i.test(id) ? "blocking contract change" : "review required";
    return { id, impact, reason: !changed ? "byte-identical pinned contract" : !a || !b ? "contract added or removed" : "contract bytes changed; behavior not assumed compatible",
      probe: "compare pinned file digests; run host scenario before verifying" };
  });
}
