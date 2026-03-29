# ADR-002: MIT License

## Status

Accepted

## Context

Both PAI v4.0.3 and OpenCode are licensed under the MIT License. The adapter needed a license that maximizes adoption, aligns with both upstream projects, and meets the user's preference for permissive licensing.

**Licensing options considered:**

1. **MIT** — Permissive open source license
   - Pros: Maximum adoption, commercial-friendly, simple terms, aligns with both PAI and OpenCode
   - Cons: No patent grant (not needed for this project)

2. **Apache 2.0** — Permissive with patent grant
   - Pros: Patent protection, commercial-friendly
   - Cons: More complex than needed, no patent issues identified

3. **AGPL / GPL** — Copyleft licenses
   - Pros: Ensures derivatives remain open
   - Cons: Restricts commercial use, limits adoption, unnecessary given MIT upstream

**Key factor:**

Both upstream projects (PAI and OpenCode) use MIT, making MIT the natural choice for ecosystem alignment. The adapter reads PAI content as data (like reading a config file), not as imported code, maintaining clean separation.

## Decision

We chose **MIT License** for the adapter.

**Rationale:**

1. **Ecosystem alignment** — Both PAI and OpenCode use MIT; adapter matches both
2. **User requirement** — Explicit request to "avoid strict licensing if possible"
3. **Maximum adoption** — MIT allows commercial use, modification, and redistribution
4. **Clean separation** — Adapter is original implementation, not derivative of PAI code
5. **Simplicity** — MIT is one of the simplest and most widely understood licenses

**Implementation:**

- `LICENSE` file contains full MIT license text
- README includes MIT badge and license section
- PAI content is read as data (JSON, Markdown), not imported as code

**Legal boundaries:**

- Adapter reads `~/.claude/hooks/*.hook.ts` as text, does not import them
- Adapter reads `~/.claude/skills/*.ts` as text, does not execute them directly
- Adapter reads `~/.claude/agents/*.md` as Markdown, embeds in system prompt
- Adapter implements its own event handlers, does not copy PAI hook implementations

## Consequences

**Positive:**

- **User satisfaction** — Meets explicit user requirement for permissive licensing
- **Broader adoption** — Commercial entities can use without legal review
- **Ecosystem alignment** — Matches both PAI's and OpenCode's MIT license
- **Contribution-friendly** — Lower barrier for community contributions

**Negative:**

- **No patent protection** — MIT does not include patent grants (Apache 2.0 does)
- **Permissive reuse** — Others can use code without contributing back (acceptable tradeoff)

**Follow-ups:**

- Adapter reads PAI content as data only; no code imports from upstream
- Self-updater creates draft PRs (not auto-merges) to maintain review control (see ADR-008)

---

*This ADR documents the licensing decision for the PAI-OpenCode Adapter.*
