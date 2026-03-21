#!/usr/bin/env bash
# PAI OpenCode Adapter — CLI Shim
# Intercepts `claude` commands and translates to `opencode` equivalents

set -eo pipefail

# ─── Resolve Script Directory ─────────────────────────────
# Follow symlinks so the shim works from anywhere
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"

# ─── Configuration ────────────────────────────────────────
DRY_RUN=false
PAI_BYPASS=false
declare -a WARNINGS=()
declare -a PASSTHROUGH_FLAGS=()
declare -a TRANSLATED_ARGS=()

# ─── Helper Functions ─────────────────────────────────────
print_help() {
  cat <<EOF
PAI OpenCode Adapter — CLI Shim

Usage: $(basename "$0") [OPTIONS] [COMMAND]

Intercepts claude commands and translates to opencode equivalents.

Options:
  --dry-run             Print translated command without executing
  --pai-bypass          Skip translation, run original claude if exists
  -h, --help            Show this help message

Flag Translations:
  --model <model>       Passed through (opencode uses same flag)
  --allowedTools        Warned (no direct equivalent in opencode)
  --dangerously-skip-permissions  Warned (not needed with PAI security)

Commands:
  claude chat           Translates to: opencode
  claude config         Translates to: editor ~/.config/opencode/opencode.json

Unknown flags are warned and passed through to opencode.

Examples:
  $(basename "$0") --dry-run chat "hello"
  $(basename "$0") --model claude-sonnet-4-5 chat "build a feature"
  $(basename "$0") --pai-bypass chat "test"

EOF
}

warn() {
  echo "[PAI CLI SHIM] Warning: $1" >&2
  WARNINGS+=("$1")
}

info() {
  echo "[PAI CLI SHIM] $1"
}

# ─── Parse Arguments ──────────────────────────────────────
COMMAND=""
COMMAND_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --pai-bypass)
      PAI_BYPASS=true
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    --model)
      # Pass through to opencode (same flag name)
      TRANSLATED_ARGS+=("--model" "$2")
      shift 2
      ;;
    --allowedTools)
      warn "--allowedTools has no direct equivalent in opencode (passed through)"
      TRANSLATED_ARGS+=("$1" "$2")
      shift 2
      ;;
    --dangerously-skip-permissions)
      warn "--dangerously-skip-permissions is not needed with PAI security hooks (passed through)"
      TRANSLATED_ARGS+=("$1")
      shift
      ;;
    --*)
      # Unknown flag - warn and pass through
      warn "unrecognized flag: $1 (passing through)"
      PASSTHROUGH_FLAGS+=("$1")
      # Check if this flag takes an argument
      if [[ $# -gt 1 && ! "$2" =~ ^- ]]; then
        PASSTHROUGH_FLAGS+=("$2")
        shift
      fi
      shift
      ;;
    chat)
      COMMAND="chat"
      shift
      # Remaining args are chat message/args
      COMMAND_ARGS+=("$@")
      break
      ;;
    config)
      COMMAND="config"
      shift
      break
      ;;
    *)
      # Treat as command or argument
      if [[ -z "$COMMAND" ]]; then
        COMMAND="$1"
      else
        COMMAND_ARGS+=("$1")
      fi
      shift
      ;;
  esac
done

# ─── Translate Command ────────────────────────────────────
build_opencode_command() {
  local cmd=("opencode")
  
  # Add translated args
  cmd+=("${TRANSLATED_ARGS[@]}")
  
  # Add passthrough flags
  cmd+=("${PASSTHROUGH_FLAGS[@]}")
  
  # Handle command translation
  case "$COMMAND" in
    chat)
      # Direct launch with message
      if [[ ${#COMMAND_ARGS[@]} -gt 0 ]]; then
        cmd+=("${COMMAND_ARGS[@]}")
      fi
      ;;
    config)
      # Open config in editor
      cmd=("${EDITOR:-vi}" "$HOME/.config/opencode/opencode.json")
      ;;
    "")
      # No command - just launch opencode
      ;;
    *)
      # Unknown claude command - pass through
      cmd+=("$COMMAND" "${COMMAND_ARGS[@]}")
      ;;
  esac
  
  echo "${cmd[@]}"
}

# ─── Execute ──────────────────────────────────────────────
if [[ "$PAI_BYPASS" == true ]]; then
  info "Bypass mode enabled - skipping translation"
  
  if command -v claude &> /dev/null; then
    if [[ "$DRY_RUN" == true ]]; then
      info "[DRY-RUN] Would execute: claude ${*}"
      exit 0
    else
      exec claude "$@"
    fi
  else
    echo "[PAI CLI SHIM] Error: claude binary not found and --pai-bypass enabled" >&2
    exit 1
  fi
fi

# Build translated command
OPENCODE_CMD=($(build_opencode_command))

if [[ "$DRY_RUN" == true ]]; then
  info "Translated command:"
  echo "${OPENCODE_CMD[*]}"
  exit 0
fi

# Execute translated command
info "Executing: ${OPENCODE_CMD[*]}"
exec "${OPENCODE_CMD[@]}"
