#!/usr/bin/env bash
# PAI-OpenCode Adapter — tmux StatusLine
# Reads session state JSON and renders tmux-formatted status string
# Called by tmux every 2 seconds: set -g status-interval 2

SESSION_ID="${PAI_SESSION_ID:-}"
FALLBACK_FILE="/tmp/pai-opencode-status.json"
FALLBACK="[PAI: idle]"

if ! command -v jq &>/dev/null; then
  echo "$FALLBACK"
  exit 0
fi

# Try session-specific file first, then fallback to session-less file
if [[ -n "$SESSION_ID" ]] && [[ -f "/tmp/pai-opencode-status-${SESSION_ID}.json" ]]; then
  STATUS_FILE="/tmp/pai-opencode-status-${SESSION_ID}.json"
elif [[ -f "$FALLBACK_FILE" ]]; then
  STATUS_FILE="$FALLBACK_FILE"
else
  echo "$FALLBACK"
  exit 0
fi

jq_safe() {
  local key="$1"
  local default="$2"
  local val
  val=$(jq -r "$key // empty" "$STATUS_FILE" 2>/dev/null)
  echo "${val:-$default}"
}

PHASE=$(jq_safe '.phase' "IDLE")
MSG_COUNT=$(jq_safe '.messageCount' "0")
LEARN_POS=$(jq_safe '.learningSignals.positive' "0")
LEARN_NEG=$(jq_safe '.learningSignals.negative' "0")
TOK_USED=$(jq_safe '.tokenUsage.used' "0")
TOK_LIMIT=$(jq_safe '.tokenUsage.limit' "200000")
PLAN_MODE=$(jq_safe '.planMode' "false")
ACTIVE_AGENT=$(jq_safe '.activeAgent' "")
DURATION_S=$(jq_safe '.duration' "0")

if [[ "$TOK_LIMIT" -gt 0 ]]; then
  TOK_PCT=$(( TOK_USED * 100 / TOK_LIMIT ))
else
  TOK_PCT=0
fi

# Format token counts as "Xk" for readability
TOK_USED_K=$(( TOK_USED / 1000 ))
TOK_LIMIT_K=$(( TOK_LIMIT / 1000 ))

DURATION_M=$(( DURATION_S / 60 ))

phase_color() {
  case "$1" in
    OBSERVE) echo "colour45" ;;
    THINK)   echo "colour99" ;;
    PLAN)    echo "colour226" ;;
    BUILD)   echo "colour46" ;;
    VERIFY)  echo "colour208" ;;
    LEARN)   echo "colour51" ;;
    *)       echo "colour252" ;;
  esac
}

tok_color() {
  local pct="$1"
  if [[ "$pct" -ge 80 ]]; then
    echo "colour196"
  elif [[ "$pct" -ge 50 ]]; then
    echo "colour226"
  else
    echo "colour46"
  fi
}

PHASE_CLR=$(phase_color "$PHASE")
TOK_CLR=$(tok_color "$TOK_PCT")

PARTS=""

PARTS+="#[fg=${PHASE_CLR},bold][${PHASE}]#[default] "
PARTS+="#[fg=colour252][MSG:${MSG_COUNT}]#[default] "

if [[ "$LEARN_POS" -gt 0 ]] || [[ "$LEARN_NEG" -gt 0 ]]; then
  PARTS+="#[fg=colour51][LEARN:+${LEARN_POS}/-${LEARN_NEG}]#[default] "
fi

PARTS+="#[fg=${TOK_CLR}][CTX:${TOK_USED_K}k/${TOK_LIMIT_K}k ${TOK_PCT}%]#[default] "

if [[ "$PLAN_MODE" == "true" ]]; then
  PARTS+="#[fg=colour226,bold][PLAN]#[default] "
fi

if [[ -n "$ACTIVE_AGENT" ]]; then
  PARTS+="#[fg=colour141][AGENT:${ACTIVE_AGENT}]#[default] "
fi

PARTS+="#[fg=colour252][DUR:${DURATION_M}m]#[default]"

echo "$PARTS"
