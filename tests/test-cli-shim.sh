#!/usr/bin/env bash
# PAI OpenCode Adapter — CLI Shim Tests
# Test suite for cli-shim.sh

set -eo pipefail

# ─── Configuration ────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIM_PATH="$SCRIPT_DIR/../src/adapters/cli-shim.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ─── Helper Functions ─────────────────────────────────────
pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  ((TESTS_PASSED++)) || true
}

fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  ((TESTS_FAILED++)) || true
}

run_test() {
  local test_name="$1"
  local test_cmd="$2"
  local expected_in_output="$3"
  local expected_in_stderr="${4:-}"
  local should_not_contain="${5:-}"
  
  ((TESTS_RUN++)) || true
  echo ""
  echo "Test $TESTS_RUN: $test_name"
  echo "  Command: $test_cmd"
  
  # Run command and capture output
  local output
  local stderr_output
  local exit_code=0
  
  output=$(eval "$test_cmd" 2>&1) || exit_code=$?
  stderr_output=$(eval "$test_cmd" 2>&1 >/dev/null) || true
  
  # Check for expected content in output
  if [[ -n "$expected_in_output" ]]; then
    if echo "$output" | grep -q "$expected_in_output"; then
      : # Found expected content
    else
      fail "$test_name - expected output to contain '$expected_in_output'"
      echo "  Actual output: $output"
      return
    fi
  fi
  
  # Check for expected content in stderr
  if [[ -n "$expected_in_stderr" ]]; then
    if echo "$stderr_output" | grep -q "$expected_in_stderr"; then
      : # Found expected content in stderr
    else
      fail "$test_name - expected stderr to contain '$expected_in_stderr'"
      echo "  Actual stderr: $stderr_output"
      return
    fi
  fi
  
  # Check for content that should NOT be in output
  if [[ -n "$should_not_contain" ]]; then
    if echo "$output" | grep -q "$should_not_contain"; then
      fail "$test_name - output should NOT contain '$should_not_contain'"
      echo "  Actual output: $output"
      return
    fi
  fi
  
  pass "$test_name"
}

# ─── Test Suite ───────────────────────────────────────────
echo "========================================"
echo "PAI OpenCode Adapter — CLI Shim Tests"
echo "========================================"
echo ""
echo "Shim path: $SHIM_PATH"

# Verify shim exists
if [[ ! -f "$SHIM_PATH" ]]; then
  echo -e "${RED}ERROR: Shim not found at $SHIM_PATH${NC}"
  exit 1
fi

if [[ ! -x "$SHIM_PATH" ]]; then
  echo -e "${RED}ERROR: Shim is not executable${NC}"
  exit 1
fi

# Test 1: --dry-run chat should show opencode NOT claude
run_test \
  "Dry-run chat translates to opencode" \
  "bash $SHIM_PATH --dry-run chat 'hello'" \
  "opencode" \
  "" \
  "claude"

# Test 2: --model flag should be passed through without errors
run_test \
  "Model flag passed through without errors" \
  "bash $SHIM_PATH --dry-run --model claude-sonnet-4-5 chat 'test'" \
  "opencode"

# Test 3: Unknown flags generate warnings on stderr
output_with_stderr=$(bash "$SHIM_PATH" --dry-run --unknown-flag 2>&1)
if echo "$output_with_stderr" | grep -q "Warning.*unknown-flag"; then
  pass "Unknown flag generates warning on stderr"
else
  fail "Unknown flag should generate warning containing 'Warning' and 'unknown-flag'"
  echo "  Actual output: $output_with_stderr"
fi

# Test 4: Unknown flags still appear in output (not silently dropped)
if echo "$output_with_stderr" | grep -q "\-\-unknown-flag"; then
  pass "Unknown flag appears in output (not dropped)"
else
  fail "Unknown flag should appear in output"
  echo "  Actual output: $output_with_stderr"
fi

# Test 5: --pai-bypass indicates bypass mode
bypass_output=$(bash "$SHIM_PATH" --dry-run --pai-bypass 2>&1) || true
if echo "$bypass_output" | grep -qi "bypass"; then
  pass "Bypass mode indicated in output"
else
  fail "Bypass mode should be indicated in output"
  echo "  Actual output: $bypass_output"
fi

# Test 6: --allowedTools generates warning
tools_output=$(bash "$SHIM_PATH" --dry-run --allowedTools "mcp,fetch" 2>&1) || true
if echo "$tools_output" | grep -q "Warning.*allowedTools"; then
  pass "allowedTools flag generates warning"
else
  fail "allowedTools should generate warning"
  echo "  Actual output: $tools_output"
fi

# Test 7: --dangerously-skip-permissions generates warning
danger_output=$(bash "$SHIM_PATH" --dry-run --dangerously-skip-permissions 2>&1) || true
if echo "$danger_output" | grep -q "Warning.*dangerously-skip-permissions"; then
  pass "dangerously-skip-permissions flag generates warning"
else
  fail "dangerously-skip-permissions should generate warning"
  echo "  Actual output: $danger_output"
fi

# Test 8: Help flag works
if bash "$SHIM_PATH" --help 2>&1 | grep -q "PAI OpenCode Adapter"; then
  pass "Help flag displays usage information"
else
  fail "Help flag should display usage information"
fi

# ─── Summary ──────────────────────────────────────────────
echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Tests run:    $TESTS_RUN"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed.${NC}"
  exit 1
fi
