import { describe, test, expect } from "bun:test";
import { scrubText } from "../handlers/secret-scrubber.js";

describe("scrubText — pattern-based API key detection", () => {
  test("redacts Anthropic API key (sk-ant- prefix)", () => {
    const { scrubbed, redactions } = scrubText("Using key sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234");
    expect(scrubbed).not.toContain("sk-ant-");
    expect(scrubbed).toContain("[REDACTED]");
    expect(redactions).toBeGreaterThan(0);
  });

  test("redacts OpenAI API key (sk- prefix, 20+ chars)", () => {
    const { scrubbed, redactions } = scrubText("key=sk-abcdefghijklmnopqrstuvwxyz12345");
    expect(scrubbed).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(redactions).toBeGreaterThan(0);
  });

  test("redacts GitHub personal access token (ghp_ prefix)", () => {
    const token = "ghp_" + "A".repeat(36);
    const { scrubbed, redactions } = scrubText("token: " + token);
    expect(scrubbed).toContain("[REDACTED]");
    expect(scrubbed).not.toContain("ghp_");
    expect(redactions).toBeGreaterThan(0);
  });

  test("redacts AWS access key (AKIA prefix)", () => {
    const { scrubbed, redactions } = scrubText("aws_access_key_id=AKIAIOSFODNN7EXAMPLE");
    expect(scrubbed).toContain("[REDACTED]");
    expect(scrubbed).not.toContain("AKIA");
    expect(redactions).toBeGreaterThan(0);
  });

  test("does not modify clean text (no false positives)", () => {
    const clean = "This is a normal message with no secrets.";
    const { scrubbed, redactions } = scrubText(clean);
    expect(scrubbed).toBe(clean);
    expect(redactions).toBe(0);
  });

  test("handles empty string without error", () => {
    const { scrubbed, redactions } = scrubText("");
    expect(scrubbed).toBe("");
    expect(redactions).toBe(0);
  });

  test("redacts multiple API key patterns in one string", () => {
    const anthKey = "sk-ant-api03-aaaaaaaaaaaabbbbbbbbbbbb";
    const awsKey = "AKIAIOSFODNN7EXAMPLE";
    const { scrubbed, redactions } = scrubText("k1=" + anthKey + " k2=" + awsKey);
    expect(scrubbed).not.toContain("sk-ant-");
    expect(scrubbed).not.toContain("AKIA");
    expect(redactions).toBe(2);
  });

  test("returns zero redactions for safe code patterns", () => {
    const { redactions } = scrubText("const x = 42; function foo() { return x; }");
    expect(redactions).toBe(0);
  });
});

describe("scrubText — edge cases", () => {
  test("short key below minimum cache length is not redacted", () => {
    const { redactions } = scrubText("tiny");
    expect(redactions).toBe(0);
  });

  test("whitespace-only string passes through unchanged", () => {
    const { scrubbed, redactions } = scrubText("   ");
    expect(redactions).toBe(0);
    expect(scrubbed).toBe("   ");
  });
});
