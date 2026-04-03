# Architecture

The PAI-OpenCode Adapter is a **plugin adapter layer**, not a fork. It sits between [PAI v4.0.3](https://github.com/danielmiessler/Personal_AI_Infrastructure) content (hooks, settings, agents) and the OpenCode plugin API, translating events and configurations so your PAI workflows run unchanged on OpenCode.

## System Diagram

```mermaid
flowchart TB
    subgraph PAI_CONTENT["PAI Content (Read-Only)"]
        A1[hooks/*.hook.ts]
        A2[settings.json]
        A3[agents/*.md]
        A4[skills/*.ts]
        A5[PAI/.env]
    end

    subgraph ADAPTER["Adapter Layer"]
        B1[pai-unified.ts<br/>Main Plugin Entry]
        B2[event-adapter.ts<br/>Event Translation]
        B3[config-translator.ts<br/>Config Merge]
        B4[state-manager.ts<br/>Session State]
        B5[security-validator.ts<br/>Input Sanitization]
        B6[compaction-handler.ts<br/>Context Survival]
        B7[voice-notifications.ts<br/>TTS Alerts]
        B8[model-resolver.ts<br/>Model Routing + Fallback]
        B9[env-loader.ts<br/>API Key Loading]
        B10[skill-loader.ts<br/>PAI Skill Support]
        B11[secret-scrubber.ts<br/>LLM Input Scrubbing]
    end

    subgraph RELIABILITY["Subagent Reliability Suite"]
        R1[Error Detection<br/>Provider error parsing]
        R2[Model Fallback<br/>Alternative agent suggestions]
        R3[Stall Detection<br/>3-min heartbeat monitor]
        R4[Loop Detection<br/>Reasoning hash window]
    end

    subgraph OPENCODE_API["OpenCode Plugin API"]
        C1[tool.execute.before]
        C2[tool.execute.after]
        C3[chat.message]
        C4[experimental.chat.system.transform]
        C5[experimental.chat.messages.transform]
        C6[experimental.session.compacting]
        C7[config]
        C8[event wildcard]
    end

    subgraph RUNTIME["OpenCode Runtime"]
        D1[OpenCode CLI]
        D2[tmux StatusLine]
        D3[Plugin System]
    end

    PAI_CONTENT -->|Read Only| ADAPTER
    B1 -->|Registers Hooks| OPENCODE_API
    OPENCODE_API -->|Executes| RUNTIME
    B4 -.->|Map&lt;sessionId, T&gt;| B4
    B7 -->|ElevenLabs API| E[Voice Output]
    B1 -->|Monitors Subagents| RELIABILITY
    RELIABILITY -->|Injects Warnings| C5
    B8 -->|Fallback Chains| R2
    B9 -->|Loads Keys| A5

    style PAI_CONTENT fill:#f9f,stroke:#333,stroke-width:2px
    style ADAPTER fill:#bbf,stroke:#333,stroke-width:2px
    style RELIABILITY fill:#ffd,stroke:#333,stroke-width:2px
    style OPENCODE_API fill:#bfb,stroke:#333,stroke-width:2px
    style RUNTIME fill:#fbb,stroke:#333,stroke-width:2px
```

## Sub-systems

| Sub-system | File | Responsibility |
|------------|------|----------------|
| Event Adapter | `src/adapters/event-adapter.ts` | PAI → OpenCode event translation |
| Config Translator | `src/adapters/config-translator.ts` | `settings.json` → `opencode.json` |
| State Manager | `src/lib/state-manager.ts` | Session-scoped `Map<sessionId, T>` |
| Security Validator | `src/handlers/security-validator.ts` | Input sanitization, 7-category injection detection |
| Secret Scrubber | `src/handlers/secret-scrubber.ts` | Redacts env secrets + API key patterns from LLM input messages |
| Compaction Handler | `src/handlers/compaction-handler.ts` | Proactive + reactive compaction |
| Voice Notifications | `src/handlers/voice-notifications.ts` | ElevenLabs TTS, ntfy, Discord |

## Subagent Reliability Suite

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Error Detection | `src/plugin/pai-unified.ts` | Parses Task output for provider errors (rate limit, model not found, auth failure) |
| Model Fallback | `src/lib/model-resolver.ts` + `pai-unified.ts` | Suggests alternative `subagent_type` with models from fallback chain |
| Stall Detection | `src/plugin/pai-unified.ts` | 3-minute heartbeat monitor per subagent; warns primary on inactivity |
| Loop Detection | `src/plugin/pai-unified.ts` | Hashes reasoning chunks in rolling window of 8; detects 3+ repeats |

All layers are fail-open — they inject guidance via `<system-reminder>` in system prompts but never block execution or crash the host process.

## Additional Components

| Component | File | Purpose |
|-----------|------|---------|
| Dedup Cache | `src/core/dedup-cache.ts` | 5s TTL message deduplication |
| Event Bus | `src/core/event-bus.ts` | Internal event pub/sub |
| File Logger | `src/lib/file-logger.ts` | `/tmp/pai-opencode-debug.log` |
| Model Resolver | `src/lib/model-resolver.ts` | Per-role model routing with fallback chains |
| Env Loader | `src/lib/env-loader.ts` | Auto-loads API keys from `~/.config/PAI/.env` for skills |
| Skill Loader | `src/lib/skill-loader.ts` | Native OpenCode skill tool support |
| Agent Model Sync | `src/plugin/pai-unified.ts` | Syncs `model:` field in agent `.md` from `pai-adapter.json` on startup |
| StatusLine | `src/statusline/statusline.sh` | tmux status-right integration |
| Self-Updater | `src/updater/self-updater.ts` | Monitors PAI + OC for updates |
| CLI Shim | `src/adapters/cli-shim.sh` | `claude` → `opencode` wrapper |

## Design Principles

- **No Anthropic subscription required** — Use any LLM provider via OpenCode
- **Adapter pattern** — Wraps PAI content, never modifies it
- **Zero forks** — Upgrades are diffs, not merges
- **Read-only PAI** — Your `~/.claude/` directory remains untouched
- **Session-scoped state** — No global variables, safe concurrent sessions
- **File-based logging** — Never corrupts OpenCode TUI with console.log
- **Fail-open reliability** — Subagent monitors inject guidance but never block

---

[← Back to README](../README.md) · [Architecture Decision Records](adrs/)
