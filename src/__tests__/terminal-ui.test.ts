import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  detectTerminal,
  generateTabTitle,
  generateTabColor,
  updateTabTitle,
  updateTabColor,
  onTaskStart,
  onPlanModeActivated,
  onError,
  onSessionEnd,
  type TerminalType,
  type TabColorState,
} from "../handlers/terminal-ui.js";

const OSC = "\x1b]";
const BEL = "\x07";

describe("detectTerminal", () => {
  afterEach(() => {
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.TERM_PROGRAM;
    delete process.env.TERM;
  });

  it("returns 'kitty' when KITTY_WINDOW_ID is set", () => {
    process.env.KITTY_WINDOW_ID = "1";
    expect(detectTerminal()).toBe("kitty");
  });

  it("returns 'iterm2' when TERM_PROGRAM=iTerm.app", () => {
    delete process.env.KITTY_WINDOW_ID;
    process.env.TERM_PROGRAM = "iTerm.app";
    expect(detectTerminal()).toBe("iterm2");
  });

  it("returns 'basic' when TERM is set but not kitty/iterm2", () => {
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.TERM_PROGRAM;
    process.env.TERM = "xterm-256color";
    expect(detectTerminal()).toBe("basic");
  });

  it("returns 'none' when no terminal env vars set", () => {
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.TERM_PROGRAM;
    delete process.env.TERM;
    expect(detectTerminal()).toBe("none");
  });

  it("kitty takes priority over TERM_PROGRAM", () => {
    process.env.KITTY_WINDOW_ID = "2";
    process.env.TERM_PROGRAM = "iTerm.app";
    expect(detectTerminal()).toBe("kitty");
  });
});

describe("generateTabTitle", () => {
  it("produces correct OSC escape sequence", () => {
    const title = generateTabTitle("Building auth module");
    expect(title).toBe(`${OSC}2;PAI: Building auth module${BEL}`);
  });

  it("truncates long titles to 60 chars", () => {
    const longTitle = "a".repeat(80);
    const result = generateTabTitle(longTitle);
    expect(result).toBe(`${OSC}2;PAI: ${"a".repeat(60)}${BEL}`);
  });

  it("handles empty string", () => {
    const result = generateTabTitle("");
    expect(result).toBe(`${OSC}2;PAI: ${BEL}`);
  });

  it("preserves special characters in title", () => {
    const result = generateTabTitle("test: auth/login");
    expect(result).toContain("test: auth/login");
  });
});

describe("generateTabColor", () => {
  it("active state contains 00ff88", () => {
    const result = generateTabColor("active");
    expect(result).toContain("00ff88");
  });

  it("plan state contains ffcc00", () => {
    const result = generateTabColor("plan");
    expect(result).toContain("ffcc00");
  });

  it("error state contains ff4444", () => {
    const result = generateTabColor("error");
    expect(result).toContain("ff4444");
  });

  it("idle state contains 888888", () => {
    const result = generateTabColor("idle");
    expect(result).toContain("888888");
  });

  it("produces OSC 1337 SetTabColor sequence", () => {
    const result = generateTabColor("active");
    expect(result).toContain("1337;SetTabColor=");
    expect(result.startsWith(OSC)).toBe(true);
    expect(result.endsWith(BEL)).toBe(true);
  });
});

describe("updateTabTitle", () => {
  afterEach(() => {
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.TERM_PROGRAM;
    delete process.env.TERM;
  });

  it("does not throw when terminal is none", () => {
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.TERM_PROGRAM;
    delete process.env.TERM;
    expect(() => updateTabTitle("test task")).not.toThrow();
  });

  it("writes escape sequence when terminal detected", () => {
    process.env.KITTY_WINDOW_ID = "1";
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => { writes.push(data); return true; }) as typeof process.stdout.write;
    try {
      updateTabTitle("my task");
      expect(writes.some((w) => w.includes("PAI: my task"))).toBe(true);
    } finally {
      process.stdout.write = original;
    }
  });
});

describe("updateTabColor", () => {
  afterEach(() => {
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.TERM_PROGRAM;
    delete process.env.TERM;
  });

  it("does not throw on non-kitty terminal", () => {
    delete process.env.KITTY_WINDOW_ID;
    process.env.TERM = "xterm";
    expect(() => updateTabColor("error")).not.toThrow();
  });

  it("does not throw when terminal is none", () => {
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.TERM_PROGRAM;
    delete process.env.TERM;
    expect(() => updateTabColor("active")).not.toThrow();
  });

  it("writes color sequence on kitty terminal", () => {
    process.env.KITTY_WINDOW_ID = "1";
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => { writes.push(data); return true; }) as typeof process.stdout.write;
    try {
      updateTabColor("error");
      expect(writes.some((w) => w.includes("ff4444"))).toBe(true);
    } finally {
      process.stdout.write = original;
    }
  });
});

describe("high-level event handlers", () => {
  afterEach(() => {
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.TERM_PROGRAM;
    delete process.env.TERM;
  });

  it("onTaskStart does not throw", () => {
    expect(() => onTaskStart("building feature X")).not.toThrow();
  });

  it("onPlanModeActivated does not throw", () => {
    expect(() => onPlanModeActivated()).not.toThrow();
  });

  it("onError does not throw", () => {
    expect(() => onError()).not.toThrow();
  });

  it("onSessionEnd does not throw", () => {
    expect(() => onSessionEnd()).not.toThrow();
  });
});
