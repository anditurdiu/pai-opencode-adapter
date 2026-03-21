# Getting Started with PAI on OpenCode

**PAI v4.0.3** via **pai-opencode-adapter**

Your Personal AI Infrastructure, running inside OpenCode. Go from zero to fully configured in under 30 minutes.

---

## TL;DR: 5-Step Quick Start

1. **Install prerequisites**: `brew install oven-sh/bun/bun` (or see [Prerequisites](#prerequisites))
2. **Install OpenCode**: `curl -fsSL https://opencode.ai/install | bash`
3. **Install PAI**: `git clone https://github.com/danielmiessler/Personal_AI_Infrastructure.git && cd Personal_AI_Infrastructure/Releases/v4.0.3 && cp -r .claude ~/ && cd ~/.claude && bash install.sh`
4. **Install adapter**: `bash scripts/install.sh` (from pai-opencode-adapter directory)
5. **Configure opencode.json**: Add PAI plugin path and your provider

Done. OpenCode will now load PAI on every session.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Method 1: Quick Install (Recommended)](#method-1-quick-install-recommended)
  - [Method 2: NPM](#method-2-npm)
  - [Method 3: Homebrew](#method-3-homebrew-macos)
- [API Keys Setup](#api-keys-setup)
- [Plugin Activation](#plugin-activation)
- [Provider Configuration](#provider-configuration)
- [PAI Personalization](#pai-personalization)
- [Notifications](#notifications)
- [StatusLine](#statusline)
- [Self-Updater](#self-updater)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Why | Install |
|------|---------|-----|---------|
| **Bun** | ≥1.0 | Runtime for PAI hooks and adapter | `brew install bun` or `curl -fsSL https://bun.sh/install \| bash` |
| **OpenCode** | Latest | AI code editor host | See [Installation](#installation) |
| **PAI v4.0.3** | v4.0.3 | Personal AI Infrastructure | `git clone https://github.com/danielmiessler/Personal_AI_Infrastructure.git` |
| **Git** | Any | Cloning repos | `xcode-select --install` (macOS) |
| **tmux** | Optional | StatusLine terminal integration | `brew install tmux` |
| **jq** | Optional | JSON processing in hooks | `brew install jq` |

---

## Installation

### Method 1: Quick Install (Recommended)

```bash
curl -fsSL https://opencode.ai/install | bash
```

This script:
- Downloads the latest OpenCode binary
- Sets up shell completions
- Configures PATH automatically

### Method 2: NPM

```bash
npm install -g opencode-ai@latest
# or with bun
bun install -g opencode-ai@latest
# or with pnpm/yarn
pnpm add -g opencode-ai@latest
yarn global add opencode-ai@latest
```

### Method 3: Homebrew (macOS)

```bash
brew install anomalyco/tap/opencode
```

### Windows (Scoop/Chocolatey)

```powershell
# Scoop
scoop install opencode

# Chocolatey
choco install opencode
```

### Verify Installation

```bash
opencode --version
```

---

## API Keys Setup

### Tier 1: Core LLM (Required)

You need **at least one** LLM provider. Configure via OpenCode's `/connect` command.

| Provider | Models | Cost | Setup |
|----------|--------|------|-------|
| **Anthropic** | claude-sonnet-4-5, claude-haiku-4-5, claude-opus-4-5 | Paid | Run `opencode` then `/connect anthropic` |
| **OpenAI** | gpt-4o, gpt-4o-mini | Paid | Run `opencode` then `/connect openai` |
| **Google** | gemini-pro, gemini-flash | Free tier | Run `opencode` then `/connect google` |
| **Ollama** | llama3, mistral | Free (local) | Run `opencode` then `/connect ollama` |

**API keys are stored in**: `~/.local/share/opencode/auth.json`

**Or set via environment variables**:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
```

### Tier 2: Enhanced Features (Optional)

| Feature | Key/Service | Required? | Get It |
|---------|-------------|-----------|--------|
| Voice TTS | `ELEVENLABS_API_KEY` | Voice only | https://elevenlabs.io → API Keys |
| Push Notifications | ntfy topic | Mobile alerts | https://ntfy.sh — pick any topic name |
| Discord Notifications | Discord webhook URL | Discord alerts | Discord Server → Settings → Integrations → Webhooks |
| SMS Notifications | Twilio credentials | SMS alerts | https://twilio.com |
| Self-Updater PRs | `GITHUB_TOKEN` | Auto-update PRs | https://github.com/settings/tokens |
| Cloudflare MCP | Cloudflare credentials | CF features | https://dash.cloudflare.com |

### Full API Key Reference Table

| Feature | API Key Required | Where to Get |
|---------|-----------------|--------------|
| LLM (core) | YES (pick one) | OpenCode `/connect` command |
| Voice TTS | Only for voice | https://elevenlabs.io |
| Push Notifications | No (free, no key) | https://ntfy.sh |
| Discord Notifications | Only for Discord | Discord webhook settings |
| SMS Notifications | Only for SMS | https://twilio.com |
| Self-Updater PRs | Only for auto-update | GitHub tokens |
| Cloudflare MCP | Only for CF features | Cloudflare dashboard |
| Image Generation | Provider-dependent | Your LLM provider |

---

## Plugin Activation

### Step 1: Install PAI

```bash
git clone https://github.com/danielmiessler/Personal_AI_Infrastructure.git
cd Personal_AI_Infrastructure/Releases/v4.0.3
cp -r .claude ~/
cd ~/.claude
bash install.sh
```

The installer will:
1. Detect your system and install prerequisites (Bun, Git)
2. Collect your identity (name, DA name, timezone)
3. Set up voice (optional, requires ElevenLabs key)
4. Configure shell aliases
5. Verify installation

### Step 2: Install pai-opencode-adapter

```bash
cd ~/projects/pai-opencode-adapter
bash scripts/install.sh
```

This interactive installer:
- Detects your OpenCode installation
- Configures `opencode.json` automatically
- Sets up environment variables
- Validates your setup

### Step 3: Manual Configuration (Alternative)

If you prefer manual setup, edit `~/.config/opencode/opencode.json`:

**Minimal config** (just PAI plugin):
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": "anthropic",
  "model": "anthropic/claude-sonnet-4-5",
  "plugin": [
    "file:///absolute/path/to/pai-opencode-adapter/src/plugin/pai-unified.ts"
  ]
}
```

**PAI adapter config** (`~/.config/opencode/pai-adapter.json` — separate file):
```json
{
  "paiDir": "~/.claude",
  "pluginDir": "~/.opencode/plugin/pai-adapter",
  "identity": {
    "aiName": "Aria",
    "aiFullName": "Adaptive Research Intelligence Assistant",
    "userName": "Alex",
    "timezone": "America/New_York"
  },
  "voice": {
    "enabled": false,
    "elevenLabsApiKey": "",
    "voiceId": "fTtv3eikoepIosk8dTZ5",
    "model": "eleven_monolingual_v1"
  },
  "notifications": {
    "ntfy": { "enabled": false, "topic": "", "server": "https://ntfy.sh" },
    "discord": { "enabled": false, "webhookUrl": "" },
    "thresholds": { "longTaskMinutes": 5 }
  },
  "logging": {
    "debugLog": "/tmp/pai-opencode-debug.log",
    "sessionLogDir": "~/.opencode/logs/sessions",
    "level": "info"
  }
}
```

> **Note**: PAI adapter settings (identity, voice, notifications, logging) live in
> `~/.config/opencode/pai-adapter.json`, NOT inside `opencode.json`. The `opencode.json`
> file should only contain standard OpenCode keys (`$schema`, `provider`, `model`, `plugin`, etc.).

### Step 4: Initialize Project

```bash
cd your-project
opencode
/init
```

---

## Provider Configuration

### Provider Presets

The adapter supports these providers out of the box:

| Provider | Default Model | Small Model | Opus Model |
|----------|---------------|-------------|------------|
| **anthropic** | claude-sonnet-4-5 | claude-haiku-4-5 | claude-opus-4-5 |
| **openai** | gpt-4o | gpt-4o-mini | — |
| **google** | gemini-pro | gemini-flash | — |
| **ollama** | llama3 | — | — |
| **zen** | OpenCode native | — | — |

### Configure Default Provider

In `~/.config/opencode/opencode.json`:
```json
{
  "provider": "anthropic",
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5"
}
```

### Switch Providers Per-Session

Inside OpenCode:
```
/model anthropic/claude-opus-4-5
/model openai/gpt-4o
/model google/gemini-pro
```

---

## PAI Personalization

PAI has **6 customization layers** plus the **TELOS system** for deep personalization.

### The 6 Customization Layers

#### 1. Identity
Your DA's name, voice, and personality.

Configure in `PAI/USER/settings.json`:
```json
{
  "daidentity": {
    "name": "Aria",
    "fullName": "Adaptive Research Intelligence Assistant",
    "displayName": "Aria",
    "color": "#3B82F6",
    "voices": {
      "main": { "voiceId": "fTtv3eikoepIosk8dTZ5", "voiceName": "Rachel" },
      "algorithm": { "voiceId": "...", "voiceName": "..." }
    },
    "personality": {
      "enthusiasm": 85,
      "energy": 80,
      "expressiveness": 75,
      "resilience": 90,
      "composure": 85,
      "optimism": 80,
      "warmth": 85,
      "formality": 30,
      "directness": 75,
      "precision": 90,
      "curiosity": 95,
      "playfulness": 70
    },
    "startupCatchphrase": "Ready to create something extraordinary?"
  },
  "principal": {
    "name": "Alex",
    "timezone": "America/New_York"
  }
}
```

**Personality Traits** (0-100 each):
- `enthusiasm`, `energy`, `expressiveness`
- `resilience`, `composure`, `optimism`
- `warmth`, `formality`, `directness`
- `precision`, `curiosity`, `playfulness`

#### 2. Preferences
Your tech stack, tools, and writing style.

Files:
- `PAI/USER/PREFERENCES.md` — Tech preferences
- `PAI/USER/ABOUTME.md` — Your background and expertise
- `PAI/USER/WRITINGSTYLE.md` — Your writing voice

#### 3. Workflows
How skills execute (338 built-in workflows).

Customize in `PAI/USER/SKILLCUSTOMIZATIONS/`

#### 4. Skills
What capabilities exist (63 skills in 12+ categories).

Enable/disable in `PAI/USER/settings.json`

#### 5. Hooks
How events are handled (21 hooks across 6 lifecycle events).

Location: `PAI/USER/hooks/`

#### 6. Memory
What gets captured (5-tier system):
- **WORK** — Project context
- **LEARNING** — New knowledge
- **RELATIONSHIP** — Interaction history
- **STATE** — Current status
- **WISDOM** — distilled lessons

---

### TELOS System (10 Files)

TELOS is your life operating system. Create these in `PAI/USER/TELOS/`:

| File | Purpose | Example Content |
|------|---------|-----------------|
| **MISSION.md** | Core life/work mission | "Build tools that amplify human creativity" |
| **GOALS.md** | Current active goals | Q1 2026 objectives, key results |
| **PROJECTS.md** | Active projects | Project names, status, next actions |
| **BELIEFS.md** | Core beliefs and values | "Shipping beats perfection", "Users first" |
| **MODELS.md** | Mental models you use | First principles, inversion, second-order thinking |
| **STRATEGIES.md** | Goal achievement strategies | Weekly reviews, time blocking, deep work |
| **NARRATIVES.md** | Stories that define you | Your origin story, pivotal moments |
| **LEARNED.md** | Key lessons learned | "What I learned from failures", "Best decisions" |
| **CHALLENGES.md** | Current challenges | Blocks, frustrations, unsolved problems |
| **IDEAS.md** | Ideas you're exploring | Product ideas, research questions, experiments |

**Pro Tip**: Start with just MISSION.md and GOALS.md. Add others as you go.

---

### The Algorithm v3.7.0

PAI's core problem-solving methodology (7 phases):

1. **OBSERVE** — Understand & plan, write ISC (Ideal State Criteria)
2. **THINK** — Deep analysis of constraints
3. **PLAN** — Design approach
4. **BUILD** — Create artifacts
5. **EXECUTE** — Run & deploy
6. **VERIFY** — Validate all ISC criteria pass
7. **LEARN** — Capture lessons

---

### 14 Built-in Agents

| Agent | Role | Best For |
|-------|------|----------|
| Architect | System design | Architecture, infrastructure |
| Engineer | Implementation | Code, debugging |
| Designer | UI/UX | Visual design, user experience |
| Artist | Creative | Art, visuals, storytelling |
| Algorithm | Problem-solving | Complex reasoning |
| BrowserAgent | Web research | Live web data |
| QATester | Testing | Test writing, validation |
| Pentester | Security | Security audits |
| UIReviewer | UI critique | Design review |
| ClaudeResearcher | Research | Deep research (Claude) |
| CodexResearcher | Research | Deep research (OpenAI) |
| GeminiResearcher | Research | Deep research (Google) |
| GrokResearcher | Research | Deep research (xAI) |
| PerplexityResearcher | Research | Quick answers |

---

## Notifications

### Configure Notification Routing

In `PAI/USER/settings.json`:
```json
{
  "notifications": {
    "ntfy": {
      "enabled": true,
      "topic": "my-pai-topic",
      "server": "https://ntfy.sh"
    },
    "discord": {
      "enabled": true,
      "webhookUrl": "https://discord.com/api/webhooks/..."
    },
    "twilio": {
      "toNumber": "+1234567890"
    },
    "thresholds": {
      "longTaskMinutes": 5
    },
    "routing": {
      "taskComplete": ["ntfy"],
      "longTask": ["ntfy", "discord"],
      "error": ["ntfy", "discord"],
      "security": ["ntfy", "discord", "twilio"]
    }
  }
}
```

### Setup ntfy (Free, No API Key)

1. Go to https://ntfy.sh
2. Pick a unique topic name: `my-pai-topic-2026`
3. Subscribe on mobile: Install ntfy app, subscribe to your topic
4. Configure in settings.json (see above)

### Setup Discord Webhook

1. Discord Server → Settings → Integrations → Webhooks
2. Create Webhook → Copy URL
3. Add to `discord.webhookUrl` in settings.json

### Setup SMS (Twilio)

1. Sign up at https://twilio.com
2. Get Account SID and Auth Token
3. Configure phone number
4. Add credentials to environment:
```bash
export TWILIO_ACCOUNT_SID=AC...
export TWILIO_AUTH_TOKEN=...
export TWILIO_FROM_NUMBER=+1...
export TWILIO_TO_NUMBER=+1...
```

---

## StatusLine

The StatusLine shows PAI status in your terminal.

### Requirements
- tmux installed
- PAI StatusLine plugin configured

### Enable in settings.json
```json
{
  "statusline": {
    "enabled": true,
    "showContext": true,
    "showMemory": true,
    "showAgent": true
  }
}
```

### Manual tmux Integration

Add to your `~/.tmux.conf`:
```tmux
set -g status-right "#(~/.claude/statusline.sh)"
set -g status-right-length 100
```

Reload tmux:
```bash
tmux source-file ~/.tmux.conf
```

---

## Self-Updater

The adapter can auto-update and create draft PRs.

### Requirements
- `GITHUB_TOKEN` environment variable
- GitHub account with repo access

### Setup

1. Create token: https://github.com/settings/tokens
   - Scope: `repo` (full control of private repositories)
2. Add to environment:
```bash
export GITHUB_TOKEN=ghp_...
```

### Configuration

In `PAI/USER/settings.json`:
```json
{
  "selfUpdater": {
    "enabled": true,
    "schedule": "0 6 * * *",
    "createPR": true,
    "autoMerge": false
  }
}
```

### Manual Trigger

```bash
pai-update
```

---

## Troubleshooting

### Plugin Doesn't Load

**Symptom**: PAI commands don't appear in OpenCode

**Solutions**:
1. Check plugin path in `~/.config/opencode/opencode.json` `plugin` array
2. Ensure Bun is installed: `bun --version`
3. Verify file exists: `ls -la ~/projects/pai-opencode-adapter/src/plugin/pai-unified.ts`
4. Restart OpenCode completely

### Voice Not Working

**Symptom**: No audio output from PAI

**Solutions**:
1. Verify `ELEVENLABS_API_KEY` is set: `echo $ELEVENLABS_API_KEY`
2. Check `PAI_VOICE_ENABLED=true` in settings
3. Confirm voice ID is valid (try `"Rachel"` or `"fTtv3eikoepIosk8dTZ5"`)
4. Test ElevenLabs API directly:
```bash
curl -X POST https://api.elevenlabs.io/v1/text-to-speech/... \
  -H "xi-api-key: $ELEVENLABS_API_KEY"
```

### Context Not Loading

**Symptom**: PAI doesn't remember previous conversations

**Solutions**:
1. Verify `PAI_DIR` points to `~/.claude`:
```bash
echo $PAI_DIR
# Should output: /Users/yourname/.claude
```
2. Check memory files exist: `ls -la ~/.claude/memory/`
3. Ensure the adapter is loaded (check plugin entry in `~/.config/opencode/opencode.json`)

### Agent Teams Not Working

**Symptom**: Multi-agent mode fails

**Solutions**:
1. Add to `opencode.json` (`~/.config/opencode/opencode.json`) env section:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```
2. Use Claude provider (agent teams are Claude-specific)
3. Check agent configuration in `PAI/USER/agents/`

### Notifications Not Arriving

**Symptom**: No push/discord alerts

**Solutions**:
1. **ntfy**: Verify topic name matches exactly (case-sensitive)
2. **Discord**: Test webhook URL with curl:
```bash
curl -X POST https://discord.com/api/webhooks/... \
  -H "Content-Type: application/json" \
  -d '{"content": "test"}'
```
3. Check routing config in `~/.config/opencode/pai-adapter.json`
4. Verify thresholds aren't too high (`longTaskMinutes: 5`)

### Self-Updater Fails

**Symptom**: No PRs created, or auth errors

**Solutions**:
1. Verify `GITHUB_TOKEN` has `repo` scope
2. Check token isn't expired
3. Ensure you have write access to the repo
4. Check logs: `cat /tmp/pai-opencode-debug.log`

### General Debugging

Enable debug logging in `~/.config/opencode/pai-adapter.json`:
```json
{
  "logging": {
    "debugLog": "/tmp/pai-opencode-debug.log",
    "sessionLogDir": "~/.opencode/logs/sessions",
    "level": "debug"
  }
}
```

Then check logs:
```bash
tail -f /tmp/pai-opencode-debug.log
```

---

## Next Steps

- Read `PAI/USER/ABOUTME.md` to understand your customization files
- Explore `PAI/SYSTEM/skills/` to see all 63 available skills
- Try your first PAI command in OpenCode: `/pai status`
- Join the community: https://github.com/danielmiessler/Personal_AI_Infrastructure/discussions

---

**Version**: PAI v4.0.3 | **Adapter**: pai-opencode-adapter | **Updated**: 2026-03-22
