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
      echo ""
      echo "  PAI Skill API keys (written to \${PAI_DIR}/PAI/.env):"
      echo "  GOOGLE_API_KEY        Google/Gemini key for Art skill image generation"
      echo "  APIFY_TOKEN           Apify token for Scraping skill"
      echo "  CLEANVOICE_API_KEY    Cleanvoice key for Audio Editor skill"
      echo "  CLOUDFLARE_API_TOKEN  Cloudflare API token for Cloudflare skill"
      echo "  FRED_API_KEY          FRED API key for US Metrics skill"
      echo "  IPINFO_API_KEY        IPinfo key for Security/Recon skill"
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

# ─── STEP 3: PAI Skills API Keys ──────────────────────────────────────────────
section "Step 3 — PAI Skills API Keys"

# Track all created/modified files for backup manifest (initialized here,
# before any step that creates or modifies files)
CREATED_DIRS=()
CREATED_FILES=()
MODIFIED_FILES=()

PAI_ENV_FILE="$PAI_DIR/PAI/.env"
PAI_ENV_KEYS=()

info "PAI skills use API keys stored in ${BOLD}$PAI_ENV_FILE${RESET}"
info "Each skill below is optional — skip any you don't need."
echo ""

if [[ "$NON_INTERACTIVE" == "false" ]]; then

  # ── Art / Image Generation (GOOGLE_API_KEY) ────────────────────────────────
  prompt "Activate ${BOLD}Art${RESET} skill (AI image generation)? [y/N]:"
  read -r ART_INPUT
  if [[ "$(echo "${ART_INPUT:-n}" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
    prompt "Google/Gemini API key (for image generation with Gemini):"
    read -r -s ART_GOOGLE_KEY
    echo ""
    if [[ -n "$ART_GOOGLE_KEY" ]]; then
      PAI_ENV_KEYS+=("GOOGLE_API_KEY=$ART_GOOGLE_KEY")
      success "GOOGLE_API_KEY configured"
    else
      PAI_ENV_KEYS+=("# GOOGLE_API_KEY=         # Required for Art skill (Gemini image generation)")
      warn "GOOGLE_API_KEY left blank — add it to $PAI_ENV_FILE later"
    fi
    info "  ${GRAY}Optional: REPLICATE_API_TOKEN (Flux models) — add to $PAI_ENV_FILE${RESET}"
    info "  ${GRAY}Optional: OPENAI_API_KEY (GPT-image-1 model) — add to $PAI_ENV_FILE${RESET}"
    info "  ${GRAY}Optional: REMOVEBG_API_KEY (background removal) — add to $PAI_ENV_FILE${RESET}"
    echo ""
  fi

  # ── Scraping / Apify (APIFY_TOKEN) ─────────────────────────────────────────
  prompt "Activate ${BOLD}Scraping${RESET} skill (web & social media scraping)? [y/N]:"
  read -r SCRAPING_INPUT
  if [[ "$(echo "${SCRAPING_INPUT:-n}" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
    prompt "Apify API token (for social media & web scraping):"
    read -r -s SCRAPING_APIFY_KEY
    echo ""
    if [[ -n "$SCRAPING_APIFY_KEY" ]]; then
      PAI_ENV_KEYS+=("APIFY_TOKEN=$SCRAPING_APIFY_KEY")
      success "APIFY_TOKEN configured"
    else
      PAI_ENV_KEYS+=("# APIFY_TOKEN=            # Required for Scraping/Apify skill")
      warn "APIFY_TOKEN left blank — add it to $PAI_ENV_FILE later"
    fi
    info "  ${GRAY}Optional: BRIGHT_DATA_API_KEY (proxy scraping) — add to $PAI_ENV_FILE${RESET}"
    echo ""
  fi

  # ── Audio Editor (CLEANVOICE_API_KEY) ──────────────────────────────────────
  prompt "Activate ${BOLD}Audio Editor${RESET} skill (audio cleaning & polish)? [y/N]:"
  read -r AUDIO_INPUT
  if [[ "$(echo "${AUDIO_INPUT:-n}" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
    prompt "Cleanvoice API key (for cloud audio polish):"
    read -r -s AUDIO_CLEANVOICE_KEY
    echo ""
    if [[ -n "$AUDIO_CLEANVOICE_KEY" ]]; then
      PAI_ENV_KEYS+=("CLEANVOICE_API_KEY=$AUDIO_CLEANVOICE_KEY")
      success "CLEANVOICE_API_KEY configured"
    else
      PAI_ENV_KEYS+=("# CLEANVOICE_API_KEY=     # Required for AudioEditor polish step")
      warn "CLEANVOICE_API_KEY left blank — add it to $PAI_ENV_FILE later"
    fi
    echo ""
  fi

  # ── Cloudflare (CF_API_TOKEN) ──────────────────────────────────────────────
  prompt "Activate ${BOLD}Cloudflare${RESET} skill (Workers, Pages, DNS)? [y/N]:"
  read -r CF_INPUT
  if [[ "$(echo "${CF_INPUT:-n}" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
    prompt "Cloudflare API token:"
    read -r -s CF_KEY
    echo ""
    if [[ -n "$CF_KEY" ]]; then
      PAI_ENV_KEYS+=("CLOUDFLARE_API_TOKEN=$CF_KEY")
      success "CLOUDFLARE_API_TOKEN configured"
    else
      PAI_ENV_KEYS+=("# CLOUDFLARE_API_TOKEN=   # Required for Cloudflare skill")
      warn "CLOUDFLARE_API_TOKEN left blank — add it to $PAI_ENV_FILE later"
    fi
    echo ""
  fi

  # ── US Metrics (FRED_API_KEY) ──────────────────────────────────────────────
  prompt "Activate ${BOLD}US Metrics${RESET} skill (economic indicators)? [y/N]:"
  read -r METRICS_INPUT
  if [[ "$(echo "${METRICS_INPUT:-n}" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
    prompt "FRED API key (https://fred.stlouisfed.org/docs/api/api_key.html):"
    read -r -s METRICS_FRED_KEY
    echo ""
    if [[ -n "$METRICS_FRED_KEY" ]]; then
      PAI_ENV_KEYS+=("FRED_API_KEY=$METRICS_FRED_KEY")
      success "FRED_API_KEY configured"
    else
      PAI_ENV_KEYS+=("# FRED_API_KEY=           # Required for US Metrics skill")
      warn "FRED_API_KEY left blank — add it to $PAI_ENV_FILE later"
    fi
    info "  ${GRAY}Optional: EIA_API_KEY (gas prices) — add to $PAI_ENV_FILE${RESET}"
    echo ""
  fi

  # ── Security / Recon (IPINFO_API_KEY) ──────────────────────────────────────
  prompt "Activate ${BOLD}Security/Recon${RESET} skill (network reconnaissance)? [y/N]:"
  read -r RECON_INPUT
  if [[ "$(echo "${RECON_INPUT:-n}" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
    prompt "IPinfo API key (for IP/ASN lookups):"
    read -r -s RECON_IPINFO_KEY
    echo ""
    if [[ -n "$RECON_IPINFO_KEY" ]]; then
      PAI_ENV_KEYS+=("IPINFO_API_KEY=$RECON_IPINFO_KEY")
      success "IPINFO_API_KEY configured"
    else
      PAI_ENV_KEYS+=("# IPINFO_API_KEY=         # Required for Security/Recon skill")
      warn "IPINFO_API_KEY left blank — add it to $PAI_ENV_FILE later"
    fi
    info "  ${GRAY}Optional: SHODAN_API_KEY, VIRUSTOTAL_API_KEY, CENSYS_API_SECRET — add to $PAI_ENV_FILE${RESET}"
    info "  ${GRAY}Optional: DEHASHED_API_KEY, HUNTER_API_KEY, HIBP_API_KEY — add to $PAI_ENV_FILE${RESET}"
    echo ""
  fi

fi  # end non-interactive

# ── Non-interactive: pick up keys from environment ───────────────────────────
if [[ "$NON_INTERACTIVE" == "true" ]]; then
  [[ -n "${GOOGLE_API_KEY:-}" ]]        && PAI_ENV_KEYS+=("GOOGLE_API_KEY=$GOOGLE_API_KEY")
  [[ -n "${APIFY_TOKEN:-}" ]]           && PAI_ENV_KEYS+=("APIFY_TOKEN=$APIFY_TOKEN")
  [[ -n "${CLEANVOICE_API_KEY:-}" ]]    && PAI_ENV_KEYS+=("CLEANVOICE_API_KEY=$CLEANVOICE_API_KEY")
  [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]  && PAI_ENV_KEYS+=("CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN")
  [[ -n "${FRED_API_KEY:-}" ]]          && PAI_ENV_KEYS+=("FRED_API_KEY=$FRED_API_KEY")
  [[ -n "${IPINFO_API_KEY:-}" ]]        && PAI_ENV_KEYS+=("IPINFO_API_KEY=$IPINFO_API_KEY")
fi

# ── Write PAI .env file ──────────────────────────────────────────────────────
# Strategy: MERGE new keys into existing .env rather than overwriting.
# - Existing keys the user set manually are preserved
# - New keys from this run are added or updated
# - Commented-out hints are only added if the key doesn't already exist

if [[ ${#PAI_ENV_KEYS[@]} -gt 0 ]]; then
  PAI_ENV_DIR="$(dirname "$PAI_ENV_FILE")"
  if [[ ! -d "$PAI_ENV_DIR" ]]; then
    mkdir -p "$PAI_ENV_DIR"
    success "Created: $PAI_ENV_DIR"
  fi

  if [[ -f "$PAI_ENV_FILE" ]]; then
    # Backup existing .env before merging
    cp "$PAI_ENV_FILE" "${PAI_ENV_FILE}.bak-$(date +%Y%m%d%H%M%S)"
    MODIFIED_FILES+=("$PAI_ENV_FILE")
    info "Backed up existing: ${PAI_ENV_FILE}.bak-*"

    # Read existing file content for merge
    EXISTING_ENV_CONTENT=$(<"$PAI_ENV_FILE")

    # Merge: update existing keys, append new ones
    for key_line in "${PAI_ENV_KEYS[@]}"; do
      # Skip comment lines (hints for blank keys)
      if [[ "$key_line" == \#* ]]; then
        # Only add comment hint if key name isn't already in the file (set or commented)
        hint_key=$(echo "$key_line" | sed 's/^# *//;s/=.*//')
        if ! grep -q "^${hint_key}=" "$PAI_ENV_FILE" 2>/dev/null; then
          echo "$key_line" >> "$PAI_ENV_FILE"
        fi
        continue
      fi

      # Extract key name (everything before first =)
      key_name="${key_line%%=*}"

      if grep -q "^${key_name}=" "$PAI_ENV_FILE" 2>/dev/null; then
        # Key exists — update in place
        # Use a temp file for sed portability (macOS sed -i requires backup suffix)
        sed -i.sedtmp "s|^${key_name}=.*|${key_line}|" "$PAI_ENV_FILE"
        rm -f "${PAI_ENV_FILE}.sedtmp"
        info "Updated: $key_name"
      elif grep -q "^# *${key_name}=" "$PAI_ENV_FILE" 2>/dev/null; then
        # Key exists but commented out — replace the comment with the active key
        sed -i.sedtmp "s|^# *${key_name}=.*|${key_line}|" "$PAI_ENV_FILE"
        rm -f "${PAI_ENV_FILE}.sedtmp"
        success "Activated: $key_name"
      else
        # Key doesn't exist — append
        echo "$key_line" >> "$PAI_ENV_FILE"
        success "Added: $key_name"
      fi
    done

    success "Merged keys into: $PAI_ENV_FILE"
  else
    # First run — write fresh .env with header and all keys
    {
      echo "# ═══════════════════════════════════════════════════════════════"
      echo "# PAI Skills — API Keys"
      echo "# Generated by PAI OpenCode Adapter installer on $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "#"
      echo "# Skills load this file from \${PAI_DIR}/.env (default: ~/.claude/PAI/.env)"
      echo "# Add keys here for any PAI skill that needs external API access."
      echo "# ═══════════════════════════════════════════════════════════════"
      echo ""
      for key_line in "${PAI_ENV_KEYS[@]}"; do
        echo "$key_line"
      done
      echo ""
      echo "# ─── Additional keys (add as needed) ────────────────────────────"
      echo "# REPLICATE_API_TOKEN=    # Art skill: Flux image generation models"
      echo "# OPENAI_API_KEY=         # Art skill: GPT-image-1 model"
      echo "# REMOVEBG_API_KEY=       # Art skill: Background removal (remove.bg)"
      echo "# BRIGHT_DATA_API_KEY=    # Scraping skill: Proxy-based web scraping"
      echo "# EIA_API_KEY=            # US Metrics skill: Energy/gas price data"
      echo "# SHODAN_API_KEY=         # Security skill: Shodan network search"
      echo "# VIRUSTOTAL_API_KEY=     # Security skill: Malware/URL analysis"
      echo "# CENSYS_API_SECRET=      # Security skill: Internet-wide scan data"
      echo "# DEHASHED_API_KEY=       # Security skill: Breach data lookups"
      echo "# HUNTER_API_KEY=         # Security skill: Email finder"
      echo "# HIBP_API_KEY=           # Security skill: Have I Been Pwned"
      echo "# DISCORD_BOT_TOKEN=      # Art skill: Midjourney via Discord bot"
      echo "# MIDJOURNEY_CHANNEL_ID=  # Art skill: Midjourney Discord channel"
    } > "$PAI_ENV_FILE"

    CREATED_FILES+=("$PAI_ENV_FILE")
    success "Created: $PAI_ENV_FILE"
  fi

  # Restrict permissions — this file contains secrets
  chmod 600 "$PAI_ENV_FILE"
  info "Permissions set: 600"
elif [[ -f "$PAI_ENV_FILE" ]]; then
  info "No new skill keys — existing $PAI_ENV_FILE preserved"
else
  info "No skill keys configured — you can create $PAI_ENV_FILE later"
fi

# ─── STEP 3b: Optional Security & Recon Tools ─────────────────────────────────
section "Step 3b — Optional Security & Recon Tools"

info "PAI's Security/Recon and OSINT skills use external CLI tools."
info "These are OPTIONAL — skip if you don't plan to use security skills."
echo ""

INSTALL_SECTOOLS="n"
if [[ "$NON_INTERACTIVE" == "false" ]]; then
  prompt "Install security/recon CLI tools? (nmap, subfinder, httpx, nuclei, shodan, yq, ffmpeg) [y/N]"
  read -r INSTALL_SECTOOLS
fi

if [[ "${INSTALL_SECTOOLS,,}" == "y" ]]; then
  # Homebrew tools
  for tool_name in nmap yq ffmpeg; do
    if command -v "$tool_name" &>/dev/null; then
      success "$tool_name already installed: $(which "$tool_name")"
    else
      info "Installing $tool_name via brew..."
      if brew install "$tool_name" &>/dev/null; then
        success "$tool_name installed"
      else
        warn "Failed to install $tool_name — install manually: brew install $tool_name"
      fi
    fi
  done

  # Go tools (ProjectDiscovery)
  if command -v go &>/dev/null; then
    for go_pkg in \
      "github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest:subfinder" \
      "github.com/projectdiscovery/httpx/cmd/httpx@latest:httpx" \
      "github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest:nuclei"; do
      pkg_path="${go_pkg%%:*}"
      tool_name="${go_pkg##*:}"
      go_bin="$(go env GOPATH)/bin/$tool_name"
      if [[ -f "$go_bin" ]] || command -v "$tool_name" &>/dev/null; then
        success "$tool_name already installed"
      else
        info "Installing $tool_name via go install (this may take a minute)..."
        if go install -v "$pkg_path" &>/dev/null; then
          success "$tool_name installed to $(go env GOPATH)/bin/"
        else
          warn "Failed to install $tool_name — install manually: go install $pkg_path"
        fi
      fi
    done

    # Remind about PATH
    GOPATH_BIN="$(go env GOPATH)/bin"
    if ! echo "$PATH" | tr ':' '\n' | grep -q "^${GOPATH_BIN}$"; then
      warn "$(go env GOPATH)/bin is not in your PATH"
      info "Add this to your shell profile: export PATH=\"\$HOME/go/bin:\$PATH\""
    fi
  else
    warn "Go not installed — skipping subfinder, httpx, nuclei"
    info "Install Go first: brew install go"
  fi

  # Python tools (shodan)
  if command -v shodan &>/dev/null; then
    success "shodan already installed: $(which shodan)"
  elif command -v pipx &>/dev/null; then
    info "Installing shodan via pipx..."
    if pipx install shodan &>/dev/null; then
      success "shodan installed via pipx"
    else
      warn "Failed to install shodan — install manually: pipx install shodan"
    fi
  elif command -v pip3 &>/dev/null; then
    info "Installing shodan via pip3..."
    if pip3 install --user shodan &>/dev/null; then
      success "shodan installed via pip3"
    else
      warn "Failed to install shodan — install manually: pip3 install --user shodan"
    fi
  else
    warn "Neither pipx nor pip3 found — skipping shodan CLI"
  fi
else
  info "Skipping security tools — install later with: brew install nmap yq ffmpeg"
  info "See DEPENDENCIES.md for full list of optional dependencies"
fi

# ─── STEP 4: Directory Setup ──────────────────────────────────────────────────
section "Step 4 — Directory Setup"

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

# ─── STEP 5: Build ────────────────────────────────────────────────────────────
section "Step 5 — Build"

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

# ─── STEP 6: Deploy Plugin Files ──────────────────────────────────────────────
section "Step 6 — Deploy Plugin"

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

# ─── STEP 7: Generate Configuration Files ─────────────────────────────────────
section "Step 7 — Configuration Files"

# --- 7a: Generate pai-adapter.json (plugin-specific config) ---

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

# --- 7b: Ensure opencode.json has the plugin entry (but NO pai section) ---

PLUGIN_PATH="file://$REPO_DIR/src/plugin/pai-unified.ts"

if [[ -f "$OPENCODE_CONFIG" ]]; then
  # Backup existing config
  cp "$OPENCODE_CONFIG" "${OPENCODE_CONFIG}.bak-$(date +%Y%m%d%H%M%S)"
  MODIFIED_FILES+=("$OPENCODE_CONFIG")
  info "Backed up: ${OPENCODE_CONFIG}.bak-*"

  if command -v jq &>/dev/null; then
    # Add plugin entry if not already present, remove any stale "pai" key,
    # and inject full PAI permission rules for all tool types
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
      end |
      # Inject full PAI permission rules — all tool types covered
      .permission = ((.permission // {}) * {
        "read": { "*": "allow" },
        "edit": ((.permission.edit // {}) * {
          "*": "allow",
          "~/.claude/*": "ask",
          "~/.claude/MEMORY/WORK/*": "allow",
          "~/.claude/MEMORY/LEARNING/REFLECTIONS/*": "allow",
          "~/.claude/MEMORY/LEARNING/SIGNALS/*": "allow",
          "~/.claude/MEMORY/WISDOM/*": "allow",
          "~/.claude/MEMORY/RELATIONSHIP/*": "allow",
          "~/.claude/MEMORY/STATE/*": "allow",
          "~/.claude/PAI/USER/TELOS/*": "allow",
          "~/.claude/transcripts/*": "allow"
        }),
        "glob": "allow",
        "grep": "allow",
        "list": "allow",
        "bash": "allow",
        "task": "allow",
        "skill": "allow",
        "webfetch": "allow",
        "question": "allow",
        "external_directory": {
          "*": "ask",
          "~/.claude/**": "allow",
          "~/.config/opencode/**": "allow"
        },
        "doom_loop": "ask"
      })
    ' "$OPENCODE_CONFIG") || true

    if [[ -n "$UPDATED" ]]; then
      echo "$UPDATED" > "$OPENCODE_CONFIG"
      success "Updated plugin entry in: $OPENCODE_CONFIG"
      success "Injected PAI permission rules (all tool types, user-owned paths: allow)"
    else
      warn "jq merge failed — please manually add plugin to opencode.json"
    fi
  else
    warn "jq not available — please manually add this to your opencode.json plugin array:"
    info "  \"$PLUGIN_PATH\""
  fi
else
  # Create minimal opencode.json with plugin entry and full PAI permission rules
  mkdir -p "$(dirname "$OPENCODE_CONFIG")"
  cat > "$OPENCODE_CONFIG" <<OCCONFIG
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": [
    "$PLUGIN_PATH"
  ],
  "permission": {
    "read": {
      "*": "allow"
    },
    "edit": {
      "*": "allow",
      "~/.claude/*": "ask",
      "~/.claude/MEMORY/WORK/*": "allow",
      "~/.claude/MEMORY/LEARNING/REFLECTIONS/*": "allow",
      "~/.claude/MEMORY/LEARNING/SIGNALS/*": "allow",
      "~/.claude/MEMORY/WISDOM/*": "allow",
      "~/.claude/MEMORY/RELATIONSHIP/*": "allow",
      "~/.claude/MEMORY/STATE/*": "allow",
      "~/.claude/PAI/USER/TELOS/*": "allow",
      "~/.claude/transcripts/*": "allow"
    },
    "glob": "allow",
    "grep": "allow",
    "list": "allow",
    "bash": "allow",
    "task": "allow",
    "skill": "allow",
    "webfetch": "allow",
    "question": "allow",
    "external_directory": {
      "*": "ask",
      "~/.claude/**": "allow",
      "~/.config/opencode/**": "allow"
    },
    "doom_loop": "ask"
  }
}
OCCONFIG
  CREATED_FILES+=("$OPENCODE_CONFIG")
  success "Created: $OPENCODE_CONFIG"
fi

# ─── STEP 8: StatusLine Setup ─────────────────────────────────────────────────
section "Step 8 — StatusLine Setup"

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

# ─── STEP 9: AGENTS.md Generation ────────────────────────────────────────────
section "Step 9 — AGENTS.md Generation"

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

# ─── STEP 9b: Deploy PAI-Native Experience ───────────────────────────────────
section "Step 9b — PAI-Native Experience (Agents, Theme, Commands)"

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

# Deploy PAI protection rules to OpenCode config
RULES_SRC="$REPO_DIR/src/config/rules"
RULES_TARGET="$OPENCODE_CONFIG_DIR/rules"
if [[ -d "$RULES_SRC" ]]; then
  create_dir "$RULES_TARGET"
  for rule_file in "$RULES_SRC"/*.md; do
    if [[ -f "$rule_file" ]]; then
      rule_name=$(basename "$rule_file")
      cp "$rule_file" "$RULES_TARGET/$rule_name"
      CREATED_FILES+=("$RULES_TARGET/$rule_name")
      success "Deployed rule: $rule_name"
    fi
  done

  # Add rules to opencode.json instructions array
  if command -v jq &>/dev/null && [[ -f "$OPENCODE_CONFIG" ]]; then
    # Build list of rule file paths relative to config dir
    RULE_PATHS=()
    for rule_file in "$RULES_TARGET"/*.md; do
      if [[ -f "$rule_file" ]]; then
        RULE_PATHS+=("$rule_file")
      fi
    done

    if [[ ${#RULE_PATHS[@]} -gt 0 ]]; then
      # Add each rule file to the instructions array if not already present
      for rule_path in "${RULE_PATHS[@]}"; do
        UPDATED=$(jq --arg path "$rule_path" '
          if (.instructions | type) == "array" then
            if (.instructions | index($path)) then .
            else .instructions += [$path]
            end
          else
            .instructions = [$path]
          end
        ' "$OPENCODE_CONFIG") || true

        if [[ -n "$UPDATED" ]]; then
          echo "$UPDATED" > "$OPENCODE_CONFIG"
        fi
      done
      success "Added PAI protection rules to opencode.json instructions"
    fi
  else
    warn "jq not available or opencode.json missing — add rules to instructions manually"
    info "  Add to opencode.json: \"instructions\": [\"$RULES_TARGET/pai-protection.md\"]"
  fi
else
  info "No rules to deploy (rules directory not found: $RULES_SRC)"
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

# ─── STEP 10: Write Backup Manifest ───────────────────────────────────────────
section "Step 10 — Backup Manifest"

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

# ─── STEP 11: Verification ────────────────────────────────────────────────────
section "Step 11 — Verification"

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

# ─── Dependency Summary ──────────────────────────────────────────────────────
echo -e "  ${BOLD}${BLUE}Dependency Summary${RESET}"
echo ""
echo -e "  ${GRAY}Core tools:${RESET}"
for cmd in bun node jq rg; do
  if command -v "$cmd" &>/dev/null; then
    echo -e "    ${GREEN}✓${RESET} $cmd"
  else
    echo -e "    ${RED}✗${RESET} $cmd ${GRAY}(required)${RESET}"
  fi
done
echo ""
echo -e "  ${GRAY}Optional tools:${RESET}"
for cmd in pandoc ffmpeg yq nmap; do
  if command -v "$cmd" &>/dev/null; then
    echo -e "    ${GREEN}✓${RESET} $cmd"
  else
    echo -e "    ${GRAY}○${RESET} $cmd ${GRAY}(not installed)${RESET}"
  fi
done
# Check Go-installed tools in both PATH and ~/go/bin
GOPATH_BIN="${GOPATH:-$HOME/go}/bin"
for cmd in subfinder httpx nuclei; do
  if command -v "$cmd" &>/dev/null || [[ -f "$GOPATH_BIN/$cmd" ]]; then
    echo -e "    ${GREEN}✓${RESET} $cmd"
  else
    echo -e "    ${GRAY}○${RESET} $cmd ${GRAY}(not installed)${RESET}"
  fi
done
if command -v shodan &>/dev/null; then
  echo -e "    ${GREEN}✓${RESET} shodan"
else
  echo -e "    ${GRAY}○${RESET} shodan ${GRAY}(not installed)${RESET}"
fi
echo ""
echo -e "  ${GRAY}API keys (from ~/.config/PAI/.env):${RESET}"
PAI_ENV_CHECK="${HOME}/.config/PAI/.env"
if [[ -f "$PAI_ENV_CHECK" ]]; then
  KEY_COUNT=$(grep -c '^[A-Za-z_]' "$PAI_ENV_CHECK" 2>/dev/null || echo "0")
  echo -e "    ${GREEN}✓${RESET} ${KEY_COUNT} keys configured"
else
  echo -e "    ${GRAY}○${RESET} No .env file found"
fi
echo ""
echo -e "  ${LIGHT_BLUE}See DEPENDENCIES.md for full details${RESET}"
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
