---
task: Remove oh-my-openagent refs, improve README for PAI adapter
slug: 20260329-073444_remove-openagent-refs-improve-readme
effort: standard
phase: complete
progress: 10/10
mode: interactive
started: 2026-03-29T07:34:44Z
updated: 2026-03-29T07:35:30Z
---

## Context

The pai-opencode-adapter is being prepared for public GitHub publication. It needs two things:
1. All references to "oh-my-openagent" must be removed — this was an earlier dependency concern that's no longer relevant and confuses readers.
2. The README needs to be improved to clearly highlight the use case: enabling PAI (Personal AI Infrastructure) users to run PAI without an Anthropic subscription, using OpenCode with any LLM provider. This directly addresses GitHub issue #98 on the PAI repo.

### Risks
- Removing oh-my-openagent references from ADR-002 could lose important licensing context — need to preserve the MIT vs SUL-1.0 distinction without naming the specific project.

## Criteria

- [x] ISC-1: Zero "oh-my-openagent" references in README.md
- [x] ISC-2: Zero "oh-my-openagent" references in ADR-002-mit-license.md
- [x] ISC-3: Zero "oh-my-openagent" references anywhere outside MEMORY/
- [x] ISC-4: README hero section communicates "PAI without Anthropic lock-in"
- [x] ISC-5: README links to PAI repo github.com/danielmiessler/Personal_AI_Infrastructure
- [x] ISC-6: README links to or references issue #98 as motivation
- [x] ISC-7: README highlights multi-provider support as key value
- [x] ISC-8: README replaces "yourusername" with actual repo path
- [x] ISC-9: Related Projects section updated without oh-my-openagent entry
- [x] ISC-10: ADR-002 preserves MIT licensing rationale without oh-my-openagent

## Decisions

## Verification

All 10 ISC criteria verified via grep searches:
- ISC-1/2/3: Zero oh-my-openagent references outside MEMORY/
- ISC-4/5/6/7: README hero section includes PAI link, issue #98 link, multi-provider table, Anthropic lock-in messaging
- ISC-8: All "yourusername" replaced with "aturdiu"
- ISC-9: Related Projects section cleaned
- ISC-10: ADR-002 uses generic "upstream SUL-1.0 licensed projects" phrasing
