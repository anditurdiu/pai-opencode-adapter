import { describe, expect, test } from "bun:test";
import {
  detectChanges,
  summarizeChanges,
  categorizeChange,
  determineSignificance,
  inferChangeType,
  type FileChange,
} from "../../lib/change-detection.js";

describe("change-detection", () => {
  describe("detectChanges", () => {
    test("detects new files", () => {
      const before = ["/path/a.ts"];
      const after = ["/path/a.ts", "/path/b.ts"];
      const changes = detectChanges(before, after);
      
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some(c => c.tool === "Write")).toBe(true);
    });

    test("detects modified files", () => {
      const before = ["/path/a.ts"];
      const after = ["/path/a.ts"];
      const changes = detectChanges(before, after);
      
      expect(changes.some(c => c.tool === "Edit")).toBe(true);
    });

    test("returns empty array for no changes", () => {
      const changes = detectChanges([], []);
      expect(changes).toEqual([]);
    });
  });

  describe("summarizeChanges", () => {
    test("returns message for no changes", () => {
      expect(summarizeChanges([])).toBe("No changes detected");
    });

    test("summarizes changes with counts", () => {
      const changes: FileChange[] = [
        { tool: "Write", path: "skills/test/SKILL.md", category: "skill", isPhilosophical: false, isStructural: true },
        { tool: "Edit", path: "hooks/test.ts", category: "hook", isPhilosophical: false, isStructural: false },
      ];
      const result = summarizeChanges(changes);
      expect(result).toContain("2 changes");
    });
  });

  describe("categorizeChange", () => {
    test("categorizes skill paths", () => {
      expect(categorizeChange("skills/test/SKILL.md")).toBe("skill");
    });

    test("categorizes hook paths", () => {
      expect(categorizeChange("hooks/test.hook.ts")).toBe("hook");
    });

    test("categorizes config paths", () => {
      expect(categorizeChange("settings.json")).toBe("config");
    });

    test("returns null for excluded paths", () => {
      expect(categorizeChange("MEMORY/WORK/test.json")).toBeNull();
      expect(categorizeChange("node_modules/test.ts")).toBeNull();
    });
  });

  describe("determineSignificance", () => {
    test("returns minor for single doc change", () => {
      const changes: FileChange[] = [
        { tool: "Edit", path: "docs/readme.md", category: "documentation", isPhilosophical: false, isStructural: false },
      ];
      expect(determineSignificance(changes)).toBe("minor");
    });

    test("returns major for structural changes", () => {
      const changes: FileChange[] = [
        { tool: "Write", path: "PAI/SYSTEM.md", category: "core-system", isPhilosophical: true, isStructural: true },
      ];
      expect(determineSignificance(changes)).toBe("major");
    });
  });

  describe("inferChangeType", () => {
    test("infers skill update", () => {
      const changes: FileChange[] = [
        { tool: "Edit", path: "skills/test/file.ts", category: "skill", isPhilosophical: false, isStructural: false },
      ];
      expect(inferChangeType(changes)).toBe("skill_update");
    });

    test("infers hook update", () => {
      const changes: FileChange[] = [
        { tool: "Edit", path: "hooks/test.ts", category: "hook", isPhilosophical: false, isStructural: false },
      ];
      expect(inferChangeType(changes)).toBe("hook_update");
    });

    test("infers multi area for multiple categories", () => {
      const changes: FileChange[] = [
        { tool: "Edit", path: "skills/test.ts", category: "skill", isPhilosophical: false, isStructural: false },
        { tool: "Edit", path: "hooks/test.ts", category: "hook", isPhilosophical: false, isStructural: false },
        { tool: "Edit", path: "config.json", category: "config", isPhilosophical: false, isStructural: false },
      ];
      expect(inferChangeType(changes)).toBe("multi_area");
    });
  });
});
