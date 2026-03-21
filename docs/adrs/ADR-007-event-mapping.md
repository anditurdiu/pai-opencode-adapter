# ADR-007: Event Mapping Strategy (20 PAI Hooks → 17 OpenCode Events)

## Status

Accepted

## Context

PAI v4.0.3 defines 20 hook files that fire on semantic events (e.g., `LoadContext`, `SecurityValidator`, `VoiceCompletion`). OpenCode's plugin API exposes 17 events (e.g., `permission.ask`, `tool.execute.after`, `chat.message`). We needed to map PAI hooks to OpenCode events.

**The mapping challenge:**

- PAI has 20 hooks; OpenCode has 17 events
- Some PAI hooks have direct equivalents (e.g., `SecurityValidator` → `permission.ask`)
- Some PAI hooks have no OpenCode equivalent (e.g., `KittyEnvPersist`, `ResponseTabReset`)
- Some OpenCode events have no PAI equivalent (e.g., `tool.definition`, `auth`)
- Some PAI hooks map to multiple OpenCode events (e.g., `VoiceCompletion` → `tool.execute.after` + `event`)

**Options considered:**

1. **One-to-one mapping** — Each PAI hook → one OpenCode event
   - Pros: Simple mental model
   - Cons: Doesn't work for hooks with no direct equivalent

2. **Semantic mapping** — Map by intent, not by name
   - Pros: Captures PAI's behavior more accurately
   - Cons: More complex, requires understanding both systems deeply

3. **Workaround pattern** — Implement custom solutions for unmappable hooks
   - Pros: Full coverage of PAI features
   - Cons: More code, potential technical debt

4. **Omission** — Skip hooks with no OpenCode equivalent
   - Pros: Simpler implementation
   - Cons: Feature loss, reduced PAI compatibility

## Decision

We chose **semantic mapping with workarounds and selective omission**.

**Mapping strategy:**

1. **Direct mapping** (14 hooks) — Map PAI hook to semantically equivalent OpenCode event

| PAI Hook | OpenCode Event | Handler |
|----------|----------------|---------|
| `SecurityValidator` | `permission.ask` | `security-validator.ts` |
| `LoadContext` | `experimental.chat.system.transform` | `context-loader.ts` |
| `QuestionAnswered` | `tool.execute.after` | `learning-tracker.ts` |
| `RatingCapture` | `chat.message` | `learning-tracker.ts` |

2. **Workaround** (3 hooks) — Implement custom solution when no direct equivalent

| PAI Hook | Workaround | Implementation |
|----------|------------|----------------|
| `KittyEnvPersist` | tmux status-right | `terminal-ui.ts` + `statusline.sh` |
| `LastResponseCache` | 5s TTL dedup cache | `dedup-cache.ts` |
| `SetQuestionTab` | tmux window title | `terminal-ui.ts` |

3. **Omission** (3 hooks) — Skip hooks that are CC-specific UI features

| PAI Hook | Reason for Omission |
|----------|---------------------|
| `ResponseTabReset` | CC-specific UI; no OC equivalent needed |
| (CC-specific hooks) | Terminal/tab management not exposed to plugins |

**Event distribution:**

| OpenCode Event | PAI Hooks Mapped |
|----------------|------------------|
| `permission.ask` | 1 (`SecurityValidator`) |
| `tool.execute.before` | 3 (`AgentExecutionGuard`, `SkillGuard`, `SetQuestionTab`) |
| `tool.execute.after` | 4 (`PRDSync`, `QuestionAnswered`, `DocIntegrity`, `VoiceCompletion`) |
| `chat.message` | 3 (`RatingCapture`, `UpdateTabTitle`, `SessionAutoName`) |
| `experimental.chat.system.transform` | 1 (`LoadContext`) |
| `experimental.session.compacting` | 0 (adapter-initiated, not PAI-mapped) |
| `event` (wildcard) | 5 (session lifecycle hooks) |
| Workaround | 3 (`KittyEnvPersist`, `LastResponseCache`, custom UI) |
| Omitted | 1 (`ResponseTabReset`) |

**Rationale:**

1. **Semantic fidelity** — Preserves PAI's behavior, not just hook names
2. **Pragmatic coverage** — 19/20 hooks supported (95%); one CC-specific feature omitted
3. **Workaround registry** — Tracks custom implementations for future retirement (see COMPATIBILITY.md)
4. **Extensibility** — New PAI hooks can be mapped using same strategy

## Consequences

**Positive:**

- **High compatibility** — 95% of PAI hooks supported on OpenCode
- **Clear documentation** — COMPATIBILITY.md tracks all mappings and workarounds
- **Retirement path** — Workarounds can be retired when OpenCode adds native equivalents
- **Testable** — Each mapping can be tested independently

**Negative:**

- **Complexity** — Multiple mapping strategies to understand and maintain
- **Workaround debt** — Custom implementations may become obsolete (tracked in registry)
- **Debugging** — Must trace through mapping layer when issues arise

**Follow-ups:**

- COMPATIBILITY.md Event Mapping Table documents all 20 hooks
- COMPATIBILITY.md Workaround Registry tracks custom implementations
- Self-updater detects when OpenCode adds events that enable workaround retirement
- Tests verify each mapping fires correctly

---

*This ADR ensures the adapter faithfully reproduces PAI's behavior on OpenCode's event system.*
