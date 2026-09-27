import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadBridge } from "./bridge.js";

test("identity, TELOS, hot memory and installed top-level routing remain session-bound", () => {
  const root = mkdtempSync(join(tmpdir(), "lifeos-bridge-"));
  const userRoot = join(root, "USER"), memoryRoot = join(root, "MEMORY"), skillRoot = join(root, "skills");
  mkdirSync(join(userRoot, "PRINCIPAL"), { recursive: true }); mkdirSync(join(userRoot, "TELOS")); mkdirSync(memoryRoot);
  mkdirSync(join(skillRoot, "ISA"), { recursive: true });
  writeFileSync(join(userRoot, "PRINCIPAL", "PRINCIPAL_IDENTITY.md"), "- **Name:** Example");
  writeFileSync(join(userRoot, "TELOS", "PRINCIPAL_TELOS.md"), "## Missions\nFixture mission\n");
  writeFileSync(join(userRoot, "PRINCIPAL", "PRINCIPAL_MEMORY.md"), "RULE: synthetic hot memory");
  writeFileSync(join(skillRoot, "ISA", "SKILL.md"), "---\nname: ISA\ndescription: Scaffold ISAs. USE WHEN create an ISA, scaffold project. NOT FOR story writing.\n---\n");
  const bridge = createReadBridge({ userRoot, memoryRoot, skillRoot }, () => 1_000_000_000);
  bridge.capture("first", [{ type: "text", text: "create an ISA" }]);
  expect(bridge.context("first").join("\n")).toContain("LifeOS skill route: ISA");
  expect(bridge.context("first").join("\n")).toContain("Fixture mission");
  expect(bridge.context("first").join("\n")).toContain("synthetic hot memory");
  expect(bridge.context("second").join("\n")).not.toContain("skill route");
  expect(bridge.context("first").join("\n")).not.toContain("skill route");
});
