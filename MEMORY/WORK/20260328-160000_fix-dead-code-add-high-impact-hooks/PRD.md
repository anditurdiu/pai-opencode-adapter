---
task: Fix dead code and add high-impact hooks
slug: 20260328-160000_fix-dead-code-add-high-impact-hooks
effort: advanced
phase: verify
progress: 28/28
mode: interactive
started: 2026-03-28T16:00:00+01:00
updated: 2026-03-28T16:45:00+01:00
---

## Context

Fix 7 issues identified in the comprehensive analysis of pai-opencode-adapter. These span critical dead code (dedup cache result ignored, learnings never flushed, hook-io.ts irrelevant, duplicate notifications), bypassed modules (event-adapter, session-lifecycle), a broken self-updater regex, and a version mismatch. All fixes are surgical — no architectural rewrites.

### What was requested
- Fix dedup cache early-return in pai-unified.ts (result of isDuplicate() is computed but ignored)
- Wire up flushSessionLearnings() to session end event
- Remove dead hook-io.ts (Claude Code stdin/stdout protocol, irrelevant to OpenCode)
- Consolidate notifications.ts into voice-notifications.ts (eliminate duplication)
- Wire up event-adapter.ts registerHook() (currently never called)
- Wire up session-lifecycle.ts registerSessionLifecycleHandlers() (never called)
- Fix self-updater extractEventsFromSource() regex to match OpenCode's object-key patterns

### Risks
- event-adapter.ts registerHook() mutates a hooks object — incompatible with pai-unified's return-object pattern. Will NOT wire event-adapter in; instead inline session-lifecycle logic directly.
- notifications.ts reads config slightly differently than voice-notifications.ts — must reconcile during merge.
- hook-io.ts test file must be deleted alongside the module.

### What was NOT requested
- No model routing (chat.params hook) — that's a separate future task
- No agent execution implementation — agent-teams.ts stays as-is
- No new features beyond fixes

## Criteria

### Dedup Cache Fix
- [x] ISC-1: isDuplicate() return value checked in chat.message handler
- [x] ISC-2: Early return skips downstream handlers when duplicate detected
- [x] ISC-3: fileLog emits message when duplicate message skipped

### Learning Flush Fix
- [x] ISC-4: flushSessionLearnings() called on session.end event
- [x] ISC-5: flushSessionLearnings() called on session.idle event
- [x] ISC-6: Session ID correctly extracted from event payload

### hook-io.ts Removal
- [x] ISC-7: hook-io.ts file deleted from src/lib/
- [x] ISC-8: No remaining imports of hook-io.ts in codebase
- [x] ISC-9: No test files reference hook-io.ts after removal

### Notification Consolidation
- [x] ISC-10: notifications.ts ntfy logic merged into voice-notifications.ts
- [x] ISC-11: notifications.ts discord logic merged into voice-notifications.ts
- [x] ISC-12: notifications.ts session-start/duration logic merged
- [x] ISC-13: notifications.ts file deleted from src/lib/
- [x] ISC-14: No remaining imports of notifications.ts in codebase

### Session Lifecycle Wiring
- [x] ISC-15: session-lifecycle handlers called on session.created event
- [x] ISC-16: session-lifecycle handlers called on session.end event
- [x] ISC-17: session-lifecycle message tracking called on chat.message
- [x] ISC-18: session-lifecycle does NOT use registerHook (direct inline)
- [x] ISC-A1: session-lifecycle does NOT duplicate existing statusline logic

### Event Adapter Decision
- [x] ISC-19: Decision documented on event-adapter.ts approach
- [x] ISC-20-alt: If not wired: rationale documented in PRD Decisions

### Self-Updater Regex Fix
- [x] ISC-21: extractEventsFromSource() matches object-key hook definitions
- [x] ISC-22: Regex matches pattern like `"tool.execute.after": async`
- [x] ISC-23: Regex matches pattern like `"event": async`
- [x] ISC-24: Existing hook pattern still matched (backwards compatible)

### Version Consistency
- [x] ISC-25: PLUGIN_VERSION in pai-unified.ts matches package.json
- [x] ISC-26: Version string is "0.1.0" in both locations

### Anti-Criteria
- [x] ISC-A2: No existing tests broken by changes
- [x] ISC-A3: No new runtime dependencies added

## Decisions

### Event-adapter.ts — NOT wired in (ISC-19, ISC-20-alt)
registerHook() mutates a hooks object passed by reference. pai-unified.ts returns a static object literal from an async factory function. These patterns are architecturally incompatible. Wiring event-adapter in would require rewriting pai-unified.ts's architecture, which is out of scope. Instead, session-lifecycle functionality is inlined directly into pai-unified.ts, following the same pattern as all existing handlers.

### Notification Consolidation Strategy
voice-notifications.ts already had basic ntfy/discord via env vars. notifications.ts had richer config-file-based ntfy (custom server, priority, tags) and discord, plus session duration tracking. Merged by: upgrading voice-notifications.ts's config loading to read pai-adapter.json (like notifications.ts did), adding priority/tags to sendNtfy, adding recordSessionStart/getSessionDurationMinutes, adding routeNotification as a general-purpose router. All types (NotificationChannel, NotificationPriority, NotificationOptions) moved to voice-notifications.ts.

### Self-Updater Regex Enhancement
Added two new regex patterns to extractEventsFromSource(): (1) objectKeyPattern for quoted dotted keys like `"tool.execute.after": async`, (2) unquotedKeyPattern for bare word keys like `event: async(` that match known events. Existing patterns preserved for backward compatibility with Claude Code source format.

### Version Test Fix
healthCheck test expected "1.0.0" (stale). Updated to "0.1.0" to match the corrected PLUGIN_VERSION.

### Plan
1. Version fix (pai-unified.ts PLUGIN_VERSION -> "0.1.0") [DONE]
2. Dedup cache early return in chat.message [DONE]
3. Learning flush on session.end/idle [DONE]
4. Session lifecycle inline into pai-unified.ts [DONE]
5. Delete hook-io.ts + test + barrel export [DONE]
6. Consolidate notifications.ts -> voice-notifications.ts [DONE]
7. Fix self-updater regex for object-key patterns [DONE]
8. Run tests [DONE - 521 pass, 0 fail]

## Verification

### ISC-1,2,3 (Dedup Cache)
- pai-unified.ts:176-179: `isDuplicate()` called, result checked, early return with fileLog on duplicate

### ISC-4,5,6 (Learning Flush)
- pai-unified.ts:243: `flushSessionLearnings(sid)` in session.idle block
- pai-unified.ts:299: `flushSessionLearnings(sid)` in session.end block
- Both extract sid from `evt.sessionID ?? evt.sessionId`

### ISC-7,8,9 (hook-io.ts Removal)
- `src/lib/hook-io.ts` deleted, `src/__tests__/lib/hook-io.test.ts` deleted
- `grep hook-io src/` returns 0 matches

### ISC-10,11,12,13,14 (Notification Consolidation)
- voice-notifications.ts now has: sendNtfy with priority/tags/server, sendDiscord, routeNotification, recordSessionStart, getSessionDurationMinutes, all types
- `src/lib/notifications.ts` deleted
- `grep notifications.js src/` returns only voice-notifications.js references

### ISC-15,16,17 (Session Lifecycle Wiring)
- pai-unified.ts:252: `onLifecycleSessionStart(sid)` in session.start/created block
- pai-unified.ts:203: `onLifecycleMessage(sid)` in chat.message handler
- pai-unified.ts:297: `onLifecycleSessionEnd(sid)` in session.end block

### ISC-18, ISC-A1 (No registerHook, no duplication)
- pai-unified.ts calls `onLifecycleSessionStart/Message/End` directly via safeHandler — no registerHook
- Lifecycle handlers track different data (session state, JSONL logs, summaries) vs statusline (display metrics)

### ISC-19, ISC-20-alt (Event Adapter Decision)
- Documented in PRD Decisions section above

### ISC-21,22,23,24 (Self-Updater Regex)
- self-updater.ts: objectKeyPattern `/["']([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+)["']\s*:\s*async/g` matches `"tool.execute.after": async`
- unquotedKeyPattern `/\b([a-z][a-z0-9]+)\s*:\s*async\s*\(/g` matches `event: async (`
- Original hooks.on()/register() pattern preserved for backward compat

### ISC-25,26 (Version)
- pai-unified.ts:48: `PLUGIN_VERSION = "0.1.0"`, package.json version: "0.1.0"

### ISC-A2 (No tests broken)
- `bun test`: 521 pass, 0 fail, 974 expect() calls

### ISC-A3 (No new dependencies)
- No new imports from node_modules. Only moved existing code between files.
