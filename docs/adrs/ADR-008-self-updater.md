# ADR-008: Self-Updater Creates Draft PRs (Never Auto-Merge)

## Status

Accepted

## Context

The adapter includes a self-updater that monitors both PAI and OpenCode for changes. When updates are detected, the self-updater must decide how to apply them: auto-merge, create a pull request for review, or notify the user manually.

**Options considered:**

1. **Auto-merge** — Apply updates automatically
   - Pros: Zero user intervention, always up-to-date
   - Cons: Risk of breaking changes in production, no human review

2. **Draft PR** — Create GitHub PR in draft mode for human review
   - Pros: Human review catches breaking changes, audit trail, safe deployment
   - Cons: Requires user action to merge, GitHub account needed

3. **Notification only** — Alert user of updates, manual application
   - Pros: Maximum control, no automation risk
   - Cons: Easy to forget updates, manual work, error-prone

4. **Hybrid** — Auto-merge minor updates, draft PR for major updates
   - Pros: Balance of automation and safety
   - Cons: Complexity in classifying updates, risk of misclassification

**Key requirements:**

- Prevent breaking changes from reaching production without review
- Maintain audit trail of what changed and why
- Support both PAI updates (new versions) and OpenCode updates (API changes)
- Enable workaround retirement when OpenCode adds native features

**Risk analysis:**

- **PAI updates** — Usually backward-compatible (minor/patch), but could introduce new hooks or change semantics
- **OpenCode updates** — Could remove events, change signatures, or break handlers
- **Workaround retirements** — Require code removal; must verify native alternative works correctly

## Decision

We chose **draft PRs for all updates** — never auto-merge.

**Implementation:**

```typescript
// src/updater/self-updater.ts
export async function createDraftPr(
  changes: DetectedChange[],
  source: ChangeSource,
  version: string
): Promise<string> {
  const branchName = `update/${source}-${version}`;
  const prTitle = `[${source.toUpperCase()}] Update adapter for ${source} ${version}`;
  const body = buildDraftPrBody(changes); // Detailed analysis

  // Create branch
  runCmd(`git checkout -b "${branchName}"`);

  // Create empty commit (placeholder for manual changes)
  runCmd(`git commit --allow-empty -m "chore: placeholder for ${branchName}"`);

  // Create DRAFT PR (note: --draft flag)
  const prUrl = runCmd(
    `gh pr create --draft --title "${prTitle}" --body "${body}"`
  );

  return prUrl;
}
```

**PR body includes:**

- Classification of each change (auto-fixable, manual-review, info-only)
- Affected handlers and files
- Recommended next steps
- Warning: "This is a DRAFT PR — do NOT apply without human review"

**Update modes:**

- `--check` — Analyze changes, no PR created
- `--update` — Create draft PRs for review (still no auto-merge)

**Workflow:**

1. User runs `bun run src/updater/self-updater.ts --check` (or cron job does this)
2. If changes detected, user runs `--update` to create draft PRs
3. User reviews PR, checks affected handlers, runs `bun test`
4. User manually applies changes, merges PR, deletes branch
5. Self-updater never merges automatically

**Rationale:**

1. **Safety first** — Human review catches breaking changes before production
2. **Audit trail** — PR documents what changed, why, and who approved it
3. **Flexibility** — User decides when to apply updates (not forced)
4. **Workaround retirement** — Requires manual verification that native alternative works

## Consequences

**Positive:**

- **Production safety** — No breaking changes deployed without review
- **Audit trail** — PRs document update history and decisions
- **User control** — Users apply updates on their schedule
- **Workaround governance** — Retirement requires explicit approval

**Negative:**

- **Manual work** — User must review and merge PRs (but this is intentional)
- **GitHub dependency** — Requires `gh` CLI and GitHub account
- **Delayed updates** — Users may forget to review PRs (mitigated by cron reminders)

**Follow-ups:**

- README documents self-updater usage and cron setup
- COMPATIBILITY.md tracks workaround retirement candidates
- Tests verify self-updater detects changes correctly
- No auto-merge logic anywhere in codebase (enforced by code review)

---

*This ADR ensures the adapter evolves safely without breaking production deployments.*
