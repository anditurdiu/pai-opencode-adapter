/**
 * prd-utils.ts - PRD file management for plan mode
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 * Ported from PAI v4.0.3 hooks/lib/prd-utils.ts
 *
 * Functions:
 *   readPRD() - Read a PRD file
 *   writePRD() - Write a PRD file (atomic)
 *   getPRDPath() - Get path to PRD for a work item
 *   parseFrontmatter() - Parse YAML frontmatter
 *   writeFrontmatterField() - Update a field in frontmatter
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "./file-logger.js";
import { getWorkDir } from "./paths.js";

export interface PRDFrontmatter {
  prd?: boolean;
  id?: string;
  title?: string;
  session_id?: string;
  status?: string;
  mode?: string;
  effort_level?: string;
  created?: string;
  updated?: string;
  phase?: string;
  progress?: string;
  [key: string]: string | boolean | undefined;
}

/**
 * Get path to PRD for a work item
 */
export function getPRDPath(slug: string): string {
  return join(getWorkDir(), slug, "PRD.md");
}

/**
 * Read a PRD file and return content with parsed frontmatter
 */
export function readPRD(path: string): { content: string; frontmatter: PRDFrontmatter } | null {
  try {
    if (!existsSync(path)) {
      return null;
    }

    const content = readFileSync(path, "utf-8");
    const frontmatter = parseFrontmatter(content);

    return { content, frontmatter };
  } catch (error) {
    fileLog(`Failed to read PRD at ${path}: ${error}`, "error");
    return null;
  }
}

/**
 * Write a PRD file (atomic write)
 */
export function writePRD(path: string, content: string): boolean {
  try {
    const dir = join(path, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Atomic write: temp → rename
    const tempPath = `${path}.tmp`;
    writeFileSync(tempPath, content, "utf-8");
    renameSync(tempPath, path);

    fileLog(`Wrote PRD to ${path}`, "debug");
    return true;
  } catch (error) {
    fileLog(`Failed to write PRD at ${path}: ${error}`, "error");
    return false;
  }
}

/**
 * Parse YAML frontmatter from content
 */
export function parseFrontmatter(content: string): PRDFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm: PRDFrontmatter = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      fm[key] = value as PRDFrontmatter[typeof key];
    }
  }
  return fm;
}

/**
 * Write a field to frontmatter (returns updated content)
 */
export function writeFrontmatterField(content: string, field: string, value: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) return content;

  const lines = (fmMatch[2] ?? "").split("\n");
  let found = false;

  for (let i = 0; i < lines.length; i++) {
      const current = lines[i];
      if (current?.startsWith(`${field}:`)) {
        lines[i] = `${field}: ${value}`;
        found = true;
        break;
      }
  }

  if (!found) {
    lines.push(`${field}: ${value}`);
  }

  return fmMatch[1] + lines.join("\n") + fmMatch[3] + content.slice(fmMatch[0].length);
}

/**
 * Count checked/unchecked criteria in PRD
 */
export function countCriteria(content: string): { checked: number; total: number } {
  const criteriaMatch = content.match(/## Criteria\n([\s\S]*?)(?=\n## |\n---|\n$)/);
  if (!criteriaMatch) return { checked: 0, total: 0 };

  const lines = (criteriaMatch[1] ?? "").split("\n").filter((l) => l.match(/^- \[[ x]\]/));
  const checked = lines.filter((l) => l.startsWith("- [x]")).length;

  return { checked, total: lines.length };
}

/**
 * Find the most recently modified PRD file
 */
export function findLatestPRD(): string | null {
  const workDir = getWorkDir();
  if (!existsSync(workDir)) return null;

  let latest: string | null = null;
  let latestMtime = 0;

  try {
    for (const dir of readdirSync(workDir)) {
      const prd = join(workDir, dir, "PRD.md");
      try {
        const s = statSync(prd);
        if (s.mtimeMs > latestMtime) {
          latestMtime = s.mtimeMs;
          latest = prd;
        }
      } catch {
        // Skip unreadable
      }
    }
  } catch (error) {
    fileLog(`Failed to find latest PRD: ${error}`, "warn");
  }

  return latest;
}
