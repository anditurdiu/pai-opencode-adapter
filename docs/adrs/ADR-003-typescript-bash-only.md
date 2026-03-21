# ADR-003: TypeScript + Bash Only (No Go)

## Status

Accepted

## Context

The adapter needs to implement multiple components: plugin hooks, CLI scripts, installers, and status line integrations. We needed to decide which programming languages to use.

**Options considered:**

1. **TypeScript only** — All components in TypeScript
   - Pros: Consistent language, type safety, single toolchain
   - Cons: Bash integration requires child_process, less natural for shell scripts

2. **TypeScript + Bash** — TypeScript for plugin, Bash for shell scripts
   - Pros: Right tool for each job, OpenCode plugin API is TypeScript, Bash ideal for installers
   - Cons: Two languages to maintain, developers need both skill sets

3. **Go + Bash** — Go for plugin, Bash for scripts
   - Pros: Fast compilation, single binary deployment
   - Cons: OpenCode plugin API expects TypeScript, cross-compilation complexity, unfamiliar to target users

4. **Python + Bash** — Python for plugin, Bash for scripts
   - Pros: Readable, widely known
   - Cons: OpenCode plugin API is TypeScript-first, runtime dependency on Python interpreter

**Key constraints:**

- OpenCode plugin API is TypeScript-first (hooks are `.ts` files)
- Target users are JavaScript/TypeScript developers (AI coding assistant users)
- Shell scripts (installers, statusline) are naturally Bash
- Avoid cross-compilation complexity (Go would require multi-arch builds)

## Decision

We chose **TypeScript + Bash only** — no Go code anywhere in the adapter.

**Implementation:**

- **Plugin code** — TypeScript (`src/plugin/pai-unified.ts`, `src/handlers/*.ts`)
- **CLI scripts** — Bash (`scripts/install.sh`, `scripts/uninstall.sh`)
- **StatusLine** — Bash (`src/statusline/statusline.sh`)
- **CLI Shim** — Bash (`src/adapters/cli-shim.sh`)
- **Build tool** — Bun (TypeScript runtime and bundler)

**Rationale:**

1. **OpenCode alignment** — Plugin API is TypeScript; we use TypeScript
2. **User familiarity** — Target users know JavaScript/TypeScript from OpenCode
3. **Shell integration** — Bash is ideal for installers and tmux integration
4. **Simplicity** — No cross-compilation, no Go toolchain, no binary distribution

**Explicitly rejected:**

- Go for performance (not needed; plugin is I/O-bound, not CPU-bound)
- Go for single-binary deployment (not needed; Bun handles TypeScript directly)
- Python for scripting (Bash is more portable for system scripts)

## Consequences

**Positive:**

- **Consistency** — Plugin code matches OpenCode's language
- **Lower barrier** — Users can read and modify adapter code without learning Go
- **Simpler toolchain** — Only Bun + Bash required (no Go compiler)
- **Faster iteration** — TypeScript compiles instantly with Bun

**Negative:**

- **Two languages** — Developers need TypeScript + Bash skills (but both are common)
- **No single binary** — Distribution requires source files (but Bun handles this)
- **Bash portability** — Some Bash features differ between macOS and Linux (mitigated with careful scripting)

**Follow-ups:**

- All `.ts` files use strict TypeScript (no `any` types)
- All `.sh` files use `set -eo pipefail` for safety
- No Go binaries checked into repository
- No `go.mod` or Go-related configuration files

---

*This ADR keeps the adapter accessible to OpenCode's primary user base: TypeScript developers.*
