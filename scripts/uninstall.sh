#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  PAI OpenCode Adapter — Uninstaller
#  MIT License
#
#  Cleanly removes the adapter installation using the backup manifest.
#  Does NOT remove PAI content files, MEMORY data, or user data.
#
#  Usage: bash scripts/uninstall.sh [--force]
#         --force: skip confirmation prompt
# ═══════════════════════════════════════════════════════════════════════════════
set -eo pipefail

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

info()    { echo -e "  ${BLUE}ℹ${RESET} $1"; }
success() { echo -e "  ${GREEN}✓${RESET} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET} $1"; }
error()   { echo -e "  ${RED}✗${RESET} $1"; }
section() { echo -e "\n  ${STEEL}──────────────────────────────────${RESET}\n  ${BOLD}${BLUE}$1${RESET}\n"; }
prompt()  { echo -e "  ${LIGHT_BLUE}?${RESET} $1"; }

FORCE=false
OPENCODE_PLUGIN_DIR="${OPENCODE_PLUGIN_DIR:-$HOME/.opencode/plugin/pai-adapter}"

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --plugin-dir) shift; OPENCODE_PLUGIN_DIR="$1" ;;
  esac
done

echo ""
echo -e "${STEEL}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓${RESET}"
echo ""
echo -e "            ${BLUE}PAI${RESET} ${STEEL}→${RESET} ${LIGHT_BLUE}OpenCode${RESET} ${GRAY}Adapter Uninstaller${RESET}"
echo ""
echo -e "${STEEL}┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${RESET}"
echo ""

MANIFEST_FILE="$OPENCODE_PLUGIN_DIR/.backup-manifest.json"

if [[ ! -f "$MANIFEST_FILE" ]]; then
  error "Backup manifest not found: $MANIFEST_FILE"
  error "Cannot safely uninstall without the manifest."
  echo ""
  info "If you installed manually, remove these locations:"
  info "  $OPENCODE_PLUGIN_DIR"
  info "  \$HOME/.opencode/logs/sessions (if empty)"
  info "  \$HOME/.opencode/pai-state (if empty)"
  exit 1
fi

section "Uninstall Plan"

info "Manifest: $MANIFEST_FILE"
echo ""

if command -v jq &>/dev/null; then
  INSTALLED_AT=$(jq -r '.installedAt // "unknown"' "$MANIFEST_FILE")
  REPO_DIR=$(jq -r '.repoDir // ""' "$MANIFEST_FILE")
  PAI_DIR=$(jq -r '.paiDir // ""' "$MANIFEST_FILE")
  info "Installed: $INSTALLED_AT"
  [[ -n "$REPO_DIR" ]] && info "Repo:      $REPO_DIR"
  [[ -n "$PAI_DIR" ]]  && info "PAI dir:   $PAI_DIR (will NOT be touched)"
  echo ""

  FILES_COUNT=$(jq '.createdFiles | length' "$MANIFEST_FILE" 2>/dev/null || echo "0")
  DIRS_COUNT=$(jq '.createdDirs | length' "$MANIFEST_FILE" 2>/dev/null || echo "0")
  MOD_COUNT=$(jq '.modifiedFiles | length' "$MANIFEST_FILE" 2>/dev/null || echo "0")

  info "Will remove: $FILES_COUNT files, $DIRS_COUNT directories"
  info "Will restore: $MOD_COUNT modified files (from backups)"
else
  warn "jq not found — will use fallback removal of known paths"
fi

echo ""
warn "This will remove the adapter plugin, its logs, and state files."
warn "PAI content files, MEMORY data, and user data will NOT be touched."
echo ""

if [[ "$FORCE" == "false" ]]; then
  prompt "Proceed with uninstall? [y/N]:"
  read -r CONFIRM
  CONFIRM="${CONFIRM:-n}"
  if [[ "${CONFIRM,,}" != "y" ]]; then
    info "Uninstall cancelled."
    exit 0
  fi
fi

section "Removing Files"

if command -v jq &>/dev/null && [[ -f "$MANIFEST_FILE" ]]; then
  while IFS= read -r file; do
    file=$(echo "$file" | tr -d '"')
    if [[ -f "$file" ]]; then
      rm -f "$file"
      success "Removed: $file"
    else
      info "Already gone: $file"
    fi
  done < <(jq -r '.createdFiles[]' "$MANIFEST_FILE" 2>/dev/null)
else
  warn "Falling back to known paths removal"
  rm -f "$OPENCODE_PLUGIN_DIR/pai-unified.ts" 2>/dev/null || true
  rm -f "$OPENCODE_PLUGIN_DIR/dist/pai-unified.js" 2>/dev/null || true
  rm -f "$OPENCODE_PLUGIN_DIR/package.json" 2>/dev/null || true
  rm -f "$OPENCODE_PLUGIN_DIR/adapter-config.json" 2>/dev/null || true
  rm -f "$HOME/.config/opencode/pai-adapter.json" 2>/dev/null || true
fi

section "Removing Directories"

if command -v jq &>/dev/null && [[ -f "$MANIFEST_FILE" ]]; then
  while IFS= read -r dir; do
    dir=$(echo "$dir" | tr -d '"')
    if [[ -d "$dir" ]] && [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
      rmdir "$dir" 2>/dev/null && success "Removed empty dir: $dir" || true
    elif [[ -d "$dir" ]]; then
      info "Skipped non-empty dir: $dir"
    fi
  done < <(jq -r '.createdDirs[]' "$MANIFEST_FILE" 2>/dev/null | sort -r)
else
  rmdir "$OPENCODE_PLUGIN_DIR/dist" 2>/dev/null || true
  rmdir "$OPENCODE_PLUGIN_DIR" 2>/dev/null || true
fi

section "Restoring Modified Files"

TMUX_CONF="$HOME/.tmux.conf"
TMUX_BACKUP="$HOME/.tmux.conf.bak"

if [[ -f "$TMUX_BACKUP" ]]; then
  cp "$TMUX_BACKUP" "$TMUX_CONF"
  rm -f "$TMUX_BACKUP"
  success "Restored tmux.conf from backup"
else
  info "No tmux.conf backup found (may not have been modified)"
fi

# Remove pai-adapter.json (plugin-specific config)
PAI_ADAPTER_CONFIG="$HOME/.config/opencode/pai-adapter.json"
if [[ -f "$PAI_ADAPTER_CONFIG" ]]; then
  rm -f "$PAI_ADAPTER_CONFIG"
  success "Removed pai-adapter.json"
else
  info "No pai-adapter.json found"
fi

# Clean opencode.json — remove pai-opencode-adapter plugin entry (don't restore from backup)
OC_CONFIG=""
if command -v jq &>/dev/null && [[ -f "$MANIFEST_FILE" ]]; then
  OC_CONFIG=$(jq -r '.opencodeConfig // ""' "$MANIFEST_FILE")
fi
# Fallback to default location
OC_CONFIG="${OC_CONFIG:-$HOME/.config/opencode/opencode.json}"

if [[ -f "$OC_CONFIG" ]] && command -v jq &>/dev/null; then
  # Remove the pai-opencode-adapter plugin entry from the plugin array
  UPDATED=$(jq 'if .plugin then .plugin = [.plugin[] | select(. != "pai-opencode-adapter" and (contains("pai-opencode-adapter") | not))] else . end' "$OC_CONFIG" 2>/dev/null)
  if [[ -n "$UPDATED" ]]; then
    echo "$UPDATED" > "$OC_CONFIG"
    success "Removed PAI plugin entry from opencode.json"
  fi
  # Remove any stale "pai" key that might have been left from old installs
  UPDATED=$(jq 'del(.pai)' "$OC_CONFIG" 2>/dev/null)
  if [[ -n "$UPDATED" ]]; then
    echo "$UPDATED" > "$OC_CONFIG"
  fi
  # Clean up backup files
  rm -f "${OC_CONFIG}.bak-"* 2>/dev/null && info "Removed opencode.json backup files" || true
elif [[ -f "$OC_CONFIG" ]]; then
  warn "jq not available — cannot automatically clean opencode.json"
  warn "Manually remove 'pai-opencode-adapter' from the plugin array in: $OC_CONFIG"
fi

section "Cleanup"

rm -f "$MANIFEST_FILE" 2>/dev/null && success "Removed manifest" || true

if [[ -d "$OPENCODE_PLUGIN_DIR" ]] && [[ -z "$(ls -A "$OPENCODE_PLUGIN_DIR" 2>/dev/null)" ]]; then
  rmdir "$OPENCODE_PLUGIN_DIR" && success "Removed plugin directory" || true
elif [[ -d "$OPENCODE_PLUGIN_DIR" ]]; then
  info "Plugin directory not empty, leaving: $OPENCODE_PLUGIN_DIR"
fi

echo ""
echo -e "${STEEL}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓${RESET}"
echo ""
echo -e "    ${GREEN}${BOLD}✓ Uninstall complete${RESET}"
echo ""
echo -e "    ${GRAY}Adapter plugin removed. OpenCode and PAI are unchanged.${RESET}"
echo ""
echo -e "    ${GRAY}To reinstall: bash scripts/install.sh${RESET}"
echo ""
echo -e "${STEEL}┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${RESET}"
echo ""
