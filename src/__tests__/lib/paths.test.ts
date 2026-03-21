import { describe, expect, test } from "bun:test";
import {
  getPAIPath,
  getAdapterPath,
  getMemoryPath,
  expandPath,
  slugify,
  generateSessionId,
  getYearMonth,
  getDateString,
} from "../../lib/paths.js";

describe("paths", () => {
  describe("expandPath", () => {
    test("expands $HOME variable", () => {
      const result = expandPath("$HOME/test");
      expect(result).toContain("/test");
    });

    test("expands ${HOME} variable", () => {
      const result = expandPath("${HOME}/test");
      expect(result).toContain("/test");
    });

    test("expands tilde", () => {
      const result = expandPath("~/test");
      expect(result).toContain("/test");
    });

    test("returns unchanged path without variables", () => {
      expect(expandPath("/absolute/path")).toBe("/absolute/path");
    });
  });

  describe("getPAIPath", () => {
    test("returns path with segments", () => {
      const result = getPAIPath("MEMORY", "WORK");
      expect(result).toContain("MEMORY");
      expect(result).toContain("WORK");
    });
  });

  describe("getAdapterPath", () => {
    test("returns path with segments", () => {
      const result = getAdapterPath("config.json");
      expect(result).toContain("config.json");
    });
  });

  describe("getMemoryPath", () => {
    test("returns memory path with segments", () => {
      const result = getMemoryPath("WORK", "sessions");
      expect(result).toContain("MEMORY");
      expect(result).toContain("WORK");
      expect(result).toContain("sessions");
    });
  });

  describe("slugify", () => {
    test("converts text to slug", () => {
      expect(slugify("Hello World")).toBe("hello-world");
      expect(slugify("Test 123!@#")).toBe("test-123");
    });

    test("truncates long text", () => {
      const longText = "a".repeat(100);
      expect(slugify(longText).length).toBeLessThanOrEqual(50);
    });

    test("removes leading and trailing hyphens", () => {
      expect(slugify("---test---")).toBe("test");
    });
  });

  describe("generateSessionId", () => {
    test("generates unique session IDs", () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
    });

    test("includes timestamp", () => {
      const id = generateSessionId();
      expect(id).toMatch(/^\d{14}_\w{4}$/);
    });
  });

  describe("getYearMonth", () => {
    test("returns YYYY-MM format", () => {
      const result = getYearMonth();
      expect(result).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe("getDateString", () => {
    test("returns YYYY-MM-DD format", () => {
      const result = getDateString();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
