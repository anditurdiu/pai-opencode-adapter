import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  getLearningCategory,
  classifySignal,
  isLearningCapture,
  captureSignal,
  storeSignal,
  type LearningSignal,
  type LearningCategory,
} from "../../lib/learning-utils.js";

describe("learning-utils", () => {
  describe("getLearningCategory", () => {
    test("returns ALGORITHM for task execution issues", () => {
      expect(getLearningCategory("wrong approach to the problem")).toBe("ALGORITHM");
      expect(getLearningCategory("didn't follow the requirements")).toBe("ALGORITHM");
      expect(getLearningCategory("too complex implementation")).toBe("ALGORITHM");
      expect(getLearningCategory("not what i wanted")).toBe("ALGORITHM");
    });

    test("returns SYSTEM for tooling issues", () => {
      expect(getLearningCategory("hook crashed during execution")).toBe("SYSTEM");
      expect(getLearningCategory("config file not found")).toBe("SYSTEM");
      expect(getLearningCategory("typescript compilation error")).toBe("SYSTEM");
      expect(getLearningCategory("import module failed")).toBe("SYSTEM");
    });

    test("returns ALGORITHM as default", () => {
      expect(getLearningCategory("some random feedback")).toBe("ALGORITHM");
      expect(getLearningCategory("")).toBe("ALGORITHM");
    });

    test("combines content and comment for analysis", () => {
      expect(getLearningCategory("good work", "but wrong approach")).toBe("ALGORITHM");
      expect(getLearningCategory("nice output", "hook failed though")).toBe("SYSTEM");
    });
  });

  describe("classifySignal", () => {
    test("is an alias for getLearningCategory", () => {
      expect(classifySignal("wrong approach")).toBe("ALGORITHM");
      expect(classifySignal("hook error")).toBe("SYSTEM");
    });
  });

  describe("isLearningCapture", () => {
    test("returns true for learning moments with 2+ indicators", () => {
      expect(isLearningCapture("problem solved after debugging")).toBe(true);
      expect(isLearningCapture("fixed the issue, lesson learned")).toBe(true);
      expect(isLearningCapture("error resolved, now we know")).toBe(true);
    });

    test("returns false for content with fewer than 2 indicators", () => {
      expect(isLearningCapture("just some text")).toBe(false);
      expect(isLearningCapture("problem only")).toBe(false);
      expect(isLearningCapture("")).toBe(false);
    });

    test("combines text, summary, and analysis", () => {
      expect(isLearningCapture("", "problem found", "debug completed")).toBe(true);
    });
  });

  describe("captureSignal", () => {
    test("creates a learning signal object", () => {
      const signal = captureSignal("session-123", "ALGORITHM", "Fixed the bug", { rating: 8, comment: "Great work" });
      
      expect(signal.sessionId).toBe("session-123");
      expect(signal.type).toBe("ALGORITHM");
      expect(signal.content).toBe("Fixed the bug");
      expect(signal.rating).toBe(8);
      expect(signal.comment).toBe("Great work");
      expect(signal.timestamp).toBeDefined();
    });

    test("creates signal without optional fields", () => {
      const signal = captureSignal("session-456", "SYSTEM", "Hook error");
      
      expect(signal.rating).toBeUndefined();
      expect(signal.comment).toBeUndefined();
    });
  });
});
