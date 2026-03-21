/**
 * identity.ts - User/assistant identity helpers
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 * Ported from PAI v4.0.3 hooks/lib/identity.ts
 *
 * Functions:
 *   getAIName() - Get AI assistant name from config
 *   getUserName() - Get user name from config/env
 *   getIdentity() - Get full AI identity object
 *   getPrincipal() - Get full user identity object
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileLog } from "./file-logger.js";

const HOME = homedir();
const PAI_ADAPTER_CONFIG_PATH = join(HOME, ".config", "opencode", "pai-adapter.json");

const DEFAULT_IDENTITY = {
  name: "PAI",
  fullName: "Personal AI",
  displayName: "PAI",
  mainDAVoiceID: "",
  color: "#3B82F6",
};

const DEFAULT_PRINCIPAL = {
  name: "User",
  pronunciation: "",
  timezone: "UTC",
};

export interface VoiceProsody {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost: boolean;
}

export interface VoicePersonality {
  baseVoice: string;
  enthusiasm: number;
  energy: number;
  expressiveness: number;
  resilience: number;
  composure: number;
  optimism: number;
  warmth: number;
  formality: number;
  directness: number;
  precision: number;
  curiosity: number;
  playfulness: number;
}

export interface Identity {
  name: string;
  fullName: string;
  displayName: string;
  mainDAVoiceID: string;
  color: string;
  voice?: VoiceProsody;
  personality?: VoicePersonality;
}

export interface Principal {
  name: string;
  pronunciation: string;
  timezone: string;
}

export interface Settings {
  daidentity?: Partial<Identity>;
  principal?: Partial<Principal>;
  env?: Record<string, string>;
  [key: string]: unknown;
}

let cachedSettings: Settings | null = null;

function loadSettings(): Settings {
  if (cachedSettings) return cachedSettings;

  try {
    if (!existsSync(PAI_ADAPTER_CONFIG_PATH)) {
      cachedSettings = {};
      return cachedSettings;
    }

    const content = readFileSync(PAI_ADAPTER_CONFIG_PATH, "utf-8");
    cachedSettings = JSON.parse(content);
    return cachedSettings!;
  } catch {
    cachedSettings = {};
    return cachedSettings;
  }
}

/**
 * Get DA (Digital Assistant) identity from settings.json
 */
export function getIdentity(): Identity {
  const settings = loadSettings();

  const daidentity = settings.daidentity || {};
  const envDA = settings.env?.DA;

  const voices = (daidentity as any).voices || {};
  const voiceConfig = voices.main || (daidentity as any).voice;

  return {
    name: daidentity.name || envDA || DEFAULT_IDENTITY.name,
    fullName: daidentity.fullName || daidentity.name || envDA || DEFAULT_IDENTITY.fullName,
    displayName: daidentity.displayName || daidentity.name || envDA || DEFAULT_IDENTITY.displayName,
    mainDAVoiceID: voiceConfig?.voiceId || (daidentity as any).voiceId || daidentity.mainDAVoiceID || DEFAULT_IDENTITY.mainDAVoiceID,
    color: daidentity.color || DEFAULT_IDENTITY.color,
    voice: voiceConfig as VoiceProsody | undefined,
    personality: (daidentity as any).personality as VoicePersonality | undefined,
  };
}

/**
 * Get Principal (human owner) identity from settings.json
 */
export function getPrincipal(): Principal {
  const settings = loadSettings();

  const principal = settings.principal || {};
  const envPrincipal = settings.env?.PRINCIPAL;

  return {
    name: principal.name || envPrincipal || DEFAULT_PRINCIPAL.name,
    pronunciation: principal.pronunciation || DEFAULT_PRINCIPAL.pronunciation,
    timezone: principal.timezone || DEFAULT_PRINCIPAL.timezone,
  };
}

/**
 * Clear cache (useful for testing or when settings.json changes)
 */
export function clearCache(): void {
  cachedSettings = null;
}

/**
 * Get just the AI name (convenience function)
 */
export function getAIName(): string {
  return getIdentity().name;
}

/**
 * Get just the user name (convenience function)
 */
export function getUserName(): string {
  return getPrincipal().name;
}

/**
 * Get just the voice ID (convenience function)
 */
export function getVoiceId(): string {
  return getIdentity().mainDAVoiceID;
}

/**
 * Get the full settings object (for advanced use)
 */
export function getSettings(): Settings {
  return loadSettings();
}

/**
 * Get the default identity (for documentation/testing)
 */
export function getDefaultIdentity(): Identity {
  return { ...DEFAULT_IDENTITY };
}

/**
 * Get the default principal (for documentation/testing)
 */
export function getDefaultPrincipal(): Principal {
  return { ...DEFAULT_PRINCIPAL };
}

/**
 * Get voice prosody settings (convenience function)
 */
export function getVoiceProsody(): VoiceProsody | undefined {
  return getIdentity().voice;
}

/**
 * Get voice personality settings (convenience function)
 */
export function getVoicePersonality(): VoicePersonality | undefined {
  return getIdentity().personality;
}

// Legacy aliases for PAI compatibility
export const getDAName = getAIName;
export const getPrincipalName = getUserName;
