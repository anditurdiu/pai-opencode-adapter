import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
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
    const parts = [{ type: "text", text: "create an ISA" }];
    await hooks["chat.message"]!({ sessionID: "main", messageID: "user-1" } as any, { parts, message: { id: "user-1" } } as any);
    const primary = { system: ["existing instruction"] };
    await hooks["experimental.chat.system.transform"]!({ sessionID: "main" } as any, primary);
    expect(primary.system[0]).toBe("existing instruction");
    expect(primary.system.join("\n")).toContain("Fixture");
    expect(primary.system.join("\n")).toContain("skill route: ISA");
    expect(parts).toEqual([{ type: "text", text: "create an ISA" }]);
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
