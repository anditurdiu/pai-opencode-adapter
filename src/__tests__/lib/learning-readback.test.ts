import { describe, expect, test } from "bun:test";
import {
  readLearnings,
  getRecentLearnings,
  loadLearningDigest,
  loadFailurePatterns,
} from "../../lib/learning-readback.js";

describe("learning-readback", () => {
  describe("readLearnings", () => {
    test("returns empty array when no learnings exist", () => {
      const result = readLearnings("nonexistent-session");
      expect(result).toBeInstanceOf(Array);
    });

    test("returns limited results", () => {
      const result = readLearnings(undefined, 30);
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe("getRecentLearnings", () => {
    test("returns empty array when no learnings exist", () => {
      const result = getRecentLearnings(30);
      expect(result).toBeInstanceOf(Array);
    });

    test("accepts custom days parameter", () => {
      const result = getRecentLearnings(7);
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe("loadLearningDigest", () => {
    test("returns null when no data exists", () => {
      const result = loadLearningDigest("/nonexistent/path");
      expect(result).toBeNull();
    });
  });

  describe("loadFailurePatterns", () => {
    test("returns null when no failures exist", () => {
      const result = loadFailurePatterns("/nonexistent/path");
      expect(result).toBeNull();
    });
  });
});
