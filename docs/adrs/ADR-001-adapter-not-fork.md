# ADR-001: Adapter Layer Architecture (Not a Fork)

## Status

Accepted

## Context

When building the PAI-OpenCode Adapter, we faced a fundamental architectural decision: should we fork PAI v4.0.3 and modify it to run on OpenCode, or should we build an adapter layer that wraps PAI content without modifying it?

**Fork approach considerations:**

- Direct modification of PAI hooks to target OpenCode API
- Full control over implementation details
- Risk of diverging from upstream PAI updates
- Merge conflicts when PAI releases new versions
- Potential licensing complications if upstream license changes

**Adapter approach considerations:**

- PAI content remains read-only at `~/.claude/`
- Adapter translates events at runtime
- Upgrades are diffs (compare versions) not merges (resolve conflicts)
- Clear separation between PAI content and adapter code (both MIT)
- Slightly more complex event mapping logic

**Key requirements:**

1. Run PAI workflows on OpenCode without modification
2. Enable independent versioning and licensing
3. Minimize maintenance burden for upstream updates
4. Preserve PAI's integrity (no accidental modifications)

## Decision

We chose the **adapter layer pattern** over forking.

**Implementation:**

- PAI content (`~/.claude/hooks/`, `~/.claude/skills/`, `~/.claude/agents/`) is **read-only**
- Adapter lives in separate repository (`pai-opencode-adapter`)
- Event translation happens at runtime via `src/plugin/pai-unified.ts`
- Config translation merges `settings.json` → `opencode.json` without modifying source
- Self-updater monitors both PAI and OpenCode for changes, creates draft PRs for review

**Architecture:**

```
PAI Content (Read-Only) → Adapter Layer → OpenCode Plugin API → OpenCode Runtime
```

The adapter registers hooks on OpenCode events, reads PAI content as needed, and translates between the two systems without ever writing to PAI directories.

## Consequences

**Positive:**

- **Upgrade simplicity** — Updating from PAI v4.0.3 to v4.0.4 is a diff analysis, not a merge conflict resolution
- **License clarity** — Adapter is MIT; PAI is also MIT; clean separation maintained
- **PAI integrity** — Impossible to accidentally corrupt PAI installation
- **Testing isolation** — Adapter can be tested independently of PAI modifications
- **Community adoption** — Users can adopt adapter without forking/maintaining PAI

**Negative:**

- **Complexity** — Event mapping logic is more complex than direct modification
- **Performance** — Runtime translation adds minimal overhead (negligible in practice)
- **Debugging** — Two layers to trace when issues arise (PAI hook → adapter → OpenCode event)
- **Feature lag** — New PAI features require adapter updates, not automatic inheritance

**Follow-ups:**

- Self-updater automates detection of PAI changes (see ADR-008)
- COMPATIBILITY.md tracks event mappings and workaround registry
- Test suite validates adapter behavior independent of PAI modifications

---

*This ADR is foundational to the adapter architecture. All subsequent decisions build on this pattern.*
