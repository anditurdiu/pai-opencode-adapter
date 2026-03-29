/**
 * Integration tests against the real PAI repository.
 *
 * These tests clone and validate against danielmiessler/Personal_AI_Infrastructure
 * to catch breaking changes in PAI's structure before users hit them.
 *
 * Skipped when PAI_REPO_PATH is not set (normal unit test runs).
 * Set PAI_REPO_PATH to a cloned PAI repo to run locally:
 *   PAI_REPO_PATH=/path/to/PAI bun test src/__tests__/integration-pai.test.ts
 */

import { expect, test, describe } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAgentDefinition } from "../generators/build-agents-md.js";

const PAI_REPO_PATH = process.env.PAI_REPO_PATH;

describe.skipIf(!PAI_REPO_PATH)("PAI Integration", () => {
  const paiDir = PAI_REPO_PATH!;

  // --- Repository structure ---

  test("PAI repo root contains expected files", () => {
    expect(existsSync(join(paiDir, "LICENSE"))).toBe(true);
    expect(existsSync(join(paiDir, "README.md"))).toBe(true);
  });

  test("PAI repo has Packs directory", () => {
    expect(existsSync(join(paiDir, "Packs"))).toBe(true);
  });

  test("PAI repo has Agents pack", () => {
    expect(existsSync(join(paiDir, "Packs", "Agents"))).toBe(true);
  });

  test("Agents pack has src directory", () => {
    expect(existsSync(join(paiDir, "Packs", "Agents", "src"))).toBe(true);
  });

  // --- Agent context files ---

  test("Agents src contains .md files", () => {
    const agentsSrc = join(paiDir, "Packs", "Agents", "src");
    const mdFiles = readdirSync(agentsSrc).filter(f => f.endsWith(".md"));
    expect(mdFiles.length).toBeGreaterThan(0);
  });

  test("Agent context files are non-empty", () => {
    const agentsSrc = join(paiDir, "Packs", "Agents", "src");
    const mdFiles = readdirSync(agentsSrc).filter(
      f => f.endsWith(".md") && f !== "SKILL.md" && f !== "REDESIGN-SUMMARY.md"
    );

    for (const file of mdFiles) {
      const content = readFileSync(join(agentsSrc, file), "utf-8");
      expect(content.length).toBeGreaterThan(50);
    }
  });

  test("Agent context files contain heading and role", () => {
    const agentsSrc = join(paiDir, "Packs", "Agents", "src");
    const contextFiles = readdirSync(agentsSrc).filter(
      f => f.endsWith("Context.md")
    );

    expect(contextFiles.length).toBeGreaterThanOrEqual(3);

    for (const file of contextFiles) {
      const content = readFileSync(join(agentsSrc, file), "utf-8");
      expect(content).toMatch(/^# .+ Agent Context/m);
      expect(content).toMatch(/\*\*Role\*\*/);
    }
  });

  // --- Parser compatibility ---

  test("parseAgentDefinition handles PAI context files without crashing", () => {
    const agentsSrc = join(paiDir, "Packs", "Agents", "src");
    const contextFiles = readdirSync(agentsSrc).filter(
      f => f.endsWith("Context.md")
    );

    for (const file of contextFiles) {
      const content = readFileSync(join(agentsSrc, file), "utf-8");
      // Should not throw — graceful handling of missing frontmatter
      const result = parseAgentDefinition(content, file);
      expect(result.name).toBe(file.replace(".md", ""));
    }
  });

  // --- Packs structure ---

  test("PAI has expected pack directories", () => {
    const packsDir = join(paiDir, "Packs");
    const packs = readdirSync(packsDir).filter(
      f => !f.startsWith(".") && !f.endsWith(".png") && !f.endsWith(".md")
    );

    // At minimum, Agents should exist. Other packs may come and go.
    expect(packs).toContain("Agents");
    expect(packs.length).toBeGreaterThanOrEqual(3);
  });

  test("Each pack has INSTALL.md and README.md", () => {
    const packsDir = join(paiDir, "Packs");
    const packs = readdirSync(packsDir).filter(
      f => !f.startsWith(".") && !f.endsWith(".png") && !f.endsWith(".md")
    );

    for (const pack of packs) {
      const packDir = join(packsDir, pack);
      // Only check directories
      if (!existsSync(join(packDir, "src"))) continue;
      
      expect(existsSync(join(packDir, "INSTALL.md"))).toBe(true);
      expect(existsSync(join(packDir, "README.md"))).toBe(true);
    }
  });
});
