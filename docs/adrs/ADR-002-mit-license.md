# ADR-002: MIT License (Not SUL-1.0)

## Status

Accepted

## Context

PAI v4.0.3 is licensed under SUL-1.0 (Sustainable Use License), which has restrictions on commercial use and redistribution. The user explicitly requested to "avoid strict licensing if possible" for the adapter.

**Licensing options considered:**

1. **SUL-1.0** — Match PAI's license
   - Pros: Consistent with upstream, clear derivative work status
   - Cons: Restricts commercial use, limits adoption, conflicts with user requirement

2. **MIT** — Permissive open source license
   - Pros: Maximum adoption, commercial-friendly, simple terms, user preference
   - Cons: Must ensure no SUL-licensed code is imported

3. **Apache 2.0** — Permissive with patent grant
   - Pros: Patent protection, commercial-friendly
   - Cons: More complex than needed, no patent issues identified

4. **Dual licensing** — MIT for adapter, SUL-1.0 for PAI content
   - Pros: Clear separation
   - Cons: Confusing for users, unnecessary complexity

**Key constraint:**

The adapter must NOT import, copy, or derivative any code from upstream SUL-1.0 licensed projects (PAI hooks, PAI skills). The adapter only reads PAI content as data (like reading a config file), not as imported code.

## Decision

We chose **MIT License** for the adapter.

**Rationale:**

1. **User requirement** — Explicit request to "avoid strict licensing if possible"
2. **Maximum adoption** — MIT allows commercial use, modification, and redistribution
3. **Clean separation** — Adapter is original implementation, not derivative of PAI code
4. **Precedent** — OpenCode itself uses MIT; adapter aligns with host platform

**Implementation:**

- `LICENSE` file contains full MIT license text
- All source files include MIT license header
- README includes MIT badge and license section
- No imports from upstream SUL-1.0 licensed projects (PAI hooks, PAI skills)
- PAI content is read as data (JSON, Markdown), not imported as code

**Legal boundaries:**

- Adapter reads `~/.claude/hooks/*.hook.ts` as text, does not import them
- Adapter reads `~/.claude/skills/*.ts` as text, does not execute them directly
- Adapter reads `~/.claude/agents/*.md` as Markdown, embeds in system prompt
- Adapter implements its own event handlers, does not copy PAI hook implementations

## Consequences

**Positive:**

- **User satisfaction** — Meets explicit user requirement
- **Broader adoption** — Commercial entities can use without legal review
- **Ecosystem alignment** — Matches OpenCode's MIT license
- **Contribution-friendly** — Lower barrier for community contributions

**Negative:**

- **License incompatibility** — Cannot directly merge code from SUL-1.0 projects
- **Careful auditing** — Must verify no SUL-licensed code is accidentally imported
- **Documentation burden** — Must clearly explain licensing separation to users

**Follow-ups:**

- Zero upstream SUL-1.0 imports anywhere in codebase
- Zero PAI hook code imports; only path references and config reads
- Self-updater creates draft PRs (not auto-merges) to prevent accidental SUL code introduction (see ADR-008)

---

*This ADR ensures the adapter remains permissively licensed while respecting PAI's SUL-1.0 license.*
