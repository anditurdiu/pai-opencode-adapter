---
task: Add voice notification to every Assistant summary line
slug: 20260328-144500_voice-on-assistant-summary
effort: standard
phase: complete
progress: 8/8
mode: interactive
started: 2026-03-28T14:45:00+01:00
updated: 2026-03-28T14:47:00+01:00
---

## Context

Andi wants voice notifications to play every time the `🗣️ Assistant:` summary line appears in output, regardless of which mode (MINIMAL, NATIVE, or ALGORITHM) is active. Currently, voice only fires during Algorithm phase transitions. The MINIMAL and NATIVE modes have no voice hooks despite having a Voice line in NATIVE's definition that was never used.

The change is a simple instruction addition to CLAUDE.md: before outputting `🗣️ Assistant: [summary]`, execute the voice curl with the summary text as the message.

## Criteria

- [x] ISC-1: MINIMAL mode format includes voice curl before 🗣️ Assistant line
- [x] ISC-2: NATIVE mode format includes voice curl before 🗣️ Assistant line
- [x] ISC-3: ALGORITHM mode final output includes voice curl before 🗣️ Assistant line
- [x] ISC-4: Voice message content is the same text as the Assistant summary
- [x] ISC-5: Voice uses same voice_id as existing Algorithm voice curls (pFZP5JQG7iQjIQuC4Bku)
- [x] ISC-6: CLAUDE.md edits preserve all existing format structure unchanged
- [x] ISC-7: No voice curl added to subagent/background agent outputs
- [x] ISC-8: Voice curl uses inline curl format matching existing Algorithm voice pattern

## Decisions

## Verification

- ISC-1: Line 39 of CLAUDE.md — MINIMAL mode has Voice curl template before format block
- ISC-2: Line 18 of CLAUDE.md — NATIVE mode has Voice curl template before format block
- ISC-3: Line 56 of CLAUDE.md — Critical Rules has global voice-on-Assistant rule covering ALGORITHM
- ISC-4: All templates specify `[same summary text as 🗣️ Assistant line]`
- ISC-5: All curls use voice_id `pFZP5JQG7iQjIQuC4Bku`
- ISC-6: Format blocks unchanged — only added Voice instruction lines and subagent rule
- ISC-7: Three locations explicitly state subagents/background agents must NOT execute voice curls
- ISC-8: All curls match inline curl pattern from Algorithm v3.7.0.md
