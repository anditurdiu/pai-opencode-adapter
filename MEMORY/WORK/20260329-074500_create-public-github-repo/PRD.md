---
task: Create public GitHub repo with professional presence
slug: 20260329-074500_create-public-github-repo
effort: standard
phase: observe
progress: 0/10
mode: interactive
started: 2026-03-29T07:45:00Z
updated: 2026-03-29T07:45:30Z
---

## Context

Publishing pai-opencode-adapter as a public GitHub repo under `anditurdiu/pai-opencode-adapter`. Need to create the repo, fix all URL references (username was `aturdiu` but GH account is `anditurdiu`), fix the self-updater example that incorrectly references danielmiessler's repo for PRs, and push the single clean commit.

### Risks
- Self-updater example showed PRs going to danielmiessler's repo — needs to point to our adapter repo instead.

## Criteria

- [x] ISC-1: GitHub repo created as public under anditurdiu
- [ ] ISC-2: Repo description set to compelling one-liner
- [ ] ISC-3: Repo topics include pai, opencode, adapter, llm
- [ ] ISC-4: README URLs use anditurdiu not aturdiu
- [ ] ISC-5: Self-updater PR example references anditurdiu repo
- [ ] ISC-6: Remote origin set to new repo
- [ ] ISC-7: Single commit pushed to main branch
- [ ] ISC-8: Repo has homepage URL set
- [ ] ISC-9: GETTING_STARTED.md paths reference correct repo
- [ ] ISC-10: Self-updater docs clarify PRs go to adapter repo

## Decisions

## Verification
