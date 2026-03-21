/**
 * Tests for Event Adapter - 9 validated PAI-to-OpenCode mappings
 *
 * NOTE: registerHook() was removed (architecturally incompatible with pai-unified.ts).
 * These tests cover the reference mappings, payload translation, and response helpers.
 */

import { test, expect, describe } from "bun:test";
import {
  getMappings,
  getMappingsForEvent,
  translatePayload,
  createBlockResponse,
  createAllowResponse,
  createAskResponse,
  HOOK_MAPPINGS,
} from "../adapters/event-adapter.js";
import { PAIHookEvent } from "../types/index.js";

describe("Event Adapter", () => {
  describe("getMappings()", () => {
    test("returns exactly 9 mappings (unique PAI events)", () => {
      const mappings = getMappings();
      expect(mappings.length).toBe(9);
    });

    test("all mappings have required fields", () => {
      const mappings = getMappings();
      for (const mapping of mappings) {
        expect(mapping.paiEvent).toBeDefined();
        expect(mapping.ocEvents).toBeDefined();
        expect(mapping.ocEvents.length).toBeGreaterThan(0);
        expect(mapping.description).toBeDefined();
      }
    });

    test("mappings cover all PAIHookEvent enum values", () => {
      const mappings = getMappings();
      const paiEvents = mappings.map((m) => m.paiEvent);
      
      expect(paiEvents).toContain(PAIHookEvent.SessionStart);
      expect(paiEvents).toContain(PAIHookEvent.PreToolUse);
      expect(paiEvents).toContain(PAIHookEvent.PreToolUseBlock);
      expect(paiEvents).toContain(PAIHookEvent.PostToolUse);
      expect(paiEvents).toContain(PAIHookEvent.Stop);
      expect(paiEvents).toContain(PAIHookEvent.SubagentStop);
      expect(paiEvents).toContain(PAIHookEvent.SessionEnd);
      expect(paiEvents).toContain(PAIHookEvent.UserPromptSubmit);
      expect(paiEvents).toContain(PAIHookEvent.Compaction);
    });
  });

  describe("SessionStart mapping", () => {
    test("maps to experimental.chat.system.transform", () => {
      const mappings = getMappingsForEvent(PAIHookEvent.SessionStart);
      expect(mappings.length).toBe(1);
      expect(mappings[0]?.ocEvents).toContain("experimental.chat.system.transform");
    });
  });

  describe("PreToolUse mapping", () => {
    test("maps to BOTH tool.execute.before AND permission.ask (dual registration)", () => {
      const mappings = getMappingsForEvent(PAIHookEvent.PreToolUse);
      expect(mappings.length).toBe(1);
      expect(mappings[0]?.ocEvents).toContain("tool.execute.before");
      expect(mappings[0]?.ocEvents).toContain("permission.ask");
      expect(mappings[0]?.ocEvents.length).toBe(2);
    });
  });

  describe("SessionEnd mapping", () => {
    test("uses event wildcard with filter for session.idle", () => {
      const mappings = getMappingsForEvent(PAIHookEvent.SessionEnd);
      expect(mappings.length).toBe(1);
      expect(mappings[0]?.ocEvents).toContain("event");
      expect(mappings[0]?.filter).toBeDefined();
      expect(mappings[0]?.filter?.type).toBe("session.idle");
    });
  });

  describe("UserPromptSubmit mapping", () => {
    test("maps to chat.message (NOT experimental.chat.user.transform)", () => {
      const mappings = getMappingsForEvent(PAIHookEvent.UserPromptSubmit);
      expect(mappings.length).toBe(1);
      expect(mappings[0]?.ocEvents).toContain("chat.message");
      // Ensure it does NOT use the non-existent experimental.chat.user.transform
      expect(mappings[0]?.ocEvents).not.toContain("experimental.chat.user.transform");
    });
  });

  describe("Compaction mapping", () => {
    test("maps to BOTH experimental.session.compacting AND event (dual registration)", () => {
      const mappings = getMappingsForEvent(PAIHookEvent.Compaction);
      expect(mappings.length).toBe(1);
      expect(mappings[0]?.ocEvents).toContain("experimental.session.compacting");
      expect(mappings[0]?.ocEvents).toContain("event");
      expect(mappings[0]?.ocEvents.length).toBe(2);
      // Check filter for session.compacted event type
      expect(mappings[0]?.filter?.type).toBe("session.compacted");
    });
  });

  describe("SubagentStop mapping", () => {
    test("maps to tool.execute.after with Task tool filter", () => {
      const mappings = getMappingsForEvent(PAIHookEvent.SubagentStop);
      expect(mappings.length).toBe(1);
      expect(mappings[0]?.ocEvents).toContain("tool.execute.after");
      expect(mappings[0]?.notes).toContain("Task");
    });
  });

  describe("translatePayload()", () => {
    test("translates tool.execute.before input to PAIPayload", () => {
      const input = {
        tool: "Bash",
        sessionID: "session-123",
        callID: "call-456",
      };

      const payload = translatePayload("tool.execute.before", input);

      expect(payload.session_id).toBe("session-123");
      expect(payload.tool_name).toBe("Bash");
      expect(payload.raw.callID).toBe("call-456");
    });

    test("translates chat.message input to PAIPayload", () => {
      const input = {
        sessionID: "session-789",
        messageID: "msg-123",
      };

      const payload = translatePayload("chat.message", input);

      expect(payload.session_id).toBe("session-789");
      expect(payload.raw.messageID).toBe("msg-123");
    });

    test("translates event wildcard input to PAIPayload", () => {
      const input = {
        sessionID: "session-abc",
        event: { type: "session.idle", reason: "timeout" },
      };

      const payload = translatePayload("event", input);

      expect(payload.session_id).toBe("session-abc");
      expect(payload.raw.eventType).toBe("session.idle");
    });
  });

  describe("helper functions", () => {
    test("createBlockResponse returns deny status", () => {
      const response = createBlockResponse("Test block");
      expect(response.status).toBe("deny");
    });

    test("createAllowResponse returns allow status", () => {
      const response = createAllowResponse();
      expect(response.status).toBe("allow");
    });

    test("createAskResponse returns ask status", () => {
      const response = createAskResponse();
      expect(response.status).toBe("ask");
    });
  });
});
