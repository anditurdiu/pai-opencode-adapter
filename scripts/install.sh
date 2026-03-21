#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  PAI OpenCode Adapter — Installer v1.0
#  MIT License — https://github.com/yourusername/pai-opencode-adapter
#
#  Deploys the PAI-to-OpenCode adapter plugin with full prerequisite validation,
#  interactive configuration, build, and backup manifest creation.
#
#  Usage: bash scripts/install.sh [--non-interactive]
#         --non-interactive: skip prompts, use env vars / defaults
# ═══════════════════════════════════════════════════════════════════════════════
set -eo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
BLUE='\033[38;2;59;130;246m'
LIGHT_BLUE='\033[38;2;147;197;253m'
GREEN='\033[38;2;34;197;94m'
YELLOW='\033[38;2;234;179;8m'
RED='\033[38;2;239;68;68m'
GRAY='\033[38;2;100;116;139m'
STEEL='\033[38;2;51;65;85m'
SILVER='\033[38;2;203;213;225m'
RESET='\033[0m'
BOLD='\033[1m'

# ─── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo -e "  ${BLUE}ℹ${RESET} $1"; }
success() { echo -e "  ${GREEN}✓${RESET} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET} $1"; }
error()   { echo -e "  ${RED}✗${RESET} $1"; }
section() { echo -e "\n  ${STEEL}──────────────────────────────────${RESET}\n  ${BOLD}${BLUE}$1${RESET}\n"; }
prompt()  { echo -e "  ${LIGHT_BLUE}?${RESET} $1"; }

# ─── Resolve Script Directory ─────────────────────────────────────────────────
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Defaults & Config ────────────────────────────────────────────────────────
NON_INTERACTIVE=false
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
OPENCODE_PLUGIN_DIR="${OPENCODE_PLUGIN_DIR:-$HOME/.opencode/plugin/pai-adapter}"
OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
OPENCODE_CONFIG="${OPENCODE_CONFIG:-$OPENCODE_CONFIG_DIR/opencode.json}"
PAI_ADAPTER_CONFIG="${PAI_ADAPTER_CONFIG:-$OPENCODE_CONFIG_DIR/pai-adapter.json}"
ENABLE_VOICE="${ENABLE_VOICE:-n}"
ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY:-}"
NTFY_TOPIC="${NTFY_TOPIC:-}"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK:-}"

# ─── Parse Flags ──────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=true ;;
    --help|-h)
      echo "Usage: bash scripts/install.sh [--non-interactive]"
      echo ""
      echo "Environment variables (used with --non-interactive):"
      echo "  PAI_DIR               Path to PAI installation (default: ~/.claude)"
      echo "  OPENCODE_PLUGIN_DIR   Plugin install path (default: ~/.opencode/plugin/pai-adapter)"
      echo "  OPENCODE_CONFIG_DIR   Config directory (default: ~/.config/opencode)"
      echo "  OPENCODE_CONFIG       opencode.json path (default: ~/.config/opencode/opencode.json)"
      echo "  PAI_ADAPTER_CONFIG    pai-adapter.json path (default: ~/.config/opencode/pai-adapter.json)"
      echo "  ENABLE_VOICE          Enable voice/TTS (y/n, default: n)"
      echo "  ELEVENLABS_API_KEY    ElevenLabs API key (optional)"
      echo "  NTFY_TOPIC            ntfy.sh topic for push notifications (optional)"
      echo "  DISCORD_WEBHOOK       Discord webhook URL (optional)"
      exit 0
      ;;
  esac
done

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${STEEL}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓${RESET}"
echo ""
echo -e "            ${BLUE}PAI${RESET} ${STEEL}→${RESET} ${LIGHT_BLUE}OpenCode${RESET} ${GRAY}Adapter Installer${RESET}"
echo ""
echo -e "                    ${GRAY}MIT License  |  v0.1.0${RESET}"
echo ""
echo -e "${STEEL}┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${RESET}"
echo ""

# ─── STEP 1: Prerequisite Checks ──────────────────────────────────────────────
section "Step 1 — Prerequisite Checks"

PREREQ_FAIL=false

# Bun ≥ 1.0
if command -v bun &>/dev/null; then
  BUN_VER=$(bun --version 2>/dev/null || echo "0.0.0")
  BUN_MAJOR=$(echo "$BUN_VER" | cut -d. -f1)
  if [[ "$BUN_MAJOR" -ge 1 ]]; then
    success "Bun $BUN_VER"
  else
    error "Bun $BUN_VER found but version ≥ 1.0 required"
    PREREQ_FAIL=true
  fi
else
  error "Bun not found. Install: npm install -g bun  OR  curl -fsSL https://bun.sh/install | bash"
  PREREQ_FAIL=true
fi

# OpenCode
if command -v opencode &>/dev/null; then
  OC_VER=$(opencode --version 2>/dev/null | head -1 || echo "unknown")
  success "OpenCode $OC_VER"
else
  error "OpenCode not found in PATH. Install: https://opencode.ai"
  PREREQ_FAIL=true
fi

# PAI
if [[ -d "$PAI_DIR" ]]; then
  success "PAI directory found: $PAI_DIR"
else
  warn "PAI directory not found at $PAI_DIR"
  warn "Set PAI_DIR env var or install PAI first: https://github.com/danielmiessler/Personal_AI_Infrastructure"
  # Not a hard failure — adapter can still be installed without PAI for testing
fi

# tmux
if command -v tmux &>/dev/null; then
  TMUX_VER=$(tmux -V 2>/dev/null | head -1 || echo "unknown")
  success "tmux ($TMUX_VER)"
else
  warn "tmux not found — StatusLine feature will be unavailable"
fi

# jq
if command -v jq &>/dev/null; then
  success "jq $(jq --version 2>/dev/null || echo "")"
else
  warn "jq not found — StatusLine JSON parsing will be unavailable"
fi

# git
if command -v git &>/dev/null; then
  success "git $(git --version | awk '{print $3}')"
else
  warn "git not found — self-updater feature will be unavailable"
fi

# Node.js (for OpenCode compatibility)
if command -v node &>/dev/null; then
  success "node $(node --version)"
fi

if [[ "$PREREQ_FAIL" == "true" ]]; then
  echo ""
  error "Required prerequisites are missing. Please install them and re-run."
  exit 1
fi

# ─── STEP 2: Configuration ────────────────────────────────────────────────────
section "Step 2 — Configuration"

if [[ "$NON_INTERACTIVE" == "false" ]]; then
  # PAI directory
  prompt "PAI installation directory [${PAI_DIR}]:"
  read -r PAI_DIR_INPUT
  [[ -n "$PAI_DIR_INPUT" ]] && PAI_DIR="$PAI_DIR_INPUT"

  # Voice/TTS
  prompt "Enable voice notifications (ElevenLabs TTS)? [y/N]:"
  read -r VOICE_INPUT
  VOICE_INPUT="${VOICE_INPUT:-n}"
  if [[ "$(echo "$VOICE_INPUT" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
    ENABLE_VOICE="y"
    prompt "ElevenLabs API key (leave blank to set later):"
    read -r -s ELEVENLABS_API_KEY
    echo ""
  fi

  # ntfy
  prompt "ntfy.sh topic for push notifications (leave blank to skip):"
  read -r NTFY_TOPIC

  # Discord
  prompt "Discord webhook URL (leave blank to skip):"
  read -r DISCORD_WEBHOOK
fi

info "PAI directory:     $PAI_DIR"
info "Plugin directory:  $OPENCODE_PLUGIN_DIR"
info "Config directory:  $OPENCODE_CONFIG_DIR"
info "OpenCode config:   $OPENCODE_CONFIG"
info "Adapter config:    $PAI_ADAPTER_CONFIG"
info "Voice enabled:     $ENABLE_VOICE"
[[ -n "$NTFY_TOPIC" ]] && info "ntfy topic:        $NTFY_TOPIC"
[[ -n "$DISCORD_WEBHOOK" ]] && info "Discord webhook:   (configured)"

if [[ "$NON_INTERACTIVE" == "false" ]]; then
  echo ""
  prompt "Proceed with installation? [Y/n]:"
  read -r CONFIRM
  CONFIRM="${CONFIRM:-y}"
  if [[ "$(echo "$CONFIRM" | tr '[:upper:]' '[:lower:]')" != "y" ]]; then
    info "Installation cancelled."
    exit 0
  fi
fi

# ─── STEP 3: Directory Setup ──────────────────────────────────────────────────
section "Step 3 — Directory Setup"

# Track all created directories for backup manifest
CREATED_DIRS=()
CREATED_FILES=()
MODIFIED_FILES=()

create_dir() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    mkdir -p "$dir"
    CREATED_DIRS+=("$dir")
    success "Created: $dir"
  else
    info "Exists:  $dir"
  fi
}

create_dir "$OPENCODE_PLUGIN_DIR"
create_dir "$OPENCODE_CONFIG_DIR"
create_dir "$HOME/.opencode/logs/sessions"
create_dir "$HOME/.opencode/pai-state"
create_dir "$HOME/.opencode/plugin/pai-adapter/dist"
create_dir "$HOME/.sisyphus/evidence" 2>/dev/null || true

# Create debug log file
if [[ ! -f "/tmp/pai-opencode-debug.log" ]]; then
  touch /tmp/pai-opencode-debug.log
  info "Created debug log: /tmp/pai-opencode-debug.log"
fi

# Create MEMORY session dir (only if PAI is installed)
if [[ -d "$PAI_DIR" ]]; then
  create_dir "$PAI_DIR/MEMORY/sessions"
fi

# ─── STEP 4: Build ────────────────────────────────────────────────────────────
section "Step 4 — Build"

info "Building plugin from source..."

# Build the unified plugin
if bun build "$REPO_DIR/src/plugin/pai-unified.ts" \
     --target=bun \
     --outdir="$REPO_DIR/dist" \
     --external opencode 2>&1; then
  success "Plugin built: dist/pai-unified.js"
  CREATED_FILES+=("$REPO_DIR/dist/pai-unified.js")
else
  warn "Build produced warnings (may be fine for TypeScript declarations)"
fi

# ─── STEP 5: Deploy Plugin Files ──────────────────────────────────────────────
section "Step 5 — Deploy Plugin"

# Copy plugin source to OpenCode plugin dir
cp "$REPO_DIR/src/plugin/pai-unified.ts" "$OPENCODE_PLUGIN_DIR/pai-unified.ts"
CREATED_FILES+=("$OPENCODE_PLUGIN_DIR/pai-unified.ts")
success "Deployed: $OPENCODE_PLUGIN_DIR/pai-unified.ts"

# Copy dist build
if [[ -f "$REPO_DIR/dist/pai-unified.js" ]]; then
  cp "$REPO_DIR/dist/pai-unified.js" "$OPENCODE_PLUGIN_DIR/dist/pai-unified.js"
  CREATED_FILES+=("$OPENCODE_PLUGIN_DIR/dist/pai-unified.js")
  success "Deployed: $OPENCODE_PLUGIN_DIR/dist/pai-unified.js"
fi

# Copy package.json for plugin context
cat > "$OPENCODE_PLUGIN_DIR/package.json" <<PKGJSON
{
  "name": "pai-opencode-adapter",
  "version": "0.1.0",
  "description": "PAI v4.0.3 adapter plugin for OpenCode",
  "main": "dist/pai-unified.js",
  "license": "MIT"
}
PKGJSON
CREATED_FILES+=("$OPENCODE_PLUGIN_DIR/package.json")
success "Deployed: $OPENCODE_PLUGIN_DIR/package.json"

# ─── STEP 6: Generate Configuration Files ─────────────────────────────────────
section "Step 6 — Configuration Files"

# --- 6a: Generate pai-adapter.json (plugin-specific config) ---

generate_pai_adapter_config() {
  local voice_enabled="false"
  [[ "$(echo "$ENABLE_VOICE" | tr '[:upper:]' '[:lower:]')" == "y" ]] && voice_enabled="true"

  local ntfy_enabled="false"
  [[ -n "$NTFY_TOPIC" ]] && ntfy_enabled="true"

  local discord_enabled="false"
  [[ -n "$DISCORD_WEBHOOK" ]] && discord_enabled="true"

  cat <<ADAPTERCONFIG
{
  "paiDir": "$PAI_DIR",
  "pluginDir": "$OPENCODE_PLUGIN_DIR",
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
    }
  },
  "voice": {
    "enabled": $voice_enabled,
    "elevenLabsApiKey": "${ELEVENLABS_API_KEY:-}",
     "voiceId": "pFZP5JQG7iQjIQuC4Bku"
  },
  "notifications": {
    "ntfy": {
      "enabled": $ntfy_enabled,
      "topic": "${NTFY_TOPIC:-}"
    },
    "discord": {
      "enabled": $discord_enabled,
      "webhookUrl": "${DISCORD_WEBHOOK:-}"
    }
  },
  "logging": {
    "debugLog": "/tmp/pai-opencode-debug.log",
    "sessionLogDir": "$HOME/.opencode/logs/sessions"
  },
  "installedVersion": "0.1.0",
  "paiVersion": "4.0.3",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
ADAPTERCONFIG
}

# Write pai-adapter.json
if [[ -f "$PAI_ADAPTER_CONFIG" ]]; then
  cp "$PAI_ADAPTER_CONFIG" "${PAI_ADAPTER_CONFIG}.bak-$(date +%Y%m%d%H%M%S)"
  MODIFIED_FILES+=("$PAI_ADAPTER_CONFIG")
  info "Backed up: ${PAI_ADAPTER_CONFIG}.bak-*"
fi

generate_pai_adapter_config > "$PAI_ADAPTER_CONFIG"
CREATED_FILES+=("$PAI_ADAPTER_CONFIG")
success "Created: $PAI_ADAPTER_CONFIG"

# --- 6b: Ensure opencode.json has the plugin entry (but NO pai section) ---

PLUGIN_PATH="file://$REPO_DIR/src/plugin/pai-unified.ts"

if [[ -f "$OPENCODE_CONFIG" ]]; then
  # Backup existing config
  cp "$OPENCODE_CONFIG" "${OPENCODE_CONFIG}.bak-$(date +%Y%m%d%H%M%S)"
  MODIFIED_FILES+=("$OPENCODE_CONFIG")
  info "Backed up: ${OPENCODE_CONFIG}.bak-*"

  if command -v jq &>/dev/null; then
    # Add plugin entry if not already present, and remove any stale "pai" key
    UPDATED=$(jq --arg plugin "$PLUGIN_PATH" '
      # Remove the pai section if it exists (migrated to pai-adapter.json)
      del(.pai) |
      # Add plugin entry if not present
      if (.plugin | type) == "array" then
        if (.plugin | index($plugin)) then .
        else .plugin += [$plugin]
        end
      else
        .plugin = [$plugin]
      end
    ' "$OPENCODE_CONFIG") || true

    if [[ -n "$UPDATED" ]]; then
      echo "$UPDATED" > "$OPENCODE_CONFIG"
      success "Updated plugin entry in: $OPENCODE_CONFIG"
    else
      warn "jq merge failed — please manually add plugin to opencode.json"
    fi
  else
    warn "jq not available — please manually add this to your opencode.json plugin array:"
    info "  \"$PLUGIN_PATH\""
  fi
else
  # Create minimal opencode.json with just plugin entry
  mkdir -p "$(dirname "$OPENCODE_CONFIG")"
  cat > "$OPENCODE_CONFIG" <<OCCONFIG
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": [
    "$PLUGIN_PATH"
  ]
}
OCCONFIG
  CREATED_FILES+=("$OPENCODE_CONFIG")
  success "Created: $OPENCODE_CONFIG"
fi

# ─── STEP 7: StatusLine Setup ─────────────────────────────────────────────────
section "Step 7 — StatusLine Setup"

STATUSLINE_SCRIPT="$REPO_DIR/src/statusline/install-statusline.sh"
if [[ -f "$STATUSLINE_SCRIPT" ]]; then
  if command -v tmux &>/dev/null; then
    info "Installing StatusLine..."
    # Backup tmux.conf before modification (install-statusline.sh does this)
    if bash "$STATUSLINE_SCRIPT" 2>&1; then
      success "StatusLine installed"
      MODIFIED_FILES+=("$HOME/.tmux.conf")
    else
      warn "StatusLine installation encountered issues (non-fatal)"
    fi
  else
    warn "Skipping StatusLine — tmux not available"
  fi
else
  warn "StatusLine script not found at: $STATUSLINE_SCRIPT"
fi

# ─── STEP 8: AGENTS.md Generation ────────────────────────────────────────────
section "Step 8 — AGENTS.md Generation"

AGENTS_GENERATOR="$REPO_DIR/src/generators/build-agents-md.ts"
if [[ -f "$AGENTS_GENERATOR" ]] && [[ -d "$PAI_DIR/agents" ]]; then
  info "Generating AGENTS.md from PAI agent definitions..."
  if bun run "$AGENTS_GENERATOR" 2>&1; then
    if [[ -f "$REPO_DIR/AGENTS.md" ]]; then
      success "AGENTS.md generated"
      CREATED_FILES+=("$REPO_DIR/AGENTS.md")
    fi
  else
    warn "AGENTS.md generation failed (non-fatal)"
  fi
else
  info "Skipping AGENTS.md generation (PAI agents dir not found or generator missing)"
fi

# ─── STEP 8b: Deploy PAI-Native Experience ───────────────────────────────────
section "Step 8b — PAI-Native Experience (Agents, Theme, Commands)"

# Deploy PAI agents to OpenCode config
AGENTS_SRC="$REPO_DIR/src/config/agents"
AGENTS_TARGET="$OPENCODE_CONFIG_DIR/agents"
if [[ -d "$AGENTS_SRC" ]]; then
  create_dir "$AGENTS_TARGET"
  for agent_file in "$AGENTS_SRC"/*.md; do
    if [[ -f "$agent_file" ]]; then
      agent_name=$(basename "$agent_file")
      cp "$agent_file" "$AGENTS_TARGET/$agent_name"
      CREATED_FILES+=("$AGENTS_TARGET/$agent_name")
      success "Deployed agent: $agent_name"
    fi
  done
else
  warn "Agent source directory not found: $AGENTS_SRC"
fi

# Deploy PAI theme to OpenCode config
THEMES_SRC="$REPO_DIR/src/config/themes"
THEMES_TARGET="$OPENCODE_CONFIG_DIR/themes"
if [[ -d "$THEMES_SRC" ]]; then
  create_dir "$THEMES_TARGET"
  for theme_file in "$THEMES_SRC"/*.json; do
    if [[ -f "$theme_file" ]]; then
      theme_name=$(basename "$theme_file")
      cp "$theme_file" "$THEMES_TARGET/$theme_name"
      CREATED_FILES+=("$THEMES_TARGET/$theme_name")
      success "Deployed theme: $theme_name"
    fi
  done
else
  warn "Theme source directory not found: $THEMES_SRC"
fi

# Deploy PAI commands to OpenCode config
COMMANDS_SRC="$REPO_DIR/src/config/commands"
COMMANDS_TARGET="$OPENCODE_CONFIG_DIR/commands"
if [[ -d "$COMMANDS_SRC" ]]; then
  create_dir "$COMMANDS_TARGET"
  for cmd_file in "$COMMANDS_SRC"/*.md; do
    if [[ -f "$cmd_file" ]]; then
      cmd_name=$(basename "$cmd_file")
      cp "$cmd_file" "$COMMANDS_TARGET/$cmd_name"
      CREATED_FILES+=("$COMMANDS_TARGET/$cmd_name")
      success "Deployed command: $cmd_name"
    fi
  done
else
  warn "Commands source directory not found: $COMMANDS_SRC"
fi

# Set PAI theme as default in tui.json if not already set
TUI_CONFIG="$OPENCODE_CONFIG_DIR/tui.json"
if [[ ! -f "$TUI_CONFIG" ]]; then
  cat > "$TUI_CONFIG" <<TUIJSON
{
  "\$schema": "https://opencode.ai/tui.json",
  "theme": "pai"
}
TUIJSON
  CREATED_FILES+=("$TUI_CONFIG")
  success "Created tui.json with PAI theme"
elif command -v jq &>/dev/null; then
  # Only set theme if not already configured
  CURRENT_THEME=$(jq -r '.theme // empty' "$TUI_CONFIG" 2>/dev/null)
  if [[ -z "$CURRENT_THEME" ]]; then
    UPDATED_TUI=$(jq '. + {"theme": "pai"}' "$TUI_CONFIG") || true
    if [[ -n "$UPDATED_TUI" ]]; then
      echo "$UPDATED_TUI" > "$TUI_CONFIG"
      MODIFIED_FILES+=("$TUI_CONFIG")
      success "Set PAI theme in existing tui.json"
    fi
  else
    info "Theme already set to: $CURRENT_THEME (not overriding)"
  fi
fi

info "PAI-native experience deployed: $(ls "$AGENTS_TARGET" 2>/dev/null | wc -l | tr -d ' ') agents, $(ls "$THEMES_TARGET" 2>/dev/null | wc -l | tr -d ' ') themes, $(ls "$COMMANDS_TARGET" 2>/dev/null | wc -l | tr -d ' ') commands"

# ─── STEP 9: Write Backup Manifest ───────────────────────────────────────────
section "Step 9 — Backup Manifest"

MANIFEST_FILE="$OPENCODE_PLUGIN_DIR/.backup-manifest.json"

# Build arrays as JSON
dirs_json="["
for ((i=0; i<${#CREATED_DIRS[@]}; i++)); do
  [[ $i -gt 0 ]] && dirs_json+=","
  dirs_json+="\"${CREATED_DIRS[$i]}\""
done
dirs_json+="]"

files_json="["
for ((i=0; i<${#CREATED_FILES[@]}; i++)); do
  [[ $i -gt 0 ]] && files_json+=","
  files_json+="\"${CREATED_FILES[$i]}\""
done
files_json+="]"

modified_json="["
for ((i=0; i<${#MODIFIED_FILES[@]}; i++)); do
  [[ $i -gt 0 ]] && modified_json+=","
  modified_json+="\"${MODIFIED_FILES[$i]}\""
done
modified_json+="]"

cat > "$MANIFEST_FILE" <<MANIFEST
{
  "version": "0.1.0",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "paiVersion": "4.0.3",
  "repoDir": "$REPO_DIR",
  "paiDir": "$PAI_DIR",
  "pluginDir": "$OPENCODE_PLUGIN_DIR",
  "opencodeConfig": "$OPENCODE_CONFIG",
  "adapterConfig": "$PAI_ADAPTER_CONFIG",
  "createdDirs": $dirs_json,
  "createdFiles": $files_json,
  "modifiedFiles": $modified_json,
  "tmuxConfBackup": "$HOME/.tmux.conf.bak"
}
MANIFEST

success "Backup manifest written: $MANIFEST_FILE"

# ─── STEP 10: Verification ────────────────────────────────────────────────────
section "Step 10 — Verification"

VERIFY_FAIL=false

# Run test suite
info "Running test suite..."
if bun test --cwd "$REPO_DIR" 2>&1 | tail -5; then
  success "All tests pass"
else
  warn "Some tests failed — installation may still work"
  VERIFY_FAIL=true
fi

# Check OpenCode still works
info "Verifying OpenCode is functional..."
if opencode --help &>/dev/null 2>&1; then
  success "OpenCode still accessible"
else
  warn "opencode --help returned non-zero (may be normal if it requires a subcommand)"
fi

# Check plugin file exists
if [[ -f "$OPENCODE_PLUGIN_DIR/pai-unified.ts" ]]; then
  success "Plugin file deployed: $OPENCODE_PLUGIN_DIR/pai-unified.ts"
else
  error "Plugin file missing: $OPENCODE_PLUGIN_DIR/pai-unified.ts"
  VERIFY_FAIL=true
fi

# Check backup manifest
if [[ -f "$MANIFEST_FILE" ]]; then
  success "Backup manifest present: $MANIFEST_FILE"
else
  error "Backup manifest missing: $MANIFEST_FILE"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${STEEL}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓${RESET}"
echo ""

if [[ "$VERIFY_FAIL" == "false" ]]; then
  echo -e "    ${GREEN}${BOLD}✓ Installation complete!${RESET}"
  echo ""
  echo -e "    ${GRAY}Plugin:${RESET}         $OPENCODE_PLUGIN_DIR"
  echo -e "    ${GRAY}OpenCode cfg:${RESET}   $OPENCODE_CONFIG"
  echo -e "    ${GRAY}Adapter cfg:${RESET}    $PAI_ADAPTER_CONFIG"
  echo -e "    ${GRAY}Manifest:${RESET}       $MANIFEST_FILE"
  echo -e "    ${GRAY}Debug log:${RESET}      /tmp/pai-opencode-debug.log"
  echo ""
  echo -e "    ${LIGHT_BLUE}Start OpenCode:${RESET} ${SILVER}opencode${RESET}"
  if command -v tmux &>/dev/null; then
    echo -e "    ${LIGHT_BLUE}With StatusLine:${RESET} ${SILVER}tmux new-session -s pai opencode${RESET}"
  fi
  echo ""
  echo -e "    ${LIGHT_BLUE}PAI Agents:${RESET}     ${SILVER}Tab${RESET} to switch between Algorithm and Native"
  echo -e "    ${LIGHT_BLUE}Setup Wizard:${RESET}   ${SILVER}/pai-setup${RESET} to configure your PAI identity"
  echo -e "    ${LIGHT_BLUE}Commands:${RESET}       ${SILVER}/algorithm${RESET}, ${SILVER}/native${RESET}, ${SILVER}/telos${RESET}"
  echo -e "    ${LIGHT_BLUE}Theme:${RESET}          ${SILVER}PAI theme auto-applied${RESET} (change with /theme)"
  echo ""
  echo -e "    ${GRAY}To uninstall:${RESET} ${SILVER}bash scripts/uninstall.sh${RESET}"
else
  echo -e "    ${YELLOW}${BOLD}⚠ Installation completed with warnings${RESET}"
  echo ""
  echo -e "    ${GRAY}Check the output above for details.${RESET}"
  echo -e "    ${GRAY}Run 'bun test' in the repo directory to diagnose.${RESET}"
fi

echo ""
echo -e "${STEEL}┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${RESET}"
echo ""
