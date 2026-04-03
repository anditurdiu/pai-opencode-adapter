# PAI-OpenCode Adapter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.11.0-blue.svg)](https://github.com/anditurdiu/pai-opencode-adapter)
[![Test Status](https://img.shields.io/badge/tests-777%20pass-green.svg)](https://github.com/anditurdiu/pai-opencode-adapter)

**Run [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure) without an Anthropic subscription.** Use any LLM provider — OpenAI, Google, Ollama, or Anthropic — through [OpenCode](https://opencode.ai), the open-source AI coding assistant.

> **Background:** PAI (Personal AI Infrastructure) is a powerful personal AI system by Daniel Miessler, but it currently requires Claude Code and an Anthropic Max subscription. This adapter removes that lock-in by translating PAI's hook system into OpenCode's plugin API. Born from [community request (issue #98)](https://github.com/danielmiessler/Personal_AI_Infrastructure/issues/98).

## Why This Adapter?

PAI gives you structured AI workflows (the Algorithm), 63+ skills, 14 agents, memory systems, and a life OS (TELOS). But today it only runs on Claude Code, which requires an Anthropic Max subscription ($100-200/mo).

This adapter lets you run the **full PAI experience** on OpenCode with **any LLM provider**:

| Provider | Models | Cost |
|----------|--------|------|
| **Anthropic** | Claude Sonnet/Opus | API pay-as-you-go (no Max sub needed) |
| **OpenAI** | GPT-4o, o1 | API pay-as-you-go |
| **Google** | Gemini Pro/Flash | Free tier available |
| **Ollama** | Llama 3, Mistral | Free (runs locally) |
| **Any OpenCode-supported provider** | Various | Varies |

## Overview

The PAI-OpenCode Adapter is a **plugin adapter layer**, not a fork. It sits between PAI content (hooks, settings, agents) and the OpenCode plugin API, translating events and configurations so your PAI workflows run unchanged on OpenCode.

**What it does:** Event translation (20 PAI hooks → 8 OpenCode hooks), config translation, session state management, security validation, secret scrubbing, compaction handling, voice notifications, and subagent reliability (error detection, model fallback, stall detection, reasoning loop detection).

**What it doesn't do:** Modify PAI source files, add npm dependencies beyond TypeScript, or auto-merge updates.

> 📖 **Detailed docs:** [Architecture](docs/architecture.md) · [Agents](docs/agents.md) · [Features](docs/features.md) · [Configuration](docs/configuration.md) · [Self-Updater](docs/self-updater.md) · [Troubleshooting](docs/troubleshooting.md)

---

## Quick Start

### Step 1: Clone the repository

```bash
cd ~/projects
git clone https://github.com/anditurdiu/pai-opencode-adapter.git
cd pai-opencode-adapter
```

### Step 2: Install dependencies

```bash
bun install
```

### Step 3: Build the plugin

```bash
bun build src/plugin/pai-unified.ts --target=bun --outdir=dist --external opencode
```

### Step 4: Configure OpenCode

Add the plugin to your `~/.config/opencode/opencode.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "plugin": [
    "file:///absolute/path/to/pai-opencode-adapter/src/plugin/pai-unified.ts"
  ]
}
```

**Important:** The `plugin` path **must** use a `file://` prefix for local plugins. PAI adapter-specific settings (identity, voice, notifications) go in a separate `~/.config/opencode/pai-adapter.json` file — see [Configuration](docs/configuration.md).

### Step 5: Run OpenCode

```bash
opencode
# Or with tmux for StatusLine support:
tmux new-session -s pai opencode
```

**Verify** the plugin loaded:

```bash
tail -f /tmp/pai-opencode-debug.log
# Should show: [pai-unified] plugin initialized
```

> 📖 **Full setup guide:** [Getting Started](GETTING_STARTED.md)

---

## PAI-Native Experience

The adapter deploys PAI-native agents, themes, and commands into OpenCode.

### Agents

| Agent | Type | Model | Purpose |
|-------|------|-------|---------|
| **Algorithm** | Primary (Tab) | Claude Sonnet 4.6 | Full PAI Algorithm v3.5.0 — structured 7-phase workflow |
| **Native** | Primary (Tab) | Claude Sonnet 4.6 | Fast, direct task execution without Algorithm overhead |
| **Architect** | Subagent (@) | Claude Opus 4.6 | System design, architecture review, implementation specs |
| **Engineer** | Subagent (@) | Claude Sonnet 4.6 | Implementation, bug fixes, refactoring — full file access |
| **Thinker** | Subagent (@) | Claude Sonnet 4.6 | Deep reasoning, first principles analysis, tradeoff evaluation |
| **Research** | Subagent (@) | GLM-4.7 | Web research, documentation retrieval, content extraction |
| **Explorer** | Subagent (@) | GLM-4.7 | Fast read-only codebase exploration, pattern searching |
| **Intern** | Subagent (@) | GLM-4.7 | Lightweight tasks — data transformation, templating, boilerplate |

Switch between Algorithm and Native with **Tab**. Invoke subagents with **@architect**, **@engineer**, **@thinker**, **@research**, **@explorer**, or **@intern**.

> 📖 **Full agent reference:** [docs/agents.md](docs/agents.md)

### Commands

| Command | Description |
|---------|-------------|
| `/pai-setup` | Interactive onboarding wizard — configure identity, voice, preferences |
| `/algorithm [task]` | Start a task using the full PAI Algorithm workflow |
| `/native [task]` | Quick task execution in Native mode |
| `/telos [action]` | Review and update your TELOS life goals |

### Theme

The PAI theme (`pai.json`) provides a dark blue/slate color scheme. Auto-applied during installation; change with `/theme` in the TUI.

---

## Prerequisites

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| [OpenCode](https://opencode.ai) | ≥1.0 | Host CLI for plugin | `curl -fsSL https://opencode.ai/install \| bash` |
| [PAI v4.0.3](https://github.com/danielmiessler/Personal_AI_Infrastructure) | 4.0.3 | Source of hooks, agents, skills | `git clone` (see [Getting Started](GETTING_STARTED.md)) |
| [Bun](https://bun.sh) | ≥1.0 | Runtime and build tool | `curl -fsSL https://bun.sh/install \| bash` |

**Optional:** tmux (StatusLine), jq (StatusLine JSON), gh CLI (self-updater PRs), ElevenLabs API key (voice TTS).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, and PR guidelines.

**Adding a new handler?** Create a handler in `src/handlers/`, register it in `src/plugin/pai-unified.ts`, write tests in `src/__tests__/`, then run `bun test` to verify all 765 tests pass.

**Code style:** TypeScript strict, `fileLog()` only (never `console.log`), session-scoped state, adapter pattern (never modify `~/.claude/`).

---

## License

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**MIT License** — See [LICENSE](LICENSE) for full text.

Both [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure) and [OpenCode](https://opencode.ai) are also MIT licensed.

---

## Related Projects

- **[Personal AI Infrastructure (PAI)](https://github.com/danielmiessler/Personal_AI_Infrastructure)** — Original PAI v4.0.3 for Claude Code (MIT licensed)
- **[OpenCode](https://opencode.ai)** — Open-source AI coding assistant (MIT licensed)
- **[PAI Issue #98](https://github.com/danielmiessler/Personal_AI_Infrastructure/issues/98)** — The community request that motivated this adapter

---

## Changelog

### v0.11.0 (2026-04-04)

**Security hardening:**

- Secret scrubber — new `experimental.chat.messages.transform` hook; redacts env secrets and API key patterns (Anthropic, OpenAI, GitHub, AWS, Slack, Google) from LLM input messages before they reach the provider
- `.env` file blocking hardened — all agents now use explicit `read: { "*.env": "deny" }` permissions instead of blanket `read: "allow"`, closing the gap where agent permissions could override OpenCode's default `.env` deny rules
- Base64 false-positive fix — `sanitizeInput` now only decodes base64 blobs that contain `+` or `/`, preventing plain alphanumeric identifiers (function names etc.) from being misidentified as injections
- Dead code removed — `permissionGateHandler`, `PROTECTED_PATHS`, `DANGEROUS_COMMANDS`, `SAFE_TOOLS` deleted; `chat.params` hook documented and deferred
- 777 tests, 0 failures (net +6)

### v0.9.1 (2026-03-31)

**Subagent reliability suite:**

- Enhanced error detection — checks top-level error fields AND full Task output body for provider errors
- Actionable model fallback guidance — injects alternative `subagent_type` suggestions on provider failures
- Stall detection — 3-minute inactivity heartbeat monitor per subagent, warns primary agent
- Reasoning loop detection — hashes reasoning text in rolling window, detects repetitive thinking patterns
- Env-loader — auto-loads API keys from `~/.config/PAI/.env`
- Skill-loader — native OpenCode skill tool support
- Agent model sync — `model:` field in agent `.md` files, synced from `pai-adapter.json` on startup
- PAI protection rule — prevents accidental modification of upstream PAI files
- 8 agents (added Architect, Engineer, Intern)
- 765 tests, 0 failures

### v0.7.0 (2026-03-31)

**Subagent context isolation:**

- Subagent preamble injection prevents recursive agent spawning
- Task tool blocking for subagent sessions (defense-in-depth)
- Skill tool remains available to subagents for loading workflows

### v0.1.0 (2026-03-21)

**Initial release:**

- Event translation for 20 PAI hooks across 8 OpenCode plugin hooks
- Config translation with merge semantics
- Session-scoped state management
- Security validator with tool gating
- Dual compaction strategy (proactive + reactive)
- Voice notifications (ElevenLabs, ntfy, Discord)
- StatusLine tmux integration
- Self-updater with draft PR creation
- File-based logging (never console.log)
- 546 tests, 0 failures

---

<div align="center">

**PAI-OpenCode Adapter** — Run PAI on OpenCode, not Claude Code.

[Report Issue](https://github.com/anditurdiu/pai-opencode-adapter/issues) · [Request Feature](https://github.com/anditurdiu/pai-opencode-adapter/discussions)

</div>
