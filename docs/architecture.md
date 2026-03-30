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
    end

    subgraph ADAPTER["Adapter Layer"]
        B1[pai-unified.ts<br/>Main Plugin Entry]
        B2[event-adapter.ts<br/>Event Translation]
        B3[config-translator.ts<br/>Config Merge]
        B4[state-manager.ts<br/>Session State]
        B5[security-validator.ts<br/>Tool Gating]
        B6[compaction-handler.ts<br/>Context Survival]
        B7[voice-notifications.ts<br/>TTS Alerts]
    end

    subgraph OPENCODE_API["OpenCode Plugin API"]
        C1[permission.ask]
        C2[tool.execute.before]
        C3[tool.execute.after]
        C4[chat.message]
        C5[experimental.chat.system.transform]
        C6[experimental.session.compacting]
        C7[event wildcard]
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
    B8 -->|Custom Tools| C1

    style PAI_CONTENT fill:#f9f,stroke:#333,stroke-width:2px
    style ADAPTER fill:#bbf,stroke:#333,stroke-width:2px
    style OPENCODE_API fill:#bfb,stroke:#333,stroke-width:2px
    style RUNTIME fill:#fbb,stroke:#333,stroke-width:2px
```

## Sub-systems

| Sub-system | File | Responsibility |
|------------|------|----------------|
| Event Adapter | `src/adapters/event-adapter.ts` | PAI → OpenCode event translation |
| Config Translator | `src/adapters/config-translator.ts` | `settings.json` → `opencode.json` |
| State Manager | `src/lib/state-manager.ts` | Session-scoped `Map<sessionId, T>` |
| Security Validator | `src/handlers/security-validator.ts` | Tool gating, input sanitization |
| Compaction Handler | `src/handlers/compaction-handler.ts` | Proactive + reactive compaction |
| Voice Notifications | `src/handlers/voice-notifications.ts` | ElevenLabs TTS, ntfy, Discord |
| Agent Teams | — | Removed — native OC teams ship on dev branch (PRs #12730–12732); use OpenCode Task tool in the interim |

## Additional Components

| Component | File | Purpose |
|-----------|------|---------|
| Dedup Cache | `src/core/dedup-cache.ts` | 5s TTL message deduplication |
| Event Bus | `src/core/event-bus.ts` | Internal event pub/sub |
| File Logger | `src/lib/file-logger.ts` | `/tmp/pai-opencode-debug.log` |
| Model Resolver | `src/lib/model-resolver.ts` | Per-role model routing with fallback chains |
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

---

[← Back to README](../README.md) · [Architecture Decision Records](adrs/)
