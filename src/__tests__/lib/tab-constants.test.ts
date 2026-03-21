import { describe, expect, test } from "bun:test";
import {
  TAB_COLORS,
  PHASE_TAB_CONFIG,
  ACTIVE_TAB_BG,
  ACTIVE_TAB_FG,
  INACTIVE_TAB_FG,
  getPhaseTabConfig,
  getTabColor,
  type TabState,
} from "../../lib/tab-constants.js";

describe("tab-constants", () => {
  describe("TAB_COLORS", () => {
    test("has all required states", () => {
      expect(TAB_COLORS).toHaveProperty("thinking");
      expect(TAB_COLORS).toHaveProperty("working");
      expect(TAB_COLORS).toHaveProperty("question");
      expect(TAB_COLORS).toHaveProperty("completed");
      expect(TAB_COLORS).toHaveProperty("error");
      expect(TAB_COLORS).toHaveProperty("idle");
    });

    test("each state has required properties", () => {
      for (const state of Object.values(TAB_COLORS)) {
        expect(state).toHaveProperty("inactiveBg");
        expect(state).toHaveProperty("label");
      }
    });
  });

  describe("PHASE_TAB_CONFIG", () => {
    test("has all algorithm phases", () => {
      expect(PHASE_TAB_CONFIG).toHaveProperty("OBSERVE");
      expect(PHASE_TAB_CONFIG).toHaveProperty("THINK");
      expect(PHASE_TAB_CONFIG).toHaveProperty("PLAN");
      expect(PHASE_TAB_CONFIG).toHaveProperty("BUILD");
      expect(PHASE_TAB_CONFIG).toHaveProperty("EXECUTE");
      expect(PHASE_TAB_CONFIG).toHaveProperty("VERIFY");
      expect(PHASE_TAB_CONFIG).toHaveProperty("LEARN");
      expect(PHASE_TAB_CONFIG).toHaveProperty("COMPLETE");
      expect(PHASE_TAB_CONFIG).toHaveProperty("IDLE");
    });

    test("each phase has required properties", () => {
      for (const config of Object.values(PHASE_TAB_CONFIG)) {
        expect(config).toHaveProperty("symbol");
        expect(config).toHaveProperty("inactiveBg");
        expect(config).toHaveProperty("label");
        expect(config).toHaveProperty("gerund");
      }
    });
  });

  describe("getPhaseTabConfig", () => {
    test("returns config for valid phase", () => {
      const config = getPhaseTabConfig("THINK");
      expect(config).toBeDefined();
      expect(config?.symbol).toBe("🧠");
    });

    test("returns undefined for invalid phase", () => {
      const config = getPhaseTabConfig("INVALID");
      expect(config).toBeUndefined();
    });

    test("case-insensitive lookup", () => {
      const config = getPhaseTabConfig("think");
      expect(config).toBeDefined();
    });
  });

  describe("getTabColor", () => {
    test("returns color for valid state", () => {
      const color = getTabColor("working");
      expect(color).toBeDefined();
      expect(color.inactiveBg).toBe("#804000");
    });

    test("returns idle color for invalid state", () => {
      const color = getTabColor("invalid" as TabState);
      expect(color).toBe(TAB_COLORS.idle);
    });
  });

  test("color constants are valid hex colors", () => {
    expect(ACTIVE_TAB_BG).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(ACTIVE_TAB_FG).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(INACTIVE_TAB_FG).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
