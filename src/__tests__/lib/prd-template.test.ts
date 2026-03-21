import { describe, expect, test } from "bun:test";
import {
  curateTitle,
  generatePRDFilename,
  generatePRDId,
  generatePRDTemplate,
  type PRDOptions,
} from "../../lib/prd-template.js";

describe("prd-template", () => {
  describe("curateTitle", () => {
    test("removes filler words from start", () => {
      expect(curateTitle("okay let's fix this")).toBe("Let's fix this");
      expect(curateTitle("please can you help me")).toBe("Can you help me");
    });

    test("removes profanity", () => {
      expect(curateTitle("fix this damn bug")).toBe("Fix this bug");
      expect(curateTitle("what the fuck is this")).toBe("What is this");
    });

    test("removes profanity", () => {
      expect(curateTitle("fix this damn bug")).toBe("Fix this bug");
      expect(curateTitle("what the fuck is this")).toBe("What is this");
    });

    test("capitalizes first letter", () => {
      expect(curateTitle("fix the bug")).toBe("Fix the bug");
    });

    test("truncates long titles", () => {
      const longTitle = "a".repeat(100);
      expect(curateTitle(longTitle).length).toBeLessThanOrEqual(80);
    });

    test("returns fallback for empty input", () => {
      expect(curateTitle("")).toBe("Untitled Task");
    });
  });

  describe("generatePRDFilename", () => {
    test("generates filename with date and slug", () => {
      const result = generatePRDFilename("my-task");
      expect(result).toMatch(/^PRD-\d{8}-my-task\.md$/);
    });
  });

  describe("generatePRDId", () => {
    test("generates ID with date and slug", () => {
      const result = generatePRDId("my-task");
      expect(result).toMatch(/^PRD-\d{8}-my-task$/);
    });
  });

  describe("generatePRDTemplate", () => {
    test("generates PRD with required sections", () => {
      const opts: PRDOptions = {
        title: "Test Task",
        slug: "test-task",
        sessionId: "session-123",
      };
      const result = generatePRDTemplate(opts);

      expect(result).toContain("---");
      expect(result).toContain("title:");
      expect(result).toContain("# Test Task");
      expect(result).toContain("## STATUS");
      expect(result).toContain("## APPETITE");
      expect(result).toContain("## CONTEXT");
      expect(result).toContain("## PLAN");
    });

    test("includes prompt when provided", () => {
      const opts: PRDOptions = {
        title: "Test Task",
        slug: "test-task",
        prompt: "This is the problem to solve",
      };
      const result = generatePRDTemplate(opts);
      expect(result).toContain("This is the problem to solve");
    });

    test("uses effort level for appetite", () => {
      const opts: PRDOptions = {
        title: "Test Task",
        slug: "test-task",
        effortLevel: "QUICK",
      };
      const result = generatePRDTemplate(opts);
      expect(result).toContain("QUICK");
      expect(result).toContain("<1min");
    });
  });
});
