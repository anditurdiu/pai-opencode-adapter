/**
 * Model Resolver
 *
 * Provides model resolution with user-configurable overrides and fallback chains.
 * Loads config from ~/.config/opencode/pai-adapter.json at call time.
 *
 * Key responsibilities:
 * - Resolve model for a given role (default, intern, architect, etc.)
 * - Traverse fallback chains when primary model fails
 * - Classify provider errors (rate limit, model not found, unavailable)
 * - Track per-session fallback suggestions for system prompt injection
 * - Generate concise model routing context for system prompts
 *
 * @module lib/model-resolver
 */

import { readFileSync, existsSync } from "node:fs";
import { fileLog } from "./file-logger.js";
import { getAdapterConfigPath } from "./paths.js";
import {
	type ProviderModels,
	type ProviderType,
	type PAIAdapterConfig,
	getProviderPreset,
} from "../adapters/config-translator.js";

// ── Types ─────────────────────────────────────────────────

export type ModelRole =
	| "default"
	| "validation"
	| "intern"
	| "architect"
	| "engineer"
	| "explorer"
	| "reviewer";

export type ProviderErrorType =
	| "rate_limit"
	| "model_not_found"
	| "provider_unavailable"
	| "unknown";

export interface FallbackSuggestion {
	failedModel: string;
	errorType: ProviderErrorType;
	suggestedModel: string | null;
	role: ModelRole | null;
	timestamp: number;
}

export interface ModelRoutingConfig {
	provider: ProviderType;
	models: ProviderModels & {
		fallbacks?: Record<string, string[]>;
	};
}

// ── Session fallback state ────────────────────────────────

const fallbackState = new Map<string, FallbackSuggestion>();

/**
 * Store a fallback suggestion after a provider error.
 * Called from tool.execute.after when an agent/Task call fails.
 */
export function setFallbackSuggestion(
	sessionId: string,
	failedModel: string,
	errorType: ProviderErrorType,
	role?: ModelRole,
): void {
	const resolvedRole = role ?? identifyRoleFromModel(failedModel);
	const nextModel = resolvedRole
		? resolveModel(resolvedRole, 1)
		: null;

	const suggestion: FallbackSuggestion = {
		failedModel,
		errorType,
		suggestedModel: nextModel,
		role: resolvedRole,
		timestamp: Date.now(),
	};

	fallbackState.set(sessionId, suggestion);
	fileLog(
		`[model-resolver] Fallback set for session=${sessionId}: ` +
		`${failedModel} (${errorType}) → ${nextModel ?? "chain exhausted"}`,
		"info",
	);
}

/**
 * Consume (read + clear) a pending fallback suggestion.
 * Called from experimental.chat.system.transform to inject into next turn.
 * Returns null if no suggestion pending.
 */
export function consumeFallbackSuggestion(sessionId: string): FallbackSuggestion | null {
	const suggestion = fallbackState.get(sessionId) ?? null;
	if (suggestion) {
		fallbackState.delete(sessionId);
	}
	return suggestion;
}

/**
 * Clear fallback state for a session. Called on session.end.
 */
export function clearFallbackState(sessionId: string): void {
	fallbackState.delete(sessionId);
}

// ── Config loading ────────────────────────────────────────

/**
 * Load the merged model routing config from pai-adapter.json.
 * Merges user overrides over provider preset defaults.
 */
export function getModelConfig(): ModelRoutingConfig {
	const configPath = getAdapterConfigPath();
	let userConfig: PAIAdapterConfig | null = null;

	try {
		if (existsSync(configPath)) {
			const raw = readFileSync(configPath, "utf-8");
			userConfig = JSON.parse(raw) as PAIAdapterConfig;
		}
	} catch (err) {
		fileLog(`[model-resolver] Failed to read config: ${err}`, "warn");
	}

	const provider: ProviderType = userConfig?.model_provider ?? "anthropic";
	const preset = getProviderPreset(provider);

	// Merge: user models override preset, preset fills gaps
	const userModels = userConfig?.models;
	const merged: ProviderModels & { fallbacks?: Record<string, string[]> } = {
		default: userModels?.default ?? preset.default,
		validation: userModels?.validation ?? preset.validation,
		agents: {
			intern: userModels?.agents?.intern ?? preset.agents?.intern,
			architect: userModels?.agents?.architect ?? preset.agents?.architect,
			engineer: userModels?.agents?.engineer ?? preset.agents?.engineer,
			explorer: userModels?.agents?.explorer ?? preset.agents?.explorer,
			reviewer: userModels?.agents?.reviewer ?? preset.agents?.reviewer,
		},
	};

	// Merge fallbacks from user config
	const userFallbacks = (userModels as ProviderModels & { fallbacks?: Record<string, string[]> })?.fallbacks;
	if (userFallbacks && typeof userFallbacks === "object") {
		merged.fallbacks = { ...userFallbacks };
	}

	return { provider, models: merged };
}

// ── Model resolution ──────────────────────────────────────

/**
 * Resolve the model for a given role and attempt number.
 *
 * @param role - The model role (default, intern, architect, etc.)
 * @param attempt - 0 = primary model, 1+ = fallback chain index
 * @returns Model string or null if fallback chain exhausted
 */
export function resolveModel(role: ModelRole, attempt = 0): string | null {
	const config = getModelConfig();

	// Get primary model for role
	let primary: string | undefined;
	if (role === "default" || role === "validation") {
		primary = config.models[role];
	} else {
		primary = config.models.agents?.[role];
	}

	if (attempt === 0) {
		return primary ?? config.models.default;
	}

	// Attempt > 0: traverse fallback chain
	const fallbacks = config.models.fallbacks?.[role];
	if (!fallbacks || !Array.isArray(fallbacks)) {
		return null;
	}

	const fallbackIndex = attempt - 1;
	if (fallbackIndex >= fallbacks.length) {
		return null;
	}

	return fallbacks[fallbackIndex] ?? null;
}

// ── Error classification ──────────────────────────────────

const RATE_LIMIT_PATTERNS = [
	/rate.?limit/i,
	/too many requests/i,
	/429/,
	/quota.?exceeded/i,
	/throttl/i,
	/capacity/i,
	/overloaded/i,
];

const MODEL_NOT_FOUND_PATTERNS = [
	/model.?not.?found/i,
	/model.?not.?supported/i,
	/unknown.?model/i,
	/invalid.?model/i,
	/does.?not.?exist/i,
	/no.?such.?model/i,
	/404/,
	/not.?available.?for.?your/i,
];

const PROVIDER_UNAVAILABLE_PATTERNS = [
	/service.?unavailable/i,
	/503/,
	/502/,
	/connection.?refused/i,
	/network.?error/i,
	/timeout/i,
	/ECONNREFUSED/,
	/ENOTFOUND/,
	/temporarily.?unavailable/i,
	/internal.?server.?error/i,
	/500/,
];

/**
 * Classify a provider error message into a known category.
 */
export function classifyProviderError(errorMsg: string): ProviderErrorType {
	if (!errorMsg || typeof errorMsg !== "string") {
		return "unknown";
	}

	for (const pattern of RATE_LIMIT_PATTERNS) {
		if (pattern.test(errorMsg)) return "rate_limit";
	}

	for (const pattern of MODEL_NOT_FOUND_PATTERNS) {
		if (pattern.test(errorMsg)) return "model_not_found";
	}

	for (const pattern of PROVIDER_UNAVAILABLE_PATTERNS) {
		if (pattern.test(errorMsg)) return "provider_unavailable";
	}

	return "unknown";
}

// ── Role identification ───────────────────────────────────

/**
 * Try to identify the model role from a model string by matching
 * against the current config. Returns null if no match found.
 */
function identifyRoleFromModel(model: string): ModelRole | null {
	const config = getModelConfig();
	const normalizedModel = model.toLowerCase().trim();

	if (config.models.default?.toLowerCase() === normalizedModel) return "default";
	if (config.models.validation?.toLowerCase() === normalizedModel) return "validation";

	const agents = config.models.agents;
	if (agents) {
		for (const [role, roleModel] of Object.entries(agents)) {
			if (roleModel?.toLowerCase() === normalizedModel) {
				return role as ModelRole;
			}
		}
	}

	return null;
}

// ── System prompt context ─────────────────────────────────

/**
 * Generate a concise model routing context block for system prompt injection.
 * Includes the current model routing table and any fallback chains.
 */
export function getModelRoutingContext(): string {
	const config = getModelConfig();
	const lines: string[] = [];

	lines.push("<model-routing>");
	lines.push(`Provider: ${config.provider}`);
	lines.push("Role → Model:");
	lines.push(`  default: ${config.models.default}`);

	if (config.models.agents) {
		for (const [role, model] of Object.entries(config.models.agents)) {
			if (model) {
				lines.push(`  ${role}: ${model}`);
			}
		}
	}

	if (config.models.fallbacks && Object.keys(config.models.fallbacks).length > 0) {
		lines.push("Fallbacks (if primary model fails):");
		for (const [role, chain] of Object.entries(config.models.fallbacks)) {
			if (chain && chain.length > 0) {
				lines.push(`  ${role}: ${chain.join(" → ")}`);
			}
		}
	}

	lines.push("</model-routing>");

	return lines.join("\n");
}

/**
 * Format a fallback suggestion as a system-reminder block.
 */
export function formatFallbackReminder(suggestion: FallbackSuggestion): string {
	const lines: string[] = [];

	lines.push("<system-reminder>");
	lines.push(`The model "${suggestion.failedModel}" encountered an error: ${suggestion.errorType}.`);

	if (suggestion.suggestedModel) {
		lines.push(
			`Suggested fallback: use "${suggestion.suggestedModel}" instead` +
			(suggestion.role ? ` for the "${suggestion.role}" role.` : "."),
		);
	} else {
		lines.push("No fallback models configured for this role. Consider using a different provider.");
	}

	lines.push("</system-reminder>");

	return lines.join("\n");
}
