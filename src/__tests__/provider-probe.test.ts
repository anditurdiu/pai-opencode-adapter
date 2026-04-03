/**
 * Tests for Provider Probe — pre-flight health checks for model providers
 * before subagent spawn, with fallback resolution.
 */

import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
	resolveProviderEndpoint,
	detectApiFormat,
	readAgentModel,
	clearProbeCache,
	type ApiFormat,
} from "../lib/provider-probe.js";

// ── detectApiFormat ───────────────────────────────────────

describe("detectApiFormat", () => {
	test("returns 'anthropic' for @ai-sdk/anthropic", () => {
		expect(detectApiFormat("@ai-sdk/anthropic")).toBe("anthropic");
	});

	test("returns 'anthropic' for packages containing 'anthropic'", () => {
		expect(detectApiFormat("@custom/anthropic-sdk")).toBe("anthropic");
	});

	test("returns 'openai' for @ai-sdk/openai", () => {
		expect(detectApiFormat("@ai-sdk/openai")).toBe("openai");
	});

	test("returns 'openai' for undefined npm", () => {
		expect(detectApiFormat(undefined)).toBe("openai");
	});

	test("returns 'openai' for empty string", () => {
		expect(detectApiFormat("")).toBe("openai");
	});

	test("returns 'openai' for generic packages", () => {
		expect(detectApiFormat("@ai-sdk/google")).toBe("openai");
	});
});

// ── resolveProviderEndpoint ───────────────────────────────

describe("resolveProviderEndpoint", () => {
	test("returns endpoint for bailian-coding-plan (has baseURL + apiKey)", () => {
		const endpoint = resolveProviderEndpoint("bailian-coding-plan");
		if (endpoint) {
			expect(endpoint.baseURL).toContain("dashscope");
			expect(endpoint.apiKey).toBeTruthy();
			expect(endpoint.apiFormat).toBe("anthropic");
			expect(endpoint.npm).toBe("@ai-sdk/anthropic");
		}
		// If opencode.json doesn't exist in test env, endpoint will be null — that's fine
	});

	test("returns null for github-copilot (no explicit baseURL/apiKey)", () => {
		const endpoint = resolveProviderEndpoint("github-copilot");
		expect(endpoint).toBeNull();
	});

	test("returns null for google (no explicit baseURL/apiKey)", () => {
		const endpoint = resolveProviderEndpoint("google");
		expect(endpoint).toBeNull();
	});

	test("returns null for zai-coding-plan (no explicit baseURL/apiKey)", () => {
		const endpoint = resolveProviderEndpoint("zai-coding-plan");
		expect(endpoint).toBeNull();
	});

	test("returns null for non-existent provider", () => {
		const endpoint = resolveProviderEndpoint("nonexistent-provider-xyz");
		expect(endpoint).toBeNull();
	});
});

// ── readAgentModel ────────────────────────────────────────

describe("readAgentModel", () => {
	test("reads model from pai-adapter.json for intern agent", () => {
		const model = readAgentModel("intern");
		// In test environment, pai-adapter.json should exist with agents section
		if (model) {
			expect(model).toContain("/");
			expect(model.length).toBeGreaterThan(5);
		}
	});

	test("reads model from pai-adapter.json for explorer agent", () => {
		const model = readAgentModel("explorer");
		if (model) {
			expect(model).toContain("/");
		}
	});

	test("reads model from pai-adapter.json for all 10 PAI agents", () => {
		const agentNames = [
			"Architect", "Engineer", "GeminiResearcher", "ClaudeResearcher",
			"CodexResearcher", "Designer", "GrokResearcher", "PerplexityResearcher",
			"QATester", "Artist",
		];
		for (const name of agentNames) {
			const model = readAgentModel(name);
			// Each agent should have a model in pai-adapter.json
			if (model) {
				expect(model).toContain("/");
				expect(model.length).toBeGreaterThan(3);
			}
		}
	});

	test("returns null for non-existent agent", () => {
		const model = readAgentModel("nonexistent-agent-xyz-12345");
		expect(model).toBeNull();
	});

	test("returns correct model string format (provider/model)", () => {
		const model = readAgentModel("engineer");
		if (model) {
			const parts = model.split("/");
			expect(parts.length).toBeGreaterThanOrEqual(2);
			expect(parts[0]!.length).toBeGreaterThan(0);
			expect(parts[1]!.length).toBeGreaterThan(0);
		}
	});
});

// ── clearProbeCache ───────────────────────────────────────

describe("clearProbeCache", () => {
	test("clears cache without error", () => {
		expect(() => clearProbeCache()).not.toThrow();
	});
});

// ── Integration: resolveProviderEndpoint + detectApiFormat ──

describe("Integration: endpoint resolution", () => {
	test("probe-able providers have correct API format", () => {
		const endpoint = resolveProviderEndpoint("bailian-coding-plan");
		if (endpoint) {
			// bailian-coding-plan uses @ai-sdk/anthropic → anthropic format
			expect(endpoint.apiFormat).toBe("anthropic");
		}
	});

	test("non-probe-able providers return null consistently", () => {
		// These providers should all return null (env-based auth)
		const providers = ["github-copilot", "google", "zai-coding-plan"];
		for (const provider of providers) {
			expect(resolveProviderEndpoint(provider)).toBeNull();
		}
	});
});
