# Compatibility Registry

This document tracks the compatibility mapping between PAI v4.0.3 hooks and OpenCode plugin API events, along with custom workarounds implemented to bridge gaps where direct mapping is not possible.

**Purpose:**

- Provide a reference for which PAI features are supported on OpenCode
- Track workarounds and their retirement criteria
- Document known limitations and API baseline
- Enable self-updater to detect when workarounds can be retired

**How to use:**

1. **Adding a new handler** — Add a row to the Event Mapping Table
2. **Implementing a workaround** — Add a row to the Workaround Registry
3. **Retiring a workaround** — Update the `Retire When` column and mark as `retired`
4. **Updating baseline** — When OpenCode adds new events, update the API Baseline section

---

## Event Mapping Table

This table maps all 20 PAI hook files to their corresponding OpenCode plugin events.

| PAI Hook | PAI File | OpenCode Event | Handler File | Notes |
|----------|----------|----------------|--------------|-------|
| LoadContext | `~/.claude/hooks/LoadContext.hook.ts` | `experimental.chat.system.transform` | `src/handlers/context-loader.ts` | Injects TELOS + context files into system prompt on session start |
| KittyEnvPersist | `~/.claude/hooks/KittyEnvPersist.hook.ts` | (Workaround) | `src/handlers/terminal-ui.ts` | No direct OC equivalent; uses tmux status-right instead of Kitty env vars |
| SecurityValidator | `~/.claude/hooks/SecurityValidator.hook.ts` | `permission.ask` | `src/handlers/security-validator.ts` | Gates tool execution with allow/deny/ask verdicts |
| AgentExecutionGuard | `~/.claude/hooks/AgentExecutionGuard.hook.ts` | `tool.execute.before` | `src/handlers/security-validator.ts` | Validates agent tool calls before execution |
| SkillGuard | `~/.claude/hooks/SkillGuard.hook.ts` | `tool.execute.before` | `src/handlers/security-validator.ts` | Blocks unauthorized skill invocations |
| SetQuestionTab | `~/.claude/hooks/SetQuestionTab.hook.ts` | `tool.execute.before` | `src/handlers/terminal-ui.ts` | Sets tmux window title; workaround for no tab API |
| PRDSync | `~/.claude/hooks/PRDSync.hook.ts` | `tool.execute.after` | `src/handlers/learning-tracker.ts` | Syncs PRD context after tool completion |
| QuestionAnswered | `~/.claude/hooks/QuestionAnswered.hook.ts` | `tool.execute.after` | `src/handlers/learning-tracker.ts` | Captures Q&A pairs for learning signals |
| LastResponseCache | `~/.claude/hooks/LastResponseCache.hook.ts` | (Workaround) | `src/core/dedup-cache.ts` | Replaced by 5s TTL dedup cache; no persistent cache needed |
| ResponseTabReset | `~/.claude/hooks/ResponseTabReset.hook.ts` | (Omitted) | N/A | CC-specific UI feature; no OC equivalent needed |
| VoiceCompletion | `~/.claude/hooks/VoiceCompletion.hook.ts` | `tool.execute.after` + `event` | `src/handlers/voice-notifications.ts` | Triggers TTS on tool completion and session idle |
| DocIntegrity | `~/.claude/hooks/DocIntegrity.hook.ts` | `tool.execute.after` | `src/handlers/learning-tracker.ts` | Validates doc updates post-execution |
| WorkCompletionLearning | `~/.claude/hooks/WorkCompletionLearning.hook.ts` | `event` (session.end) | `src/handlers/session-lifecycle.ts` | Writes session summary JSONL on session end |
| SessionCleanup | `~/.claude/hooks/SessionCleanup.hook.ts` | `event` (session.end) | `src/handlers/session-lifecycle.ts` | Cleans up session state on session end |
| RelationshipMemory | `~/.claude/hooks/RelationshipMemory.hook.ts` | `event` (session.end) | `src/handlers/learning-tracker.ts` | Persists relationship context to memory |
| UpdateCounts | `~/.claude/hooks/UpdateCounts.hook.ts` | `event` (session.end) | `src/handlers/session-lifecycle.ts` | Updates skill/work counts in status |
| IntegrityCheck | `~/.claude/hooks/IntegrityCheck.hook.ts` | `event` (session.end) | `src/handlers/session-lifecycle.ts` | Final integrity validation before session close |
| RatingCapture | `~/.claude/hooks/RatingCapture.hook.ts` | `chat.message` | `src/handlers/learning-tracker.ts` | Captures user ratings from chat messages |
| UpdateTabTitle | `~/.claude/hooks/UpdateTabTitle.hook.ts` | `chat.message` | `src/handlers/terminal-ui.ts` | Updates tmux window title on message |
| SessionAutoName | `~/.claude/hooks/SessionAutoName.hook.ts` | `chat.message` | `src/handlers/session-lifecycle.ts` | Auto-generates session name from first message |

**Mapping summary:**

- **Direct mappings:** 14 PAI hooks → OpenCode events
- **Workarounds:** 3 PAI hooks → Custom implementation
- **Omitted:** 3 PAI hooks → No OC equivalent (CC-specific UI features)

**Event distribution:**

| OpenCode Event | PAI Hooks Mapped | Handler Files |
|----------------|------------------|---------------|
| `experimental.chat.system.transform` | 1 | `context-loader.ts` |
| `permission.ask` | 1 | `security-validator.ts` |
| `tool.execute.before` | 3 | `security-validator.ts`, `terminal-ui.ts` |
| `tool.execute.after` | 4 | `learning-tracker.ts`, `voice-notifications.ts` |
| `chat.message` | 3 | `learning-tracker.ts`, `terminal-ui.ts`, `session-lifecycle.ts` |
| `event` (wildcard) | 5 | `session-lifecycle.ts`, `learning-tracker.ts`, `voice-notifications.ts` |
| (Workaround) | 3 | `dedup-cache.ts`, `terminal-ui.ts` |
| (Omitted) | 1 | N/A |

---

## Workaround Registry

This registry tracks custom implementations that bridge gaps where PAI hooks have no direct OpenCode equivalent.

| Workaround | Custom Feature | PAI Mechanism | Adapter Implementation | OC Native? | Retire When |
|------------|----------------|---------------|------------------------|------------|-------------|
| dedup-cache | Message Deduplication | CC auto-dedup on message send | `src/core/dedup-cache.ts` (5s TTL, session-scoped) | No | OpenCode adds native message dedup API |
| agent-teams | Agent Team Coordination | CC sub-agent spawning | **Removed** — OpenCode's `dev` branch ships native agent teams (PRs #12730–12732) with full task board, peer-to-peer messaging, multi-turn coordination, and multi-provider support. Our fire-and-forget wrapper added no meaningful value over the native Task tool. | Retired | Native OC agent teams (dev branch, PRs #12730–12732) |
| plan-mode | Plan Mode | CC plan mode toggle | `src/handlers/plan-mode.ts` (tool blocking + agent switch on `/plan` command) | No | OpenCode adds plan/edit mode toggle API |
| statusline | Status Line | CC status hook integration | `src/statusline/statusline.sh` (tmux status-right, reads session state JSON) | No | OpenCode adds TUI status display API |
| voice-notifications | Voice/TTS | CC voice completion hook | `src/handlers/voice-notifications.ts` (ElevenLabs API, ntfy.sh, Discord webhooks) | No | OpenCode adds native voice output API |
| terminal-ui | Terminal UI | CC Kitty terminal integration | `src/handlers/terminal-ui.ts` (tmux window title, bash-env fallback) | No | OpenCode adds terminal title API |
| cli-shim | Claude Command Shim | CC `claude` CLI entrypoint | `src/adapters/cli-shim.sh` (wraps `opencode` as `claude`) | No | Users migrate to `opencode` command natively |

**Workaround status:**

| Status | Count | Description |
|--------|-------|-------------|
| Active | 6 | Currently in use, no OC native equivalent |
| Retired | 1 | OC now provides native equivalent (agent-teams) |
| Pending | 0 | Under consideration for retirement |

**Retirement process:**

1. Self-updater detects new OpenCode event that provides native equivalent
2. Self-updater flags workaround as `retirementCandidate` in update report
3. Developer reviews and implements migration to native API
4. Workaround marked as `retired` in this registry
5. Code removed in next major version

---

## OpenCode Native Capabilities (Not Adapter Responsibilities)

The following capabilities are provided **natively by OpenCode** and do NOT require adapter implementation. The adapter observes these via hook logging but does not implement them:

| Capability | OpenCode Source | What It Does | Adapter Role |
|------------|----------------|--------------|--------------|
| **Skill Tool** | `packages/opencode/src/tool/skill.ts` | Discovers and loads skills from `~/.claude/skills/`, `~/.agents/skills/`, `.opencode/skill/` | Logging only (`[skill-tracker]` in debug log) |
| **Task Tool** | `packages/opencode/src/tool/task.ts` | Spawns real sub-agent sessions via `Session.create()` with `parentID`, returns results | Logging only (`[skill-tracker]` in debug log) |
| **MCP Servers** | `opencode.json` → `"mcp"` key | Native MCP server support; tools appear directly in model's tool list | None — fully native |

**Note:** The adapter no longer ships custom agent team tools. OpenCode's native Task tool handles sub-agent spawning, and a full native agent teams implementation exists on OpenCode's `dev` branch (PRs #12730–12732) with task boards, peer-to-peer messaging, multi-turn coordination, crash recovery, and multi-provider support.

---

## Known Limitations

The following features are **not supported** by the adapter:

### 1. Claude Code-specific slash commands

**Limitation:** CC slash commands like `/clear`, `/help`, `/terms` are not available.

**Reason:** These are built into CC's CLI, not exposed via plugin API.

**Workaround:** Use OpenCode equivalents (e.g., `Ctrl+L` to clear, `--help` flag).

---

### 2. tmux required for StatusLine

**Limitation:** StatusLine feature requires tmux to be installed and running.

**Reason:** Adapter uses tmux `status-right` for real-time status display.

**Workaround:** Run without tmux; adapter functions normally, just no status line.

---

### 3. ElevenLabs API key required for voice

**Limitation:** Voice notifications require a paid ElevenLabs API key.

**Reason:** Adapter uses ElevenLabs TTS API for voice synthesis.

**Workaround:** Disable voice in config; use ntfy.sh or Discord notifications instead (free).

---

### 4. Kitty terminal features limited

**Limitation:** Kitty-specific features (env var persistence, tab control) are degraded.

**Reason:** Adapter targets tmux for broader compatibility.

**Workaround:** Use tmux instead of Kitty; or accept reduced functionality.

---

### 5. No direct session name API

**Limitation:** Session auto-naming uses heuristics, not OC-native session naming.

**Reason:** OpenCode plugin API does not expose session naming.

**Workaround:** Session names stored in `~/.opencode/pai-state/sessions/` JSONL logs.

---

### 6. No native plan/edit mode toggle

**Limitation:** Plan mode implemented via tool blocking, not OC mode toggle.

**Reason:** OpenCode does not expose plan/edit mode to plugins.

**Workaround:** Use `/plan` and `/build` commands; adapter blocks tools accordingly.

---

### 7. Agent team tools removed — use OpenCode native teams when available

The adapter previously shipped 5 custom tools (`agent_team_create/dispatch/message/status/collect`) as a fire-and-forget coordination layer. These have been removed because:

- OpenCode's `dev` branch ships a full native agent teams implementation (PRs #12730–12732) with task boards, peer-to-peer messaging, multi-turn coordination, crash recovery, and multi-provider support — architecturally superior in every dimension
- Our implementation added no meaningful value over the native Task tool the model already uses
- Maintaining it created ongoing cost with no benefit

**What to use instead:**
- **Today (OpenCode 1.3.0 stable):** Use OpenCode's native `Task` tool. The model reaches for it automatically for sub-agent work.
- **When native teams land in stable:** Use `team_create`, `team_spawn`, `team_message`, `team_broadcast`, `team_tasks`, `team_claim` as documented in the OpenCode release notes.

---

## API Baseline

This adapter was built against the following **17 OpenCode plugin API events**:

| # | Event Name | Category | Used By |
|---|------------|----------|---------|
| 1 | `event` | Wildcard | Session lifecycle, compaction reactive, voice idle |
| 2 | `config` | Configuration | (Reserved for future config reload) |
| 3 | `tool` | Tool execution | (Reserved for future tool introspection) |
| 4 | `auth` | Authentication | (Reserved for future auth handling) |
| 5 | `chat.message` | Chat | Learning tracker, plan mode, terminal UI |
| 6 | `chat.params` | Chat | (Reserved for future param injection) |
| 7 | `chat.headers` | Chat | (Reserved for future header injection) |
| 8 | `permission.ask` | Permission | Security validator, plan mode |
| 9 | `command.execute.before` | Command | (Reserved for future command gating) |
| 10 | `tool.execute.before` | Tool execution | Security validator, plan mode |
| 11 | `shell.env` | Shell | (Reserved for future env var injection) |
| 12 | `tool.execute.after` | Tool execution | Learning tracker, voice notifications, terminal UI |
| 13 | `experimental.chat.messages.transform` | Experimental | (Reserved for future message rewriting) |
| 14 | `experimental.chat.system.transform` | Experimental | Context loader, session lifecycle |
| 15 | `experimental.session.compacting` | Experimental | Compaction proactive |
| 16 | `experimental.text.complete` | Experimental | (Reserved for future text completion) |
| 17 | `tool.definition` | Tool | Custom tools: agent_team_dispatch, agent_team_status, agent_team_collect |

**Events actively used:** 8 of 17 (47%)

**Reserved events:** 9 of 17 (53%) — Available for future feature additions

**Baseline storage:** `.opencode-api-baseline` file in repo root

**Baseline update:** Self-updater automatically updates baseline when `--check` mode detects new events

---

## OpenCode Events Used (Detailed)

### `permission.ask`

**Purpose:** Gate tool execution with allow/deny/ask verdicts.

**Handler:** `src/handlers/security-validator.ts`

**Input:**

```typescript
{
  tool: string;
  args: Record<string, unknown>;
  sessionID: string;
}
```

**Output:**

```typescript
{
  status: "allow" | "deny" | "ask";
}
```

---

### `tool.execute.before`

**Purpose:** Validate and sanitize tool arguments before execution.

**Handler:** `src/handlers/security-validator.ts`, `src/handlers/plan-mode.ts`

**Input:**

```typescript
{
  tool: string;
  args: Record<string, unknown>;
  sessionID: string;
  callID: string;
}
```

**Output:**

```typescript
{
  args: Record<string, unknown>; // Sanitized args
}
```

---

### `tool.execute.after`

**Purpose:** Capture learning signals, trigger voice notifications, update terminal UI.

**Handler:** `src/handlers/learning-tracker.ts`, `src/handlers/voice-notifications.ts`, `src/handlers/terminal-ui.ts`

**Input:**

```typescript
{
  tool: string;
  args: Record<string, unknown>;
  sessionID: string;
  callID: string;
  result: unknown;
  durationMs: number;
}
```

---

### `chat.message`

**Purpose:** Track chat messages for learning, update terminal UI, detect plan mode triggers.

**Handler:** `src/handlers/learning-tracker.ts`, `src/handlers/terminal-ui.ts`, `src/handlers/plan-mode.ts`

**Input:**

```typescript
{
  sessionID: string;
  messageID: string;
  message: {
    role: "user" | "assistant";
    content: string;
  };
}
```

---

### `experimental.chat.system.transform`

**Purpose:** Inject TELOS + context files into system prompt on session start.

**Handler:** `src/handlers/context-loader.ts`

**Input:**

```typescript
{
  sessionID: string;
  model: string;
}
```

**Output:**

```typescript
{
  system: string[]; // Array of system prompt segments
}
```

---

### `experimental.session.compacting`

**Purpose:** Inject survival context during session compaction to preserve critical learnings.

**Handler:** `src/handlers/compaction-handler.ts`

**Input:**

```typescript
{
  sessionID: string;
}
```

**Output:**

```typescript
{
  context: string[]; // Survival context segments
  prompt?: string; // Optional compaction instructions
}
```

---

### `event` (Wildcard)

**Purpose:** Handle session lifecycle events (end, idle, compacted).

**Handler:** `src/handlers/session-lifecycle.ts`, `src/handlers/compaction-handler.ts`, `src/handlers/voice-notifications.ts`

**Input:**

```typescript
{
  type: "session.end" | "session.idle" | "session.compacted" | string;
  sessionId: string;
  durationMs?: number;
  [key: string]: unknown;
}
```

---

### `tool.definition`

**Purpose:** No custom tools are currently registered. The `tool` hook block is present but empty — reserved for future use.

---

## Version Compatibility Matrix

| Adapter Version | PAI Version | OpenCode Version | Status |
|-----------------|-------------|------------------|--------|
| 0.1.0 | 4.0.3 | ≥1.0 | ✅ Supported |
| 0.1.0 | 4.0.2 | ≥1.0 | ⚠️ Untested |
| 0.1.0 | 4.0.4+ | ≥1.0 | ⚠️ Self-updater will detect changes |
| 0.0.x | Any | Any | ❌ Deprecated |

**Upgrade policy:**

- **PAI minor updates (4.0.x):** Auto-fixable via self-updater
- **PAI major updates (5.0.0):** Manual review required
- **OpenCode event additions:** Auto-fixable, may enable workaround retirement
- **OpenCode event removals:** Manual review required, may break handlers

---

## Migration Guide

### From PAI v4.0.3 (Claude Code) to OpenCode

1. **Install adapter** — Follow [Quick Start](README.md#quick-start)
2. **Copy settings** — Adapter auto-translates `settings.json` → `opencode.json`
3. **Verify skills** — Skills in `~/.claude/skills/` loaded automatically
4. **Verify agents** — Agents in `~/.claude/agents/` loaded automatically
5. **Test workflows** — Run existing workflows; check debug log for errors
6. **Configure voice** — Set `ELEVENLABS_API_KEY` if using voice notifications
7. **Set up tmux** — Optional: install tmux for StatusLine support

### From Adapter v0.0.x to v0.1.0

1. **Pull latest** — `git pull origin main`
2. **Rebuild** — `bun build src/plugin/pai-unified.ts --target=bun --outdir=dist`
3. **Run self-updater** — `bun run src/updater/self-updater.ts --check`
4. **Review changes** — Check for breaking changes in update report
5. **Test** — `bun test` to verify 531 tests pass
6. **Update config** — Check `opencode.json` for new config options

---

## Support Matrix

| Feature | Claude Code (PAI) | OpenCode (Adapter) | Notes |
|---------|-------------------|--------------------|--------|
| Skills | ✅ Native | ✅ Native (OC built-in) | Loaded from `~/.claude/skills/`; adapter logs invocations |
| Agents | ✅ Native | ✅ Native (OC built-in) | Task tool spawns real sub-agents; adapter logs invocations |
| MCP Servers | ✅ Native | ✅ Native (OC built-in) | Configured in `opencode.json`; no adapter involvement |
| Workflows | ✅ Native | ✅ Adapted | Loaded from `~/.claude/workflows/` |
| StatusLine | ✅ Native | ✅ Adapted | Requires tmux |
| Voice/TTS | ✅ Native | ✅ Adapted | Requires ElevenLabs API key |
| Plan Mode | ✅ Native | ✅ Adapted | Via `/plan` command |
| Agent Teams | ✅ Native (CC) | ✅ Native (OC dev) | Removed from adapter — use OC native teams when stable ships |
| Session Compaction | ✅ Native | ✅ Adapted | Dual proactive+reactive |
| Learning Signals | ✅ Native | ✅ Adapted | JSONL logs in `~/.opencode/logs/` |
| Security Validator | ✅ Native | ✅ Adapted | Tool gating + input sanitization |
| Kitty Integration | ✅ Native | ⚠️ Limited | tmux fallback |
| Slash Commands | ✅ Native | ❌ Not supported | CC-specific |

---

<div align="center">

**PAI-OpenCode Adapter Compatibility Registry**

Last updated: 2026-03-29 • Version: 0.1.1

[Back to README](../README.md)

</div>
