#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  PAI OpenCode Adapter — Documentation Validation Script
#  MIT License — https://github.com/yourusername/pai-opencode-adapter
#
#  Validates that all documentation files exist and contain required sections.
#
#  Usage: bash tests/test-docs.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -o pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[38;2;34;197;94m'
RED='\033[38;2;239;68;68m'
YELLOW='\033[38;2;234;179;8m'
BLUE='\033[38;2;59;130;246m'
RESET='\033[0m'
BOLD='\033[1m'

# ─── Helpers ──────────────────────────────────────────────────────────────────
pass() { echo -e "  ${GREEN}✓${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $1"; }
info() { echo -e "  ${BLUE}ℹ${RESET} $1"; }
section() { echo -e "\n  ${BOLD}${BLUE}$1${RESET}\n"; }

# ─── Counters ─────────────────────────────────────────────────────────────────
PASSED=0
FAILED=0

check() {
  local name="$1"
  local result="$2"
  if [[ "$result" == "true" ]]; then
    pass "$name"
    ((PASSED++))
  else
    fail "$name"
    ((FAILED++))
  fi
}

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}PAI OpenCode Adapter — Documentation Validation${RESET}"
echo ""

# ─── Test 1: README.md exists ─────────────────────────────────────────────────
section "Test 1: README.md"

if [[ -f "README.md" ]]; then
  check "README.md exists" "true"
else
  check "README.md exists" "false"
fi

# ─── Test 2: README.md has all required sections ──────────────────────────────
section "Test 2: README.md Required Sections"

README_SECTIONS=(
  "## Overview"
  "## Architecture"
  "## Quick Start"
  "## Prerequisites"
  "## Configuration"
  "## Features"
  "## Self-Updater"
  "## Troubleshooting"
  "## Contributing"
  "## License"
)

for section in "${README_SECTIONS[@]}"; do
  if grep -q "^${section}$" README.md; then
    check "README.md has '${section}'" "true"
  else
    check "README.md has '${section}'" "false"
  fi
done

# ─── Test 3: README.md line count ─────────────────────────────────────────────
section "Test 3: README.md Size"

README_LINES=$(wc -l < README.md)
if [[ "$README_LINES" -ge 300 ]]; then
  check "README.md has ≥300 lines (actual: ${README_LINES})" "true"
else
  check "README.md has ≥300 lines (actual: ${README_LINES})" "false"
fi

# ─── Test 4: COMPATIBILITY.md exists ──────────────────────────────────────────
section "Test 4: COMPATIBILITY.md"

if [[ -f "COMPATIBILITY.md" ]]; then
  check "COMPATIBILITY.md exists" "true"
else
  check "COMPATIBILITY.md exists" "false"
fi

# ─── Test 5: COMPATIBILITY.md event mapping table ─────────────────────────────
section "Test 5: COMPATIBILITY.md Event Mapping Table"

# Count pipe-delimited data rows in event mapping table (excluding header and separator)
# Table starts after "## Event Mapping Table" and ends before "## Workaround Registry"
EVENT_TABLE_ROWS=$(awk '/^## Event Mapping Table$/,/^## Workaround Registry$/' COMPATIBILITY.md | grep -E "^\\|" | wc -l | tr -d ' ')
# Subtract 2 for header row and separator row
EVENT_TABLE_ROWS=$((EVENT_TABLE_ROWS - 2))

if [[ "$EVENT_TABLE_ROWS" -ge 20 ]]; then
  check "Event mapping table has ≥20 rows (actual: ${EVENT_TABLE_ROWS})" "true"
else
  check "Event mapping table has ≥20 rows (actual: ${EVENT_TABLE_ROWS})" "false"
fi

# ─── Test 6: COMPATIBILITY.md workaround registry ─────────────────────────────
section "Test 6: COMPATIBILITY.md Workaround Registry"

# Count pipe-delimited data rows in workaround registry table (excluding header and separator)
WORKAROUND_ROWS=$(awk '/^## Workaround Registry$/,/^## Known Limitations$/' COMPATIBILITY.md | grep -E "^\\|" | wc -l | tr -d ' ')
# Subtract 2 for header row and separator row
WORKAROUND_ROWS=$((WORKAROUND_ROWS - 2))

if [[ "$WORKAROUND_ROWS" -ge 5 ]]; then
  check "Workaround registry has ≥5 rows (actual: ${WORKAROUND_ROWS})" "true"
else
  check "Workaround registry has ≥5 rows (actual: ${WORKAROUND_ROWS})" "false"
fi

# ─── Test 7: docs/adr/ directory exists ───────────────────────────────────────
section "Test 7: ADR Directory"

if [[ -d "docs/adrs" ]]; then
  check "docs/adrs/ directory exists" "true"
else
  check "docs/adrs/ directory exists" "false"
fi

# ─── Test 8: Exactly 8 ADR files exist ────────────────────────────────────────
section "Test 8: ADR File Count"

ADR_COUNT=$(find docs/adrs/ -name "ADR-*.md" 2>/dev/null | wc -l)

if [[ "$ADR_COUNT" -eq 8 ]]; then
  check "Exactly 8 ADR files exist (actual: ${ADR_COUNT})" "true"
else
  check "Exactly 8 ADR files exist (actual: ${ADR_COUNT})" "false"
fi

# ─── Test 9: Each ADR has required sections ───────────────────────────────────
section "Test 9: ADR Required Sections"

ADR_REQUIRED_SECTIONS=(
  "## Status"
  "## Context"
  "## Decision"
  "## Consequences"
)

for adr_file in docs/adrs/ADR-*.md; do
  if [[ -f "$adr_file" ]]; then
    adr_name=$(basename "$adr_file")
    for section in "${ADR_REQUIRED_SECTIONS[@]}"; do
      if grep -q "^${section}$" "$adr_file"; then
        check "${adr_name} has '${section}'" "true"
      else
        check "${adr_name} has '${section}'" "false"
      fi
    done
  fi
done

# ─── Test 10: No ADR contains TODO ────────────────────────────────────────────
section "Test 10: ADR TODO Check"

for adr_file in docs/adrs/ADR-*.md; do
  if [[ -f "$adr_file" ]]; then
    adr_name=$(basename "$adr_file")
    if grep -qi "TODO" "$adr_file"; then
      check "${adr_name} contains no TODO" "false"
    else
      check "${adr_name} contains no TODO" "true"
    fi
  fi
done

# ─── Test 11: No README placeholder text ──────────────────────────────────────
section "Test 11: README Placeholder Check"

PLACEHOLDER_PATTERNS=(
  "TODO:"
  "Coming soon"
  "\\[details here\\]"
  "\\[TODO\\]"
  "fill in"
)

for pattern in "${PLACEHOLDER_PATTERNS[@]}"; do
  if grep -qi "$pattern" README.md; then
    check "README.md contains no '${pattern}'" "false"
  else
    check "README.md contains no '${pattern}'" "true"
  fi
done

# ─── Test 12: Internal file references exist ──────────────────────────────────
section "Test 12: Internal File References"

# Check that referenced files in README actually exist
README_REFS=(
  "LICENSE"
  "README.md"
  "COMPATIBILITY.md"
  "docs/adrs/ADR-001-adapter-not-fork.md"
  "docs/adrs/ADR-008-self-updater.md"
)

for ref in "${README_REFS[@]}"; do
  if [[ -f "$ref" ]]; then
    check "README reference '${ref}' exists" "true"
  else
    check "README reference '${ref}' exists" "false"
  fi
done

# ─── Summary ──────────────────────────────────────────────────────────────────
section "Summary"

TOTAL=$((PASSED + FAILED))

echo -e "  ${BOLD}Passed:${RESET} ${GREEN}${PASSED}${RESET}"
echo -e "  ${BOLD}Failed:${RESET} ${RED}${FAILED}${RESET}"
echo -e "  ${BOLD}Total:${RESET}  ${TOTAL}"
echo ""

if [[ "$FAILED" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}✓ All documentation validation checks passed!${RESET}"
  echo ""
  exit 0
else
  echo -e "${RED}${BOLD}✗ ${FAILED} validation check(s) failed${RESET}"
  echo ""
  exit 1
fi
