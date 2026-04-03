import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PATHS } from "./path-mapper.js";

export interface AgentDefinition {
  name: string;
  description: string;
  skills?: string[];
  tools?: string[];
}

/**
 * Parse an agent definition from either:
 * - Legacy format: YAML frontmatter with `name`, `description`, `skills` fields
 * - New format: Markdown heading `# Name Agent Context` + `**Role**: description`
 */
export function parseAgentDefinition(content: string, filename: string): AgentDefinition {
  // Try legacy YAML frontmatter format first
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1] ?? "";
    const name = filename.replace(".md", "");

    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    const description = descMatch?.[1]?.trim() ?? "No description available";

    const skillsMatch = frontmatter.match(/^skills:\s*\n((?:\s+-\s*.+\n?)+)/m);
    const skills: string[] = [];
    if (skillsMatch) {
      const skillsLines = skillsMatch[1]?.split("\n") ?? [];
      for (const line of skillsLines) {
        const skillMatch = line.match(/^\s+-\s*(.+)$/);
        if (skillMatch) {
          skills.push(skillMatch[1]?.trim() ?? "");
        }
      }
    }

    return {
      name,
      description,
      skills: skills.length > 0 ? skills : undefined,
      tools: [],
    };
  }

  // Try new markdown format: `# Name Agent Context` + `**Role**: description`
  const headingMatch = content.match(/^# (.+?) Agent Context$/m);
  const roleMatch = content.match(/^\*\*Role\*\*:\s*(.+)$/m);

  const name = headingMatch
    ? headingMatch[1]!.trim()
    : filename.replace(/Context\.md$/, "").replace(/\.md$/, "");

  const description = roleMatch
    ? roleMatch[1]!.trim()
    : "No description available";

  return {
    name,
    description,
    skills: [],
    tools: [],
  };
}

/**
 * Generate a markdown summary of all available PAI agents.
 *
 * Scans `skills/Agents/*Context.md` for context-based agents, then
 * supplements with `agents/*.md` for named agents that don't have
 * Context.md files (e.g., BrowserAgent, UIReviewer, Algorithm, Pentester).
 * Deduplicates by agent name to avoid double-counting.
 */
export async function generateAgentsMD(paiDir?: string): Promise<string> {
  const rootDir = paiDir || PATHS.PAI_ROOT();

  const contextAgentsDir = join(rootDir, "skills", "Agents");
  const namedAgentsDir = join(rootDir, "agents");

  const agentsByName = new Map<string, AgentDefinition>();

  // 1. Scan skills/Agents/*Context.md (primary source)
  if (existsSync(contextAgentsDir)) {
    try {
      const contextFiles = readdirSync(contextAgentsDir).filter(
        f => f.endsWith("Context.md")
      );
      for (const file of contextFiles) {
        const filePath = join(contextAgentsDir, file);
        const content = readFileSync(filePath, "utf-8");
        const agent = parseAgentDefinition(content, file);
        agentsByName.set(agent.name, agent);
      }
    } catch {
      // Skip on error
    }
  }

  // 2. Supplement with agents/*.md for named agents not already discovered
  if (existsSync(namedAgentsDir)) {
    try {
      const namedFiles = readdirSync(namedAgentsDir).filter(f => f.endsWith(".md"));
      for (const file of namedFiles) {
        const filePath = join(namedAgentsDir, file);
        const content = readFileSync(filePath, "utf-8");
        const agent = parseAgentDefinition(content, file);
        // Only add if not already present from Context.md scan
        if (!agentsByName.has(agent.name)) {
          agentsByName.set(agent.name, agent);
        }
      }
    } catch {
      // Skip on error
    }
  }

  if (agentsByName.size === 0) {
    throw new Error(`No agents found in ${contextAgentsDir} or ${namedAgentsDir}`);
  }

  const agents = Array.from(agentsByName.values()).sort((a, b) => a.name.localeCompare(b.name));

  let markdown = "# Agents\n\n";
  markdown += `Total: ${agents.length} agents\n\n`;

  for (const agent of agents) {
    markdown += `## ${agent.name}\n\n`;
    markdown += `${agent.description}\n\n`;

    if (agent.skills && agent.skills.length > 0) {
      markdown += `**Skills:** ${agent.skills.join(", ")}\n\n`;
    }
  }

  return markdown;
}
