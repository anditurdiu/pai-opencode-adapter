/**
 * skill-loader.ts — PAI Skill Tool Handler
 *
 * Registers a custom "skill" tool for OpenCode via the adapter's tool:{} plugin
 * block. Allows the LLM to load PAI skill instructions from ~/.claude/skills/.
 *
 * Supports:
 *   skill("list")                  — list all available skills
 *   skill("Research")              — load Research/SKILL.md content
 *   skill("Research", "Workflow")  — load Research/Workflows/Workflow.md content
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { tool } from "@opencode-ai/plugin";
import { fileLog } from "../lib/file-logger.js";
import {
  isRegisteredSubagent,
  getSubagentType,
  formatPermissionSummary,
} from "../lib/agent-type-registry.js";

// Base directory for all PAI skills
const SKILLS_BASE_DIR = join(homedir(), ".claude", "skills");

// User skill customizations directory
const CUSTOMIZATIONS_DIR = join(homedir(), ".claude", "PAI", "USER", "SKILLCUSTOMIZATIONS");

// ── Security ──────────────────────────────────────────────────────────────────

/**
 * Load skill customizations from PAI/USER/SKILLCUSTOMIZATIONS/{skillName}/.
 * Reads EXTEND.yaml manifest, then loads all listed files.
 * Returns null if no customizations exist.
 */
function loadCustomizations(skillName: string): string | null {
  const customDir = join(CUSTOMIZATIONS_DIR, skillName);
  if (!existsSync(customDir)) return null;

  const files: string[] = [];

  try {
    let customEntries = readdirSync(customDir);

    // Check for EXTEND.yaml manifest
    const extendPath = join(customDir, "EXTEND.yaml");
    if (existsSync(extendPath)) {
      const extendContent = readFileSync(extendPath, "utf-8");
      const enabledMatch = extendContent.match(/enabled:\s*(\w+)/);
      if (enabledMatch && enabledMatch[1]?.toLowerCase() === "false") {
        return null;
      }

      const extendsMatch = extendContent.match(/extends:\s*\n((?:\s+- .+\n?)+)/);
      if (extendsMatch?.[1]) {
        const listedFiles = extendsMatch[1]
          .split("\n")
          .map(l => l.trim().replace(/^- /, "").trim())
          .filter(Boolean);
        for (const f of listedFiles) {
          const fp = join(customDir, f);
          if (existsSync(fp)) {
            files.push(readFileSync(fp, "utf-8"));
          }
        }
      }
    }

    // If no EXTEND.yaml or no extends section, load PREFERENCES.md if it exists
    if (files.length === 0) {
      const prefsPath = join(customDir, "PREFERENCES.md");
      if (existsSync(prefsPath)) {
        files.push(readFileSync(prefsPath, "utf-8"));
      }
    }

    if (files.length === 0) return null;

    return `\n\n---\n\n## User Customizations for ${skillName}\n\n${files.join("\n\n---\n\n")}`;
  } catch (err) {
    fileLog(`[skill-loader] Failed to load customizations for "${skillName}": ${err}`, "warn");
    return null;
  }
}

// ── Security ──────────────────────────────────────────────────────────────────

/**
 * Reject any input containing ".." to prevent path traversal.
 */
function hasDotDot(value: string): boolean {
  return value.includes("..");
}

// ── Path Resolution ───────────────────────────────────────────────────────────

/**
 * Resolve the path to a SKILL.md file by skill name.
 *
 * 1. Try ~/.claude/skills/{name}/SKILL.md  (direct, case-sensitive)
 * 2. Scan one level deep for a directory whose basename matches {name}
 *    case-insensitively, then return its SKILL.md.
 *
 * Returns null if:
 *   - name contains ".."
 *   - no matching SKILL.md can be found
 */
export function resolveSkillPath(name: string): string | null {
  if (hasDotDot(name)) return null;

  // 1. Direct hit
  const direct = join(SKILLS_BASE_DIR, name, "SKILL.md");
  if (existsSync(direct)) return direct;

  // 2. Case-insensitive scan of top-level directories
  if (!existsSync(SKILLS_BASE_DIR)) return null;

  let entries: string[];
  try {
    entries = readdirSync(SKILLS_BASE_DIR);
  } catch {
    return null;
  }

  const lowerName = name.toLowerCase();
  for (const entry of entries) {
    if (entry.toLowerCase() === lowerName) {
      const candidate = join(SKILLS_BASE_DIR, entry, "SKILL.md");
      if (existsSync(candidate)) return candidate;
    }
  }

  // 3. Recursive scan — walk one extra level (sub-skill directories)
  for (const entry of entries) {
    const subDir = join(SKILLS_BASE_DIR, entry);
    let subEntries: string[];
    try {
      subEntries = readdirSync(subDir);
    } catch {
      continue;
    }
    for (const sub of subEntries) {
      if (sub.toLowerCase() === lowerName) {
        const candidate = join(subDir, sub, "SKILL.md");
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  return null;
}

/**
 * Resolve path to a workflow file inside a skill's Workflows/ directory.
 *
 * Looks for:  ~/.claude/skills/{skillDir}/Workflows/{workflow}.md
 *
 * The skill directory is derived from the resolveSkillPath result —
 * dirname of the SKILL.md.
 *
 * Returns null if:
 *   - skillName or workflow contains ".."
 *   - the skill cannot be resolved
 *   - the workflow file does not exist
 */
export function resolveWorkflowPath(skillName: string, workflow: string): string | null {
  if (hasDotDot(skillName) || hasDotDot(workflow)) return null;

  const skillMdPath = resolveSkillPath(skillName);
  if (!skillMdPath) return null;

  // skillMdPath = .../SkillName/SKILL.md  →  skillDir = .../SkillName
  const { dirname } = await_free_dirname(skillMdPath);
  const workflowPath = join(dirname, "Workflows", `${workflow}.md`);
  if (existsSync(workflowPath)) return workflowPath;

  // Also try without .md extension in case the caller passed one
  const bare = basename(workflow, ".md");
  const workflowPathBare = join(dirname, "Workflows", `${bare}.md`);
  if (existsSync(workflowPathBare)) return workflowPathBare;

  return null;
}

/**
 * Synchronous dirname helper — avoids importing path.dirname separately.
 * Returns the directory portion of a file path.
 */
function await_free_dirname(filePath: string): { dirname: string } {
  const parts = filePath.replace(/\\/g, "/").split("/");
  parts.pop();
  return { dirname: parts.join("/") };
}

// ── Skill Listing ─────────────────────────────────────────────────────────────

/**
 * Extract the description value from YAML frontmatter.
 *
 * Handles multi-line values (plain string after `description:`) and
 * falls back to the first non-empty non-YAML-marker line in the file.
 */
function extractDescription(content: string): string {
  // Check for frontmatter block  ---  ...  ---
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1] ?? "";
    // Match `description: <value>` — may be multi-line until next key or end
    const descMatch = fm.match(/^description:\s*(.+)/m);
    if (descMatch?.[1]) {
      // Trim quoted values and truncate at ~120 chars
      return descMatch[1].replace(/^['"]|['"]$/g, "").slice(0, 120);
    }
  }

  // Fallback: first non-empty, non-YAML-fence line
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && trimmed !== "---" && !trimmed.startsWith("#")) {
      return trimmed.slice(0, 120);
    }
  }

  return "";
}

/**
 * Collect all available skill names by scanning SKILLS_BASE_DIR for
 * directories that contain a SKILL.md file.
 *
 * Returns an array of { name, description } objects sorted alphabetically.
 */
function collectSkills(): Array<{ name: string; description: string }> {
  if (!existsSync(SKILLS_BASE_DIR)) return [];

  let topLevel: string[];
  try {
    topLevel = readdirSync(SKILLS_BASE_DIR);
  } catch {
    return [];
  }

  const skills: Array<{ name: string; description: string }> = [];

  for (const entry of topLevel) {
    const skillMd = join(SKILLS_BASE_DIR, entry, "SKILL.md");
    if (existsSync(skillMd)) {
      try {
        const content = readFileSync(skillMd, "utf-8");
        skills.push({ name: entry, description: extractDescription(content) });
      } catch {
        skills.push({ name: entry, description: "" });
      }
    }

    // Also scan one level deeper for nested skill directories
    const subDir = join(SKILLS_BASE_DIR, entry);
    let subEntries: string[];
    try {
      subEntries = readdirSync(subDir);
    } catch {
      continue;
    }
    for (const sub of subEntries) {
      const subSkillMd = join(subDir, sub, "SKILL.md");
      if (existsSync(subSkillMd)) {
        try {
          const content = readFileSync(subSkillMd, "utf-8");
          skills.push({ name: sub, description: extractDescription(content) });
        } catch {
          skills.push({ name: sub, description: "" });
        }
      }
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * List all available PAI skills.
 *
 * Returns a human-readable string in the format:
 *   Available PAI Skills:
 *   - Research: <description>
 *   - Council: <description>
 *   ...
 */
export function listSkills(): string {
  const skills = collectSkills();
  if (skills.length === 0) {
    return `Available PAI Skills:\n(No skills found in ${SKILLS_BASE_DIR})`;
  }

  const lines = skills.map(({ name, description }) =>
    description ? `- ${name}: ${description}` : `- ${name}`
  );

  return `Available PAI Skills:\n${lines.join("\n")}`;
}

// ── Subagent Permission Context ───────────────────────────────────────────

/**
 * If the requesting session is a known subagent, append permission
 * adaptation context after the skill content. This helps the subagent
 * understand which instructions it can execute and which need adaptation.
 *
 * Returns the original content unchanged for non-subagent sessions.
 */
function maybeAppendPermissionContext(
  content: string,
  isSubagent: boolean,
  agentType: string | null,
  skillName: string,
): string {
  if (!isSubagent || !agentType) return content;

  const summary = formatPermissionSummary(agentType);
  if (!summary) return content;

  fileLog(
    `[skill-loader] Appending permission context for ${agentType} agent loading skill "${skillName}"`,
    "info",
  );

  return `${content}\n\n---\n\n${summary}`;
}

// ── Tool Definition ───────────────────────────────────────────────────────────

/**
 * Create the "skill" ToolDefinition for registration in pai-unified.ts.
 *
 * Args:
 *   name     — skill name ("Research", "list", etc.) or undefined → list mode
 *   workflow — optional workflow file name within the skill's Workflows/ dir
 */
export function createSkillTool(): ReturnType<typeof tool> {
  return tool({
    description: `Load a PAI skill by name to get specialized instructions and workflows. 
Call skill("list") to see all available skills.
Call skill("Research") to load the Research skill.
Call skill("Research", "StandardResearch") to load a specific workflow.
Skills provide step-by-step instructions, workflows, and patterns for specialized tasks.`,
    args: {
      name: z.string().optional().describe(
        'Skill name to load (e.g. "Research", "Council"), or "list" to see all skills. Omit to list all skills.'
      ),
      workflow: z.string().optional().describe(
        "Optional workflow file name within the skill's Workflows/ directory (without .md extension)."
      ),
    },
    async execute({ name, workflow }, ctx) {
      // ── Security gate ──────────────────────────────────────────────────────
      if (name && hasDotDot(name)) {
        fileLog(`[skill-loader] Path traversal attempt blocked: name="${name}"`, "warn");
        return "Error: Invalid skill name — path traversal not allowed";
      }
      if (workflow && hasDotDot(workflow)) {
        fileLog(`[skill-loader] Path traversal attempt blocked: workflow="${workflow}"`, "warn");
        return "Error: Invalid skill name — path traversal not allowed";
      }

      // ── Subagent detection ─────────────────────────────────────────────────
      // Determine if this request comes from a subagent session.
      // If so, we'll append permission adaptation context after the skill content.
      const sessionId = ctx?.sessionID ?? "";
      const isSubagent = sessionId ? isRegisteredSubagent(sessionId) : false;
      const agentType = isSubagent ? getSubagentType(sessionId) : null;

      // ── List mode ──────────────────────────────────────────────────────────
      if (!name || name.trim() === "" || name.toLowerCase() === "list") {
        fileLog("[skill-loader] Listing all available skills", "info");
        return listSkills();
      }

      // ── Workflow mode ──────────────────────────────────────────────────────
      if (workflow) {
        const wfPath = resolveWorkflowPath(name, workflow);
        if (!wfPath) {
          fileLog(
            `[skill-loader] Workflow not found: skill="${name}" workflow="${workflow}"`,
            "warn",
          );
          return `Error: Workflow "${workflow}" not found for skill "${name}". Use skill("${name}") to see available workflows.`;
        }
        try {
          const content = readFileSync(wfPath, "utf-8");
          fileLog(
            `[skill-loader] Loaded workflow: skill="${name}" workflow="${workflow}"`,
            "info",
          );
          return maybeAppendPermissionContext(content, isSubagent, agentType, name);
        } catch (err) {
          fileLog(`[skill-loader] Failed to read workflow file: ${err}`, "warn");
          return `Error: Workflow "${workflow}" not found for skill "${name}". Use skill("${name}") to see available workflows.`;
        }
      }

      // ── Normal mode ────────────────────────────────────────────────────────
      const skillPath = resolveSkillPath(name);
      if (!skillPath) {
        fileLog(`[skill-loader] Skill not found: "${name}"`, "warn");
        return `Error: Skill '${name}' not found. Use skill("list") to see available skills.`;
      }

      try {
        const content = readFileSync(skillPath, "utf-8");
        fileLog(`[skill-loader] Loaded skill: "${name}" from ${skillPath}`, "info");
        let result = maybeAppendPermissionContext(content, isSubagent, agentType, name);
        const customizations = loadCustomizations(name);
        if (customizations) {
          result += customizations;
          fileLog(`[skill-loader] Appended customizations for "${name}"`, "info");
        }
        return result;
      } catch (err) {
        fileLog(`[skill-loader] Failed to read skill file: ${err}`, "warn");
        return `Error: Skill '${name}' not found. Use skill("list") to see available skills.`;
      }
    },
  });
}
