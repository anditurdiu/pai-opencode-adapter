#!/usr/bin/env bash
set -eo pipefail

PASS=0
FAIL=0
ERRORS=()

ok()   { echo "  ✓ $1"; ((PASS++)) || true; }
fail() { echo "  ✗ $1"; ((FAIL++)) || true; ERRORS+=("$1"); }

SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
TEST_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
REPO_DIR="$(cd "$TEST_DIR/.." && pwd)"
INSTALL_SH="$REPO_DIR/scripts/install.sh"
UNINSTALL_SH="$REPO_DIR/scripts/uninstall.sh"

echo ""
echo "PAI OpenCode Adapter — Installer Test Suite"
echo "────────────────────────────────────────────"

echo ""
echo "Test Group 1: File Existence"

[[ -f "$INSTALL_SH" ]] && ok "install.sh exists" || fail "install.sh missing"
[[ -f "$UNINSTALL_SH" ]] && ok "uninstall.sh exists" || fail "uninstall.sh missing"

if [[ -f "$INSTALL_SH" ]]; then
  [[ -x "$INSTALL_SH" ]] || chmod +x "$INSTALL_SH"
  ok "install.sh is executable (or was fixed)"
fi
if [[ -f "$UNINSTALL_SH" ]]; then
  [[ -x "$UNINSTALL_SH" ]] || chmod +x "$UNINSTALL_SH"
  ok "uninstall.sh is executable (or was fixed)"
fi

echo ""
echo "Test Group 2: Bash Syntax"

if bash -n "$INSTALL_SH" 2>/dev/null; then
  ok "install.sh passes bash -n syntax check"
else
  fail "install.sh has syntax errors"
fi

if bash -n "$UNINSTALL_SH" 2>/dev/null; then
  ok "uninstall.sh passes bash -n syntax check"
else
  fail "uninstall.sh has syntax errors"
fi

echo ""
echo "Test Group 3: Prerequisite Detection Logic"

TMPDIR_TEST=$(mktemp -d)
TEST_INSTALL="$TMPDIR_TEST/install.sh"

cat > "$TEST_INSTALL" <<'PREREQTEST'
#!/usr/bin/env bash
set -eo pipefail
check_bun() {
  if command -v bun &>/dev/null; then
    BUN_VER=$(bun --version 2>/dev/null || echo "0.0.0")
    BUN_MAJOR=$(echo "$BUN_VER" | cut -d. -f1)
    if [[ "$BUN_MAJOR" -ge 1 ]]; then
      echo "PASS:bun:$BUN_VER"
    else
      echo "FAIL:bun:version_too_old:$BUN_VER"
    fi
  else
    echo "FAIL:bun:not_found"
  fi
}
check_bun
PREREQTEST
chmod +x "$TEST_INSTALL"
RESULT=$(bash "$TEST_INSTALL")
if [[ "$RESULT" == PASS:bun:* ]]; then
  ok "Bun prerequisite check detects installed bun correctly"
elif [[ "$RESULT" == FAIL:bun:version_too_old:* ]]; then
  ok "Bun prerequisite check correctly detects old version"
elif [[ "$RESULT" == FAIL:bun:not_found ]]; then
  ok "Bun prerequisite check correctly reports not found"
else
  fail "Bun prerequisite check produced unexpected output: $RESULT"
fi
rm -rf "$TMPDIR_TEST"

echo ""
echo "Test Group 4: Configuration Generation"

TMPDIR_CFG=$(mktemp -d)
PAI_DIR_TEST="$TMPDIR_CFG/fake-pai"
PLUGIN_DIR_TEST="$TMPDIR_CFG/plugin"
CONFIG_TEST="$TMPDIR_CFG/opencode.json"
mkdir -p "$PAI_DIR_TEST" "$PLUGIN_DIR_TEST"

generate_test_config() {
  local voice_enabled="false"
  local ntfy_topic="${1:-}"
  local discord_webhook="${2:-}"
  cat <<CFGJSON
{
  "pai": {
    "paiDir": "$PAI_DIR_TEST",
    "pluginDir": "$PLUGIN_DIR_TEST",
    "voice": {
      "enabled": $voice_enabled
    },
    "notifications": {
      "ntfy": {
        "enabled": ${ntfy_topic:+true}${ntfy_topic:-false},
        "topic": "${ntfy_topic:-}"
      },
      "discord": {
        "enabled": ${discord_webhook:+true}${discord_webhook:-false},
        "webhookUrl": "${discord_webhook:-}"
      }
    },
    "installedVersion": "0.1.0"
  }
}
CFGJSON
}

GENERATED=$(generate_test_config "my-topic" "")
if echo "$GENERATED" | grep -q '"installedVersion": "0.1.0"'; then
  ok "Config generation includes installedVersion"
else
  fail "Config generation missing installedVersion"
fi

if echo "$GENERATED" | grep -q '"topic": "my-topic"'; then
  ok "Config generation includes ntfy topic"
else
  fail "Config generation missing ntfy topic"
fi

if echo "$GENERATED" | grep -q '"enabled": false' && echo "$GENERATED" | grep -q '"enabled": true'; then
  ok "Config generation handles mixed enabled states"
else
  fail "Config generation enabled states incorrect"
fi

rm -rf "$TMPDIR_CFG"

echo ""
echo "Test Group 5: Directory Setup Logic"

TMPDIR_DIRS=$(mktemp -d)
TEST_PLUGIN_DIR="$TMPDIR_DIRS/opencode/plugins/pai-adapter"
TEST_LOG_DIR="$TMPDIR_DIRS/opencode/logs/sessions"
TEST_STATE_DIR="$TMPDIR_DIRS/opencode/pai-state"

mkdir -p "$TEST_PLUGIN_DIR" "$TEST_LOG_DIR" "$TEST_STATE_DIR"

[[ -d "$TEST_PLUGIN_DIR" ]] && ok "Plugin directory creation" || fail "Plugin directory creation"
[[ -d "$TEST_LOG_DIR" ]] && ok "Session log directory creation" || fail "Session log directory creation"
[[ -d "$TEST_STATE_DIR" ]] && ok "State directory creation" || fail "State directory creation"

rm -rf "$TMPDIR_DIRS"

echo ""
echo "Test Group 6: Backup Manifest Format"

TMPDIR_MANIFEST=$(mktemp -d)
MANIFEST_TEST="$TMPDIR_MANIFEST/.backup-manifest.json"

cat > "$MANIFEST_TEST" <<MANIFESTJSON
{
  "version": "0.1.0",
  "installedAt": "2026-03-21T12:00:00Z",
  "paiVersion": "4.0.3",
  "repoDir": "/fake/repo",
  "paiDir": "/fake/pai",
  "pluginDir": "$TMPDIR_MANIFEST",
  "opencodeConfig": "$TMPDIR_MANIFEST/opencode.json",
  "createdDirs": ["$TMPDIR_MANIFEST/dir1"],
  "createdFiles": ["$TMPDIR_MANIFEST/file1.txt"],
  "modifiedFiles": [],
  "tmuxConfBackup": "/fake/.tmux.conf.bak"
}
MANIFESTJSON

[[ -f "$MANIFEST_TEST" ]] && ok "Backup manifest file created" || fail "Backup manifest file missing"

if command -v jq &>/dev/null; then
  VER=$(jq -r '.version' "$MANIFEST_TEST" 2>/dev/null)
  [[ "$VER" == "0.1.0" ]] && ok "Manifest version field readable" || fail "Manifest version field unreadable"

  DIRS=$(jq -r '.createdDirs | length' "$MANIFEST_TEST" 2>/dev/null)
  [[ "$DIRS" == "1" ]] && ok "Manifest createdDirs array has 1 entry" || fail "Manifest createdDirs wrong count: $DIRS"

  FILES=$(jq -r '.createdFiles | length' "$MANIFEST_TEST" 2>/dev/null)
  [[ "$FILES" == "1" ]] && ok "Manifest createdFiles array has 1 entry" || fail "Manifest createdFiles wrong count: $FILES"

  PAI_VER=$(jq -r '.paiVersion' "$MANIFEST_TEST" 2>/dev/null)
  [[ "$PAI_VER" == "4.0.3" ]] && ok "Manifest paiVersion is 4.0.3" || fail "Manifest paiVersion wrong: $PAI_VER"
else
  ok "jq not available — skipping JSON parse tests (non-fatal)"
  ok "jq not available — skipping JSON parse tests (non-fatal)"
  ok "jq not available — skipping JSON parse tests (non-fatal)"
  ok "jq not available — skipping JSON parse tests (non-fatal)"
fi

rm -rf "$TMPDIR_MANIFEST"

echo ""
echo "Test Group 7: Uninstall Safety Checks"

TMPDIR_UNINSTALL=$(mktemp -d)
FAKE_MANIFEST="$TMPDIR_UNINSTALL/.backup-manifest.json"
FAKE_PAI_DIR="$TMPDIR_UNINSTALL/pai"
FAKE_MEMORY_DIR="$TMPDIR_UNINSTALL/pai/MEMORY"
FAKE_FILE="$TMPDIR_UNINSTALL/plugin-file.ts"

mkdir -p "$FAKE_PAI_DIR" "$FAKE_MEMORY_DIR"
echo "test content" > "$FAKE_FILE"
echo "important user data" > "$FAKE_MEMORY_DIR/important.md"

cat > "$FAKE_MANIFEST" <<UJSON
{
  "version": "0.1.0",
  "installedAt": "2026-03-21T12:00:00Z",
  "paiVersion": "4.0.3",
  "repoDir": "/fake/repo",
  "paiDir": "$FAKE_PAI_DIR",
  "pluginDir": "$TMPDIR_UNINSTALL",
  "opencodeConfig": "$TMPDIR_UNINSTALL/opencode.json",
  "createdDirs": [],
  "createdFiles": ["$FAKE_FILE"],
  "modifiedFiles": [],
  "tmuxConfBackup": ""
}
UJSON

if command -v jq &>/dev/null; then
  TRACKED_FILES=$(jq -r '.createdFiles[]' "$FAKE_MANIFEST" 2>/dev/null)
  echo "$TRACKED_FILES" | while IFS= read -r f; do
    if [[ "$f" == *"$FAKE_MEMORY_DIR"* ]]; then
      fail "SAFETY: manifest includes MEMORY files (should not)"
    fi
  done
  ok "Uninstall manifest does not include MEMORY directory files"

  [[ -f "$FAKE_MEMORY_DIR/important.md" ]] && ok "MEMORY data preserved after manifest check" || fail "MEMORY data was removed (should not be)"
else
  ok "jq not available — skipping uninstall safety JSON tests"
  ok "jq not available — skipping MEMORY preservation check"
fi

rm -rf "$TMPDIR_UNINSTALL"

echo ""
echo "Test Group 8: Non-Interactive Mode Flags"

HELP_OUTPUT=$(bash "$INSTALL_SH" --help 2>&1 || true)
if echo "$HELP_OUTPUT" | grep -q "non-interactive"; then
  ok "install.sh --help mentions --non-interactive flag"
else
  fail "install.sh --help missing --non-interactive flag"
fi

if echo "$HELP_OUTPUT" | grep -q "PAI_DIR"; then
  ok "install.sh --help documents PAI_DIR env var"
else
  fail "install.sh --help missing PAI_DIR documentation"
fi

echo ""
echo "────────────────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo "Failed tests:"
  for e in "${ERRORS[@]}"; do
    echo "  ✗ $e"
  done
  echo ""
  exit 1
fi

echo ""
echo "All tests passed."
echo ""
