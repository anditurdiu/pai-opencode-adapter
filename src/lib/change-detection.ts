/**
 * change-detection.ts - File change detection for work tracking
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 * Ported from PAI v4.0.3 hooks/lib/change-detection.ts
 *
 * Functions:
 *   detectChanges() - Detect changes between before/after states
 *   summarizeChanges() - Summarize detected changes
 *   categorizeChange() - Categorize a change by type
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { fileLog } from "./file-logger.js";
import { getPAIDir } from "./paths.js";

export interface FileChange {
  tool: "Write" | "Edit" | "MultiEdit";
  path: string;
  category: ChangeCategory | null;
  isPhilosophical: boolean;
  isStructural: boolean;
}

export type ChangeCategory =
  | "skill"
  | "hook"
  | "workflow"
  | "config"
  | "core-system"
  | "memory-system"
  | "documentation";

export type SignificanceLabel = "trivial" | "minor" | "moderate" | "major" | "critical";

export type ChangeType =
  | "skill_update"
  | "structure_change"
  | "doc_update"
  | "hook_update"
  | "workflow_update"
  | "config_update"
  | "tool_update"
  | "multi_area";

function getPAIDirCached(): string {
  return getPAIDir();
}

const EXCLUDED_PATHS = [
  "MEMORY/WORK/",
  "MEMORY/LEARNING/",
  "MEMORY/STATE/",
  "Plans/",
  "projects/",
  ".git/",
  "node_modules/",
  "ShellSnapshots/",
];

const HIGH_PRIORITY_PATHS = [
  "PAI/",
  "PAISYSTEMARCHITECTURE.md",
  "SKILLSYSTEM.md",
  "MEMORYSYSTEM.md",
  "THEHOOKSYSTEM.md",
  "THEDELEGATIONSYSTEM.md",
  "THENOTIFICATIONSYSTEM.md",
  "settings.json",
];

const PHILOSOPHICAL_PATTERNS = [
  /PAI\//i,
  /ARCHITECTURE/i,
  /PRINCIPLES/i,
  /FOUNDING/i,
  /IDENTITY/i,
];

const STRUCTURAL_PATTERNS = [
  /\/SKILL\.md$/i,
  /\/Workflows\//i,
  /settings\.json$/i,
  /frontmatter/i,
];

/**
 * Detect changes between before/after states
 * Compares file lists and returns detected changes
 */
export function detectChanges(before: string[], after: string[]): FileChange[] {
  const changes: FileChange[] = [];
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  for (const path of afterSet) {
    if (!beforeSet.has(path)) {
      changes.push(createFileChange("Write", path));
    } else {
      changes.push(createFileChange("Edit", path));
    }
  }

  return changes;
}

/**
 * Summarize detected changes into a human-readable string
 */
export function summarizeChanges(changes: FileChange[]): string {
  if (changes.length === 0) {
    return "No changes detected";
  }

  const byCategory = new Map<ChangeCategory | null, number>();
  for (const change of changes) {
    const cat = change.category;
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
  }

  const parts: string[] = [];
  for (const [cat, count] of byCategory) {
    if (cat) {
      parts.push(`${count} ${cat}`);
    }
  }

  const newFiles = changes.filter((c) => c.tool === "Write").length;
  const modifiedFiles = changes.filter((c) => c.tool === "Edit").length;

  let summary = `${changes.length} changes: ${parts.join(", ")}`;
  if (newFiles > 0) {
    summary += ` (${newFiles} new, ${modifiedFiles} modified)`;
  }

  return summary;
}

function normalizeToRelativePath(absolutePath: string): string {
  const paiDir = getPAIDirCached();
  if (absolutePath.startsWith(paiDir)) {
    return relative(paiDir, absolutePath);
  }
  return absolutePath;
}

function createFileChange(tool: "Write" | "Edit", path: string): FileChange {
  return {
    tool,
    path,
    category: categorizeChange(path),
    isPhilosophical: isPhilosophicalPath(path),
    isStructural: isStructuralPath(path),
  };
}

/**
 * Categorize a file path by its location in the PAI system
 */
export function categorizeChange(path: string): ChangeCategory | null {
  for (const excluded of EXCLUDED_PATHS) {
    if (path.includes(excluded)) {
      return null;
    }
  }

  const paiDir = getPAIDirCached();
  const absolutePath = path.startsWith("/") ? path : join(paiDir, path);
  if (!absolutePath.startsWith(paiDir)) {
    return null;
  }

  if (path.includes("skills/")) {
    const skillMatch = path.match(/skills\/(_[^/]+)/);
    if (skillMatch) return null;
    if (path.includes("/Workflows/")) return "workflow";
    if (path.match(/PAI\/(?:PAISYSTEM|THEHOOKSYSTEM|THEDELEGATION|MEMORYSYSTEM|AISTEERINGRULES)/))
      return "core-system";
    return "skill";
  }

  if (path.includes("hooks/")) return "hook";
  if (path.includes("MEMORY/PAISYSTEMUPDATES/")) return "documentation";
  if (path.includes("MEMORY/")) return "memory-system";
  if (path.endsWith("settings.json")) return "config";
  if (path.endsWith(".md") && !path.includes("WORK/")) return "documentation";

  return null;
}

function isPhilosophicalPath(path: string): boolean {
  for (const pattern of PHILOSOPHICAL_PATTERNS) {
    if (pattern.test(path)) return true;
  }
  for (const highPriority of HIGH_PRIORITY_PATHS) {
    if (path.includes(highPriority)) return true;
  }
  return false;
}

function isStructuralPath(path: string): boolean {
  for (const pattern of STRUCTURAL_PATTERNS) {
    if (pattern.test(path)) return true;
  }
  return false;
}

/**
 * Determine if changes are significant enough to warrant attention
 */
export function isSignificantChange(changes: FileChange[]): boolean {
  const systemChanges = changes.filter((c) => c.category !== null);

  if (systemChanges.length === 0) return false;

  if (systemChanges.some((c) => c.isPhilosophical || c.isStructural)) {
    return true;
  }

  const categories = new Set(systemChanges.map((c) => c.category));
  if (categories.size >= 1 && systemChanges.length >= 2) {
    return true;
  }

  const importantCategories: ChangeCategory[] = ["skill", "hook", "core-system", "workflow"];
  if (systemChanges.some((c) => importantCategories.includes(c.category!))) {
    return true;
  }

  return false;
}

/**
 * Determine the significance label based on change characteristics
 */
export function determineSignificance(changes: FileChange[]): SignificanceLabel {
  const count = changes.length;
  const hasStructural = changes.some((c) => c.isStructural);
  const hasPhilosophical = changes.some((c) => c.isPhilosophical);
  const hasNewFiles = changes.some((c) => c.tool === "Write");

  const categories = new Set(changes.map((c) => c.category).filter(Boolean));
  const hasCoreSystem = changes.some((c) => c.category === "core-system");
  const hasHooks = changes.some((c) => c.category === "hook");
  const hasSkills = changes.some((c) => c.category === "skill");

  if (hasStructural && hasPhilosophical && count >= 5) {
    return "critical";
  }

  if (hasNewFiles && (hasStructural || hasPhilosophical)) {
    return "major";
  }
  if (hasCoreSystem || categories.size >= 3) {
    return "major";
  }
  if (hasHooks && count >= 3) {
    return "major";
  }

  if (count >= 3 || categories.size >= 2) {
    return "moderate";
  }
  if (hasSkills && count >= 2) {
    return "moderate";
  }

  if (count === 1 && !hasStructural && !hasPhilosophical) {
    return "minor";
  }

  if (count === 1 && changes[0]?.category === "documentation") {
    return "trivial";
  }

  return "minor";
}

/**
 * Infer the change type based on affected files
 */
export function inferChangeType(changes: FileChange[]): ChangeType {
  const categories = changes.map((c) => c.category).filter(Boolean);
  const uniqueCategories = new Set(categories);

  if (uniqueCategories.size >= 3) {
    return "multi_area";
  }

  if (uniqueCategories.size === 1) {
    const cat = [...uniqueCategories][0];
    switch (cat) {
      case "skill":
        return changes.some((c) => c.isStructural) ? "structure_change" : "skill_update";
      case "hook":
        return "hook_update";
      case "workflow":
        return "workflow_update";
      case "config":
        return "config_update";
      case "core-system":
        return "structure_change";
      case "documentation":
        return "doc_update";
      default:
        return "skill_update";
    }
  }

  if (uniqueCategories.has("hook")) return "hook_update";
  if (uniqueCategories.has("skill")) return "skill_update";
  if (uniqueCategories.has("workflow")) return "workflow_update";
  if (uniqueCategories.has("config")) return "config_update";

  return "multi_area";
}
