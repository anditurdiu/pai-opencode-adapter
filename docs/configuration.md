# Configuration

The adapter uses OpenCode's `opencode.json` for plugin registration, and a separate `pai-adapter.json` for adapter-specific settings.

## Minimal Configuration

In `~/.config/opencode/opencode.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "plugin": [
    "file:///absolute/path/to/pai-opencode-adapter/src/plugin/pai-unified.ts"
  ]
}
```

## Full Configuration

PAI adapter settings go in `~/.config/opencode/pai-adapter.json` (separate from `opencode.json`):

```json
{
  "paiDir": "~/.claude",
  "model_provider": "anthropic",
  "models": {
    "default": "anthropic/claude-sonnet-4-5",
    "validation": "anthropic/claude-sonnet-4-5",
    "agents": {
      "intern": "anthropic/claude-haiku-4-5",
      "architect": "anthropic/claude-sonnet-4-5",
      "engineer": "anthropic/claude-sonnet-4-5",
      "explorer": "anthropic/claude-sonnet-4-5",
      "reviewer": "anthropic/claude-opus-4-5"
    },
    "fallbacks": {
      "default": ["openai/gpt-4o", "google/gemini-2.5-pro"],
      "intern": ["openai/gpt-4o-mini", "google/gemini-flash"],
      "reviewer": ["openai/gpt-4o"]
    }
  },
  "identity": {
    "aiName": "Aria",
    "aiFullName": "Adaptive Research Intelligence Assistant",
    "userName": "Alex",
    "timezone": "America/New_York"
  },
  "voice": {
    "enabled": false,
    "provider": "elevenlabs",
    "apiKey": "",
    "voiceId": "fTtv3eikoepIosk8dTZ5",
    "model": "eleven_monolingual_v1"
  },
  "notifications": {
    "enabled": false,
    "ntfy": {
      "enabled": false,
      "topic": "",
      "server": "https://ntfy.sh"
    },
    "discord": {
      "enabled": false,
      "webhookUrl": ""
    },
    "thresholds": {
      "longTaskMinutes": 5
    }
  },
  "logging": {
    "debugLog": "/tmp/pai-opencode-debug.log",
    "sessionLogDir": "~/.opencode/logs/sessions",
    "level": "info"
  },
  "compaction": {
    "proactive": true,
    "reactive": true,
    "survivalContextThreshold": 0.7
  }
}
```

## Options Reference

Settings in `~/.config/opencode/pai-adapter.json`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `paiDir` | string | `~/.claude` | Path to PAI installation (read-only) |
| `model_provider` | string | `"anthropic"` | Provider type: anthropic, openai, google, ollama, zen |
| `models.default` | string | *(per provider)* | Default model for general use |
| `models.validation` | string | *(per provider)* | Model for validation tasks |
| `models.agents.intern` | string | *(per provider)* | Model for fast/cheap agent tasks |
| `models.agents.architect` | string | *(per provider)* | Model for architecture/planning tasks |
| `models.agents.engineer` | string | *(per provider)* | Model for code generation tasks |
| `models.agents.explorer` | string | *(per provider)* | Model for codebase exploration |
| `models.agents.reviewer` | string | *(per provider)* | Model for code review (typically strongest) |
| `models.fallbacks` | object | `{}` | Per-role fallback chains (see below) |
| `identity.aiName` | string | `"PAI"` | AI assistant short name |
| `identity.userName` | string | `"User"` | Principal/user name |
| `identity.timezone` | string | `"UTC"` | User timezone for scheduling |
| `voice.enabled` | boolean | `false` | Enable ElevenLabs TTS |
| `voice.apiKey` | string | `""` | ElevenLabs API key (required if enabled) |
| `voice.voiceId` | string | `"fTtv3eikoepIosk8dTZ5"` | ElevenLabs voice clone ID |
| `notifications.ntfy.enabled` | boolean | `false` | Enable ntfy.sh push notifications |
| `notifications.ntfy.topic` | string | `""` | ntfy.sh topic name |
| `notifications.discord.enabled` | boolean | `false` | Enable Discord webhook notifications |
| `notifications.discord.webhookUrl` | string | `""` | Discord webhook URL |
| `notifications.thresholds.longTaskMinutes` | number | `5` | Minimum task duration for notifications |
| `logging.debugLog` | string | `/tmp/pai-opencode-debug.log` | Debug log file path |
| `logging.sessionLogDir` | string | `~/.opencode/logs/sessions` | JSONL session log directory |
| `logging.level` | string | `"info"` | Log level: debug, info, warn, error |
| `compaction.proactive` | boolean | `true` | Inject survival context during compaction |
| `compaction.reactive` | boolean | `true` | Rescue learnings after compaction |

## Config Translation from PAI Settings

If you have an existing PAI `settings.json`, the adapter can auto-translate it:

```bash
bun run src/adapters/config-translator.ts
```

This reads `~/.claude/settings.json` and merges it with `~/.config/opencode/opencode.json`, preserving existing OpenCode config while adding PAI-derived fields.

**Translation behavior:**

- **Provider auto-detection** — Infers provider from model name (e.g., `claude-*` → anthropic)
- **Model presets** — Applies provider-specific model presets (default, validation, agent roles)
- **Identity merge** — Maps `daidentity.name` → `pai.identity.aiName`, `principal.name` → `pai.identity.userName`
- **Plugin registration** — Adds `pai-opencode-adapter` to plugin array if not present
- **User field preservation** — Never overwrites existing custom user fields

## Model Routing and Fallback Chains

The adapter maps PAI's 3-tier model system (haiku/sonnet/opus) to configurable per-role models. Each role (`default`, `intern`, `architect`, `engineer`, `explorer`, `reviewer`) can have a primary model and a fallback chain.

**How it works:**

1. A `<model-routing>` table is injected into every system prompt, telling the LLM which models map to which roles
2. When a Task/agent call fails (rate limit, model not found, provider unavailable), the adapter detects the error type
3. A `<system-reminder>` is injected into the next system prompt suggesting the next fallback model from the chain
4. The LLM can then retry the operation with the suggested model

**Configuring fallbacks** in `pai-adapter.json`:

```json
{
  "models": {
    "fallbacks": {
      "default": ["openai/gpt-4o", "google/gemini-2.5-pro"],
      "intern": ["openai/gpt-4o-mini"],
      "reviewer": ["anthropic/claude-sonnet-4-5", "openai/gpt-4o"]
    }
  }
}
```

Each key is a role name, each value is an ordered array of fallback models. When the primary model for a role fails, the adapter suggests the first fallback. If that fails too, it suggests the second, and so on. When the chain is exhausted, the reminder says no fallbacks are available.

**Provider presets** (used when `models` is not configured):

| Provider | Default | Intern | Architect | Engineer | Reviewer |
|----------|---------|--------|-----------|----------|----------|
| anthropic | claude-sonnet-4-5 | claude-haiku-4-5 | claude-sonnet-4-5 | claude-sonnet-4-5 | claude-opus-4-5 |
| openai | gpt-4o | gpt-4o-mini | gpt-4o | gpt-4o | gpt-4o |
| google | gemini-pro | gemini-flash | gemini-pro | gemini-pro | gemini-pro |
| ollama | llama3 | llama3 | llama3 | llama3 | llama3 |

---

[← Back to README](../README.md)
