/**
 * PAI-OpenCode Config Translator
 *
 * Translates PAI's settings.json format into OpenCode's opencode.json format.
 * Handles provider auto-detection, merge semantics, and file watching.
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 *
 * @module adapters/config-translator
 */

import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileLog } from "../lib/file-logger.js";

/**
 * PAI settings.json shape
 * Based on Releases/v4.0.3/.claude/settings.json structure
 */
export interface PAISettings {
  $schema?: string;
  env?: Record<string, string>;
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
    defaultMode?: string;
  };
  enableAllProjectMcpServers?: boolean;
  enabledMcpjsonServers?: string[];
  hooks?: Record<string, unknown>;
  statusLine?: {
    type: string;
    command: string;
  };
  spinnerVerbs?: {
    mode?: string;
    verbs?: string[];
  };
  spinnerTipsOverride?: {
    excludeDefault?: boolean;
    tips?: string[];
  };
  plansDirectory?: string;
  loadAtStartup?: {
    _docs?: string;
    files?: string[];
  };
  dynamicContext?: {
    _docs?: string;
    relationshipContext?: boolean;
    learningReadback?: boolean;
    activeWorkSummary?: boolean;
  };
  contextFiles?: string[];
  mcpServers?: Record<string, { url?: string; command?: string; args?: string[] }>;
  teammateMode?: string;
  daidentity?: {
    name?: string;
    fullName?: string;
    displayName?: string;
    color?: string;
    voices?: Record<string, unknown>;
    personality?: Record<string, number>;
    startupCatchphrase?: string;
  };
  principal?: {
    name?: string;
    timezone?: string;
    voiceClone?: {
      voiceId?: string;
      voiceName?: string;
      provider?: string;
    };
  };
  pai?: {
    repoUrl?: string;
    version?: string;
    algorithmVersion?: string;
  };
  preferences?: Record<string, unknown>;
  contextDisplay?: {
    compactionThreshold?: number;
    _docs?: string;
  };
  techStack?: Record<string, string>;
  _docs?: Record<string, unknown>;
  feedbackSurveyState?: {
    lastShownTime?: number;
  };
  max_tokens?: number;
  notifications?: {
    ntfy?: { enabled?: boolean; topic?: string; server?: string };
    discord?: { enabled?: boolean; webhook?: string };
    twilio?: { enabled?: boolean; toNumber?: string };
    thresholds?: { longTaskMinutes?: number };
    routing?: Record<string, string[]>;
  };
  counts?: {
    skills?: number;
    workflows?: number;
    hooks?: number;
    signals?: number;
    files?: number;
    work?: number;
    sessions?: number;
    research?: number;
    ratings?: number;
    updatedAt?: string;
  };
  [key: string]: unknown;
}

/**
 * OpenCode opencode.json shape
 * Based on OpenCode's configuration schema.
 * NOTE: Plugin-specific config (identity, models, notifications) goes in
 * ~/.config/opencode/pai-adapter.json, NOT here.
 */
export interface OpenCodeConfig {
  $schema?: string;
  provider?: string;
  model?: string;
  theme?: string;
  keybinds?: Record<string, string>;
  plugin?: string[];
  agent?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * PAI adapter config shape (pai-adapter.json)
 * Plugin-specific configuration, separate from opencode.json.
 */
export interface PAIAdapterConfig {
  paiDir?: string;
  pluginDir?: string;
  model_provider?: ProviderType;
  models?: ProviderModels;
  identity?: {
    aiName?: string;
    aiFullName?: string;
    userName?: string;
    timezone?: string;
  };
  daidentity?: Record<string, unknown>;
  principal?: Record<string, unknown>;
  voice?: {
    enabled?: boolean;
    elevenLabsApiKey?: string;
    voiceId?: string;
    model?: string;
    greeting?: string;
  };
  notifications?: {
    ntfy?: { enabled?: boolean; topic?: string; server?: string };
    discord?: { enabled?: boolean; webhookUrl?: string };
    thresholds?: { longTaskMinutes?: number };
  };
  logging?: {
    debugLog?: string;
    sessionLogDir?: string;
    level?: string;
  };
  installedVersion?: string;
  paiVersion?: string;
  installedAt?: string;
  [key: string]: unknown;
}

export type ProviderType = "zen" | "anthropic" | "openai" | "google" | "ollama";

export interface ProviderModels {
  default: string;
  validation?: string;
  agents?: {
    intern?: string;
    architect?: string;
    engineer?: string;
    explorer?: string;
    reviewer?: string;
  };
  /**
   * Per-role fallback chains. When a primary model fails (rate limit, not found,
   * unavailable), the adapter suggests the next model in the chain.
   * Keys are role names (default, intern, architect, etc.).
   * Values are ordered arrays of fallback model strings.
   *
   * @example
   * {
   *   "default": ["openai/gpt-4o", "google/gemini-2.5-pro"],
   *   "intern": ["openai/gpt-4o-mini", "google/gemini-flash"]
   * }
   */
  fallbacks?: Record<string, string[]>;
}

const PROVIDER_PRESETS: Record<ProviderType, ProviderModels> = {
  zen: {
    default: "opencode/grok-code",
    validation: "opencode/grok-code",
    agents: {
      intern: "opencode/gpt-5-nano",
      architect: "opencode/big-pickle",
      engineer: "opencode/grok-code",
      explorer: "opencode/grok-code",
      reviewer: "opencode/big-pickle",
    },
  },
  anthropic: {
    default: "anthropic/claude-sonnet-4-5",
    validation: "anthropic/claude-sonnet-4-5",
    agents: {
      intern: "anthropic/claude-haiku-4-5",
      architect: "anthropic/claude-sonnet-4-5",
      engineer: "anthropic/claude-sonnet-4-5",
      explorer: "anthropic/claude-sonnet-4-5",
      reviewer: "anthropic/claude-opus-4-5",
    },
  },
  openai: {
    default: "openai/gpt-4o",
    validation: "openai/gpt-4o",
    agents: {
      intern: "openai/gpt-4o-mini",
      architect: "openai/gpt-4o",
      engineer: "openai/gpt-4o",
      explorer: "openai/gpt-4o",
      reviewer: "openai/gpt-4o",
    },
  },
  google: {
    default: "google/gemini-pro",
    validation: "google/gemini-pro",
    agents: {
      intern: "google/gemini-flash",
      architect: "google/gemini-pro",
      engineer: "google/gemini-pro",
      explorer: "google/gemini-flash",
      reviewer: "google/gemini-pro",
    },
  },
  ollama: {
    default: "ollama/llama3",
    validation: "ollama/llama3",
    agents: {
      intern: "ollama/llama3",
      architect: "ollama/llama3",
      engineer: "ollama/llama3",
      explorer: "ollama/llama3",
      reviewer: "ollama/llama3",
    },
  },
};

const PAI_PLUGIN_ID = "pai-opencode-adapter";

export function detectProvider(model: string): ProviderType {
  if (!model || typeof model !== "string") {
    fileLog("No model provided, defaulting to anthropic", "debug");
    return "anthropic";
  }

  const normalizedModel = model.toLowerCase().trim();

  if (normalizedModel.startsWith("anthropic/")) return "anthropic";
  if (normalizedModel.startsWith("openai/")) return "openai";
  if (normalizedModel.startsWith("google/") || normalizedModel.startsWith("gemini")) return "google";
  if (normalizedModel.startsWith("ollama/")) return "ollama";
  if (normalizedModel.startsWith("opencode/")) return "zen";

  if (normalizedModel.includes("claude")) return "anthropic";
  if (normalizedModel.includes("gpt") || normalizedModel.includes("o1") || normalizedModel.includes("o3")) return "openai";
  if (normalizedModel.includes("gemini")) return "google";
  if (normalizedModel.includes("llama") || normalizedModel.includes("mistral")) return "ollama";

  fileLog(`config-translator: Unknown model "${model}", defaulting to anthropic`, "warn");
  return "anthropic";
}

/**
 * Get provider preset configuration
 *
 * @param provider - Provider type
 * @returns Model configuration for the provider
 */
export function getProviderPreset(provider: ProviderType): ProviderModels {
  return PROVIDER_PRESETS[provider];
}

/**
 * Result of config translation — produces two separate configs.
 */
export interface TranslationResult {
  /** OpenCode's opencode.json (only standard OpenCode keys) */
  openCodeConfig: OpenCodeConfig;
  /** PAI adapter config (pai-adapter.json) */
  adapterConfig: PAIAdapterConfig;
}

/**
 * Translate PAI settings.json into OpenCode opencode.json + pai-adapter.json
 *
 * Merge strategy:
 * - OpenCode config: only standard keys (provider, model, plugin)
 * - PAI adapter config: identity, models, notifications, voice
 * - Plugin array: merge (add pai-opencode-adapter plugin if not already present)
 *
 * @param settingsJson - PAI settings.json content
 * @param existingOCConfig - Existing opencode.json content (optional)
 * @param existingAdapterConfig - Existing pai-adapter.json content (optional)
 * @returns Translation result with both configs
 */
export function translateConfig(
  settingsJson: PAISettings,
  existingOCConfig?: Partial<OpenCodeConfig>,
  existingAdapterConfig?: Partial<PAIAdapterConfig>
): TranslationResult {
  fileLog("Starting config translation", "info");

  const baseConfig: OpenCodeConfig = existingOCConfig ? { ...existingOCConfig } : {};
  const baseAdapterConfig: PAIAdapterConfig = existingAdapterConfig ? { ...existingAdapterConfig } : {};

  const aiName = settingsJson.daidentity?.name;
  const aiFullName = settingsJson.daidentity?.fullName || settingsJson.daidentity?.displayName;
  const userName = settingsJson.principal?.name;
  const timezone = settingsJson.principal?.timezone;

  const modelString = baseConfig.model || settingsJson.max_tokens?.toString();
  const provider = (baseConfig.provider || detectProvider(modelString || "")) as ProviderType;
  const preset = getProviderPreset(provider);

  // Build adapter config (pai-adapter.json)
  // Deep-merge: user model overrides > provider presets, with fallbacks preserved
  const userModels = baseAdapterConfig.models;
  const mergedModels: ProviderModels = {
    default: userModels?.default ?? preset.default,
    validation: userModels?.validation ?? preset.validation,
    agents: {
      intern: userModels?.agents?.intern ?? preset.agents?.intern,
      architect: userModels?.agents?.architect ?? preset.agents?.architect,
      engineer: userModels?.agents?.engineer ?? preset.agents?.engineer,
      explorer: userModels?.agents?.explorer ?? preset.agents?.explorer,
      reviewer: userModels?.agents?.reviewer ?? preset.agents?.reviewer,
    },
    // Fallbacks come from user config only — presets don't define them
    ...(userModels?.fallbacks && { fallbacks: userModels.fallbacks }),
  };

  const adapterConfig: PAIAdapterConfig = {
    ...baseAdapterConfig,
    model_provider: provider,
    models: mergedModels,
    identity: {
      ...(baseAdapterConfig.identity || {}),
      ...(aiName !== undefined && { aiName }),
      ...(aiFullName !== undefined && { aiFullName }),
      ...(userName !== undefined && { userName }),
      ...(timezone !== undefined && { timezone }),
    },
  };

  // Copy identity sections from PAI settings if present
  if (settingsJson.daidentity) {
    adapterConfig.daidentity = settingsJson.daidentity as Record<string, unknown>;
  }
  if (settingsJson.principal) {
    adapterConfig.principal = settingsJson.principal as Record<string, unknown>;
  }

  // Map PAI startupCatchphrase to adapter voice.greeting
  const startupCatchphrase = settingsJson.daidentity?.startupCatchphrase;
  if (startupCatchphrase) {
    adapterConfig.voice = {
      ...(baseAdapterConfig.voice || {}),
      ...(adapterConfig.voice || {}),
      greeting: startupCatchphrase,
    };
  }

  if (settingsJson.notifications) {
    adapterConfig.notifications = {
      ...(baseAdapterConfig.notifications || {}),
      ntfy: settingsJson.notifications.ntfy ? {
        enabled: settingsJson.notifications.ntfy.enabled ?? false,
        topic: settingsJson.notifications.ntfy.topic ?? "",
        server: settingsJson.notifications.ntfy.server ?? "ntfy.sh",
      } : baseAdapterConfig.notifications?.ntfy,
      discord: settingsJson.notifications.discord ? {
        enabled: settingsJson.notifications.discord.enabled ?? false,
        webhookUrl: settingsJson.notifications.discord.webhook ?? "",
      } : baseAdapterConfig.notifications?.discord,
    };
  }

  // Build OpenCode config (opencode.json) — only standard keys
  const existingPlugins = baseConfig.plugin || [];
  const plugins = [...existingPlugins];
  if (!plugins.includes(PAI_PLUGIN_ID)) {
    plugins.push(PAI_PLUGIN_ID);
  }

  const openCodeConfig: OpenCodeConfig = {
    ...baseConfig,
    provider,
    model: baseConfig.model || preset.default,
    plugin: plugins,
  };

  // Remove pai key from opencode.json if it was left over from old config
  delete openCodeConfig.pai;

  fileLog(`Translation complete: provider=${provider}, model=${openCodeConfig.model}`, "info");

  return { openCodeConfig, adapterConfig };
}

/**
 * Read and parse JSON file safely
 *
 * @param filePath - Path to JSON file
 * @returns Parsed JSON object or null if file doesn't exist/parse fails
 */
function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) {
      fileLog(`File not found: ${filePath}`, "debug");
      return null;
    }

    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    fileLog(`Error reading ${filePath}: ${error}`, "error");
    return null;
  }
}

/**
 * Write JSON file atomically (write to temp, then rename)
 *
 * @param filePath - Target file path
 * @param data - Data to write
 */
function writeJsonFileAtomic(filePath: string, data: unknown): void {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = JSON.stringify(data, null, 2);
    writeFileSync(filePath, content, "utf-8");

    fileLog(`Wrote config to ${filePath}`, "info");
  } catch (error) {
    fileLog(`Error writing ${filePath}: ${error}`, "error");
  }
}

/**
 * Watch settings.json for changes and re-merge with opencode.json + pai-adapter.json
 *
 * @param settingsPath - Path to PAI settings.json
 * @param ocConfigPath - Path to OpenCode opencode.json
 * @param adapterConfigPath - Path to PAI adapter config (pai-adapter.json)
 * @param onUpdate - Optional callback when update occurs
 * @returns Function to stop watching
 *
 * @example
 * const stopWatching = watchAndRemerge(
 *   "~/.claude/settings.json",
 *   "~/.config/opencode/opencode.json",
 *   "~/.config/opencode/pai-adapter.json",
 *   () => {}
 * );
 *
 * // Later: stopWatching();
 */
export function watchAndRemerge(
  settingsPath: string,
  ocConfigPath: string,
  adapterConfigPath: string,
  onUpdate?: () => void
): () => void {
  fileLog(`Starting watch on ${settingsPath}`, "info");

  const expandedSettingsPath = settingsPath.replace(/^~/, process.env.HOME || "");
  const expandedOcConfigPath = ocConfigPath.replace(/^~/, process.env.HOME || "");
  const expandedAdapterConfigPath = adapterConfigPath.replace(/^~/, process.env.HOME || "");

  if (!existsSync(expandedSettingsPath)) {
    fileLog(`Settings file not found: ${expandedSettingsPath}`, "error");
    return () => {};
  }

  const performMerge = () => {
    try {
      const settings = readJsonFile<PAISettings>(expandedSettingsPath);
      const existingConfig = readJsonFile<Partial<OpenCodeConfig>>(expandedOcConfigPath);
      const existingAdapterConfig = readJsonFile<Partial<PAIAdapterConfig>>(expandedAdapterConfigPath);

      if (settings) {
        const result = translateConfig(settings, existingConfig || undefined, existingAdapterConfig || undefined);
        writeJsonFileAtomic(expandedOcConfigPath, result.openCodeConfig);
        writeJsonFileAtomic(expandedAdapterConfigPath, result.adapterConfig);

        if (onUpdate) {
          onUpdate();
        }
      }
    } catch (error) {
      fileLog(`Error during merge: ${error}`, "error");
    }
  };

  performMerge();

  const watcher = watch(expandedSettingsPath, (eventType) => {
    if (eventType === "change") {
      fileLog(`Detected change in ${expandedSettingsPath}`, "info");
      performMerge();
    }
  });

  return () => {
    fileLog("Stopping watch", "info");
    watcher.close();
  };
}

/**
 * Load and translate config from file paths
 *
 * @param settingsPath - Path to PAI settings.json
 * @param ocConfigPath - Path to OpenCode opencode.json (optional)
 * @param adapterConfigPath - Path to PAI adapter config (optional)
 * @returns Translation result or null if settings not found
 */
export function loadAndTranslate(
  settingsPath: string,
  ocConfigPath?: string,
  adapterConfigPath?: string
): TranslationResult | null {
  const expandedSettingsPath = settingsPath.replace(/^~/, process.env.HOME || "");

  const settings = readJsonFile<PAISettings>(expandedSettingsPath);
  if (!settings) {
    return null;
  }

  let existingConfig: Partial<OpenCodeConfig> | undefined;
  if (ocConfigPath) {
    const expandedOcConfigPath = ocConfigPath.replace(/^~/, process.env.HOME || "");
    existingConfig = readJsonFile<Partial<OpenCodeConfig>>(expandedOcConfigPath) || undefined;
  }

  let existingAdapterConfig: Partial<PAIAdapterConfig> | undefined;
  if (adapterConfigPath) {
    const expandedAdapterConfigPath = adapterConfigPath.replace(/^~/, process.env.HOME || "");
    existingAdapterConfig = readJsonFile<Partial<PAIAdapterConfig>>(expandedAdapterConfigPath) || undefined;
  }

  return translateConfig(settings, existingConfig, existingAdapterConfig);
}
