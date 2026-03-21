#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUSLINE="${SCRIPT_DIR}/../src/statusline/statusline.sh"
PASS=0
FAIL=0
ERRORS=()

assert_contains() {
  local test_name="$1"
  local output="$2"
  local expected="$3"
  if [[ "$output" == *"$expected"* ]]; then
    PASS=$(( PASS + 1 ))
    echo "  PASS: $test_name"
  else
    FAIL=$(( FAIL + 1 ))
    ERRORS+=("FAIL: $test_name — expected '$expected' in output: '$output'")
    echo "  FAIL: $test_name — expected '$expected'"
  fi
}

assert_not_contains() {
  local test_name="$1"
  local output="$2"
  local unexpected="$3"
  if [[ "$output" != *"$unexpected"* ]]; then
    PASS=$(( PASS + 1 ))
    echo "  PASS: $test_name"
  else
    FAIL=$(( FAIL + 1 ))
    ERRORS+=("FAIL: $test_name — unexpected '$unexpected' found in: '$output'")
    echo "  FAIL: $test_name — unexpected '$unexpected' found"
  fi
}

assert_equals() {
  local test_name="$1"
  local output="$2"
  local expected="$3"
  if [[ "$output" == "$expected" ]]; then
    PASS=$(( PASS + 1 ))
    echo "  PASS: $test_name"
  else
    FAIL=$(( FAIL + 1 ))
    ERRORS+=("FAIL: $test_name — expected '$expected', got '$output'")
    echo "  FAIL: $test_name — expected '$expected', got '$output'"
  fi
}

echo "=== statusline.sh tests ==="

echo ""
echo "--- Fallback behavior ---"

OUTPUT=$(PAI_SESSION_ID="" bash "$STATUSLINE")
assert_equals "empty SESSION_ID returns fallback" "$OUTPUT" "[PAI: idle]"

OUTPUT=$(PAI_SESSION_ID="nonexistent-session-xyz" bash "$STATUSLINE")
assert_equals "missing status file returns fallback" "$OUTPUT" "[PAI: idle]"

echo ""
echo "--- Normal status rendering ---"

TEST_SESSION="test-statusline-$$"
STATUS_FILE="/tmp/pai-opencode-status-${TEST_SESSION}.json"

cat > "$STATUS_FILE" <<'EOF'
{
  "phase": "BUILD",
  "messageCount": 42,
  "learningSignals": { "positive": 3, "negative": 1 },
  "tokenUsage": { "used": 25000, "limit": 100000 },
  "planMode": false,
  "activeAgent": "",
  "duration": 125
}
EOF

OUTPUT=$(PAI_SESSION_ID="$TEST_SESSION" bash "$STATUSLINE")

assert_contains "phase BUILD appears in output" "$OUTPUT" "[BUILD]"
assert_contains "message count appears" "$OUTPUT" "[MSG:42]"
assert_contains "learning signals appear" "$OUTPUT" "[LEARN:+3/-1]"
assert_contains "token usage appears" "$OUTPUT" "[TOK:25000/100000"
assert_contains "token percentage appears" "$OUTPUT" "25%"
assert_contains "duration appears" "$OUTPUT" "[DUR:2m]"
assert_not_contains "PLAN marker absent when planMode=false" "$OUTPUT" "[PLAN]"
assert_not_contains "AGENT marker absent when no activeAgent" "$OUTPUT" "[AGENT:"

echo ""
echo "--- Plan mode active ---"

cat > "$STATUS_FILE" <<'EOF'
{
  "phase": "PLAN",
  "messageCount": 5,
  "learningSignals": { "positive": 0, "negative": 0 },
  "tokenUsage": { "used": 1000, "limit": 100000 },
  "planMode": true,
  "activeAgent": "",
  "duration": 30
}
EOF

OUTPUT=$(PAI_SESSION_ID="$TEST_SESSION" bash "$STATUSLINE")
assert_contains "PLAN marker present when planMode=true" "$OUTPUT" "[PLAN]"
assert_contains "PLAN phase in output" "$OUTPUT" "[PLAN]"

echo ""
echo "--- Active agent ---"

cat > "$STATUS_FILE" <<'EOF'
{
  "phase": "BUILD",
  "messageCount": 10,
  "learningSignals": { "positive": 1, "negative": 0 },
  "tokenUsage": { "used": 5000, "limit": 100000 },
  "planMode": false,
  "activeAgent": "researcher",
  "duration": 60
}
EOF

OUTPUT=$(PAI_SESSION_ID="$TEST_SESSION" bash "$STATUSLINE")
assert_contains "agent name appears when set" "$OUTPUT" "[AGENT:researcher]"

echo ""
echo "--- Token percentage coloring thresholds ---"

cat > "$STATUS_FILE" <<'EOF'
{
  "phase": "OBSERVE",
  "messageCount": 0,
  "learningSignals": { "positive": 0, "negative": 0 },
  "tokenUsage": { "used": 85000, "limit": 100000 },
  "planMode": false,
  "activeAgent": "",
  "duration": 0
}
EOF

OUTPUT=$(PAI_SESSION_ID="$TEST_SESSION" bash "$STATUSLINE")
assert_contains "85% token usage renders" "$OUTPUT" "85%"

echo ""
echo "--- Learning signals omitted when zero ---"

cat > "$STATUS_FILE" <<'EOF'
{
  "phase": "IDLE",
  "messageCount": 1,
  "learningSignals": { "positive": 0, "negative": 0 },
  "tokenUsage": { "used": 0, "limit": 100000 },
  "planMode": false,
  "activeAgent": "",
  "duration": 0
}
EOF

OUTPUT=$(PAI_SESSION_ID="$TEST_SESSION" bash "$STATUSLINE")
assert_not_contains "LEARN marker absent when both signals are zero" "$OUTPUT" "[LEARN:"

echo ""
echo "--- Duration calculation ---"

cat > "$STATUS_FILE" <<'EOF'
{
  "phase": "BUILD",
  "messageCount": 0,
  "learningSignals": { "positive": 0, "negative": 0 },
  "tokenUsage": { "used": 0, "limit": 100000 },
  "planMode": false,
  "activeAgent": "",
  "duration": 180
}
EOF

OUTPUT=$(PAI_SESSION_ID="$TEST_SESSION" bash "$STATUSLINE")
assert_contains "180s renders as 3m" "$OUTPUT" "[DUR:3m]"

rm -f "$STATUS_FILE"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo "Failures:"
  for err in "${ERRORS[@]}"; do
    echo "  $err"
  done
fi

[[ $FAIL -eq 0 ]]
