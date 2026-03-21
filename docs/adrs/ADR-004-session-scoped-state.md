# ADR-004: Session-Scoped State (No Globals)

## Status

Accepted

## Context

The adapter needs to maintain state across multiple event handlers: session IDs, learning signals, compaction context, agent dispatches, plan mode status, and more. We needed to decide how to structure this state.

**Options considered:**

1. **Global variables** — Single shared state object
   - Pros: Simple to implement, easy to access
   - Cons: Breaks with concurrent sessions, memory leaks, race conditions

2. **Session-scoped Map** — `Map<sessionId, T>` per state type
   - Pros: Isolated per session, safe concurrency, auto-cleanup on session end
   - Cons: Slightly more complex access pattern, need to track session lifecycle

3. **File-based state** — Write state to disk per session
   - Pros: Persistent across restarts, debuggable
   - Cons: I/O overhead, race conditions on concurrent writes, complexity

4. **Database** — SQLite or similar for state storage
   - Pros: Queryable, persistent, scalable
   - Cons: Overkill for this use case, adds dependency, complexity

**Key requirements:**

- Support concurrent OpenCode sessions (multiple tmux panes, each running `opencode`)
- Auto-cleanup when sessions end (prevent memory leaks)
- Thread-safe access (no race conditions between event handlers)
- Minimal overhead (state access on every event)

## Decision

We chose **session-scoped `Map<sessionId, T>`** for all state — no global variables.

**Implementation:**

Every stateful module uses the pattern:

```typescript
const sessionState = new Map<string, StateType>();

export function getState(sessionId: string): StateType | undefined {
  return sessionState.get(sessionId);
}

export function setState(sessionId: string, state: StateType): void {
  sessionState.set(sessionId, state);
}

export function clearState(sessionId: string): void {
  sessionState.delete(sessionId);
}
```

**Examples:**

- `src/handlers/plan-mode.ts` — `planStates: Map<string, PlanModeState>`
- `src/handlers/agent-teams.ts` — `sessionDispatches: Map<string, AgentDispatch[]>`
- `src/handlers/compaction-handler.ts` — `compactionContexts: Map<string, CompactionContext>`
- `src/core/dedup-cache.ts` — `sessionKeys: Map<string, Set<string>>`

**Cleanup strategy:**

On `session.end` event (via `src/handlers/session-lifecycle.ts`):

```typescript
clearPlanModeState(sessionId);
clearAgentTeamsState(sessionId);
clearCompactionState(sessionId);
clearDedupState(sessionId);
// ... etc
```

**Rationale:**

1. **Concurrent sessions** — Each session has isolated state; no cross-talk
2. **Memory safety** — Cleanup on session end prevents leaks
3. **Simplicity** — Map API is straightforward; no database needed
4. **Performance** — In-memory Map access is O(1); no I/O overhead

## Consequences

**Positive:**

- **Concurrency-safe** — Multiple `opencode` sessions can run simultaneously
- **Memory-efficient** — State is garbage-collected when sessions end
- **Debuggable** — Easy to inspect state per session in debugger
- **Testable** — Tests can isolate state per session ID

**Negative:**

- **Explicit cleanup** — Must remember to clear state on session end (mitigated with centralized cleanup in `session-lifecycle.ts`)
- **Session ID tracking** — Every event handler must extract and pass `sessionId` (mitigated with consistent input typing)

**Follow-ups:**

- All handlers accept `sessionId` as first parameter (or extract from input)
- `session-lifecycle.ts` centralizes cleanup logic
- Tests verify state isolation between sessions
- No module exports global state directly (only via getter functions)

---

*This ADR ensures the adapter is safe for real-world usage with multiple concurrent sessions.*
