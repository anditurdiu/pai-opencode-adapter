import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "../lib/file-logger.js";
import { getMemoryPath, getDateString } from "../lib/paths.js";
import { getISOTimestamp } from "../lib/time.js";

const RAW_EVENTS_DIR = () => getMemoryPath("RAW", "events");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const DEDUP_TTL_MS = 5000;
const recentEvents = new Map<string, number>();

function isRecentDuplicate(eventType: string, sessionId: string): boolean {
  const key = `${eventType}:${sessionId}`;
  const lastTime = recentEvents.get(key);
  if (lastTime && Date.now() - lastTime < DEDUP_TTL_MS) {
    return true;
  }
  recentEvents.set(key, Date.now());
  return false;
}

const LOW_VALUE_EVENTS = new Set([
  "message.part.updated",
  "message.updated",
]);

const MAX_EVENT_SIZE = 4096;

export function logRawEvent(eventType: string, evt: Record<string, unknown>): void {
  try {
    if (LOW_VALUE_EVENTS.has(eventType)) return;

    const sessionId = String(
      evt.sessionID ?? evt.sessionId ??
      (evt.properties as Record<string, unknown> | undefined)?.sessionID ??
      (evt.properties as Record<string, unknown> | undefined)?.sessionId ??
      ""
    );

    if (isRecentDuplicate(eventType, sessionId)) return;

    const dir = RAW_EVENTS_DIR();
    ensureDir(dir);

    const date = getDateString();
    const file = join(dir, `${date}.jsonl`);

    let serialized: string;
    try {
      serialized = JSON.stringify(evt);
    } catch {
      serialized = JSON.stringify({ type: eventType, error: "circular reference", sessionId });
    }

    if (serialized.length > MAX_EVENT_SIZE) {
      serialized = serialized.slice(0, MAX_EVENT_SIZE) + "...\"_truncated\":true}";
    }

    const entry = {
      ts: getISOTimestamp(),
      event: eventType,
      sid: sessionId.slice(0, 12),
      payload: serialized,
    };

    appendFileSync(file, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    fileLog(`[raw-event-logger] Failed: ${err}`, "warn");
  }
}
