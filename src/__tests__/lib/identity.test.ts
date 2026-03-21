import { describe, expect, test, beforeEach } from "bun:test";
import {
  getAIName,
  getUserName,
  getIdentity,
  getPrincipal,
  clearCache,
  getDefaultIdentity,
  getDefaultPrincipal,
} from "../../lib/identity.js";

describe("identity", () => {
  beforeEach(() => {
    clearCache();
  });

  describe("getAIName", () => {
    test("returns default name when no settings", () => {
      const result = getAIName();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("getUserName", () => {
    test("returns default name when no settings", () => {
      const result = getUserName();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("getIdentity", () => {
    test("returns identity object with required fields", () => {
      const identity = getIdentity();
      expect(identity).toHaveProperty("name");
      expect(identity).toHaveProperty("fullName");
      expect(identity).toHaveProperty("displayName");
      expect(identity).toHaveProperty("color");
    });
  });

  describe("getPrincipal", () => {
    test("returns principal object with required fields", () => {
      const principal = getPrincipal();
      expect(principal).toHaveProperty("name");
      expect(principal).toHaveProperty("timezone");
    });
  });

  describe("getDefaultIdentity", () => {
    test("returns default identity object", () => {
      const identity = getDefaultIdentity();
      expect(identity.name).toBe("PAI");
      expect(identity.fullName).toBe("Personal AI");
    });
  });

  describe("getDefaultPrincipal", () => {
    test("returns default principal object", () => {
      const principal = getDefaultPrincipal();
      expect(principal.name).toBe("User");
      expect(principal.timezone).toBe("UTC");
    });
  });

  describe("clearCache", () => {
    test("clears cached settings", () => {
      getIdentity();
      clearCache();
      expect(() => getIdentity()).not.toThrow();
    });
  });
});
