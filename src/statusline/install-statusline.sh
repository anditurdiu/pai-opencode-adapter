#!/usr/bin/env bash
# PAI-OpenCode Adapter — StatusLine tmux installer
# Adds statusline.sh call to ~/.tmux.conf

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUSLINE_PATH="${SCRIPT_DIR}/statusline.sh"
TMUX_CONF="${HOME}/.tmux.conf"
BACKUP="${TMUX_CONF}.pai-backup-$(date +%Y%m%d%H%M%S)"

if [[ ! -f "$STATUSLINE_PATH" ]]; then
  echo "ERROR: statusline.sh not found at $STATUSLINE_PATH" >&2
  exit 1
fi

chmod +x "$STATUSLINE_PATH"

if [[ -f "$TMUX_CONF" ]] && grep -q "pai-opencode" "$TMUX_CONF" 2>/dev/null; then
  echo "PAI StatusLine already configured in $TMUX_CONF"
  exit 0
fi

if [[ -f "$TMUX_CONF" ]]; then
  cp "$TMUX_CONF" "$BACKUP"
  echo "Backed up existing tmux.conf to $BACKUP"
fi

cat >> "$TMUX_CONF" <<EOF

# PAI-OpenCode Adapter StatusLine
set -g status-interval 2
set -g status-right '#(bash ${STATUSLINE_PATH})'
set -g status-right-length 120
EOF

echo "PAI StatusLine installed. Reload tmux config with: tmux source-file ~/.tmux.conf"
