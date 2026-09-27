import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

export type Disposition = "pending" | "reviewing" | "applying" | "succeeded" | "noop" | "failed-retryable" | "blocked-governance" | "uncertain-write";
export interface SpanState { sessionID: string; userID: string; assistantIDs: string[]; status: Disposition; attempts: number; updated: string; itemDigest?: string; errorCode?: string }
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const terminal = new Set<Disposition>(["succeeded", "noop", "blocked-governance"]);

/** Each exchange has a stable key independent of the length/content of its text. */
export function spanKey(sessionID: string, userID: string, assistantIDs: string[]): string {
  if (!sessionID || !userID || !assistantIDs.length || assistantIDs.some(id => !id)) throw new Error("incomplete span identity");
  return digest(JSON.stringify([sessionID, userID, assistantIDs]));
}

/** Per-span atomic state. A crash after entering `applying` NEVER retries a write automatically. */
export class ReviewJournal {
  constructor(private readonly root: string) { mkdirSync(root, { recursive: true }); }
  private path(key: string) { if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("invalid span key"); return join(this.root, `${key}.json`); }
  read(key: string): SpanState | undefined {
    const path = this.path(key);
    if (!existsSync(path)) return undefined;
    const state = JSON.parse(readFileSync(path, "utf8")) as SpanState;
    if (spanKey(state.sessionID, state.userID, state.assistantIDs) !== key) throw new Error("journal identity mismatch");
    return state;
  }
  private save(key: string, state: SpanState): void {
    const path = this.path(key), temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(state), { flag: "wx", mode: 0o600 });
    try {
      const fd = openSync(temp, "r"); try { fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temp, path);
      try { const dir = openSync(this.root, "r"); try { fsyncSync(dir); } finally { closeSync(dir); } } catch { /* unsupported on some filesystems */ }
    } catch (e) { try { unlinkSync(temp); } catch {} throw e; }
  }
  recordFeedback(sessionID: string, messageID: string, kind: string): boolean {
    if (!sessionID || !messageID || !["rating", "praise", "correction", "directive"].includes(kind)) return false;
    const key = digest(JSON.stringify(["feedback", sessionID, messageID]));
    const file = join(this.root, `${key}.feedback.json`);
    try { writeFileSync(file, JSON.stringify({ sessionID, messageID, kind, capturedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 }); return true; }
    catch (e: any) { if (e.code === "EEXIST") return false; throw e; }
  }
  private async locked<T>(key: string, action: () => Promise<T>): Promise<T | { status: "contended" }> {
    const lock = `${this.path(key)}.lock`;
    let fd: number;
    try { fd = openSync(lock, "wx", 0o600); }
    catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      // Never break another process's lock on a guess. A same-host dead PID
      // is positive evidence of a crash; the persisted `applying` state still
      // forces reconciliation before another write.
      let holder: { pid: number; host: string } | undefined;
      try { holder = JSON.parse(readFileSync(lock, "utf8")); } catch { /* unknown */ }
      if (holder?.host !== hostname() || !Number.isSafeInteger(holder.pid) || holder.pid < 2) return { status: "contended" };
      try { process.kill(holder.pid, 0); return { status: "contended" }; }
      catch (error: any) { if (error.code !== "ESRCH") return { status: "contended" }; }
      const stale = `${lock}.${process.pid}.stale`;
      try { renameSync(lock, stale); unlinkSync(stale); fd = openSync(lock, "wx", 0o600); }
      catch { return { status: "contended" }; }
    }
    try {
      writeFileSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), at: Date.now() }));
      return await action();
    } finally { closeSync(fd); try { unlinkSync(lock); } catch { /* subsequent holder may own it */ } }
  }
  /** One transaction covers reviewer result AND writer dispatch; retry starts only before `applying`. */
  async process(identity: { sessionID: string; userID: string; assistantIDs: string[] },
    review: () => Promise<{ type: "noop" } | { type: "item"; item: unknown }>,
    apply: (item: unknown) => Promise<{ ok: boolean; code?: string }>,
  ): Promise<SpanState | { status: "contended" }> {
    const key = spanKey(identity.sessionID, identity.userID, identity.assistantIDs);
    // Keep the per-span lock over async inference/write. Other sessions have
    // separate locks; a second caller cannot review the same span concurrently.
    return this.locked(key, async () => {
      let state = this.read(key) ?? { ...identity, status: "pending" as const, attempts: 0, updated: new Date().toISOString() };
      if (terminal.has(state.status) || state.status === "uncertain-write") return state;
      if (state.status === "applying") { state = { ...state, status: "uncertain-write", updated: new Date().toISOString() }; this.save(key, state); return state; }
      state = { ...state, status: "reviewing", attempts: state.attempts + 1, updated: new Date().toISOString() }; this.save(key, state);
      try {
        const outcome = await review();
        if (outcome.type === "noop") { state = { ...state, status: "noop", updated: new Date().toISOString() }; this.save(key, state); return state; }
        const itemDigest = digest(JSON.stringify(outcome.item));
        state = { ...state, status: "applying", itemDigest, updated: new Date().toISOString() }; this.save(key, state);
        let applied: { ok: boolean; code?: string };
        try { applied = await apply(outcome.item); }
        catch { state = { ...state, status: "uncertain-write", errorCode: "write-outcome-unknown", updated: new Date().toISOString() }; this.save(key, state); return state; }
        state = { ...state, status: applied.ok ? "succeeded" : "blocked-governance", errorCode: applied.code, updated: new Date().toISOString() };
        this.save(key, state);
        return state;
      } catch {
        state = { ...state, status: "failed-retryable", errorCode: "review-failed", updated: new Date().toISOString() };
        this.save(key, state);
        return state;
      }
    });
  }
}
