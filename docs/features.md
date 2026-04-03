# Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Hook Translation** | 🔄 Adapted from PAI | Maps 20 PAI hooks → 9 semantic events → 8 OpenCode hooks |
| **Config Translation** | 🔄 Adapted from PAI | `settings.json` → `opencode.json` with merge semantics |
| **Session State** | 🔄 Adapted from PAI | Per-session `Map<sessionId, T>` with auto-cleanup |
| **Security Validator** | 🔄 Adapted from PAI | Input sanitization + 7-category injection detection (`tool.execute.before`) |
| **Secret Scrubber** | ✅ Native to OC | Redacts env secrets and API key patterns from LLM input messages (`experimental.chat.messages.transform`) |
| **Plan Mode** | 🔄 Adapted from PAI | Read-only mode via `/plan` command, blocks destructive tools |
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
| **Env Loader** | ✅ Native to OC | Auto-loads API keys from `~/.config/PAI/.env` for skills |
| **Skill Loader** | ✅ Native to OC | Native OpenCode skill tool support for PAI skills |
| **Agent Model Sync** | ✅ Native to OC | Syncs `model:` field in agent `.md` files from `pai-adapter.json` on startup |
| **Subagent Error Detection** | ✅ Native to OC | Checks top-level + stringified Task output for provider errors |
| **Subagent Model Fallback** | ✅ Native to OC | Injects alternative `subagent_type` suggestions on provider failures |
| **Subagent Stall Detection** | ✅ Native to OC | 3-minute heartbeat monitor per subagent, warns primary agent |
| **Subagent Loop Detection** | ✅ Native to OC | Hashes reasoning text in rolling window, detects repetitive thinking |
| **PAI Protection Rule** | ✅ Native to OC | Prevents accidental modification of upstream PAI files |

## Status Legend

- ✅ **Native to OC** — OpenCode native feature, adapter uses it directly
- 🔄 **Adapted from PAI** — PAI feature translated to OpenCode events
- ⚠️ **Limited Support** — Feature available with constraints or dependencies

## What This Adapter Does

1. **Event translation** — Maps 20 PAI hook files → 9 semantic events → 8 OpenCode plugin hooks
2. **Config translation** — Converts `settings.json` to `opencode.json` format
3. **State management** — Per-session state with automatic cleanup
4. **Security validation** — Tool gating and input sanitization
5. **Compaction handling** — Dual proactive and reactive session compaction
6. **Voice notifications** — ElevenLabs TTS for task completion alerts
7. **Subagent reliability** — 4-layer suite: error detection, model fallback, stall detection, reasoning loop detection

## What This Adapter Does NOT Do

- Modify PAI source files (read-only wrapper)
- Add npm dependencies beyond TypeScript
- Auto-merge updates (human review always required)

## Subagent Reliability Suite (v0.9.1)

The adapter monitors all subagent sessions and provides automatic guidance when things go wrong. All mechanisms are fail-open — they inject warnings into system prompts but never block execution.

### Layer 1: Enhanced Error Detection

Detects provider errors in Task tool output by checking:
- Top-level `error` fields in the Task result
- Full stringified body for error patterns (rate limits, model not found, connection errors, auth failures)

### Layer 2: Actionable Model Fallback

When a provider error is detected:
- Identifies the failed `subagent_type` and its model
- Looks up the fallback chain for that role in `pai-adapter.json`
- Injects a `<system-reminder>` with specific alternative `subagent_type` suggestions and their models
- Progresses through the fallback chain on repeated failures

### Layer 3: Stall Detection

Monitors subagent activity via `message.part.updated` events:
- Tracks last activity timestamp per subagent session
- If 3 minutes pass with no activity, warns the primary agent
- Warning suggests the subagent may be hung and recommends retrying with a different model

### Layer 4: Reasoning Loop Detection

Detects when a subagent gets stuck repeating the same reasoning:
- Hashes each reasoning text chunk (via `message.part.updated` for `reasoning` parts)
- Maintains a rolling window of 8 hashes per subagent
- If 3+ identical hashes appear in the window, warns the primary agent
- Session cleanup removes all tracking state on session end

---

[← Back to README](../README.md) · [Agents](agents.md) · [Compatibility Registry](../COMPATIBILITY.md)
