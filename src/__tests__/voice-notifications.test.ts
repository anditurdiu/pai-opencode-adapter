import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  speakText,
  routeNotificationByDuration,
  voiceNotificationHandler,
} from "../handlers/voice-notifications.js";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("speakText", () => {
  afterEach(() => {
    setEnv({
      PAI_VOICE_ENABLED: undefined,
      PAI_VOICE_ID: undefined,
    });
  });

  it("resolves without throwing when voice disabled", async () => {
    setEnv({ PAI_VOICE_ENABLED: "false" });
    await expect(speakText("hello")).resolves.toBeUndefined();
  });

  it("resolves without throwing when no voice ID configured", async () => {
    setEnv({ PAI_VOICE_ENABLED: "true", PAI_VOICE_ID: undefined });
    // With no adapter config and no env var, voiceId is empty → skips
    await expect(speakText("hello")).resolves.toBeUndefined();
  });

  it("resolves without throwing even if proxy unreachable", async () => {
    setEnv({ PAI_VOICE_ENABLED: "true", PAI_VOICE_ID: "test-voice-id" });
    const original = globalThis.fetch;
    globalThis.fetch = ((async () => { throw new Error("connection refused"); }) as unknown) as typeof fetch;
    try {
      await expect(speakText("hello world")).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("calls PAI proxy with correct payload when enabled", async () => {
    setEnv({ PAI_VOICE_ENABLED: "true", PAI_VOICE_ID: "test-voice-123" });
    const calls: { url: string; body: string }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ status: "success" }), { status: 200 });
    }) as typeof fetch;
    try {
      await speakText("test message");
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe("http://localhost:8888/notify");
      const payload = JSON.parse(calls[0]!.body);
      expect(payload.message).toBe("test message");
      expect(payload.voice_id).toBe("test-voice-123");
      expect(payload.voice_enabled).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("routeNotificationByDuration - short tasks (<30s)", () => {
  beforeEach(() => {
    setEnv({ PAI_TERMINAL_BELL: "true", PAI_NTFY_TOPIC: undefined, PAI_DISCORD_WEBHOOK: undefined });
  });

  it("does nothing for 0 seconds", async () => {
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => { writes.push(data); return true; }) as typeof process.stdout.write;
    try {
      await routeNotificationByDuration(0, "quick task");
      expect(writes).toEqual([]);
    } finally {
      process.stdout.write = original;
    }
  });

  it("does nothing for 29 seconds", async () => {
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => { writes.push(data); return true; }) as typeof process.stdout.write;
    try {
      await routeNotificationByDuration(29, "quick task");
      expect(writes).toEqual([]);
    } finally {
      process.stdout.write = original;
    }
  });
});

describe("routeNotificationByDuration - medium tasks (30-299s)", () => {
  beforeEach(() => {
    setEnv({ PAI_TERMINAL_BELL: "true", PAI_NTFY_TOPIC: undefined, PAI_DISCORD_WEBHOOK: undefined });
  });

  it("sends terminal bell for 30 second task", async () => {
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => { writes.push(data); return true; }) as typeof process.stdout.write;
    try {
      await routeNotificationByDuration(30, "medium task");
      expect(writes).toContain("\x07");
    } finally {
      process.stdout.write = original;
    }
  });

  it("sends terminal bell for 180 second task", async () => {
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => { writes.push(data); return true; }) as typeof process.stdout.write;
    try {
      await routeNotificationByDuration(180, "medium task");
      expect(writes).toContain("\x07");
    } finally {
      process.stdout.write = original;
    }
  });

  it("skips bell when PAI_TERMINAL_BELL=false", async () => {
    setEnv({ PAI_TERMINAL_BELL: "false" });
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => { writes.push(data); return true; }) as typeof process.stdout.write;
    try {
      await routeNotificationByDuration(60, "medium task");
      expect(writes).not.toContain("\x07");
    } finally {
      process.stdout.write = original;
    }
  });

  it("does not call ntfy for medium task even if topic set", async () => {
    setEnv({ PAI_NTFY_TOPIC: "my-topic" });
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => { calls.push(String(url)); return new Response("", { status: 200 }); }) as typeof fetch;
    try {
      await routeNotificationByDuration(60, "medium task");
      expect(calls.some((u) => u.includes("ntfy.sh"))).toBe(false);
    } finally {
      globalThis.fetch = original;
      setEnv({ PAI_NTFY_TOPIC: undefined });
    }
  });
});

describe("routeNotificationByDuration - long tasks (>=300s)", () => {
  beforeEach(() => {
    setEnv({ PAI_TERMINAL_BELL: "true", PAI_NTFY_TOPIC: undefined, PAI_DISCORD_WEBHOOK: undefined });
  });

  it("sends bell for 300 second task", async () => {
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => { writes.push(data); return true; }) as typeof process.stdout.write;
    try {
      await routeNotificationByDuration(300, "long task");
      expect(writes).toContain("\x07");
    } finally {
      process.stdout.write = original;
    }
  });

  it("calls ntfy when topic configured for long task", async () => {
    setEnv({ PAI_NTFY_TOPIC: "test-topic" });
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => { calls.push(String(url)); return new Response("", { status: 200 }); }) as typeof fetch;
    try {
      await routeNotificationByDuration(300, "long task done");
      expect(calls.some((u) => u.includes("ntfy.sh/test-topic"))).toBe(true);
    } finally {
      globalThis.fetch = original;
      setEnv({ PAI_NTFY_TOPIC: undefined });
    }
  });

  it("calls discord webhook when configured for long task", async () => {
    setEnv({ PAI_DISCORD_WEBHOOK: "https://discord.com/api/webhooks/test" });
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => { calls.push(String(url)); return new Response("", { status: 200 }); }) as typeof fetch;
    try {
      await routeNotificationByDuration(600, "very long task");
      expect(calls.some((u) => u.includes("discord.com"))).toBe(true);
    } finally {
      globalThis.fetch = original;
      setEnv({ PAI_DISCORD_WEBHOOK: undefined });
    }
  });

  it("calls both ntfy and discord when both configured", async () => {
    setEnv({ PAI_NTFY_TOPIC: "t", PAI_DISCORD_WEBHOOK: "https://discord.com/api/webhooks/test2" });
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => { calls.push(String(url)); return new Response("", { status: 200 }); }) as typeof fetch;
    try {
      await routeNotificationByDuration(400, "task");
      expect(calls.some((u) => u.includes("ntfy.sh"))).toBe(true);
      expect(calls.some((u) => u.includes("discord.com"))).toBe(true);
    } finally {
      globalThis.fetch = original;
      setEnv({ PAI_NTFY_TOPIC: undefined, PAI_DISCORD_WEBHOOK: undefined });
    }
  });

  it("gracefully handles ntfy fetch failure", async () => {
    setEnv({ PAI_NTFY_TOPIC: "test-topic" });
    const original = globalThis.fetch;
    globalThis.fetch = ((async () => { throw new Error("network error"); }) as unknown) as typeof fetch;
    try {
      await expect(routeNotificationByDuration(300, "task")).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = original;
      setEnv({ PAI_NTFY_TOPIC: undefined });
    }
  });
});

describe("voiceNotificationHandler", () => {
  afterEach(() => {
    setEnv({
      PAI_VOICE_ENABLED: undefined,
      PAI_VOICE_ID: undefined,
      PAI_TERMINAL_BELL: undefined,
    });
  });

  it("resolves without throwing for short task", async () => {
    await expect(voiceNotificationHandler(10, "short")).resolves.toBeUndefined();
  });

  it("resolves without throwing for long task with voice disabled", async () => {
    setEnv({ PAI_VOICE_ENABLED: "false", PAI_TERMINAL_BELL: "false" });
    await expect(voiceNotificationHandler(600, "big task")).resolves.toBeUndefined();
  });
});
