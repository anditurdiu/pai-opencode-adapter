import { test, expect, describe, beforeEach } from "bun:test";
import {
  on,
  off,
  emit,
  onSession,
  offSession,
  clearAllListeners,
} from "../core/event-bus.js";

describe("event-bus", () => {
  beforeEach(() => {
    clearAllListeners();
  });

  describe("on / emit", () => {
    test("registered handler receives emitted event", () => {
      const received: unknown[] = [];
      on("adapter:session:started", (data) => received.push(data));
      emit("adapter:session:started", { sessionId: "test-123" });
      expect(received).toEqual([{ sessionId: "test-123" }]);
    });

    test("multiple handlers all receive the event", () => {
      const calls: number[] = [];
      on("adapter:session:started", () => calls.push(1));
      on("adapter:session:started", () => calls.push(2));
      on("adapter:session:started", () => calls.push(3));
      emit("adapter:session:started", {});
      expect(calls).toEqual([1, 2, 3]);
    });

    test("emit with no handlers does not throw", () => {
      expect(() => emit("adapter:unknown:event", {})).not.toThrow();
    });

    test("handlers for different events do not cross-fire", () => {
      const calls: string[] = [];
      on("adapter:session:started", () => calls.push("started"));
      on("adapter:session:ending", () => calls.push("ending"));
      emit("adapter:session:started", {});
      expect(calls).toEqual(["started"]);
    });
  });

  describe("fail-open behavior", () => {
    test("listener 2 throwing does not prevent listener 3 from receiving event", () => {
      const calls: number[] = [];
      on("adapter:session:started", () => calls.push(1));
      on("adapter:session:started", () => { throw new Error("listener 2 exploded"); });
      on("adapter:session:started", () => calls.push(3));
      expect(() => emit("adapter:session:started", { sessionId: "test" })).not.toThrow();
      expect(calls).toEqual([1, 3]);
    });

    test("all non-throwing listeners are called even when one throws", () => {
      const received: string[] = [];
      on("adapter:learning:signal", () => { throw new Error("boom"); });
      on("adapter:learning:signal", (d: unknown) => received.push((d as { signal: string }).signal));
      emit("adapter:learning:signal", { signal: "positive" });
      expect(received).toEqual(["positive"]);
    });
  });

  describe("off", () => {
    test("removed handler no longer receives events", () => {
      const calls: number[] = [];
      const handler = () => calls.push(1);
      on("adapter:session:started", handler);
      off("adapter:session:started", handler);
      emit("adapter:session:started", {});
      expect(calls).toEqual([]);
    });

    test("off on unknown event does not throw", () => {
      expect(() => off("adapter:nonexistent", () => {})).not.toThrow();
    });
  });

  describe("onSession / offSession", () => {
    test("session handler receives emitted event", () => {
      const received: unknown[] = [];
      onSession("sess-1", "adapter:context:loaded", (data) => received.push(data));
      emit("adapter:context:loaded", { files: 3 });
      expect(received).toEqual([{ files: 3 }]);
    });

    test("session handlers from different sessions both fire", () => {
      const calls: string[] = [];
      onSession("sess-A", "adapter:context:loaded", () => calls.push("A"));
      onSession("sess-B", "adapter:context:loaded", () => calls.push("B"));
      emit("adapter:context:loaded", {});
      expect(calls).toContain("A");
      expect(calls).toContain("B");
    });

    test("offSession removes all handlers for that session", () => {
      const calls: string[] = [];
      onSession("sess-1", "adapter:session:started", () => calls.push("s1-start"));
      onSession("sess-1", "adapter:context:loaded", () => calls.push("s1-ctx"));
      offSession("sess-1");
      emit("adapter:session:started", {});
      emit("adapter:context:loaded", {});
      expect(calls).toEqual([]);
    });

    test("offSession does not affect other sessions", () => {
      const calls: string[] = [];
      onSession("sess-1", "adapter:session:started", () => calls.push("s1"));
      onSession("sess-2", "adapter:session:started", () => calls.push("s2"));
      offSession("sess-1");
      emit("adapter:session:started", {});
      expect(calls).toEqual(["s2"]);
    });

    test("offSession on unknown session does not throw", () => {
      expect(() => offSession("nonexistent-session")).not.toThrow();
    });

    test("session handler fail-open: other session listeners still receive event", () => {
      const calls: string[] = [];
      onSession("sess-1", "adapter:compaction:started", () => { throw new Error("sess1 broke"); });
      onSession("sess-2", "adapter:compaction:started", () => calls.push("sess2"));
      expect(() => emit("adapter:compaction:started", {})).not.toThrow();
      expect(calls).toEqual(["sess2"]);
    });
  });

  describe("global + session combined", () => {
    test("both global and session handlers fire for same event", () => {
      const calls: string[] = [];
      on("adapter:session:ending", () => calls.push("global"));
      onSession("sess-1", "adapter:session:ending", () => calls.push("session"));
      emit("adapter:session:ending", {});
      expect(calls).toContain("global");
      expect(calls).toContain("session");
    });
  });
});
