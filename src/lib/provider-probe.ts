/**
 * Provider Health Probe
 *
 * Pre-flight HTTP health check for model providers before subagent spawn.
 * Detects unhealthy providers (quota exceeded, auth failures, outages) BEFORE
 * OpenCode enters its infinite internal retry loop.
 *
 * Only probes providers with explicit `baseURL` + `apiKey` in opencode.json.
 * For env-based providers (github-copilot, google, zai-coding-plan), assumes
 * healthy — we can't construct a probe request without knowing the endpoint.
 *
 * On probe failure, walks the fallback chain from pai-adapter.json to find
 * the first healthy model for the given agent type.
 *
 * @module lib/provider-probe
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "./file-logger.js";
import { getOpenCodeConfigPath, getConfigDir, getAdapterConfigPath } from "./paths.js";
import { markProviderUnhealthy, classifyProviderError, extractProvider } from "./model-resolver.js";

// ── Types ─────────────────────────────────────────────────

export type ApiFormat = "anthropic" | "openai";

export interface ProviderEndpoint {
	baseURL: string;
	apiKey: string;
	apiFormat: ApiFormat;
	npm?: string;
}

export interface ProbeResult {
	healthy: boolean;
	provider: string;
	model: string;
	cachedAt?: number;
	error?: string;
}

// ── Probe cache ───────────────────────────────────────────

const PROBE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

interface ProbeCacheEntry {
	healthy: boolean;
	timestamp: number;
	error?: string;
}

const probeCache = new Map<string, ProbeCacheEntry>();

/**
 * Clear the probe cache. For testing.
 */
export function clearProbeCache(): void {
	probeCache.clear();
}

// ── Provider endpoint resolution ──────────────────────────

/**
 * Resolve the HTTP endpoint for a provider by reading opencode.json.
 * Returns the endpoint info if the provider has explicit baseURL + apiKey,
 * or null if the provider uses env-based auth (not probe-able).
 */
export function resolveProviderEndpoint(providerName: string): ProviderEndpoint | null {
	const configPath = getOpenCodeConfigPath();
	if (!existsSync(configPath)) {
		fileLog(`[provider-probe] opencode.json not found at ${configPath}`, "warn");
		return null;
	}

	try {
		const raw = readFileSync(configPath, "utf-8");
		const config = JSON.parse(raw) as {
			provider?: Record<string, {
				npm?: string;
				options?: {
					baseURL?: string;
					apiKey?: string;
				};
				models?: Record<string, unknown>;
			}>;
		};

		const provider = config.provider?.[providerName];
		if (!provider) {
			fileLog(`[provider-probe] Provider "${providerName}" not found in opencode.json`, "debug");
			return null;
		}

		const baseURL = provider.options?.baseURL;
		const apiKey = provider.options?.apiKey;

		if (!baseURL || !apiKey) {
			fileLog(
				`[provider-probe] Provider "${providerName}" has no explicit baseURL/apiKey, not probe-able`,
				"debug",
			);
			return null;
		}

		const apiFormat = detectApiFormat(provider.npm);

		return {
			baseURL,
			apiKey,
			apiFormat,
			npm: provider.npm,
		};
	} catch (err) {
		fileLog(`[provider-probe] Failed to parse opencode.json: ${err}`, "warn");
		return null;
	}
}

/**
 * Detect the API format based on the npm package name.
 * @ai-sdk/anthropic → Anthropic Messages API format
 * Everything else → OpenAI Chat Completions format
 */
export function detectApiFormat(npm?: string): ApiFormat {
	if (npm && npm.includes("anthropic")) {
		return "anthropic";
	}
	return "openai";
}

// ── HTTP probe ────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 5_000;

/**
 * Probe a provider's API endpoint with a minimal request.
 *
 * Sends a tiny completion request (max_tokens:1) to test if the provider
 * is responsive and authenticated. Uses a 5-second timeout.
 *
 * @param modelString - Full model string like "bailian-coding-plan/glm-4.7"
 * @returns ProbeResult indicating health status
 */
export async function probeProvider(modelString: string): Promise<ProbeResult> {
	const provider = extractProvider(modelString);
	const modelName = modelString.includes("/") ? modelString.split("/").slice(1).join("/") : modelString;

	// Check cache first
	const cached = probeCache.get(provider);
	if (cached && (Date.now() - cached.timestamp) < PROBE_CACHE_TTL_MS) {
		fileLog(
			`[provider-probe] Cache hit for "${provider}": ${cached.healthy ? "healthy" : "unhealthy"}`,
			"debug",
		);
		return {
			healthy: cached.healthy,
			provider,
			model: modelString,
			cachedAt: cached.timestamp,
			error: cached.error,
		};
	}

	// Resolve endpoint
	const endpoint = resolveProviderEndpoint(provider);
	if (!endpoint) {
		// Provider cannot be probed — assume healthy (skip probe)
		return {
			healthy: true,
			provider,
			model: modelString,
		};
	}

	// Build probe request
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

	try {
		const { url, headers, body } = buildProbeRequest(endpoint, modelName);

		fileLog(
			`[provider-probe] Probing provider "${provider}" (model: ${modelName}, format: ${endpoint.apiFormat})`,
			"info",
		);

		const response = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		clearTimeout(timeout);

		// Any 2xx or even a 4xx that isn't auth/quota related means the provider is reachable.
		// We specifically care about: 401 (auth), 403 (forbidden), 429 (rate limit/quota), 5xx (down)
		if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403 && response.status !== 429)) {
			// Provider is healthy (or returned a normal client error like 400 bad request)
			probeCache.set(provider, { healthy: true, timestamp: Date.now() });
			fileLog(`[provider-probe] Provider "${provider}" is healthy (status: ${response.status})`, "info");
			return { healthy: true, provider, model: modelString };
		}

		// Read error body for classification
		let errorBody = "";
		try {
			errorBody = await response.text();
		} catch {
			errorBody = `HTTP ${response.status}`;
		}

		const errorMsg = `HTTP ${response.status}: ${errorBody.slice(0, 300)}`;
		const errorType = classifyProviderError(errorMsg);

		// Mark unhealthy
		probeCache.set(provider, { healthy: false, timestamp: Date.now(), error: errorMsg });
		markProviderUnhealthy(provider, errorType, errorMsg);

		fileLog(
			`[provider-probe] Provider "${provider}" probe FAILED: ${errorMsg.slice(0, 200)}`,
			"warn",
		);

		return {
			healthy: false,
			provider,
			model: modelString,
			error: errorMsg,
		};
	} catch (err) {
		clearTimeout(timeout);

		const errorMsg = err instanceof Error
			? (err.name === "AbortError" ? `Probe timeout (${PROBE_TIMEOUT_MS}ms)` : err.message)
			: String(err);

		const errorType = classifyProviderError(errorMsg);
		probeCache.set(provider, { healthy: false, timestamp: Date.now(), error: errorMsg });
		markProviderUnhealthy(provider, errorType, errorMsg);

		fileLog(
			`[provider-probe] Provider "${provider}" probe EXCEPTION: ${errorMsg}`,
			"warn",
		);

		return {
			healthy: false,
			provider,
			model: modelString,
			error: errorMsg,
		};
	}
}

/**
 * Build the HTTP request for a probe based on API format.
 */
function buildProbeRequest(
	endpoint: ProviderEndpoint,
	modelName: string,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
	if (endpoint.apiFormat === "anthropic") {
		return {
			url: `${endpoint.baseURL.replace(/\/+$/, "")}/messages`,
			headers: {
				"Content-Type": "application/json",
				"x-api-key": endpoint.apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: {
				model: modelName,
				max_tokens: 1,
				messages: [{ role: "user", content: "hi" }],
			},
		};
	}

	// OpenAI format
	return {
		url: `${endpoint.baseURL.replace(/\/+$/, "")}/chat/completions`,
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${endpoint.apiKey}`,
		},
		body: {
			model: modelName,
			max_tokens: 1,
			messages: [{ role: "user", content: "hi" }],
		},
	};
}

// ── Agent model reading ───────────────────────────────────

/**
 * Read the current model assignment for an agent from pai-adapter.json.
 *
 * @param agentName - Agent name, e.g., "Engineer", "GeminiResearcher"
 * @returns The model string (e.g., "bailian-coding-plan/glm-4.7") or null
 */
export function readAgentModel(agentName: string): string | null {
	const configPath = getAdapterConfigPath();

	if (!existsSync(configPath)) {
		fileLog(`[provider-probe] pai-adapter.json not found: ${configPath}`, "debug");
		return null;
	}

	try {
		const raw = readFileSync(configPath, "utf-8");
		const config = JSON.parse(raw) as { agents?: Record<string, { model?: string }> };
		const model = config.agents?.[agentName]?.model;
		if (!model) {
			fileLog(`[provider-probe] No model found for agent "${agentName}" in pai-adapter.json`, "debug");
			return null;
		}
		return model;
	} catch (err) {
		fileLog(`[provider-probe] Failed to read agent model for "${agentName}": ${err}`, "warn");
		return null;
	}
}

// ── Fallback resolution ───────────────────────────────────

/**
 * Find the first healthy model from the fallback chain for a given agent.
 *
 * Lookup order for fallback chains in pai-adapter.json:
 * 1. Agent name directly (e.g., "intern", "research-claude") — 1:1 mapping
 * 2. "default" chain
 *
 * For each candidate in the chain, probes the provider (if probe-able).
 * Non-probe-able providers (github-copilot, google, etc.) are assumed healthy.
 *
 * @param subagentType - The subagent type name (e.g., "intern", "explorer")
 * @returns The first healthy model string, or null if chain exhausted
 */
export async function findHealthyFallback(subagentType: string): Promise<string | null> {
	// Load fallback chains from pai-adapter.json
	const configPath = getAdapterConfigPath();
	let fallbacks: Record<string, string[]> = {};

	try {
		if (existsSync(configPath)) {
			const raw = readFileSync(configPath, "utf-8");
			const config = JSON.parse(raw) as { fallbacks?: Record<string, string[]> };
			fallbacks = config.fallbacks ?? {};
		}
	} catch (err) {
		fileLog(`[provider-probe] Failed to load fallback chains: ${err}`, "warn");
		return null;
	}

	// Resolve fallback chain: agent name → "default"
	let chain: string[] | undefined;

	// 1. Try agent name directly (1:1 mapping)
	chain = fallbacks[subagentType];

	// 2. Try "default"
	if (!chain || chain.length === 0) {
		chain = fallbacks["default"];
	}

	if (!chain || chain.length === 0) {
		fileLog(
			`[provider-probe] No fallback chain found for subagent "${subagentType}"`,
			"warn",
		);
		return null;
	}

	fileLog(
		`[provider-probe] Walking fallback chain for "${subagentType}": [${chain.join(", ")}]`,
		"info",
	);

	// Probe each candidate sequentially
	for (const candidate of chain) {
		const result = await probeProvider(candidate);
		if (result.healthy) {
			fileLog(
				`[provider-probe] Healthy fallback found for "${subagentType}": ${candidate}`,
				"info",
			);
			return candidate;
		}
		fileLog(
			`[provider-probe] Fallback "${candidate}" is unhealthy: ${result.error ?? "unknown"}`,
			"info",
		);
	}

	fileLog(
		`[provider-probe] Fallback chain exhausted for "${subagentType}" — no healthy models found`,
		"warn",
	);
	return null;
}
