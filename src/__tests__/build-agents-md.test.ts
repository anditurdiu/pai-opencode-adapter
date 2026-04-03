import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseAgentDefinition, generateAgentsMD } from "../generators/build-agents-md.js";

describe("build-agents-md", () => {
  // ---- Legacy YAML frontmatter format tests ----

  const sampleAgentContent = `---
name: TestAgent
description: A test agent for verification
skills:
  - Testing
  - Validation
---

# Test Agent Content
This is test content.
`;

  test("parseAgentDefinition extracts name from filename", () => {
    const result = parseAgentDefinition(sampleAgentContent, "TestAgent.md");
    expect(result.name).toBe("TestAgent");
  });

  test("parseAgentDefinition extracts description", () => {
    const result = parseAgentDefinition(sampleAgentContent, "TestAgent.md");
    expect(result.description).toBe("A test agent for verification");
  });

  test("parseAgentDefinition extracts skills array", () => {
    const result = parseAgentDefinition(sampleAgentContent, "TestAgent.md");
    expect(result.skills).toEqual(["Testing", "Validation"]);
  });

  test("parseAgentDefinition handles missing frontmatter", () => {
    const result = parseAgentDefinition("No frontmatter here", "NoFrontMatter.md");
    expect(result.name).toBe("NoFrontMatter");
    expect(result.description).toBe("No description available");
  });

  test("parseAgentDefinition handles missing skills", () => {
    const noSkillsContent = `---
name: NoSkills
description: Agent without skills
---
Content`;
    
    const result = parseAgentDefinition(noSkillsContent, "NoSkills.md");
    expect(result.skills).toBeUndefined();
  });

  // ---- New markdown context format tests ----

  const newFormatContent = `# Architect Agent Context

**Role**: Software architecture specialist with deep knowledge of PAI's constitutional principles.

**Model**: opus

---

## PAI Mission

You are an agent within PAI.
`;

  test("parseAgentDefinition extracts name from new format heading", () => {
    const result = parseAgentDefinition(newFormatContent, "ArchitectContext.md");
    expect(result.name).toBe("Architect");
  });

  test("parseAgentDefinition extracts description from new format Role field", () => {
    const result = parseAgentDefinition(newFormatContent, "ArchitectContext.md");
    expect(result.description).toBe(
      "Software architecture specialist with deep knowledge of PAI's constitutional principles."
    );
  });

  test("parseAgentDefinition falls back to filename when no heading match", () => {
    const noHeading = "Some content without a proper heading\n**Role**: A role";
    const result = parseAgentDefinition(noHeading, "CustomAgentContext.md");
    expect(result.name).toBe("CustomAgent");
  });

  test("parseAgentDefinition falls back to description when no Role field", () => {
    const noRole = "# Test Agent Context\n\nNo role here.";
    const result = parseAgentDefinition(noRole, "TestContext.md");
    expect(result.description).toBe("No description available");
  });

  // --- generateAgentsMD tests using temp fixture directory (legacy format) ---

  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "pai-agents-test-"));
    const agentsDir = join(fixtureDir, "agents");
    mkdirSync(agentsDir);

    writeFileSync(join(agentsDir, "Alpha.md"), `---
name: Alpha
description: First test agent for CI validation
skills:
  - Planning
  - Analysis
---

# Alpha Agent
Alpha does planning and analysis.
`);

    writeFileSync(join(agentsDir, "Bravo.md"), `---
name: Bravo
description: Second test agent for CI validation
skills:
  - Execution
---

# Bravo Agent
Bravo handles execution tasks.
`);

    writeFileSync(join(agentsDir, "Charlie.md"), `---
name: Charlie
description: Third test agent for CI validation
---

# Charlie Agent
Charlie has no skills listed.
`);
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  test("generateAgentsMD returns non-empty markdown", async () => {
    const result = await generateAgentsMD(fixtureDir);
    expect(result.length).toBeGreaterThan(0);
  });

  test("generateAgentsMD output starts with # heading", async () => {
    const result = await generateAgentsMD(fixtureDir);
    expect(result).toMatch(/^# Agents/);
  });

  test("generateAgentsMD contains fixture agent names", async () => {
    const result = await generateAgentsMD(fixtureDir);
    
    expect(result).toContain("## Alpha");
    expect(result).toContain("## Bravo");
    expect(result).toContain("## Charlie");
  });

  test("generateAgentsMD includes agent descriptions", async () => {
    const result = await generateAgentsMD(fixtureDir);
    
    expect(result).toContain("First test agent for CI validation");
    expect(result).toContain("Second test agent for CI validation");
  });

  test("generateAgentsMD throws on invalid directory", async () => {
    try {
      await generateAgentsMD("/nonexistent/path/to/pai");
      throw new Error("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("No agents found in");
    }
  });

  // --- generateAgentsMD tests using new format fixtures ---

  let newFixtureDir: string;

  beforeAll(() => {
    newFixtureDir = mkdtempSync(join(tmpdir(), "pai-agents-new-test-"));
    const skillsAgentsDir = join(newFixtureDir, "skills", "Agents");
    mkdirSync(skillsAgentsDir, { recursive: true });

    writeFileSync(join(skillsAgentsDir, "ArchitectContext.md"), `# Architect Agent Context

**Role**: Software architecture specialist for testing.

**Model**: opus

---

## PAI Mission

Test content.
`);

    writeFileSync(join(skillsAgentsDir, "EngineerContext.md"), `# Engineer Agent Context

**Role**: Senior engineering leader for testing.

**Model**: opus

---

## PAI Mission

Test content.
`);

    // Non-context files should be ignored
    writeFileSync(join(skillsAgentsDir, "SKILL.md"), "# Agents Skill\nNot an agent.");
  });

  afterAll(() => {
    rmSync(newFixtureDir, { recursive: true, force: true });
  });

  test("generateAgentsMD reads from new skills/Agents path", async () => {
    const result = await generateAgentsMD(newFixtureDir);
    expect(result).toContain("## Architect");
    expect(result).toContain("## Engineer");
  });

  test("generateAgentsMD extracts descriptions from new format", async () => {
    const result = await generateAgentsMD(newFixtureDir);
    expect(result).toContain("Software architecture specialist for testing.");
    expect(result).toContain("Senior engineering leader for testing.");
  });

  test("generateAgentsMD ignores non-Context.md files in new path", async () => {
    const result = await generateAgentsMD(newFixtureDir);
    expect(result).not.toContain("Agents Skill");
    expect(result).toContain("Total: 2 agents");
  });
});
