import { fileLog } from "../lib/file-logger.js";

type EventHandler<T = unknown> = (data: T) => void;

const globalListeners = new Map<string, EventHandler[]>();
const sessionListeners = new Map<string, Map<string, EventHandler[]>>();

export function on(event: string, handler: EventHandler): void {
  if (!globalListeners.has(event)) {
    globalListeners.set(event, []);
  }
  globalListeners.get(event)!.push(handler);
}

export function off(event: string, handler: EventHandler): void {
  const listeners = globalListeners.get(event);
  if (!listeners) return;
  const idx = listeners.indexOf(handler);
  if (idx !== -1) listeners.splice(idx, 1);
}

export function emit(event: string, data: unknown): void {
  const global = globalListeners.get(event) ?? [];
  for (const handler of global) {
    try {
      handler(data);
    } catch (err) {
      fileLog(`[event-bus] global listener error on "${event}": ${String(err)}`);
    }
  }
  for (const [, eventMap] of sessionListeners) {
    const handlers = eventMap.get(event) ?? [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        fileLog(`[event-bus] session listener error on "${event}": ${String(err)}`);
      }
    }
  }
}

export function onSession(sessionId: string, event: string, handler: EventHandler): void {
  if (!sessionListeners.has(sessionId)) {
    sessionListeners.set(sessionId, new Map());
  }
  const eventMap = sessionListeners.get(sessionId)!;
  if (!eventMap.has(event)) {
    eventMap.set(event, []);
  }
  eventMap.get(event)!.push(handler);
}

export function offSession(sessionId: string): void {
  sessionListeners.delete(sessionId);
  fileLog(`[event-bus] removed all session listeners: ${sessionId}`);
}

export function clearAllListeners(): void {
  globalListeners.clear();
  sessionListeners.clear();
}
