# Contributing to PAI-OpenCode Adapter

Thanks for your interest in contributing! This guide covers the mechanics of contributing.

## Prerequisites

- [Bun](https://bun.sh) (v1.0+) — runtime and package manager
- [Git](https://git-scm.com/)
- A working [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure) installation (`~/.claude/` directory)

## Setup

```bash
# Clone the repo
git clone https://github.com/anditurdiu/pai-opencode-adapter.git
cd pai-opencode-adapter

# Install dependencies
bun install
```

## Running Tests

```bash
# Run all tests with coverage
bun test

# Run a specific test file
bun test src/__tests__/event-adapter.test.ts

# Run tests matching a pattern
bun test --filter "compaction"
```

All 546 tests should pass before submitting a PR.

## Project Structure

```
src/
  plugin/         # Main plugin entry point (pai-unified.ts)
  adapters/       # Event and config translation
  handlers/       # Individual feature handlers
  generators/     # Config and agent file generators
  lib/            # Shared utilities
  core/           # Event bus, dedup cache
  config/         # Agent definitions, commands, themes
  updater/        # Self-update mechanism
  __tests__/      # All test files
scripts/          # Install/uninstall scripts
docs/adrs/        # Architecture Decision Records
```

## Submitting a Pull Request

1. **Fork** the repo and create your branch from `main`
2. **Write tests** for any new functionality
3. **Run `bun test`** and ensure all tests pass
4. **Follow existing patterns** — look at existing handlers for style reference
5. **One concern per PR** — keep changes focused
6. **Write a clear PR description** explaining what and why

## Code Style

- TypeScript with strict types
- File-based logging only (`fileLog()`) — never `console.log`
- Session-scoped state — no global mutable variables
- Adapter pattern — never modify PAI source files in `~/.claude/`

## Architecture Decisions

Before proposing significant changes, review the [ADRs](docs/adrs/) to understand design choices:

- [ADR-001](docs/adrs/ADR-001-adapter-not-fork.md) — Adapter pattern, not a fork
- [ADR-004](docs/adrs/ADR-004-session-scoped-state.md) — Session-scoped state
- [ADR-005](docs/adrs/ADR-005-file-logging.md) — File-based logging
- [ADR-007](docs/adrs/ADR-007-event-mapping.md) — Event mapping strategy

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
