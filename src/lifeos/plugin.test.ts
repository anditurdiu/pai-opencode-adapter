import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin from "./plugin.js";

test("actual plugin hooks inject primary-only context while retaining system/parts", async () => {
  const home = mkdtempSync(join(tmpdir(), "lifeos-plugin-"));
  const configRoot = join(home, ".config", "opencode"), personal = join(home, ".config", "LIFEOS", "USER"), memory = join(configRoot, "LIFEOS", "MEMORY");
  mkdirSync(join(configRoot, "LIFEOS"), { recursive: true });
  mkdirSync(join(configRoot, "skills", "ISA"), { recursive: true });
  mkdirSync(join(personal, "PRINCIPAL"), { recursive: true }); mkdirSync(memory);
  symlinkSync(personal, join(configRoot, "LIFEOS", "USER"));
  writeFileSync(join(personal, "PRINCIPAL", "PRINCIPAL_IDENTITY.md"), "- **Name:** Fixture");
  writeFileSync(join(configRoot, "skills", "ISA", "SKILL.md"), "---\nname: ISA\ndescription: Build artifacts. USE WHEN create an ISA. NOT FOR fixtures.\n---\n");
  const saved = process.env.OPENCODE_CONFIG_DIR, savedHome = process.env.HOME;
  process.env.OPENCODE_CONFIG_DIR = configRoot; process.env.HOME = home;
  try {
    const client = { session: { get: async ({ path }: { path: { id: string } }) => ({ data: { id: path.id, ...(path.id === "child" ? { parentID: "main" } : {}) } }) } };
    const hooks = await plugin({ client, directory: configRoot } as any);
    const health = readFileSync(join(memory, "STATE", "opencode-feedback", "health.jsonl"), "utf8");
    expect(health).toContain("read-side-ready");
    expect(health).not.toContain("Fixture");
    const parts = [{ type: "text", text: "create an ISA" }];
    await hooks["chat.message"]!({ sessionID: "main", messageID: "user-1" } as any, { parts, message: { id: "user-1" } } as any);
    const primary = { system: ["existing instruction"] };
    await hooks["experimental.chat.system.transform"]!({ sessionID: "main" } as any, primary);
    expect(primary.system[0]).toBe("existing instruction");
    expect(primary.system.join("\n")).toContain("Fixture");
    expect(primary.system.join("\n")).toContain("skill route: ISA");
    expect(parts).toEqual([{ type: "text", text: "create an ISA" }]);
    await hooks["chat.message"]!({ sessionID: "main", messageID: "user-private" } as any, { parts: [{ type: "text", text: "Public <private>never search this</private> fixture" }], message: { id: "user-private" } } as any);
    const afterPrivate = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!({ sessionID: "main" } as any, afterPrivate);
    expect(afterPrivate.system.join("\n")).not.toContain("never search this");
    const child = { system: [] as string[] };
    await hooks["chat.message"]!({ sessionID: "child", messageID: "child-1" } as any, { parts, message: { id: "child-1" } } as any);
    await hooks["experimental.chat.system.transform"]!({ sessionID: "child" } as any, child);
    expect(child.system).toEqual([]);
    let executed = false;
    try { await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "main", callID: "probe" }, { args: { command: "LIFEOS_USER_ROOT=/tmp/other bun LIFEOS/TOOLS/Cortex.ts remember '{}'" } }); executed = true; }
    catch { /* expected pre-execution refusal */ }
    expect(executed).toBe(false);
  } finally {
    if (saved === undefined) delete process.env.OPENCODE_CONFIG_DIR; else process.env.OPENCODE_CONFIG_DIR = saved;
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
  }
});

test("noop reviewer mode handles primary idle without writing canonical files", async () => {
  const home = mkdtempSync(join(tmpdir(), "lifeos-idle-plugin-"));
  const configRoot = join(home, ".config", "opencode"), userRoot = join(home, ".config", "LIFEOS", "USER"), memory = join(configRoot, "LIFEOS", "MEMORY");
  mkdirSync(join(configRoot, "skills", "ISA"), { recursive: true }); mkdirSync(join(userRoot, "PRINCIPAL"), { recursive: true }); mkdirSync(memory, { recursive: true });
  writeFileSync(join(configRoot, "skills", "ISA", "SKILL.md"), "---\nname: ISA\ndescription: fixture\n---\n");
  const previous = { HOME: process.env.HOME, LIFEOS_OPENCODE_REVIEW_MODE: process.env.LIFEOS_OPENCODE_REVIEW_MODE };
  process.env.HOME = home; process.env.LIFEOS_OPENCODE_REVIEW_MODE = "noop";
  let prompts = 0;
  const client = { session: {
    get: async () => ({ data: { id: "primary" } }),
    messages: async () => ({ data: [
      { info: { id: "u", sessionID: "primary", role: "user", model: { providerID: "fixture", modelID: "fixture" }, time: { created: 1 } }, parts: [{ type: "text", text: "There is no durable fact" }] },
      { info: { id: "a", sessionID: "primary", role: "assistant", finish: "stop", time: { created: 2, completed: 3 } }, parts: [{ type: "text", text: "Understood" }] },
    ] }),
    create: async () => ({ data: { id: "review-child" } }),
    prompt: async () => { prompts++; return { data: { info: { providerID: "fixture", modelID: "fixture", time: { completed: 4 } }, parts: [{ type: "text", text: '{"disposition":"noop"}' }] } }; },
    delete: async () => ({ data: true }), abort: async () => ({ data: true }),
  } };
  try {
    const hooks = await plugin({ client, directory: configRoot } as any);
    await hooks.event!({ event: { type: "session.idle", properties: { sessionID: "primary" } } } as any);
    await hooks.event!({ event: { type: "session.idle", properties: { sessionID: "review-child" } } } as any);
    await hooks.event!({ event: { type: "session.idle", properties: { sessionID: "primary" } } } as any);
    expect(prompts).toBe(1);
    expect(readFileSync(join(memory, "STATE", "opencode-feedback", "health.jsonl"), "utf8")).toContain('"code":"reviewed"');
  } finally {
    if (previous.HOME === undefined) delete process.env.HOME; else process.env.HOME = previous.HOME;
    if (previous.LIFEOS_OPENCODE_REVIEW_MODE === undefined) delete process.env.LIFEOS_OPENCODE_REVIEW_MODE; else process.env.LIFEOS_OPENCODE_REVIEW_MODE = previous.LIFEOS_OPENCODE_REVIEW_MODE;
  }
});
