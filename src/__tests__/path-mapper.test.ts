import { expect, test, describe } from "bun:test";
import { PATHS, resolvePAIPath, isPAIInstalled } from "../generators/path-mapper.js";

describe("path-mapper", () => {
  test("resolvePAIPath returns string ending with agents/", () => {
    const result = resolvePAIPath("agents/");
    expect(result).toMatch(/\/agents\/$/);
  });

  test("resolvePAIPath uses HOME not hardcoded path", () => {
    const result = resolvePAIPath("agents/");
    expect(result).toContain(process.env.HOME || "");
  });

  test("resolvePAIPath handles paths with leading slash", () => {
    const result = resolvePAIPath("/agents/");
    expect(result).toMatch(/\/agents\/$/);
  });

  test("resolvePAIPath handles paths with leading tilde", () => {
    const result = resolvePAIPath("~/agents/");
    expect(result).toMatch(/\/agents\/$/);
  });

  test("resolvePAIPath throws without HOME", () => {
    const originalHome = process.env.HOME;
    process.env.HOME = "";
    
    expect(() => resolvePAIPath("agents/")).toThrow("HOME environment variable not set");
    
    process.env.HOME = originalHome;
  });

  test("PATHS.PAI_AGENTS returns correct path", () => {
    const result = PATHS.PAI_AGENTS();
    expect(result).toMatch(/\/\.claude\/agents$/);
  });

  test("PATHS.PAI_TELOS uses PAI/USER/TELOS not PAI/TELOS", () => {
    const result = PATHS.PAI_TELOS();
    expect(result).toContain("/.claude/PAI/USER/TELOS");
    expect(result).not.toContain("/.claude/PAI/TELOS");
  });

  test("PATHS.PAI_SETTINGS returns settings.json path", () => {
    const result = PATHS.PAI_SETTINGS();
    expect(result).toMatch(/\/\.claude\/settings\.json$/);
  });

  test("PATHS.LOG_FILE is /tmp/pai-opencode-debug.log", () => {
    expect(PATHS.LOG_FILE).toBe("/tmp/pai-opencode-debug.log");
  });

  test("isPAIInstalled returns boolean", () => {
    const result = isPAIInstalled();
    expect(typeof result).toBe("boolean");
  });
});
