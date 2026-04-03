import { describe, expect, test } from "bun:test";
import {
  detectProvider,
  getProviderPreset,
  translateConfig,
  type PAISettings,
  type OpenCodeConfig,
  type PAIAdapterConfig,
  type TranslationResult,
} from "../adapters/config-translator.js";

describe("detectProvider", () => {
  test("detects anthropic from full model string", () => {
    expect(detectProvider("anthropic/claude-sonnet-4-5")).toBe("anthropic");
  });

  test("detects openai from full model string", () => {
    expect(detectProvider("openai/gpt-4")).toBe("openai");
  });

  test("detects google from full model string", () => {
    expect(detectProvider("google/gemini-pro")).toBe("google");
  });

  test("detects google from gemini prefix", () => {
    expect(detectProvider("gemini-2.0-flash")).toBe("google");
  });

  test("detects ollama from full model string", () => {
    expect(detectProvider("ollama/llama3")).toBe("ollama");
  });

  test("detects zen from opencode prefix", () => {
    expect(detectProvider("opencode/grok-code")).toBe("zen");
  });

  test("detects anthropic from claude in model name", () => {
    expect(detectProvider("claude-3-opus")).toBe("anthropic");
  });

  test("detects openai from gpt in model name", () => {
    expect(detectProvider("gpt-4-turbo")).toBe("openai");
  });

  test("detects openai from o1 in model name", () => {
    expect(detectProvider("o1-preview")).toBe("openai");
  });

  test("detects google from gemini in model name", () => {
    expect(detectProvider("gemini-pro-vision")).toBe("google");
  });

  test("detects ollama from llama in model name", () => {
    expect(detectProvider("llama-3-70b")).toBe("ollama");
  });

  test("detects ollama from mistral in model name", () => {
    expect(detectProvider("mistral-7b")).toBe("ollama");
  });

  test("falls back to anthropic for unknown model", () => {
    expect(detectProvider("unknown-model")).toBe("anthropic");
  });

  test("falls back to anthropic for empty string", () => {
    expect(detectProvider("")).toBe("anthropic");
  });

  test("handles null/undefined gracefully", () => {
    expect(detectProvider(null as unknown as string)).toBe("anthropic");
    expect(detectProvider(undefined as unknown as string)).toBe("anthropic");
  });

  test("is case-insensitive", () => {
    expect(detectProvider("ANTHROPIC/CLAUDE-SONNET-4-5")).toBe("anthropic");
    expect(detectProvider("OpenAI/GPT-4")).toBe("openai");
  });
});

describe("getProviderPreset", () => {
  test("returns preset for anthropic", () => {
    const preset = getProviderPreset("anthropic");
    expect(preset.default).toBe("anthropic/claude-sonnet-4-5");
    expect(preset.agents?.Architect).toBe("anthropic/claude-opus-4-5");
  });

  test("returns preset for openai", () => {
    const preset = getProviderPreset("openai");
    expect(preset.default).toBe("openai/gpt-4o");
    expect(preset.agents?.Engineer).toBe("openai/gpt-4o");
  });

  test("returns preset for google", () => {
    const preset = getProviderPreset("google");
    expect(preset.default).toBe("google/gemini-pro");
  });

  test("returns preset for ollama", () => {
    const preset = getProviderPreset("ollama");
    expect(preset.default).toBe("ollama/llama3");
  });

  test("returns preset for zen", () => {
    const preset = getProviderPreset("zen");
    expect(preset.default).toBe("opencode/grok-code");
  });
});

describe("translateConfig", () => {
  test("translates basic PAI settings to OpenCode config + adapter config", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
      principal: { name: "Alex" },
    };

    const result = translateConfig(settings);

    // OpenCode config gets provider, model, plugin
    expect(result.openCodeConfig.provider).toBe("anthropic");
    expect(result.openCodeConfig.model).toBe("anthropic/claude-sonnet-4-5");
    expect(result.openCodeConfig.plugin).toContain("pai-opencode-adapter");

    // Adapter config gets identity
    expect(result.adapterConfig.identity?.aiName).toBe("PAI");
    expect(result.adapterConfig.identity?.userName).toBe("Alex");
  });

  test("extracts AI identity fields correctly", () => {
    const settings: PAISettings = {
      daidentity: {
        name: "Jarvis",
        fullName: "Just A Rather Very Intelligent System",
        displayName: "JARVIS",
      },
      principal: { name: "Tony", timezone: "America/New_York" },
    };

    const result = translateConfig(settings);

    expect(result.adapterConfig.identity?.aiName).toBe("Jarvis");
    expect(result.adapterConfig.identity?.aiFullName).toBe("Just A Rather Very Intelligent System");
    expect(result.adapterConfig.identity?.userName).toBe("Tony");
    expect(result.adapterConfig.identity?.timezone).toBe("America/New_York");
  });

  test("auto-detects provider from model string", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
    };

    const existing: Partial<OpenCodeConfig> = {
      model: "openai/gpt-4o",
    };

    const result = translateConfig(settings, existing);

    expect(result.openCodeConfig.provider).toBe("openai");
    expect(result.adapterConfig.model_provider).toBe("openai");
  });

  test("preserves existing provider if set", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
    };

    const existing: Partial<OpenCodeConfig> = {
      provider: "google",
      model: "google/gemini-pro",
    };

    const result = translateConfig(settings, existing);

    expect(result.openCodeConfig.provider).toBe("google");
  });

  test("merges plugin array and adds PAI plugin", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
    };

    const existing: Partial<OpenCodeConfig> = {
      plugin: ["existing-plugin", "another-plugin"],
    };

    const result = translateConfig(settings, existing);

    expect(result.openCodeConfig.plugin).toContain("existing-plugin");
    expect(result.openCodeConfig.plugin).toContain("another-plugin");
    expect(result.openCodeConfig.plugin).toContain("pai-opencode-adapter");
  });

  test("does not duplicate PAI plugin if already present", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
    };

    const existing: Partial<OpenCodeConfig> = {
      plugin: ["pai-opencode-adapter", "other-plugin"],
    };

    const result = translateConfig(settings, existing);

    const paiPluginCount = result.openCodeConfig.plugin?.filter((p: string) => p === "pai-opencode-adapter").length;
    expect(paiPluginCount).toBe(1);
  });

  test("preserves existing custom fields in opencode config", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
    };

    const existing: Partial<OpenCodeConfig> = {
      theme: "dark",
      keybinds: { save: "Cmd+S" },
    };

    const result = translateConfig(settings, existing);

    expect(result.openCodeConfig.theme).toBe("dark");
    expect(result.openCodeConfig.keybinds?.save).toBe("Cmd+S");
  });

  test("preserves existing adapter config fields", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
    };

    const existingAdapter: Partial<PAIAdapterConfig> = {
      logging: { debugLog: "/tmp/test.log", level: "debug" },
      paiDir: "~/.claude",
    };

    const result = translateConfig(settings, undefined, existingAdapter);

    expect(result.adapterConfig.logging?.debugLog).toBe("/tmp/test.log");
    expect(result.adapterConfig.logging?.level).toBe("debug");
    expect(result.adapterConfig.paiDir).toBe("~/.claude");
    // New identity should still be merged in
    expect(result.adapterConfig.identity?.aiName).toBe("PAI");
  });

  test("produces valid JSON output", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI", fullName: "Personal AI" },
      principal: { name: "Alex", timezone: "UTC" },
    };

    const result = translateConfig(settings);

    expect(() => JSON.stringify(result.openCodeConfig)).not.toThrow();
    expect(() => JSON.stringify(result.adapterConfig)).not.toThrow();
    const ocJson = JSON.stringify(result.openCodeConfig);
    expect(ocJson).toContain('"provider"');
    expect(ocJson).toContain('"model"');
    expect(ocJson).toContain('"plugin"');
  });

  test("handles empty settings", () => {
    const settings: PAISettings = {};

    const result = translateConfig(settings);

    expect(result.openCodeConfig.provider).toBe("anthropic");
    expect(result.openCodeConfig.plugin).toContain("pai-opencode-adapter");
  });

  test("handles settings with only identity", () => {
    const settings: PAISettings = {
      daidentity: { name: "Test AI" },
    };

    const result = translateConfig(settings);

    expect(result.adapterConfig.identity?.aiName).toBe("Test AI");
    expect(result.adapterConfig.identity?.userName).toBeUndefined();
  });

  test("removes undefined identity fields from output", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
    };

    const result = translateConfig(settings);

    expect(result.adapterConfig.identity?.aiName).toBe("PAI");
    expect(result.adapterConfig.identity?.aiFullName).toBeUndefined();
    expect(result.adapterConfig.identity?.userName).toBeUndefined();
    expect(result.adapterConfig.identity?.timezone).toBeUndefined();
  });

  test("uses displayName as fallback for fullName", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI", displayName: "Personal AI Assistant" },
    };

    const result = translateConfig(settings);

    expect(result.adapterConfig.identity?.aiFullName).toBe("Personal AI Assistant");
  });

  test("opencode config does not contain pai key", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
      principal: { name: "Alex" },
    };

    const result = translateConfig(settings);

    expect(result.openCodeConfig).not.toHaveProperty("pai");
  });

  test("returns TranslationResult with both configs", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
    };

    const result = translateConfig(settings);

    expect(result).toHaveProperty("openCodeConfig");
    expect(result).toHaveProperty("adapterConfig");
    expect(typeof result.openCodeConfig).toBe("object");
    expect(typeof result.adapterConfig).toBe("object");
  });

  test("adds permission.external_directory with ~/.claude/** allow", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
    };

    const result = translateConfig(settings);
    const permission = (result.openCodeConfig as Record<string, unknown>).permission as Record<string, unknown>;

    expect(permission).toBeDefined();
    expect(permission.external_directory).toBeDefined();
    const extDir = permission.external_directory as Record<string, string>;
    expect(extDir["~/.claude/**"]).toBe("allow");
    expect(extDir["~/.config/opencode/**"]).toBe("allow");
    expect(extDir["~/.config/opencode/agents/**"]).toBe("allow");
  });

  test("preserves existing user permissions when merging", () => {
    const settings: PAISettings = {
      daidentity: { name: "PAI" },
    };

    const existing: Partial<OpenCodeConfig> = {
      permission: {
        external_directory: {
          "~/other-dir/**": "allow",
          "/tmp/logs/**": "deny",
        },
      },
    };

    const result = translateConfig(settings, existing);
    const permission = (result.openCodeConfig as Record<string, unknown>).permission as Record<string, unknown>;
    const extDir = permission.external_directory as Record<string, string>;

    // PAI's required permissions are present
    expect(extDir["~/.claude/**"]).toBe("allow");
    expect(extDir["~/.config/opencode/**"]).toBe("allow");
    expect(extDir["~/.config/opencode/agents/**"]).toBe("allow");
    // User's existing permissions are preserved
    expect(extDir["~/other-dir/**"]).toBe("allow");
    expect(extDir["/tmp/logs/**"]).toBe("deny");
  });
});
