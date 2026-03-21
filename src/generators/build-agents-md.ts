import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PATHS } from "./path-mapper.js";

export interface AgentDefinition {
  name: string;
  description: string;
  skills?: string[];
  tools?: string[];
}

export function parseAgentDefinition(content: string, filename: string): AgentDefinition {
  const name = filename.replace(".md", "");
  
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {
      name,
      description: "No description available",
      skills: [],
      tools: [],
    };
  }
  
  const frontmatter = frontmatterMatch[1] ?? "";
  
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

export async function generateAgentsMD(paiDir?: string): Promise<string> {
  const rootDir = paiDir || PATHS.PAI_ROOT();
  const agentsDir = join(rootDir, "agents");
  
  let files: string[];
  try {
    files = readdirSync(agentsDir).filter(f => f.endsWith(".md"));
  } catch (error) {
    throw new Error(`Failed to read agents directory: ${agentsDir}`);
  }
  
  const agents: AgentDefinition[] = [];
  
  for (const file of files) {
    const filePath = join(agentsDir, file);
    const content = readFileSync(filePath, "utf-8");
    const agent = parseAgentDefinition(content, file);
    agents.push(agent);
  }
  
  agents.sort((a, b) => a.name.localeCompare(b.name));
  
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
