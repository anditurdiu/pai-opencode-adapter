import type { Plugin } from "@opencode-ai/plugin";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createReadBridge } from "./bridge.js";
import { resolveRoots } from "./contracts.js";
import { assertAllowedTool } from "./guard.js";
import { classifyFeedback } from "./feedback.js";
import { ReviewJournal } from "./journal.js";

/** Observational plugin candidate. Reviewer/writes remain disabled until host gates pass. */
export default (async ({ client, directory }) => {
  if (!process.env.HOME) throw new Error("LifeOS adapter requires HOME");
  const configRoot = process.env.OPENCODE_CONFIG_DIR ?? join(process.env.HOME, ".config", "opencode");
  const userRoot = join(process.env.HOME, ".config", "LIFEOS", "USER"), memoryAlias = join(configRoot, "LIFEOS", "MEMORY");
  const roots = resolveRoots(configRoot, userRoot, memoryAlias);
  const skillRoot = join(configRoot, "skills");
  if (!existsSync(skillRoot)) throw new Error("LifeOS installed skills are missing");
  const bridge = createReadBridge({ ...roots, skillRoot });
  const journal = new ReviewJournal(join(memoryAlias, "STATE", "opencode-feedback"));
  journal.recordStatus("loaded", "read-side-ready");
  return {
    "chat.message": async (input, output) => {
      const session = await client.session.get({ path: { id: input.sessionID }, query: { directory } });
      if (session.error || !session.data || session.data.parentID) return;
      const parts = output.parts as { type: string; text?: string; synthetic?: boolean }[];
      if (parts.some(part => part.synthetic)) return;
      bridge.capture(input.sessionID, parts);
      const feedback = classifyFeedback(parts.filter(part => part.type === "text").map(part => part.text ?? "").join("\n"));
      const messageID = input.messageID ?? output.message?.id;
      if (feedback.kind !== "none" && messageID) {
        journal.recordFeedback(input.sessionID, messageID, feedback.kind);
      }
    },
    "experimental.chat.system.transform": async (input, output) => {
      if (!input.sessionID) return;
      const session = await client.session.get({ path: { id: input.sessionID }, query: { directory } });
      if (session.error || !session.data || session.data.parentID) return;
      const blocks = bridge.context(input.sessionID);
      if (blocks.length) output.system.push(blocks.join("\n\n"));
    },
    "tool.execute.before": async (input, output) => { assertAllowedTool(input.tool, output.args); },
    event: async ({ event }) => {
      if (event.type === "session.deleted") bridge.forget(event.properties.info.id);
      if (event.type === "session.idle") journal.recordStatus("idle", "review-not-enabled");
    },
  };
}) satisfies Plugin;
