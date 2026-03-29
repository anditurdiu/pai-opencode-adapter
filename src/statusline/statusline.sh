#!/usr/bin/env bash
# PAI-OpenCode Adapter — tmux StatusLine v2
# Renders a rich PAI status bar from session state JSON
# Called by tmux every 2 seconds: set -g status-interval 2
#
# Design:  PAI  👁️ OBSERVE  ▰▰▱▱▱▱ 2/12  EXT  ▕████░░░░░▏ 35%  4m
# Idle:    PAI  ◆ READY  ▕░░░░░░░░░░▏ 0%  0m

SESSION_ID="${PAI_SESSION_ID:-}"
FALLBACK_FILE="/tmp/pai-opencode-status.json"
IDLE_DISPLAY="#[fg=colour39,bold] PAI #[fg=colour245] ◆ READY#[default]"

# Require jq
if ! command -v jq &>/dev/null; then
  echo "$IDLE_DISPLAY"
  exit 0
fi

# Find status file — session-specific first, then fallback
if [[ -n "$SESSION_ID" ]] && [[ -f "/tmp/pai-opencode-status-${SESSION_ID}.json" ]]; then
  STATUS_FILE="/tmp/pai-opencode-status-${SESSION_ID}.json"
elif [[ -f "$FALLBACK_FILE" ]]; then
  STATUS_FILE="$FALLBACK_FILE"
else
  echo "$IDLE_DISPLAY"
  exit 0
fi

# Safe JSON field reader
jq_safe() {
  local key="$1" default="$2" val
  val=$(jq -r "$key // empty" "$STATUS_FILE" 2>/dev/null)
  echo "${val:-$default}"
}

# ── Read all fields ──────────────────────────────────────
PHASE=$(jq_safe '.phase' "IDLE")
ALG_PHASE=$(jq_safe '.algorithmPhase' "")
MSG_COUNT=$(jq_safe '.messageCount' "0")
TOK_USED=$(jq_safe '.tokenUsage.used' "0")
TOK_LIMIT=$(jq_safe '.tokenUsage.limit' "200000")
DURATION_S=$(jq_safe '.duration' "0")
EFFORT=$(jq_safe '.effortLevel' "")
TASK_DESC=$(jq_safe '.taskDescription' "")
ISC_CHECKED=$(jq_safe '.iscProgress.checked' "0")
ISC_TOTAL=$(jq_safe '.iscProgress.total' "0")
ACTIVE_AGENT=$(jq_safe '.activeAgent' "")

# Use algorithmPhase if available, otherwise fall back to phase
DISPLAY_PHASE="${ALG_PHASE:-$PHASE}"

# ── Derived values ───────────────────────────────────────
if [[ "$TOK_LIMIT" -gt 0 ]]; then
  TOK_PCT=$(( TOK_USED * 100 / TOK_LIMIT ))
else
  TOK_PCT=0
fi

DURATION_M=$(( DURATION_S / 60 ))

# ── Phase emoji + color mapping ──────────────────────────
phase_emoji() {
  case "$1" in
    OBSERVE)  echo "👁️" ;;
    THINK)    echo "🧠" ;;
    PLAN)     echo "📋" ;;
    BUILD)    echo "🔨" ;;
    EXECUTE)  echo "⚡" ;;
    VERIFY)   echo "✅" ;;
    LEARN)    echo "📚" ;;
    COMPLETE) echo "✅" ;;
    ACTIVE)   echo "●" ;;
    IDLE)     echo "◆" ;;
    *)        echo "●" ;;
  esac
}

phase_color() {
  case "$1" in
    OBSERVE)  echo "colour39"  ;;  # blue
    THINK)    echo "colour141" ;;  # purple
    PLAN)     echo "colour178" ;;  # gold
    BUILD)    echo "colour208" ;;  # orange
    EXECUTE)  echo "colour220" ;;  # yellow
    VERIFY)   echo "colour78"  ;;  # green
    LEARN)    echo "colour51"  ;;  # cyan
    COMPLETE) echo "colour78"  ;;  # green
    ACTIVE)   echo "colour252" ;;  # white
    IDLE)     echo "colour245" ;;  # grey
    *)        echo "colour252" ;;
  esac
}

# Context bar color: green < 50%, yellow 50-80%, red > 80%
ctx_color() {
  local pct="$1"
  if [[ "$pct" -ge 80 ]]; then
    echo "colour196"  # red
  elif [[ "$pct" -ge 50 ]]; then
    echo "colour220"  # yellow
  else
    echo "colour78"   # green
  fi
}

# ── Effort level abbreviation ────────────────────────────
effort_abbrev() {
  case "$1" in
    STANDARD)      echo "STD" ;;
    EXTENDED)      echo "EXT" ;;
    ADVANCED)      echo "ADV" ;;
    DEEP)          echo "DEEP" ;;
    COMPREHENSIVE) echo "COMP" ;;
    *)             echo "" ;;
  esac
}

# ── Build context progress bar ───────────────────────────
# 16-char visual bar: ▕████████░░░░░░░░▏
build_ctx_bar() {
  local pct="$1"
  local width=16
  local filled=$(( pct * width / 100 ))
  local empty=$(( width - filled ))
  local bar="▕"
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done
  bar+="▏"
  echo "$bar"
}

# ── Build ISC progress blocks ────────────────────────────
# Shows ▰▰▰▱▱▱ style progress (max 8 blocks for readability)
build_isc_blocks() {
  local checked="$1" total="$2"
  if [[ "$total" -eq 0 ]]; then
    echo ""
    return
  fi
  local max_blocks=8
  local filled=$(( checked * max_blocks / total ))
  local empty=$(( max_blocks - filled ))
  local blocks=""
  for ((i=0; i<filled; i++)); do blocks+="▰"; done
  for ((i=0; i<empty; i++)); do blocks+="▱"; done
  echo "$blocks"
}

# ── Truncate task description ────────────────────────────
truncate_task() {
  local desc="$1" max="$2"
  if [[ ${#desc} -gt $max ]]; then
    echo "${desc:0:$((max-1))}…"
  else
    echo "$desc"
  fi
}

# ── Assemble status bar ─────────────────────────────────

P_EMOJI=$(phase_emoji "$DISPLAY_PHASE")
P_COLOR=$(phase_color "$DISPLAY_PHASE")
C_COLOR=$(ctx_color "$TOK_PCT")
CTX_BAR=$(build_ctx_bar "$TOK_PCT")
EFF_ABBR=$(effort_abbrev "$EFFORT")

OUT=""

# ── Left: PAI branding ──────────────────────────────────
OUT+="#[fg=colour39,bold] PAI #[default]"

# ── Phase section ────────────────────────────────────────
OUT+="#[fg=${P_COLOR},bold] ${P_EMOJI} ${DISPLAY_PHASE}#[default]"

# ── ISC progress (only when Algorithm is running) ────────
if [[ "$ISC_TOTAL" -gt 0 ]]; then
  ISC_BLOCKS=$(build_isc_blocks "$ISC_CHECKED" "$ISC_TOTAL")
  OUT+="#[fg=colour245]  ${ISC_BLOCKS} ${ISC_CHECKED}/${ISC_TOTAL}#[default]"
fi

# ── Effort level ─────────────────────────────────────────
if [[ -n "$EFF_ABBR" ]]; then
  OUT+="#[fg=colour178,bold]  ${EFF_ABBR}#[default]"
fi

# ── Task description (truncated) ─────────────────────────
if [[ -n "$TASK_DESC" ]]; then
  TRUNC_TASK=$(truncate_task "$TASK_DESC" 28)
  OUT+="#[fg=colour245]  ${TRUNC_TASK}#[default]"
fi

# ── Context bar ──────────────────────────────────────────
OUT+="#[fg=${C_COLOR}]  ${CTX_BAR} ${TOK_PCT}%#[default]"

# ── Duration ─────────────────────────────────────────────
OUT+="#[fg=colour245]  ${DURATION_M}m#[default]"

echo "$OUT"
