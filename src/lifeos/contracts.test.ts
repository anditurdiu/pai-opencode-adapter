import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareContracts, resolveRoots, scanSkills, skillFindings, snapshotContracts } from "./contracts.js";

test("separate roots required; legacy root cannot be guessed", () => {
  const base = mkdtempSync(join(tmpdir(), "lifeos-contract-"));
  const config = join(base, "config"), user = join(base, "user"), memory = join(user, "MEMORY");
  mkdirSync(config); mkdirSync(memory, { recursive: true });
  expect(resolveRoots(config, user, memory)).toEqual({ configRoot: realpathSync(config), userRoot: realpathSync(user), memoryRoot: realpathSync(memory) });
  expect(() => resolveRoots(config, config, memory)).toThrow();
  expect(() => resolveRoots("relative", user, memory)).toThrow();
  expect(() => resolveRoots(config, user, join(base, "absent"))).toThrow();
});

test("nested release skill shadows intended installed skill and fails inventory", () => {
  const root = mkdtempSync(join(tmpdir(), "lifeos-skills-"));
  const top = join(root, "ISA"), nested = join(root, "LifeOS", "install", "skills", "ISA");
  mkdirSync(join(top, "Workflows"), { recursive: true }); mkdirSync(nested, { recursive: true });
  writeFileSync(join(top, "SKILL.md"), "---\nname: ISA\ndescription: project ISA\n---\n");
  writeFileSync(join(top, "Workflows", "Scaffold.md"), "fixture");
  writeFileSync(join(nested, "SKILL.md"), "---\nname: ISA\ndescription: nested payload\n---\n");
  const rows = scanSkills(root);
  expect(rows).toHaveLength(2);
  expect(skillFindings(rows, [{ name: "ISA", location: join(nested, "SKILL.md") }], root).map(x => x.finding))
    .toEqual(["duplicate-discovered-name", "nested-payload-effective"]);
});

test("upstream schema/overlay/skill edits never remain silently green", () => {
  const root = mkdtempSync(join(tmpdir(), "lifeos-upstream-"));
  const names = ["sdk-event.json", "MemoryTypes.ts", "LifeOS/install/skills/New/SKILL.md", "OverlaySystem.ts"];
  for (const name of names) {
    const file = join(root, name);
    mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, "original");
  }
  const pinned = snapshotContracts(root, names);
  expect(compareContracts(pinned, snapshotContracts(root, names)).every(x => x.impact === "no evidenced impact")).toBe(true);
  for (const name of names) writeFileSync(join(root, name), "changed");
  expect(compareContracts(pinned, snapshotContracts(root, names)).map(x => x.impact))
    .toEqual(["review required", "blocking contract change", "review required", "blocking contract change"]);
  expect(() => snapshotContracts(root, ["../private"])).toThrow();
});

test("new nested skill discovered after baseline is review-required", () => {
  const root = mkdtempSync(join(tmpdir(), "lifeos-added-skill-"));
  const initial = join(root, "skills", "ISA", "SKILL.md");
  mkdirSync(join(initial, ".."), { recursive: true }); writeFileSync(initial, "top-level");
  const pinned = snapshotContracts(root, ["skills/ISA/SKILL.md"]);
  const added = join(root, "skills", "LifeOS", "install", "skills", "ISA", "SKILL.md");
  mkdirSync(join(added, ".."), { recursive: true }); writeFileSync(added, "shadow");
  const current = snapshotContracts(root, ["skills/ISA/SKILL.md", "skills/LifeOS/install/skills/ISA/SKILL.md"]);
  expect(compareContracts(pinned, current).find(row => row.id.includes("install"))?.impact).toBe("review required");
});
