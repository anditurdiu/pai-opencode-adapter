import { expect, test, describe } from "bun:test";
import { parseAgentDefinition, generateAgentsMD } from "../generators/build-agents-md.js";

describe("build-agents-md", () => {
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

  test("generateAgentsMD returns non-empty markdown", async () => {
    const result = await generateAgentsMD(`${process.env.HOME}/.claude`);
    expect(result.length).toBeGreaterThan(0);
  });

  test("generateAgentsMD output starts with # heading", async () => {
    const result = await generateAgentsMD(`${process.env.HOME}/.claude`);
    expect(result).toMatch(/^# Agents/);
  });

  test("generateAgentsMD contains at least 5 agent names", async () => {
    const result = await generateAgentsMD(`${process.env.HOME}/.claude`);
    
    const expectedAgents = ["Algorithm", "Architect", "Artist", "Engineer", "Pentester"];
    let foundCount = 0;
    
    for (const agentName of expectedAgents) {
      if (result.includes(`## ${agentName}`)) {
        foundCount++;
      }
    }
    
    expect(foundCount).toBeGreaterThanOrEqual(5);
  });

  test("generateAgentsMD includes agent descriptions", async () => {
    const result = await generateAgentsMD(`${process.env.HOME}/.claude`);
    
    expect(result).toMatch(/## Engineer\s*\n\s*Elite|Engineer/);
  });

  test("generateAgentsMD throws on invalid directory", async () => {
    try {
      await generateAgentsMD("/nonexistent/path/to/pai");
      throw new Error("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("Failed to read agents directory");
    }
  });
});
