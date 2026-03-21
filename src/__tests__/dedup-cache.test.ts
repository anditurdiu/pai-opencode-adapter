import { test, expect, describe, beforeEach } from "bun:test";
import {
  isDuplicate,
  clearSessionDedup,
  getDedupCacheSize,
  clearAllDedup,
} from "../core/dedup-cache.js";

describe("dedup-cache", () => {
  beforeEach(() => {
    clearAllDedup();
  });

  describe("isDuplicate basic behavior", () => {
    test("first call returns false", () => {
      expect(isDuplicate("sess-1", "hello world", "chat.message")).toBe(false);
    });

    test("second identical call returns true", () => {
      isDuplicate("sess-1", "hello world", "chat.message");
      expect(isDuplicate("sess-1", "hello world", "chat.message")).toBe(true);
    });

    test("same content different eventType returns true within TTL", () => {
      isDuplicate("sess-1", "hello world", "chat.message");
      expect(isDuplicate("sess-1", "hello world", "message.updated")).toBe(true);
    });
  });

  describe("session isolation", () => {
    test("same content in different sessions are not duplicates", () => {
      isDuplicate("sess-A", "shared content", "chat.message");
      expect(isDuplicate("sess-B", "shared content", "chat.message")).toBe(false);
    });

    test("different content in same session are not duplicates", () => {
      isDuplicate("sess-1", "content A", "chat.message");
      expect(isDuplicate("sess-1", "content B", "chat.message")).toBe(false);
    });
  });

  describe("TTL expiry", () => {
    test("entry is re-allowed after cache clear (simulates TTL expiry)", () => {
      isDuplicate("sess-1", "hello world", "chat.message");
      clearAllDedup();
      expect(isDuplicate("sess-1", "hello world", "chat.message")).toBe(false);
    });
  });

  describe("clearSessionDedup", () => {
    test("clears only the target session entries", () => {
      isDuplicate("sess-1", "msg", "chat.message");
      isDuplicate("sess-2", "msg", "chat.message");
      const before = getDedupCacheSize();
      clearSessionDedup("sess-1");
      expect(getDedupCacheSize()).toBe(before - 1);
    });

    test("after clear, session entries are no longer duplicates", () => {
      isDuplicate("sess-1", "msg-a", "chat.message");
      isDuplicate("sess-1", "msg-b", "chat.message");
      clearSessionDedup("sess-1");
      expect(isDuplicate("sess-1", "msg-a", "chat.message")).toBe(false);
      expect(isDuplicate("sess-1", "msg-b", "chat.message")).toBe(false);
    });

    test("other session entries are unaffected", () => {
      isDuplicate("sess-1", "msg", "chat.message");
      isDuplicate("sess-2", "msg", "chat.message");
      clearSessionDedup("sess-1");
      expect(isDuplicate("sess-2", "msg", "chat.message")).toBe(true);
    });

    test("does not throw for unknown session", () => {
      expect(() => clearSessionDedup("nonexistent")).not.toThrow();
    });
  });

  describe("getDedupCacheSize", () => {
    test("returns 0 on empty cache", () => {
      expect(getDedupCacheSize()).toBe(0);
    });

    test("increments with each unique entry", () => {
      isDuplicate("sess-1", "msg-1", "chat.message");
      isDuplicate("sess-1", "msg-2", "chat.message");
      expect(getDedupCacheSize()).toBe(2);
    });

    test("does not increment on duplicate detection", () => {
      isDuplicate("sess-1", "msg", "chat.message");
      isDuplicate("sess-1", "msg", "chat.message");
      expect(getDedupCacheSize()).toBe(1);
    });
  });
});
