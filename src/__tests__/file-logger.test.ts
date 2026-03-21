import { expect, test, describe, beforeEach } from "bun:test";
import { fileLog, clearLog, getLogPath } from "../lib/file-logger.js";
import { readFileSync, existsSync } from "node:fs";

const LOG_PATH = "/tmp/pai-opencode-debug.log";

describe("file-logger", () => {
  beforeEach(() => {
    clearLog();
  });

  test("fileLog writes to log file with INFO level prefix", () => {
    fileLog("test message", "info");

    expect(existsSync(LOG_PATH)).toBe(true);

    const content = readFileSync(LOG_PATH, "utf-8");
    expect(content).toContain("[INFO ]");
    expect(content).toContain("test message");
  });

  test("fileLog includes ISO timestamp in output", () => {
    fileLog("timestamped message", "info");

    const content = readFileSync(LOG_PATH, "utf-8");
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
  });

  test("fileLog works with all log levels", () => {
    fileLog("debug msg", "debug");
    fileLog("warn msg", "warn");
    fileLog("error msg", "error");

    const content = readFileSync(LOG_PATH, "utf-8");
    expect(content).toContain("[DEBUG]");
    expect(content).toContain("[WARN ]");
    expect(content).toContain("[ERROR]");
  });

  test("clearLog empties the log file", () => {
    fileLog("message to clear", "info");
    expect(readFileSync(LOG_PATH, "utf-8").length).toBeGreaterThan(0);

    clearLog();

    expect(readFileSync(LOG_PATH, "utf-8")).toBe("");
  });

  test("getLogPath returns the correct log file path", () => {
    expect(getLogPath()).toBe(LOG_PATH);
  });
});
