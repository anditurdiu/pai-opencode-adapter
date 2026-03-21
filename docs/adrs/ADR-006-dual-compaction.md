# ADR-006: Dual Compaction Strategy (Proactive + Reactive)

## Status

Accepted

## Context

Session compaction is critical for preserving important learnings and context when OpenCode automatically compacts conversation history. PAI v4.0.3 uses a single compaction hook, but OpenCode's plugin API offers multiple compaction-related events.

**OpenCode compaction events:**

1. `experimental.session.compacting` — Fires **before** compaction, allows injecting survival context
2. `session.compacted` — Fires **after** compaction (via `event` wildcard), allows rescuing lost learnings

**Options considered:**

1. **Proactive only** — Use `experimental.session.compacting` to inject survival context
   - Pros: Prevents loss upfront, cleaner architecture
   - Cons: Cannot recover if survival context itself is compacted away

2. **Reactive only** — Use `session.compacted` to rescue learnings post-compaction
   - Pros: Can analyze what was lost and recover it
   - Cons: More complex recovery logic, learnings already lost at this point

3. **Dual strategy** — Both proactive injection and reactive rescue
   - Pros: Best of both worlds; defense in depth
   - Cons: More code, two handlers to maintain

4. **No compaction handling** — Let OpenCode compact freely
   - Pros: Simplest implementation
   - Cons: Critical learnings lost, defeats PAI's memory features

**Key requirements:**

- Preserve survival context (active goals, pending learnings) across compaction
- Recover learnings if they were lost during compaction
- Minimal performance impact during compaction (already a sensitive operation)

## Decision

We chose **dual compaction strategy**: proactive injection + reactive rescue.

**Implementation:**

**Proactive handler** (`src/handlers/compaction-handler.ts`):

```typescript
export async function compactionProactiveHandler(
  input: { sessionID: string },
  output: { context: string[]; prompt?: string }
): Promise<void> {
  const context = buildSurvivalContext(input.sessionID);
  output.context = context;
  output.prompt = "Preserve these critical learnings during compaction.";
}
```

Injected survival context includes:
- Active goals from current session phase
- Pending learnings not yet persisted
- Critical relationship memory summaries

**Reactive handler** (`src/handlers/compaction-handler.ts`):

```typescript
export async function compactionReactiveHandler(
  input: { event?: { type: string; properties?: Record<string, unknown> } }
): Promise<void> {
  if (input.event?.type === "session.compacted") {
    const lostLearnings = detectLostLearnings(input.sessionID);
    if (lostLearnings.length > 0) {
      rescueLearnings(lostLearnings);
    }
  }
}
```

**Event registration** (`src/plugin/pai-unified.ts`):

```typescript
const hooks = {
  "experimental.session.compacting": [compactionProactiveHandler],
  event: [(input) => {
    if (input.type === "session.compacted") {
      compactionReactiveHandler(input);
    }
  }],
};
```

**Rationale:**

1. **Defense in depth** — If proactive injection fails, reactive rescue catches it
2. **Complete coverage** — Proactive handles expected compaction; reactive handles edge cases
3. **PAI compatibility** — Matches PAI's compaction behavior (survival context + learning rescue)
4. **Future-proof** — If OpenCode adds more compaction hooks, adapter can extend strategy

## Consequences

**Positive:**

- **Learning preservation** — Critical learnings survive compaction reliably
- **Resilience** — Two independent mechanisms; both must fail for data loss
- **PAI parity** — Matches PAI's compaction behavior on Claude Code
- **Flexibility** — Can tune proactive and reactive strategies independently

**Negative:**

- **Complexity** — Two handlers to implement, test, and maintain
- **Performance** — Slight overhead during compaction (acceptable; compaction is infrequent)
- **Debugging** — Must trace both handlers when compaction issues arise

**Follow-ups:**

- Tests verify both proactive and reactive handlers fire correctly
- Debug log entries distinguish proactive vs reactive compaction
- COMPATIBILITY.md documents both handlers in event mapping table
- Self-updater monitors for new OpenCode compaction events

---

*This ADR ensures session compaction preserves PAI's critical learning and memory features.*
