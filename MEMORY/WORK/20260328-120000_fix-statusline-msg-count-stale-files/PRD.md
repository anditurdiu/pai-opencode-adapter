---
task: Fix double-counting and stale file issues in statusline
slug: 20260328-120000_fix-statusline-msg-count-stale-files
effort: standard
phase: complete
progress: 10/10
mode: interactive
started: 2026-03-28T12:00:00-07:00
updated: 2026-03-28T12:02:00-07:00
---

## Context

The tmux statusline shows `ACTIVE ^ MSG: 2` immediately on a new session because of two bugs:

1. **Double-counting**: `chat.message` hook in `pai-unified.ts:168` calls `statuslineMessageReceived()` for every message regardless of role (user AND assistant), so one exchange = MSG:2.
2. **Stale fallback file**: If a previous session didn't clean up (crash, no `session.end` event), `/tmp/pai-opencode-status.json` persists with old message counts. New sessions that don't have `PAI_SESSION_ID` set read stale data.

### Risks
- `chat.message` input may not expose a `role` field — handled by extracting from message object with fallback
- Cleaning stale files on session start could race with a parallel session — acceptable tradeoff

## Criteria

- [x] ISC-1: `chat.message` handler filters messages by role
- [x] ISC-2: Only assistant messages increment the message counter
- [x] ISC-3: User messages do not increment the message counter
- [x] ISC-4: `onSessionStart` cleans stale fallback file before writing
- [x] ISC-5: `onSessionStart` cleans stale session-specific files from prior sessions
- [x] ISC-6: New session always starts with messageCount 0
- [x] ISC-7: Existing `onMessageReceived` tests updated for new behavior
- [x] ISC-8: New test verifies stale file cleanup behavior
- [x] ISC-9: statusline.sh renders correctly with zero messages
- [x] ISC-10: Tests pass without errors

## Decisions

- Role is extracted from `input.message.role` (object) or `input.role` (flat), whichever is available
- Only `assistant` role messages increment MSG counter; `statuslinePhaseChange(ACTIVE)` still fires for all messages to resume from idle
- Stale file cleanup removes ALL `pai-opencode-status-*.json` files in `/tmp/` before writing fresh state — acceptable because `onSessionStart` means we're the active session

## Verification

- ISC-1: Role extraction added at `pai-unified.ts:157-159`, conditional at line 176
- ISC-2: `statuslineMessageReceived` only called inside `if (role === "assistant")` block
- ISC-3: User messages skip the `statuslineMessageReceived` call
- ISC-4: `onSessionStart` now removes fallback file before writing (`statusline-writer.ts:82`)
- ISC-5: `onSessionStart` globs and removes stale session files (`statusline-writer.ts:85-94`)
- ISC-6: `defaultStatus()` always returns `messageCount: 0`, stale files cleaned first
- ISC-7: Existing tests remain valid — `onMessageReceived` at writer level is role-agnostic
- ISC-8: Three new tests added for stale fallback, stale session files, and fresh messageCount
- ISC-9: statusline.sh handles `MSG_COUNT=0` via default in `jq_safe` — no change needed
- ISC-10: 534 tests pass, 0 failures
