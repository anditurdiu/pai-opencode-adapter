# Troubleshooting

## Debug Log Location

All adapter logs are written to:

```
/tmp/pai-opencode-debug.log
```

**View in real-time:**

```bash
tail -f /tmp/pai-opencode-debug.log
```

**Search for errors:**

```bash
grep ERROR /tmp/pai-opencode-debug.log
```

**Clear the log:**

```bash
> /tmp/pai-opencode-debug.log
```

**Common log entries:**

| Log Pattern | Meaning |
|-------------|---------|
| `[pai-unified] plugin initialized` | Plugin loaded successfully |
| `[context-loader] session started` | New session began, context loaded |
| `[security-validator] blocked tool` | Tool blocked by security gate |
| `[voice] ElevenLabs API error` | Voice notification failed |
| `[dedup-cache] duplicate detected` | Message deduplication triggered |

---

## Issue 1: tmux Not Found

**Symptom:**

```
StatusLine installation failed: tmux not found in PATH
```

**Cause:** tmux is required for StatusLine integration but not installed.

**Solution:**

```bash
# macOS
brew install tmux

# Ubuntu/Debian
apt install tmux

# Fedora/RHEL
dnf install tmux
```

**Workaround:** Run without StatusLine (adapter still functions):

```bash
opencode  # Instead of: tmux new-session -s pai opencode
```

---

## Issue 2: ElevenLabs API Key Missing

**Symptom:**

```
[voice] voice disabled or no API key, skipping TTS
```

**Cause:** Voice notifications enabled in config but `ELEVENLABS_API_KEY` not set.

**Solution:**

1. Get API key from [ElevenLabs](https://elevenlabs.io)
2. Set environment variable:

```bash
export ELEVENLABS_API_KEY="your-api-key-here"
```

3. Or add to `~/.config/opencode/pai-adapter.json`:

```json
{
  "voice": {
    "enabled": true,
    "apiKey": "your-api-key-here"
  }
}
```

**Disable voice entirely** (in `pai-adapter.json`):

```json
{
  "voice": {
    "enabled": false
  }
}
```

---

## Issue 3: PAI Directory Not Found

**Symptom:**

```
[context-loader] PAI directory not found: ~/.claude
[security-validator] no skills loaded (PAI not installed)
```

**Cause:** PAI v4.0.3 not installed at `~/.claude/` or `PAI_DIR` not set.

**Solution:**

```bash
cd ~
git clone https://github.com/danielmiessler/Personal_AI_Infrastructure.git .claude
```

**Or set custom PAI path:**

```bash
export PAI_DIR="/path/to/your/pai/installation"
```

**Adapter behavior without PAI:**

- ✅ Plugin still loads
- ✅ OpenCode events still fire
- ❌ No skills, agents, or workflows available
- ❌ Context loader returns empty system prompt

---

## Issue 4: Baseline Stale

**Symptom:**

```
Self-updater error: baseline mismatch
```

**Cause:** Stored baseline (`.opencode-api-baseline`) doesn't match current OpenCode plugin source.

**Solution:**

```bash
rm .opencode-api-baseline
bun run src/updater/self-updater.ts --check
```

This forces the self-updater to re-fetch and store a fresh baseline.

---

## Issue 5: Plugin Fails to Load

**Symptom:**

```
Failed to load plugin: ~/projects/pai-opencode-adapter/src/plugin/pai-unified.ts
```

**Cause:** TypeScript compilation errors, missing dependencies, or invalid plugin path.

**Solution:**

1. **Check TypeScript:**

```bash
bun build src/plugin/pai-unified.ts --target=bun --outdir=dist --external opencode
```

2. **Verify path in config** (must have `file://` prefix for local plugins):

```json
{
  "plugin": [
    "file:///absolute/path/to/pai-opencode-adapter/src/plugin/pai-unified.ts"
  ]
}
```

3. **Check debug log:**

```bash
tail -20 /tmp/pai-opencode-debug.log
```

---

## Issue 6: StatusLine Not Rendering

**Symptom:** tmux status-right shows `[PAI: idle]` instead of detailed status.

**Cause:** jq not installed, session ID not exported, or status file not being written.

**Solution:**

1. **Install jq:**

```bash
brew install jq  # or apt install jq
```

2. **Check status file:**

```bash
ls -la /tmp/pai-opencode-status-*.json
```

3. **Verify tmux config:**

```bash
grep -A5 "status-right" ~/.tmux.conf
```

Should include:

```tmux
set -g status-right '#(PAI_SESSION_ID="#{pane_id}" bash ~/projects/pai-opencode-adapter/src/statusline/statusline.sh)'
set -g status-interval 2
```

---

[← Back to README](../README.md)
