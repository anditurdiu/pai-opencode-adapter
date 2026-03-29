# Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Hook Translation** | 🔄 Adapted from PAI | Maps 20 PAI hooks → 9 semantic events → 7 OpenCode hooks |
| **Config Translation** | 🔄 Adapted from PAI | `settings.json` → `opencode.json` with merge semantics |
| **Session State** | 🔄 Adapted from PAI | Per-session `Map<sessionId, T>` with auto-cleanup |
| **Security Validator** | 🔄 Adapted from PAI | Tool gating, input sanitization, bash command blocking |
| **Plan Mode** | 🔄 Adapted from PAI | Read-only mode via `/plan` command, blocks destructive tools |
| **Agent Teams** | ⚠️ Scaffold | Dispatch tracking via custom tools — records agent task assignments but does not spawn sub-agents; completion must be signaled externally |
| **Model Routing** | ✅ Native to OC | User-configurable model-per-role mapping with fallback chains |
| **Voice Notifications** | 🔄 Adapted from PAI | ElevenLabs TTS, ntfy.sh, Discord webhooks |
| **StatusLine** | 🔄 Adapted from PAI | tmux status-right integration with phase, tokens, learning signals |
| **Compaction (Proactive)** | 🔄 Adapted from PAI | Injects survival context during `experimental.session.compacting` |
| **Compaction (Reactive)** | 🔄 Adapted from PAI | Rescues learnings after `session.compacted` event |
| **Learning Tracker** | 🔄 Adapted from PAI | Captures ratings, sentiment, tool outcomes to JSONL |
| **Context Loader** | 🔄 Adapted from PAI | Loads TELOS + context files on session start |
| **Message Deduplication** | 🔄 Adapted from PAI | 5s TTL dedup cache prevents double-fire |
| **Session Lifecycle** | 🔄 Adapted from PAI | JSONL session tracking with memory summary |
| **Terminal UI (Kitty)** | ⚠️ Limited Support | Kitty tab integration (requires Kitty terminal) |
| **CLI Shim** | 🔄 Adapted from PAI | `claude` command → `opencode` wrapper script |
| **Self-Updater** | ✅ Native to OC | Monitors PAI + OC for updates, creates draft PRs |
| **File Logging** | ✅ Native to OC | `/tmp/pai-opencode-debug.log` (never console.log) |
| **Event Bus** | ✅ Native to OC | Internal pub/sub for adapter events |
| **Audit Logger** | ✅ Native to OC | Security audit JSONL for compliance |

## Status Legend

- ✅ **Native to OC** — OpenCode native feature, adapter uses it directly
- 🔄 **Adapted from PAI** — PAI feature translated to OpenCode events
- ⚠️ **Limited Support** — Feature available with constraints or dependencies
- ⚠️ **Scaffold** — Infrastructure in place, not yet fully functional

## What This Adapter Does

1. **Event translation** — Maps 20 PAI hook files → 9 semantic events → 7 OpenCode plugin hooks
2. **Config translation** — Converts `settings.json` to `opencode.json` format
3. **State management** — Per-session state with automatic cleanup
4. **Security validation** — Tool gating and input sanitization
5. **Compaction handling** — Dual proactive and reactive session compaction
6. **Voice notifications** — ElevenLabs TTS for task completion alerts
7. **Agent teams** — Dispatch tracking scaffold via custom OpenCode tools (tracks agent task assignments; actual agent execution depends on LLM tool-calling)

## What This Adapter Does NOT Do

- Modify PAI source files (read-only wrapper)
- Add npm dependencies beyond TypeScript
- Auto-merge updates (human review always required)

---

[← Back to README](../README.md) · [Compatibility Registry](../COMPATIBILITY.md)
