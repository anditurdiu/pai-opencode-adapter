import { describe, expect, test } from "bun:test";
import {
  validateOutput,
  checkQuality,
  hasRedFlags,
  isValidVoiceCompletion,
  isValidWorkingTitle,
  isValidCompletionTitle,
  isValidQuestionTitle,
  gerundToPastTense,
} from "../../lib/output-validators.js";

describe("output-validators", () => {
  describe("validateOutput", () => {
    test("returns invalid for empty content", () => {
      const result = validateOutput("");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Empty content");
    });

    test("returns invalid for very short content", () => {
      const result = validateOutput("hi");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Content too short");
    });

    test("returns invalid for content with red flags", () => {
      const result = validateOutput("Sorry, I cannot help with that");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Contains red flag patterns");
    });

    test("returns valid for good content", () => {
      const result = validateOutput("Successfully implemented the feature as requested");
      expect(result.valid).toBe(true);
    });
  });

  describe("checkQuality", () => {
    test("returns 0 for empty text", () => {
      expect(checkQuality("")).toBe(0);
    });

    test("increases score for quality indicators", () => {
      const score = checkQuality("Completed the task successfully");
      expect(score).toBeGreaterThan(50);
    });

    test("decreases score for red flags", () => {
      const score = checkQuality("Error: failed to complete");
      expect(score).toBeLessThan(50);
    });

    test("clamps score between 0 and 100", () => {
      expect(checkQuality("")).toBeGreaterThanOrEqual(0);
      expect(checkQuality("a".repeat(1000))).toBeLessThanOrEqual(100);
    });
  });

  describe("hasRedFlags", () => {
    test("returns true for error patterns", () => {
      expect(hasRedFlags("error occurred")).toBe(true);
      expect(hasRedFlags("failed to complete")).toBe(true);
      expect(hasRedFlags("I cannot do that")).toBe(true);
      expect(hasRedFlags("unable to proceed")).toBe(true);
    });

    test("returns false for normal text", () => {
      expect(hasRedFlags("completed successfully")).toBe(false);
      expect(hasRedFlags("task done")).toBe(false);
    });

    test("returns false for empty text", () => {
      expect(hasRedFlags("")).toBe(false);
    });
  });

  describe("isValidVoiceCompletion", () => {
    test("returns false for short text", () => {
      expect(isValidVoiceCompletion("hi")).toBe(false);
      expect(isValidVoiceCompletion("done")).toBe(false);
    });

    test("returns false for garbage patterns", () => {
      expect(isValidVoiceCompletion("Thank you for your help")).toBe(false);
      expect(isValidVoiceCompletion("I appreciate your assistance")).toBe(false);
    });

    test("returns true for valid completion", () => {
      expect(isValidVoiceCompletion("Successfully fixed the authentication bug in the login module")).toBe(true);
    });
  });

  describe("isValidWorkingTitle", () => {
    test("returns true for gerund titles", () => {
      expect(isValidWorkingTitle("Fixing the bug.")).toBe(true);
      expect(isValidWorkingTitle("Updating the config.")).toBe(true);
    });

    test("returns false for non-gerund titles", () => {
      expect(isValidWorkingTitle("Fixed the bug.")).toBe(false);
      expect(isValidWorkingTitle("Task complete.")).toBe(false);
    });

    test("returns false for titles without period", () => {
      expect(isValidWorkingTitle("Fixing the bug")).toBe(false);
    });
  });

  describe("isValidCompletionTitle", () => {
    test("returns true for past tense titles", () => {
      expect(isValidCompletionTitle("Fixed the bug.")).toBe(true);
      expect(isValidCompletionTitle("Deployed the fix.")).toBe(true);
    });

    test("returns false for gerund titles", () => {
      expect(isValidCompletionTitle("Fixing the bug.")).toBe(false);
    });
  });

  describe("isValidQuestionTitle", () => {
    test("returns true for valid question titles", () => {
      expect(isValidQuestionTitle("Auth method")).toBe(true);
      expect(isValidQuestionTitle("Config option")).toBe(true);
    });

    test("returns false for titles with period", () => {
      expect(isValidQuestionTitle("Auth method.")).toBe(false);
    });

    test("returns false for titles over 30 chars", () => {
      expect(isValidQuestionTitle("This is a very long question title that exceeds")).toBe(false);
    });
  });

  describe("gerundToPastTense", () => {
    test("converts regular gerunds to past tense", () => {
      expect(gerundToPastTense("fixing")).toBe("Fixed");
      expect(gerundToPastTense("updating")).toBe("Updated");
      expect(gerundToPastTense("creating")).toBe("Created");
    });

    test("handles irregular gerunds", () => {
      expect(gerundToPastTense("building")).toBe("Built");
      expect(gerundToPastTense("running")).toBe("Ran");
      expect(gerundToPastTense("writing")).toBe("Wrote");
    });

    test("returns unchanged for non-gerunds", () => {
      expect(gerundToPastTense("fixed")).toBe("fixed");
      expect(gerundToPastTense("abc")).toBe("abc");
    });
  });
});
