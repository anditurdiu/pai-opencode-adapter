import { createHash } from "node:crypto";
import { fileLog } from "../lib/file-logger.js";

const TTL_MS = 5000;

interface DedupEntry {
  timestamp: number;
}

const cache = new Map<string, DedupEntry>();
const sessionKeys = new Map<string, Set<string>>();

function makeKey(sessionId: string, content: string): string {
  const raw = `${sessionId}|${content.slice(0, 64)}`;
  return createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > TTL_MS) {
      cache.delete(key);
    }
  }
}

export function isDuplicate(sessionId: string, content: string, _eventType: string): boolean {
  evictExpired();
  const key = makeKey(sessionId, content);
  if (cache.has(key)) {
    fileLog(`[dedup-cache] duplicate detected: session=${sessionId}`);
    return true;
  }
  cache.set(key, { timestamp: Date.now() });
  if (!sessionKeys.has(sessionId)) {
    sessionKeys.set(sessionId, new Set());
  }
  sessionKeys.get(sessionId)!.add(key);
  return false;
}

export function clearSessionDedup(sessionId: string): void {
  const keys = sessionKeys.get(sessionId);
  if (keys) {
    for (const key of keys) {
      cache.delete(key);
    }
  }
  sessionKeys.delete(sessionId);
  fileLog(`[dedup-cache] cleared session: ${sessionId}`);
}

export function getDedupCacheSize(): number {
  return cache.size;
}

export function clearAllDedup(): void {
  cache.clear();
  sessionKeys.clear();
}
