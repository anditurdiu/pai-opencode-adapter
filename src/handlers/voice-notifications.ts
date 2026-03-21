import { fileLog } from "../lib/file-logger.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SHORT_TASK_THRESHOLD_S = 30;
const MEDIUM_TASK_THRESHOLD_S = 300;
const PAI_ADAPTER_CONFIG_PATH = join(homedir(), ".config", "opencode", "pai-adapter.json");
const SESSION_START_FILE = "/tmp/pai-session-start.txt";

/**
 * PAI TTS proxy endpoint — the same localhost proxy that PAI's Algorithm
 * voice announcements use. Handles ElevenLabs auth internally.
 */
const PAI_VOICE_PROXY_URL = "http://localhost:8888/notify";

// ── Types ──────────────────────────────────────────────────────────────

export type NotificationChannel = "ntfy" | "discord" | "both";
export type NotificationPriority = "min" | "low" | "default" | "high" | "urgent";

export interface NotificationOptions {
  title?: string;
  priority?: NotificationPriority;
  tags?: string[];
  channel?: NotificationChannel;
}

export interface VoiceConfig {
  enabled: boolean;
  voiceId: string;
}

export interface NotificationConfig {
  ntfyTopic?: string;
  ntfyServer?: string;
  discordWebhookUrl?: string;
  terminalBellEnabled?: boolean;
}

interface AdapterVoiceConfig {
  enabled?: boolean;
  elevenLabsApiKey?: string;
  voiceId?: string;
  greeting?: string;
}

function loadAdapterVoiceConfig(): AdapterVoiceConfig {
  try {
    if (!existsSync(PAI_ADAPTER_CONFIG_PATH)) return {};
    const raw = readFileSync(PAI_ADAPTER_CONFIG_PATH, "utf-8");
    const settings = JSON.parse(raw);
    return (settings.voice ?? {}) as AdapterVoiceConfig;
  } catch {
    return {};
  }
}

/**
 * Get the configured startup greeting, or undefined if disabled.
 * Set `voice.greeting` in pai-adapter.json to customize.
 */
export function getStartupGreeting(): string | undefined {
  const adapter = loadAdapterVoiceConfig();
  return adapter.greeting;
}

/**
 * Resolve voice configuration from pai-adapter.json.
 * Voice ID is single-sourced from `voice.voiceId` in the adapter config.
 * The PAI_VOICE_ID env var can override for testing/CI.
 */
function getVoiceConfig(): VoiceConfig {
  const adapter = loadAdapterVoiceConfig();
  return {
    enabled: process.env.PAI_VOICE_ENABLED === "true" || (adapter.enabled ?? false),
    voiceId: process.env.PAI_VOICE_ID || adapter.voiceId || "",
  };
}

function getNotificationConfig(): NotificationConfig {
  try {
    if (existsSync(PAI_ADAPTER_CONFIG_PATH)) {
      const raw = readFileSync(PAI_ADAPTER_CONFIG_PATH, "utf-8").replace(
        /\$\{(\w+)\}/g,
        (_, key) => process.env[key as string] || ""
      );
      const settings = JSON.parse(raw);
      const ntfy = settings.notifications?.ntfy;
      const discord = settings.notifications?.discord;
      return {
        ntfyTopic: process.env.PAI_NTFY_TOPIC || (ntfy?.enabled ? ntfy.topic : undefined),
        ntfyServer: ntfy?.server || "ntfy.sh",
        discordWebhookUrl: process.env.PAI_DISCORD_WEBHOOK || (discord?.enabled ? discord.webhookUrl : undefined),
        terminalBellEnabled: process.env.PAI_TERMINAL_BELL !== "false",
      };
    }
  } catch { /* fall through */ }
  return {
    ntfyTopic: process.env.PAI_NTFY_TOPIC,
    ntfyServer: "ntfy.sh",
    discordWebhookUrl: process.env.PAI_DISCORD_WEBHOOK,
    terminalBellEnabled: process.env.PAI_TERMINAL_BELL !== "false",
  };
}

/**
 * Speak text via the PAI local TTS proxy at localhost:8888/notify.
 * This is the same proxy that PAI's Algorithm voice curls use.
 * The proxy handles ElevenLabs authentication internally.
 */
export async function speakText(text: string): Promise<void> {
  const config = getVoiceConfig();
  if (!config.enabled) {
    fileLog("[voice] voice disabled, skipping TTS");
    return;
  }
  if (!config.voiceId) {
    fileLog("[voice] no voice ID configured, skipping TTS");
    return;
  }
  try {
    const response = await fetch(PAI_VOICE_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        voice_id: config.voiceId,
        voice_enabled: true,
      }),
    });
    if (!response.ok) {
      fileLog(`[voice] PAI proxy error: ${response.status}`);
    }
  } catch (err) {
    fileLog(`[voice] PAI proxy unreachable (graceful degradation): ${String(err)}`);
  }
}

function sendTerminalBell(): void {
  try {
    process.stdout.write("\x07");
  } catch {}
}

async function sendNtfy(topic: string, message: string, title: string, server = "ntfy.sh", options?: NotificationOptions): Promise<void> {
  try {
    const headers: Record<string, string> = { Title: title, Priority: "default" };
    if (options?.priority) {
      const map: Record<NotificationPriority, string> = {
        min: "1", low: "2", default: "3", high: "4", urgent: "5",
      };
      headers.Priority = map[options.priority] || "3";
    }
    if (options?.tags?.length) headers.Tags = options.tags.join(",");
    await fetch(`https://${server}/${topic}`, {
      method: "POST",
      headers,
      body: message,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    fileLog(`[notifications] ntfy send error: ${String(err)}`);
  }
}

async function sendDiscord(webhookUrl: string, message: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    fileLog(`[notifications] discord send error: ${String(err)}`);
  }
}

export async function routeNotificationByDuration(
  durationSeconds: number,
  summary: string,
  title = "PAI Task Complete"
): Promise<void> {
  const config = getNotificationConfig();

  if (durationSeconds < SHORT_TASK_THRESHOLD_S) {
    return;
  }

  if (durationSeconds < MEDIUM_TASK_THRESHOLD_S) {
    if (config.terminalBellEnabled !== false) {
      sendTerminalBell();
    }
    return;
  }

  if (config.terminalBellEnabled !== false) {
    sendTerminalBell();
  }

  const promises: Promise<void>[] = [];

  if (config.ntfyTopic) {
    promises.push(sendNtfy(config.ntfyTopic, summary, title, config.ntfyServer));
  }

  if (config.discordWebhookUrl) {
    promises.push(sendDiscord(config.discordWebhookUrl, `**${title}**\n${summary}`));
  }

  await Promise.allSettled(promises);
}

// ── Session duration tracking (consolidated from notifications.ts) ───

/**
 * Record session start time for duration calculations.
 */
export function recordSessionStart(): void {
  try {
    writeFileSync(SESSION_START_FILE, Date.now().toString());
  } catch (error) {
    fileLog(`Failed to record session start: ${error}`, "warn");
  }
}

/**
 * Get session duration in minutes since last recordSessionStart().
 */
export function getSessionDurationMinutes(): number {
  try {
    if (existsSync(SESSION_START_FILE)) {
      const startTime = parseInt(readFileSync(SESSION_START_FILE, "utf-8"));
      return (Date.now() - startTime) / 1000 / 60;
    }
  } catch (error) {
    fileLog(`Failed to get session duration: ${error}`, "warn");
  }
  return 0;
}

/**
 * General-purpose notification router (consolidated from notifications.ts).
 * Sends to ntfy, discord, or both based on channel selection.
 */
export async function routeNotification(
  message: string,
  channel: NotificationChannel = "both",
  options: NotificationOptions = {}
): Promise<boolean> {
  const config = getNotificationConfig();
  const results: boolean[] = [];

  if ((channel === "ntfy" || channel === "both") && config.ntfyTopic) {
    try {
      await sendNtfy(config.ntfyTopic, message, options.title || "PAI", config.ntfyServer, options);
      results.push(true);
    } catch {
      results.push(false);
    }
  }

  if ((channel === "discord" || channel === "both") && config.discordWebhookUrl) {
    try {
      await sendDiscord(config.discordWebhookUrl, options.title ? `**${options.title}**\n${message}` : message);
      results.push(true);
    } catch {
      results.push(false);
    }
  }

  return results.some((r) => r);
}

export async function voiceNotificationHandler(
  durationSeconds: number,
  summary: string
): Promise<void> {
  try {
    await Promise.allSettled([
      speakText(summary),
      routeNotificationByDuration(durationSeconds, summary),
    ]);
  } catch (err) {
    fileLog(`[voice-notifications] handler error: ${String(err)}`);
  }
}
