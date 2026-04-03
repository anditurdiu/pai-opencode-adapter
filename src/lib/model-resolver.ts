/**
 * Model Resolver
 *
 * Provider health tracking, fallback chain resolution, and error classification.
 * Works with PAI agent names (PascalCase) as defined in PAI's skills/Agents/.
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

export type ProviderErrorType =
	| "rate_limit"
	| "model_not_found"
	| "provider_unavailable"
	| "unknown";

export interface FallbackSuggestion {
	failedModel: string;
	errorType: ProviderErrorType;
	suggestedModel: string | null;
	role: string | null;
	subagentType: string | null;
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

// ── Provider health tracking ──────────────────────────────

const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;

interface ProviderHealthEntry {
	provider: string;
	errorType: ProviderErrorType;
	markedAt: number;
	expiresAt: number;
	errorMessage: string;
}

const providerHealth = new Map<string, ProviderHealthEntry>();

export function markProviderUnhealthy(
	provider: string,
	errorType: ProviderErrorType,
	errorMessage = "",
): void {
	const now = Date.now();
	providerHealth.set(provider, {
		provider,
		errorType,
		markedAt: now,
		expiresAt: now + PROVIDER_COOLDOWN_MS,
		errorMessage: errorMessage.slice(0, 200),
	});
	fileLog(
		`[provider-health] Marked provider "${provider}" as unhealthy: ${errorType} (cooldown: ${PROVIDER_COOLDOWN_MS / 1000}s)`,
		"warn",
	);
}

export function getProviderHealth(provider: string): ProviderHealthEntry | null {
	const entry = providerHealth.get(provider);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		providerHealth.delete(provider);
		fileLog(`[provider-health] Provider "${provider}" cooldown expired, marking healthy`, "info");
		return null;
	}
	return entry;
}

export function extractProvider(modelString: string): string {
	const slashIndex = modelString.indexOf("/");
	if (slashIndex === -1) return modelString;
	return modelString.slice(0, slashIndex);
}

// ── Subagent health check ─────────────────────────────────

export function checkSubagentHealth(subagentType: string): {
	blocked: true;
	reason: string;
	unhealthyProvider: string;
	unhealthyModel: string;
	alternatives: Array<{ type: string; model: string }>;
} | null {
	const config = getModelConfig();
	const agents = config.models.agents;
	if (!agents) return null;

	// OpenCode built-in aliases → PAI names
	const aliasMap: Record<string, string> = {
		general: "Engineer",
	};
	const resolvedName = aliasMap[subagentType] ?? subagentType;

	const model = agents[resolvedName];
	if (!model) return null;

	const provider = extractProvider(model);
	const health = getProviderHealth(provider);
	if (!health) return null;

	const altAgentTypes = getAlternativeAgentTypes(subagentType);
	const remainingSec = Math.ceil((health.expiresAt - Date.now()) / 1000);

	return {
		blocked: true,
		reason:
			`Provider "${provider}" is currently unhealthy (${health.errorType}, ` +
			`cooldown: ${remainingSec}s remaining). Model: ${model}. ` +
			(altAgentTypes.length > 0
				? `Use an alternative subagent_type: ${altAgentTypes.map(a => `"${a.type}" (${a.model})`).join(", ")}`
				: `No alternative agents available. Perform the work directly yourself.`),
		unhealthyProvider: provider,
		unhealthyModel: model,
		alternatives: altAgentTypes,
	};
}

export function clearProviderHealth(): void {
	providerHealth.clear();
}

// ── Fallback suggestions ──────────────────────────────────

export function setFallbackSuggestion(
	sessionId: string,
	failedModel: string,
	errorType: ProviderErrorType,
	role?: string,
	subagentType?: string,
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
		subagentType: subagentType ?? null,
		timestamp: Date.now(),
	};

	fallbackState.set(sessionId, suggestion);
	fileLog(
		`[model-resolver] Fallback set for session=${sessionId}: ` +
		`${failedModel} (${errorType}) → ${nextModel ?? "chain exhausted"}` +
		(subagentType ? ` [subagent: ${subagentType}]` : ""),
		"info",
	);
}

export function consumeFallbackSuggestion(sessionId: string): FallbackSuggestion | null {
	const suggestion = fallbackState.get(sessionId) ?? null;
	if (suggestion) {
		fallbackState.delete(sessionId);
	}
	return suggestion;
}

export function clearFallbackState(sessionId: string): void {
	fallbackState.delete(sessionId);
}

// ── Config loading ────────────────────────────────────────

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

	const userAgents: Record<string, string> = {};
	if (userConfig?.agents) {
		for (const [name, agentEntry] of Object.entries(userConfig.agents)) {
			if (agentEntry?.model) {
				userAgents[name] = agentEntry.model;
			}
		}
	}

	const mergedAgents: Record<string, string> = { ...(preset.agents ?? {}) };
	for (const [name, model] of Object.entries(userAgents)) {
		mergedAgents[name] = model;
	}

	const merged: ProviderModels & { fallbacks?: Record<string, string[]> } = {
		default: userConfig?.models?.default ?? preset.default,
		validation: userConfig?.models?.validation ?? preset.validation,
		agents: mergedAgents,
	};

	const userFallbacks = userConfig?.fallbacks;
	if (userFallbacks && typeof userFallbacks === "object") {
		merged.fallbacks = { ...userFallbacks };
	}

	return { provider, models: merged };
}

// ── Model resolution ──────────────────────────────────────

export function resolveModel(role: string, attempt = 0): string | null {
	const config = getModelConfig();

	let primary: string | undefined;
	if (role === "default" || role === "validation") {
		primary = config.models[role];
	} else {
		primary = config.models.agents?.[role];
	}

	if (attempt === 0) {
		return primary ?? config.models.default;
	}

	const fallbacks = config.models.fallbacks?.[role] ?? config.models.fallbacks?.["default"];
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
	/\b429\b/,
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
	/\b404\b/,
	/not.?available.?for.?your/i,
];

const PROVIDER_UNAVAILABLE_PATTERNS = [
	/service.?unavailable/i,
	/\b503\b/,
	/\b502\b/,
	/connection.?refused/i,
	/network.?error/i,
	/timeout/i,
	/ECONNREFUSED/,
	/ENOTFOUND/,
	/temporarily.?unavailable/i,
	/internal.?server.?error/i,
	/\b500\b/,
];

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

function identifyRoleFromModel(model: string): string | null {
	const config = getModelConfig();
	const normalizedModel = model.toLowerCase().trim();

	if (config.models.default?.toLowerCase() === normalizedModel) return "default";
	if (config.models.validation?.toLowerCase() === normalizedModel) return "validation";

	const agents = config.models.agents;
	if (agents) {
		for (const [agentName, agentModel] of Object.entries(agents)) {
			if (agentModel?.toLowerCase() === normalizedModel) {
				return agentName;
			}
		}
	}

	return null;
}

// ── System prompt context ─────────────────────────────────

export function getModelRoutingContext(): string {
	const config = getModelConfig();
	const lines: string[] = [];

	lines.push("<model-routing>");
	lines.push(`Provider: ${config.provider}`);
	lines.push("Agent → Model:");
	lines.push(`  default: ${config.models.default}`);

	if (config.models.agents) {
		for (const [agentName, model] of Object.entries(config.models.agents)) {
			if (model) {
				lines.push(`  ${agentName}: ${model}`);
			}
		}
	}

	if (config.models.fallbacks && Object.keys(config.models.fallbacks).length > 0) {
		lines.push("Fallbacks (if primary model fails):");
		for (const [agentName, chain] of Object.entries(config.models.fallbacks)) {
			if (chain && chain.length > 0) {
				lines.push(`  ${agentName}: ${chain.join(" → ")}`);
			}
		}
	}

	lines.push("</model-routing>");

	return lines.join("\n");
}

export function formatFallbackReminder(suggestion: FallbackSuggestion): string {
	const lines: string[] = [];

	lines.push("<system-reminder>");
	lines.push(`## Provider Error — Automatic Fallback Required`);
	lines.push("");
	lines.push(`A Task call failed with: **${suggestion.errorType}**`);
	if (suggestion.failedModel) {
		lines.push(`Failed model: \`${suggestion.failedModel}\``);
	}
	if (suggestion.subagentType) {
		lines.push(`Failed subagent_type: \`${suggestion.subagentType}\``);
	}
	lines.push("");

	const altAgentTypes = getAlternativeAgentTypes(suggestion.subagentType ?? "");

	if (altAgentTypes.length > 0) {
		lines.push("### Action Required");
		lines.push(`Retry the failed task using a different \`subagent_type\`. These alternatives use different models/providers:`);
		for (const alt of altAgentTypes) {
			lines.push(`- \`subagent_type: "${alt.type}"\` → uses \`${alt.model}\``);
		}
		lines.push("");
		lines.push("Re-issue the same Task call with the alternative subagent_type above. Keep the same prompt/description.");
	} else if (suggestion.suggestedModel) {
		lines.push(`Suggested fallback model: \`${suggestion.suggestedModel}\``);
		lines.push("Note: You cannot override the model directly. Try a different subagent_type or simplify the task.");
	} else {
		lines.push("No fallback agents available. Perform the work directly yourself without delegating.");
	}

	lines.push("</system-reminder>");

	return lines.join("\n");
}

function getAlternativeAgentTypes(
	failedType: string,
): Array<{ type: string; model: string }> {
	const config = getModelConfig();
	const agents = config.models.agents;
	if (!agents) return [];

	const agentTypeToModel: Record<string, string> = {};
	for (const [name, model] of Object.entries(agents)) {
		if (model) {
			agentTypeToModel[name] = model;
		}
	}

	// Include OpenCode aliases
	if (agents.Engineer) agentTypeToModel["general"] = agents.Engineer;

	const failedModel = agentTypeToModel[failedType] ?? "";
	const failedProvider = extractProvider(failedModel);

	const alternatives: Array<{ type: string; model: string }> = [];

	for (const [altType, altModel] of Object.entries(agentTypeToModel)) {
		if (altType !== failedType && altModel !== failedModel) {
			const altProvider = extractProvider(altModel);
			if (altProvider !== failedProvider) {
				alternatives.push({ type: altType, model: altModel });
			}
		}
		if (alternatives.length >= 3) break;
	}

	return alternatives;
}
