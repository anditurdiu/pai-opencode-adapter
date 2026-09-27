import type { Plugin } from "@opencode-ai/plugin";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createReadBridge } from "./bridge.js";
import { resolveRoots } from "./contracts.js";

/** Read-only plugin candidate. Capture/review/write remain disabled until host gates pass. */
export default (async ({ client, directory }) => {
  const configRoot = process.env.OPENCODE_CONFIG_DIR;
  if (!configRoot) throw new Error("LifeOS adapter requires an explicit OpenCode config root");
  if (!process.env.HOME) throw new Error("LifeOS adapter requires HOME");
  const userAlias = join(configRoot, "LIFEOS", "USER"), memoryAlias = join(configRoot, "LIFEOS", "MEMORY");
  const roots = resolveRoots(configRoot, userAlias, memoryAlias);
  const skillRoot = join(configRoot, "skills");
  if (!existsSync(skillRoot)) throw new Error("LifeOS installed skills are missing");
  const bridge = createReadBridge({ ...roots, skillRoot });
  return {
    "chat.message": async (input, output) => {
      const session = await client.session.get({ path: { id: input.sessionID }, query: { directory } });
      if (session.error || session.data?.parentID) return;
      bridge.capture(input.sessionID, output.parts as { type: string; text?: string }[]);
    },
    "experimental.chat.system.transform": async (input, output) => {
      if (!input.sessionID) return;
      const session = await client.session.get({ path: { id: input.sessionID }, query: { directory } });
      if (session.error || session.data?.parentID) return;
      const blocks = bridge.context(input.sessionID);
      if (blocks.length) output.system.push(blocks.join("\n\n"));
    },
    event: async ({ event }) => {
      if (event.type === "session.deleted") bridge.forget(event.properties.info.id);
    },
  };
}) satisfies Plugin;
