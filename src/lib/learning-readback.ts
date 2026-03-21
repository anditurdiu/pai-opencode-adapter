/**
 * learning-readback.ts - Read back learning history for context injection
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 * Ported from PAI v4.0.3 hooks/lib/learning-readback.ts
 *
 * Functions:
 *   readLearnings() - Read recent learning signals for a session
 *   getRecentLearnings() - Get N most recent learnings from all sessions
 *   loadLearningDigest() - Load compact learning digest
 *   loadFailurePatterns() - Load recent failure patterns
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "./file-logger.js";
import { getMemoryPath } from "./paths.js";

export interface LearningDigest {
  algorithm: string[];
  system: string[];
}

/**
 * Get the N most recent learning files from a LEARNING subdirectory.
 * Files are named YYYY-MM-DD-HHMMSS_LEARNING_*.md with YAML frontmatter.
 * Extracts the **Feedback:** line and rating for compact display.
 */
function getRecentLearningFiles(
  baseDir: string,
  subdir: string,
  count: number
): string[] {
  const insights: string[] = [];
  const learningDir = join(baseDir, "MEMORY", "LEARNING", subdir);
  if (!existsSync(learningDir)) return insights;

  try {
    // Get month dirs sorted descending (newest first)
    const months = readdirSync(learningDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
      .map((d) => d.name)
      .sort()
      .reverse();

    for (const month of months) {
      if (insights.length >= count) break;
      const monthPath = join(learningDir, month);

      try {
        const files = readdirSync(monthPath)
          .filter((f) => f.endsWith(".md"))
          .sort()
          .reverse();

        for (const file of files) {
          if (insights.length >= count) break;
          try {
            const content = readFileSync(join(monthPath, file), "utf-8");
            const feedbackMatch = content.match(/\*\*Feedback:\*\*\s*(.+)/);
            const ratingMatch = content.match(/rating:\s*(\d+)/);
            if (feedbackMatch) {
              const rating = ratingMatch ? ratingMatch[1] : "?";
              const feedback = (feedbackMatch[1] ?? "").substring(0, 80);
              insights.push(`[${rating}/10] ${feedback}`);
            }
          } catch {
            /* skip unreadable files */
          }
        }
      } catch {
        /* skip unreadable months */
      }
    }
  } catch {
    /* skip if dir scan fails */
  }

  return insights;
}

/**
 * Read recent learning signals for a specific session
 * Returns array of learning content strings
 */
export function readLearnings(sessionId?: string, days: number = 30): string[] {
  const memoryDir = getMemoryPath();
  const learnings: string[] = [];

  if (!existsSync(memoryDir)) return learnings;

  try {
    const learningDir = join(memoryDir, "LEARNING");
    if (!existsSync(learningDir)) return learnings;

    // Get all category directories
    const categories = readdirSync(learningDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const category of categories) {
      const categoryDir = join(learningDir, category);
      const months = readdirSync(categoryDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
        .map((d) => d.name)
        .sort()
        .reverse();

      for (const month of months) {
        const monthPath = join(categoryDir, month);
        const files = readdirSync(monthPath)
          .filter((f) => f.endsWith(".md"))
          .sort()
          .reverse();

        for (const file of files) {
          try {
            const filePath = join(monthPath, file);
            const content = readFileSync(filePath, "utf-8");
            
            // Filter by sessionId if provided
            if (sessionId) {
              const sessionMatch = content.match(/session:\s*([^\n]+)/);
              if (!sessionMatch || !sessionMatch[1]?.includes(sessionId)) {
                continue;
              }
            }

            const feedbackMatch = content.match(/\*\*Feedback:\*\*\s*(.+)/);
            if (feedbackMatch) {
              learnings.push((feedbackMatch[1] ?? "").trim());
            }
          } catch {
            /* skip unreadable */
          }
        }
      }
    }
  } catch (error) {
    fileLog(`Failed to read learnings: ${error}`, "warn");
  }

  return learnings.slice(0, 50); // Limit to 50 most recent
}

/**
 * Get N most recent learnings from all sessions
 * Alias for readLearnings without sessionId filter
 */
export function getRecentLearnings(days: number = 30): string[] {
  return readLearnings(undefined, days);
}

/**
 * Load recent learning signals from ALGORITHM and SYSTEM directories.
 * Returns the 3 most recent from each, formatted as a compact bullet list.
 */
export function loadLearningDigest(paiDir: string): string | null {
  const algorithmInsights = getRecentLearningFiles(paiDir, "ALGORITHM", 3);
  const systemInsights = getRecentLearningFiles(paiDir, "SYSTEM", 3);

  if (algorithmInsights.length === 0 && systemInsights.length === 0) return null;

  const parts: string[] = ["**Recent Learning Signals:**"];

  if (algorithmInsights.length > 0) {
    parts.push("*Algorithm:*");
    for (const i of algorithmInsights) parts.push(`  ${i}`);
  }
  if (systemInsights.length > 0) {
    parts.push("*System:*");
    for (const i of systemInsights) parts.push(`  ${i}`);
  }

  return parts.join("\n");
}

/**
 * Load recent failure pattern insights.
 * Reads the 5 most recent FAILURES directories and extracts summaries.
 */
export function loadFailurePatterns(paiDir: string): string | null {
  const failuresDir = join(paiDir, "MEMORY", "LEARNING", "FAILURES");
  if (!existsSync(failuresDir)) return null;

  const patterns: string[] = [];

  try {
    // Get month dirs sorted descending
    const months = readdirSync(failuresDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
      .map((d) => d.name)
      .sort()
      .reverse();

    for (const month of months) {
      if (patterns.length >= 5) break;
      const monthPath = join(failuresDir, month);

      try {
        // Failure dirs are named timestamp_slug
        const dirs = readdirSync(monthPath, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .sort()
          .reverse();

        for (const dir of dirs) {
          if (patterns.length >= 5) break;
          const contextPath = join(monthPath, dir, "CONTEXT.md");
          if (!existsSync(contextPath)) continue;

          try {
            // Extract slug as human-readable failure description
            const slug = dir
              .replace(/^\d{4}-\d{2}-\d{2}-\d{6}_/, "")
              .replace(/-/g, " ");
            // Get date from dir name
            const dateMatch = dir.match(/^(\d{4}-\d{2}-\d{2})/);
            const date = dateMatch ? dateMatch[1] : "";
            patterns.push(`[${date}] ${slug.substring(0, 70)}`);
          } catch {
            /* skip unreadable */
          }
        }
      } catch {
        /* skip unreadable months */
      }
    }
  } catch {
    /* skip if dir scan fails */
  }

  if (patterns.length === 0) return null;

  return `**Recent Failure Patterns (avoid these):**\n${patterns
    .map((p) => `  ${p}`)
    .join("\n")}`;
}
