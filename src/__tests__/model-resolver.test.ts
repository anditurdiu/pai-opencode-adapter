/**
 * Tests for Model Resolver — model resolution, fallback chains,
 * error classification, fallback state management, and routing context.
 */

import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import {
	resolveModel,
	classifyProviderError,
	getModelConfig,
	getModelRoutingContext,
	setFallbackSuggestion,
	consumeFallbackSuggestion,
	clearFallbackState,
	formatFallbackReminder,
	type ModelRole,
	type ProviderErrorType,
	type FallbackSuggestion,
} from "../lib/model-resolver.js";

// ── Error Classification ──────────────────────────────────

describe("classifyProviderError", () => {
	test("detects rate limit errors", () => {
		expect(classifyProviderError("rate limit exceeded")).toBe("rate_limit");
		expect(classifyProviderError("Too many requests")).toBe("rate_limit");
		expect(classifyProviderError("Error 429: rate limited")).toBe("rate_limit");
		expect(classifyProviderError("quota exceeded for this model")).toBe("rate_limit");
		expect(classifyProviderError("API throttled")).toBe("rate_limit");
		expect(classifyProviderError("server overloaded")).toBe("rate_limit");
	});

	test("detects model-not-found errors", () => {
		expect(classifyProviderError("model not found: claude-5")).toBe("model_not_found");
		expect(classifyProviderError("Model not supported")).toBe("model_not_found");
		expect(classifyProviderError("unknown model identifier")).toBe("model_not_found");
		expect(classifyProviderError("invalid model name")).toBe("model_not_found");
		expect(classifyProviderError("model does not exist")).toBe("model_not_found");
		expect(classifyProviderError("404 not found")).toBe("model_not_found");
	});

	test("detects provider-unavailable errors", () => {
		expect(classifyProviderError("service unavailable")).toBe("provider_unavailable");
		expect(classifyProviderError("503 Service Unavailable")).toBe("provider_unavailable");
		expect(classifyProviderError("502 Bad Gateway")).toBe("provider_unavailable");
		expect(classifyProviderError("connection refused")).toBe("provider_unavailable");
		expect(classifyProviderError("network error occurred")).toBe("provider_unavailable");
		expect(classifyProviderError("request timeout")).toBe("provider_unavailable");
		expect(classifyProviderError("ECONNREFUSED")).toBe("provider_unavailable");
		expect(classifyProviderError("ENOTFOUND")).toBe("provider_unavailable");
		expect(classifyProviderError("internal server error")).toBe("provider_unavailable");
	});

	test("returns unknown for unrecognized errors", () => {
		expect(classifyProviderError("something went wrong")).toBe("unknown");
		expect(classifyProviderError("")).toBe("unknown");
		expect(classifyProviderError("unexpected error in handler")).toBe("unknown");
	});

	test("handles null/undefined gracefully", () => {
		expect(classifyProviderError(undefined as unknown as string)).toBe("unknown");
		expect(classifyProviderError(null as unknown as string)).toBe("unknown");
		expect(classifyProviderError(123 as unknown as string)).toBe("unknown");
	});
});

// ── Model Resolution ──────────────────────────────────────

describe("resolveModel", () => {
	test("returns primary model for default role", () => {
		const model = resolveModel("default");
		expect(model).toBeDefined();
		expect(typeof model).toBe("string");
		expect(model!.length).toBeGreaterThan(0);
	});

	test("returns primary model for agent roles", () => {
		const roles: ModelRole[] = ["intern", "architect", "engineer", "explorer", "reviewer"];
		for (const role of roles) {
			const model = resolveModel(role);
			expect(model).toBeDefined();
			expect(typeof model).toBe("string");
		}
	});

	test("returns primary model at attempt 0", () => {
		const primary = resolveModel("default", 0);
		expect(primary).toBeDefined();
	});

	test("returns null for fallback when no fallbacks configured", () => {
		// Default config from PROVIDER_PRESETS has no fallbacks
		const config = getModelConfig();
		if (!config.models.fallbacks || Object.keys(config.models.fallbacks).length === 0) {
			const fallback = resolveModel("default", 1);
			expect(fallback).toBeNull();
		}
	});

	test("returns null when fallback chain is exhausted", () => {
		// Even with fallbacks, a high enough attempt should exhaust the chain
		const result = resolveModel("default", 100);
		expect(result).toBeNull();
	});

	test("returns validation model for validation role", () => {
		const model = resolveModel("validation");
		expect(model).toBeDefined();
		expect(typeof model).toBe("string");
	});
});

// ── Model Config ──────────────────────────────────────────

describe("getModelConfig", () => {
	test("returns a valid config with provider", () => {
		const config = getModelConfig();
		expect(config.provider).toBeDefined();
		expect(typeof config.provider).toBe("string");
	});

	test("returns config with default model", () => {
		const config = getModelConfig();
		expect(config.models.default).toBeDefined();
		expect(typeof config.models.default).toBe("string");
	});

	test("returns config with agent models", () => {
		const config = getModelConfig();
		expect(config.models.agents).toBeDefined();
		expect(config.models.agents?.intern).toBeDefined();
		expect(config.models.agents?.architect).toBeDefined();
		expect(config.models.agents?.engineer).toBeDefined();
	});
});

// ── Fallback State Management ─────────────────────────────

describe("Fallback State", () => {
	const TEST_SESSION = "test-session-fallback";

	beforeEach(() => {
		clearFallbackState(TEST_SESSION);
	});

	afterEach(() => {
		clearFallbackState(TEST_SESSION);
	});

	test("consumeFallbackSuggestion returns null when no suggestion set", () => {
		const result = consumeFallbackSuggestion(TEST_SESSION);
		expect(result).toBeNull();
	});

	test("setFallbackSuggestion stores suggestion for session", () => {
		setFallbackSuggestion(TEST_SESSION, "anthropic/claude-opus-4-5", "rate_limit");
		const result = consumeFallbackSuggestion(TEST_SESSION);
		expect(result).not.toBeNull();
		expect(result!.failedModel).toBe("anthropic/claude-opus-4-5");
		expect(result!.errorType).toBe("rate_limit");
	});

	test("consumeFallbackSuggestion clears suggestion after read", () => {
		setFallbackSuggestion(TEST_SESSION, "openai/gpt-4o", "model_not_found");
		const first = consumeFallbackSuggestion(TEST_SESSION);
		expect(first).not.toBeNull();

		const second = consumeFallbackSuggestion(TEST_SESSION);
		expect(second).toBeNull();
	});

	test("clearFallbackState removes pending suggestion", () => {
		setFallbackSuggestion(TEST_SESSION, "google/gemini-pro", "provider_unavailable");
		clearFallbackState(TEST_SESSION);

		const result = consumeFallbackSuggestion(TEST_SESSION);
		expect(result).toBeNull();
	});

	test("suggestions are isolated between sessions", () => {
		const session2 = "test-session-fallback-2";

		setFallbackSuggestion(TEST_SESSION, "model-a", "rate_limit");
		setFallbackSuggestion(session2, "model-b", "model_not_found");

		const result1 = consumeFallbackSuggestion(TEST_SESSION);
		const result2 = consumeFallbackSuggestion(session2);

		expect(result1!.failedModel).toBe("model-a");
		expect(result2!.failedModel).toBe("model-b");

		clearFallbackState(session2);
	});

	test("new suggestion overwrites previous for same session", () => {
		setFallbackSuggestion(TEST_SESSION, "model-first", "rate_limit");
		setFallbackSuggestion(TEST_SESSION, "model-second", "model_not_found");

		const result = consumeFallbackSuggestion(TEST_SESSION);
		expect(result!.failedModel).toBe("model-second");
		expect(result!.errorType).toBe("model_not_found");
	});
});

// ── Routing Context ───────────────────────────────────────

describe("getModelRoutingContext", () => {
	test("returns a string with model-routing tags", () => {
		const context = getModelRoutingContext();
		expect(context).toContain("<model-routing>");
		expect(context).toContain("</model-routing>");
	});

	test("includes provider name", () => {
		const context = getModelRoutingContext();
		expect(context).toContain("Provider:");
	});

	test("includes default model", () => {
		const context = getModelRoutingContext();
		expect(context).toContain("default:");
	});

	test("includes agent role models", () => {
		const context = getModelRoutingContext();
		expect(context).toContain("intern:");
		expect(context).toContain("architect:");
	});
});

// ── Format Fallback Reminder ──────────────────────────────

describe("formatFallbackReminder", () => {
	test("formats reminder with suggested model", () => {
		const suggestion: FallbackSuggestion = {
			failedModel: "anthropic/claude-opus-4-5",
			errorType: "rate_limit",
			suggestedModel: "openai/gpt-4o",
			role: "architect",
			subagentType: "architect",
			timestamp: Date.now(),
		};

		const reminder = formatFallbackReminder(suggestion);
		expect(reminder).toContain("<system-reminder>");
		expect(reminder).toContain("</system-reminder>");
		expect(reminder).toContain("rate_limit");
		// New format provides actionable guidance with alternative subagent_types
		expect(reminder).toContain("Provider Error");
		expect(reminder).toContain("Action Required");
		expect(reminder).toContain("subagent_type");
	});

	test("formats reminder when no fallback available", () => {
		const suggestion: FallbackSuggestion = {
			failedModel: "some/model",
			errorType: "model_not_found",
			suggestedModel: null,
			role: null,
			subagentType: null,
			timestamp: Date.now(),
		};

		const reminder = formatFallbackReminder(suggestion);
		expect(reminder).toContain("<system-reminder>");
		// With the new format, it either finds alternative agent types or says to do the work directly
		expect(reminder).toContain("Provider Error");
	});
});
