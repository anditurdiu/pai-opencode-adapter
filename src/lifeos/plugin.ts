import type { Plugin } from "@opencode-ai/plugin";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createReadBridge } from "./bridge.js";
import { resolveRoots } from "./contracts.js";
import { assertAllowedTool } from "./guard.js";
import { classifyFeedback } from "./feedback.js";
import { ReviewJournal } from "./journal.js";
import { searchCanonical } from "./context.js";
import { stripPrivate } from "./reviewer.js";
import { reviewFixture } from "./reviewer.js";
import { reviewPrimaryIdle } from "./scheduler.js";

/** Observational plugin candidate. Reviewer/writes remain disabled until host gates pass. */
export default (async ({ client, directory }) => {
  if (!process.env.HOME) throw new Error("LifeOS adapter requires HOME");
  const configRoot = join(process.env.HOME, ".config", "opencode");
  const userRoot = join(process.env.HOME, ".config", "LIFEOS", "USER"), memoryAlias = join(configRoot, "LIFEOS", "MEMORY");
  const roots = resolveRoots(configRoot, userRoot, memoryAlias);
  const skillRoot = join(configRoot, "skills");
  if (!existsSync(skillRoot)) throw new Error("LifeOS installed skills are missing");
  const bridge = createReadBridge({ ...roots, skillRoot });
  const journal = new ReviewJournal(join(memoryAlias, "STATE", "opencode-feedback"));
  journal.recordStatus("loaded", "read-side-ready");
  const queries = new Map<string, string>();
  const reviewerIDs = new Set<string>();
  const reviewMode = process.env.LIFEOS_OPENCODE_REVIEW_MODE;
  if (reviewMode && reviewMode !== "noop") throw new Error("LifeOS review mode is not validated for governed writes");
  const cortex = async (args: string[]) => {
    const module = await import(join(configRoot, "LIFEOS", "TOOLS", "Cortex.ts"));
    return module.runCortex(args);
  };
  return {
    "chat.message": async (input, output) => {
      const session = await client.session.get({ path: { id: input.sessionID }, query: { directory } });
      if (session.error || !session.data || session.data.parentID) return;
      const parts = output.parts as { type: string; text?: string; synthetic?: boolean }[];
      if (parts.some(part => part.synthetic)) return;
      bridge.capture(input.sessionID, parts.map(part => part.type === "text" ? { ...part, text: stripPrivate(part.text ?? "") } : part));
      queries.set(input.sessionID, stripPrivate(parts.filter(part => part.type === "text").map(part => part.text ?? "").join(" ")).slice(0, 512));
      const feedback = classifyFeedback(stripPrivate(parts.filter(part => part.type === "text").map(part => part.text ?? "").join("\n")));
      const messageID = input.messageID ?? output.message?.id;
      if (feedback.kind !== "none" && messageID) {
        journal.recordFeedback(input.sessionID, messageID, feedback);
      }
    },
    "experimental.chat.system.transform": async (input, output) => {
      if (!input.sessionID) return;
      const session = await client.session.get({ path: { id: input.sessionID }, query: { directory } });
      if (session.error || !session.data || session.data.parentID) return;
      const blocks = bridge.context(input.sessionID);
      const query = queries.get(input.sessionID);
      if (query && existsSync(join(configRoot, "LIFEOS", "TOOLS", "Cortex.ts"))) {
        try {
          const selected = await searchCanonical({ run: cortex }, query);
          if (selected.length) {
            blocks.push(`Relevant LifeOS Cortex context:\n${selected.map(record => `- ${record.text}`).join("\n")}`);
            journal.recordStatus("retrieval", "records-selected");
          }
        } catch { journal.recordStatus("error", "retrieval-failed"); }
      }
      if (blocks.length) output.system.push(blocks.join("\n\n"));
    },
    "tool.execute.before": async (input, output) => { assertAllowedTool(input.tool, output.args); },
    event: async ({ event }) => {
      if (event.type === "session.deleted") { bridge.forget(event.properties.info.id); queries.delete(event.properties.info.id); }
      if (event.type === "session.idle") {
        if (!reviewMode) { journal.recordStatus("idle", "review-not-enabled"); return; }
        if (reviewerIDs.has(event.properties.sessionID)) return;
        const outcome = await reviewPrimaryIdle({
          sessionID: event.properties.sessionID, client, journal, reviewerIDs,
          review: (exchange, sessionID) => exchange.model
            ? reviewFixture(client, { sessionID, exchange: `User: ${exchange.user}\nAssistant: ${exchange.assistant}`, memory: "", model: exchange.model }, id => reviewerIDs.add(id))
            : Promise.resolve({ ok: false as const, reason: "model-unavailable" }),
          // Provider output cannot mutate authority in this mode. A candidate
          // remains blocked in the journal rather than becoming an invisible no-op.
          apply: async () => ({ ok: false, code: "review-writes-disabled" }),
        });
        const counts = journal.statusCounts();
        const code = counts["uncertain-write"] || counts["blocked-governance"] ? "blocked-governance"
          : counts["failed-retryable"] ? "failed-retryable"
          : counts.succeeded ? "succeeded" : counts.noop ? "noop" : outcome.state;
        journal.recordStatus("review-result", code);
      }
    },
  };
}) satisfies Plugin;
