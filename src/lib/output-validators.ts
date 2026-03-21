/**
 * output-validators.ts - Output validation utilities (quality checks)
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 * Ported from PAI v4.0.3 hooks/lib/output-validators.ts
 *
 * Functions:
 *   validateOutput() - Validate output content for quality
 *   checkQuality() - Check quality indicators in text
 *   hasRedFlags() - Check for red flag patterns in text
 *   isValidVoiceCompletion() - Check if voice completion is valid for TTS
 *   isValidWorkingTitle() - Check if working title is valid
 *   isValidCompletionTitle() - Check if completion title is valid
 */

import { fileLog } from "./file-logger.js";

// Conversational filler — always invalid for voice output
const GARBAGE_PATTERNS = [
  /appreciate/i,
  /thank/i,
  /welcome/i,
  /help(ing)? you/i,
  /assist(ing)? you/i,
  /reaching out/i,
  /happy to/i,
  /let me know/i,
  /feel free/i,
];

// Conversational starters — not factual summaries
const CONVERSATIONAL_STARTERS = [
  /^I'm /i,
  /^I am /i,
  /^Sure[,.]?/i,
  /^OK[,.]?/i,
  /^Got it[,.]?/i,
  /^Done\.?$/i,
  /^Yes[,.]?/i,
  /^No[,.]?/i,
  /^Okay[,.]?/i,
  /^Alright[,.]?/i,
];

// Single-word garbage
const SINGLE_WORD_BLOCKLIST = new Set([
  "ready",
  "done",
  "ok",
  "okay",
  "yes",
  "no",
  "sure",
  "hello",
  "hi",
  "hey",
  "thanks",
  "working",
  "processing",
]);

// Quality indicators
const QUALITY_INDICATORS = [
  /completed/i,
  /fixed/i,
  /resolved/i,
  /implemented/i,
  /updated/i,
  /created/i,
  /added/i,
  /removed/i,
  /refactored/i,
];

// Red flag patterns
const RED_FLAG_PATTERNS = [
  /error/i,
  /failed/i,
  /cannot/i,
  /unable to/i,
  /not possible/i,
  /sorry/i,
  /apologize/i,
  /i don't know/i,
  /unclear/i,
  /undefined/i,
  /null/i,
  /NaN/i,
];

// Incomplete endings — dangling articles, prepositions, conjunctions, adverbs
const INCOMPLETE_ENDINGS = new Set([
  "the",
  "a",
  "an",
  "to",
  "for",
  "with",
  "of",
  "in",
  "on",
  "at",
  "by",
  "from",
  "into",
  "about",
  "and",
  "or",
  "but",
  "that",
  "which",
  "now",
  "then",
  "still",
  "also",
  "just",
  "only",
  "even",
  "very",
  "quite",
  "rather",
  "really",
  "here",
  "there",
]);

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate output content for quality
 */
export function validateOutput(content: string): ValidationResult {
  if (!content || content.trim().length === 0) {
    return { valid: false, reason: "Empty content" };
  }

  if (content.length < 10) {
    return { valid: false, reason: "Content too short" };
  }

  // Check for red flags
  if (hasRedFlags(content)) {
    return { valid: false, reason: "Contains red flag patterns" };
  }

  return { valid: true };
}

/**
 * Check quality indicators in text
 * Returns a score from 0-100 based on quality indicators
 */
export function checkQuality(text: string): number {
  if (!text || text.trim().length === 0) return 0;

  let score = 50; // Base score

  // Add points for quality indicators
  for (const pattern of QUALITY_INDICATORS) {
    if (pattern.test(text)) {
      score += 10;
    }
  }

  // Subtract points for red flags
  for (const pattern of RED_FLAG_PATTERNS) {
    if (pattern.test(text)) {
      score -= 15;
    }
  }

  // Ensure score is within bounds
  return Math.max(0, Math.min(100, score));
}

/**
 * Check for red flag patterns in text
 */
export function hasRedFlags(text: string): boolean {
  if (!text) return false;

  const lowerText = text.toLowerCase();
  
  for (const pattern of RED_FLAG_PATTERNS) {
    if (pattern.test(lowerText)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a voice completion is valid for TTS.
 */
export function isValidVoiceCompletion(text: string): boolean {
  if (!text || text.length < 10) return false;

  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount === 1) {
    const lower = text.toLowerCase().replace(/[^a-z]/g, "");
    if (SINGLE_WORD_BLOCKLIST.has(lower) || lower.length < 10) return false;
  }

  for (const p of GARBAGE_PATTERNS) if (p.test(text)) return false;

  if (text.length < 40) {
    if (/\bready\b/i.test(text) || /\bhello\b/i.test(text)) return false;
  }

  for (const p of CONVERSATIONAL_STARTERS) if (p.test(text)) return false;

  return true;
}

/**
 * Get fallback for invalid voice completions
 */
export function getVoiceFallback(): string {
  return ""; // Intentionally empty — invalid voice completions should be skipped
}

/**
 * Shared base validation: 2-4 words, period, no garbage, no incomplete endings.
 */
function isValidTitleBase(text: string): { valid: boolean; firstWord: string } {
  if (!text || text.length < 5) return { valid: false, firstWord: "" };
  if (!text.endsWith(".")) return { valid: false, firstWord: "" };

  const content = text.slice(0, -1).trim();
  const words = content.split(/\s+/);
  if (words.length < 2 || words.length > 4) return { valid: false, firstWord: "" };

  const firstWord = words[0]?.toLowerCase() ?? "";

  // Reject generic garbage (both gerund and past-tense forms)
  if (
    /^(completed?|proces{1,2}e?d|processing|handled|handling|finished|finishing|worked|working|done|analyzed?) (the |on )?(task|request|work|it|input)$/i.test(
      content
    )
  ) {
    return { valid: false, firstWord };
  }

  // Reject first-person pronouns
  const lower = content.toLowerCase();
  if (/\bi\b/.test(lower) || /\bme\b/.test(lower) || /\bmy\b/.test(lower)) {
    return { valid: false, firstWord };
  }

  // Reject dangling/incomplete endings
  const lastWord = words[words.length - 1]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (INCOMPLETE_ENDINGS.has(lastWord)) return { valid: false, firstWord };

  // Reject single-character last words
  if (lastWord.length <= 1) return { valid: false, firstWord };

  // Reject long adverbs ending in "-ly"
  if (lastWord.endsWith("ly") && lastWord.length > 5)
    return { valid: false, firstWord };

  return { valid: true, firstWord };
}

/**
 * Working-phase title: MUST start with gerund (-ing verb).
 */
export function isValidWorkingTitle(text: string): boolean {
  const { valid, firstWord } = isValidTitleBase(text);
  if (!valid) return false;
  return firstWord.endsWith("ing");
}

/**
 * Completion-phase title: must NOT start with gerund.
 */
export function isValidCompletionTitle(text: string): boolean {
  const { valid, firstWord } = isValidTitleBase(text);
  if (!valid) return false;
  if (firstWord.endsWith("ing")) return false;
  return true;
}

/**
 * Question-phase title: noun phrase, no period, 1-4 words, max 30 chars.
 */
export function isValidQuestionTitle(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  if (text.endsWith(".")) return false;
  if (text.length > 30) return false;
  const words = text.trim().split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  if (/<[^>]*>/.test(text)) return false;
  return true;
}

/**
 * Try progressively shorter word counts until valid.
 */
export function trimToValidTitle(
  words: string[],
  validator: (text: string) => boolean,
  maxWords: number = 4
): string | null {
  const limit = Math.min(words.length, maxWords);
  for (let n = limit; n >= 2; n--) {
    let candidate = words
      .slice(0, n)
      .join(" ")
      .replace(/[,;:!?\-\u2014]+$/, "")
      .trim();
    if (!candidate.endsWith(".")) candidate += ".";
    if (validator(candidate)) return candidate;
  }
  return null;
}

/**
 * Get fallback for working title
 */
export function getWorkingFallback(): string {
  return "Analyzing input.";
}

/**
 * Get fallback for completion title
 */
export function getCompletionFallback(): string {
  return "Task complete.";
}

/**
 * Get fallback for question title
 */
export function getQuestionFallback(): string {
  return "Awaiting input";
}

// Irregular past tense mappings
const IRREGULAR_PAST: Record<string, string> = {
  building: "Built",
  running: "Ran",
  writing: "Wrote",
  reading: "Read",
  making: "Made",
  finding: "Found",
  getting: "Got",
  setting: "Set",
  doing: "Did",
  sending: "Sent",
  keeping: "Kept",
  putting: "Put",
  losing: "Lost",
  telling: "Told",
  understanding: "Understood",
};

/**
 * Convert a gerund to past tense: "Fixing" → "Fixed", "Building" → "Built".
 */
export function gerundToPastTense(gerund: string): string {
  const lower = gerund.toLowerCase();

  // Check irregular map first
  if (IRREGULAR_PAST[lower]) return IRREGULAR_PAST[lower];

  if (!lower.endsWith("ing") || lower.length < 5) return gerund;
  const stem = lower.slice(0, -3);

  // Regular: stem + "ed"
  const result = stem + "ed";
  return result.charAt(0).toUpperCase() + result.slice(1);
}
