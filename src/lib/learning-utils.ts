/**
 * learning-utils.ts - Learning signal capture, classification, and storage
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 * Ported from PAI v4.0.3 hooks/lib/learning-utils.ts
 *
 * Functions:
 *   getLearningCategory() - Classify learning as SYSTEM or ALGORITHM
 *   isLearningCapture() - Determine if content represents a learning moment
 *   captureSignal() - Capture a learning signal for a session
 *   classifySignal() - Alias for getLearningCategory
 *   storeSignal() - Persist a learning signal to disk
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "./file-logger.js";
import { getAdapterPath, getMemoryPath } from "./paths.js";
import { getISOTimestamp, getYearMonth } from "./time.js";

export type LearningCategory = "SYSTEM" | "ALGORITHM";

export interface LearningSignal {
  sessionId: string;
  type: LearningCategory;
  content: string;
  rating?: number;
  timestamp: string;
  comment?: string;
}

/**
 * Categorize learning as SYSTEM (tooling/infrastructure) or ALGORITHM (task execution)
 *
 * SYSTEM = hook failures, tooling issues, infrastructure problems, system errors
 * ALGORITHM = task execution issues, approach errors, method improvements
 *
 * Check ALGORITHM first because user feedback about task execution is more valuable.
 * Default to ALGORITHM since most learnings are about task quality, not infrastructure.
 *
 * @param content - The main content to analyze
 * @param comment - Optional user comment to include in analysis
 */
export function getLearningCategory(content: string, comment?: string): LearningCategory {
  const text = `${content} ${comment || ""}`.toLowerCase();

  // ALGORITHM indicators - task execution/approach issues (check first)
  const algorithmIndicators = [
    /over.?engineer/,
    /wrong approach/,
    /should have asked/,
    /didn't follow/,
    /missed the point/,
    /too complex/,
    /didn't understand/,
    /wrong direction/,
    /not what i wanted/,
    /approach|method|strategy|reasoning/,
  ];

  // SYSTEM indicators - tooling/infrastructure issues
  const systemIndicators = [
    /hook|crash|broken/,
    /tool|config|deploy|path/,
    /import|module|file.*not.*found/,
    /typescript|javascript|npm|bun/,
  ];

  // Check ALGORITHM first (user feedback about approach is valuable)
  for (const pattern of algorithmIndicators) {
    if (pattern.test(text)) return "ALGORITHM";
  }

  for (const pattern of systemIndicators) {
    if (pattern.test(text)) return "SYSTEM";
  }

  // Default: learnings reflect task quality → ALGORITHM
  return "ALGORITHM";
}

/**
 * Alias for getLearningCategory - matches PAI API
 */
export function classifySignal(content: string, comment?: string): LearningCategory {
  return getLearningCategory(content, comment);
}

/**
 * Determine if a response represents a learning moment
 */
export function isLearningCapture(text: string, summary?: string, analysis?: string): boolean {
  const learningIndicators = [
    /problem|issue|bug|error|failed|broken/i,
    /fixed|solved|resolved|discovered|realized|learned/i,
    /troubleshoot|debug|investigate|root cause/i,
    /lesson|takeaway|now we know|next time/i,
  ];

  const checkText = `${summary || ""} ${analysis || ""} ${text}`;

  let indicatorCount = 0;
  for (const pattern of learningIndicators) {
    if (pattern.test(checkText)) {
      indicatorCount++;
    }
  }

  // If 2+ learning indicators, consider it a learning
  return indicatorCount >= 2;
}

/**
 * Capture a learning signal for a session
 * Returns the signal object for further processing
 */
export function captureSignal(
  sessionId: string,
  type: LearningCategory,
  content: string,
  options?: { rating?: number; comment?: string }
): LearningSignal {
  const signal: LearningSignal = {
    sessionId,
    type,
    content,
    timestamp: getISOTimestamp(),
    rating: options?.rating,
    comment: options?.comment,
  };

  fileLog(`Captured ${type} learning signal for session ${sessionId.slice(0, 8)}`, "debug");
  return signal;
}

/**
 * Store a learning signal to disk
 * Writes to MEMORY/LEARNING/{type}/{YYYY-MM}/ directory
 */
export function storeSignal(signal: LearningSignal): boolean {
  try {
    const learningDir = getMemoryPath("LEARNING", signal.type, getYearMonth());
    
    if (!existsSync(learningDir)) {
      mkdirSync(learningDir, { recursive: true });
    }

    const timestamp = signal.timestamp.replace(/[:.]/g, "-").slice(0, 19);
    const filename = `${timestamp}_LEARNING_${signal.sessionId.slice(0, 8)}.md`;
    const filePath = join(learningDir, filename);

    // Build markdown content
    const content = `---
type: ${signal.type}
session: ${signal.sessionId}
timestamp: ${signal.timestamp}
rating: ${signal.rating || "N/A"}
---

# Learning Signal

**Category:** ${signal.type}

**Feedback:** ${signal.content}

${signal.comment ? `**Comment:** ${signal.comment}` : ""}
`;

    // Atomic write: temp → rename
    const tempPath = `${filePath}.tmp`;
    writeFileSync(tempPath, content, "utf-8");
    renameSync(tempPath, filePath);

    fileLog(`Stored learning signal to ${filename}`, "debug");
    return true;
  } catch (error) {
    fileLog(`Failed to store learning signal: ${error}`, "error");
    return false;
  }
}
