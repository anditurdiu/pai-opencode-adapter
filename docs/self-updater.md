# Self-Updater

The adapter includes a self-updater that monitors both PAI and OpenCode for changes, analyzes their impact, and creates draft pull requests for human review.

**Why draft PRs?**

The self-updater **never auto-merges**. All updates require human review to prevent breaking changes in production. This is by design (see [ADR-008](adrs/ADR-008-self-updater.md)).

## Check for Updates

```bash
cd ~/projects/pai-opencode-adapter
bun run src/updater/self-updater.ts --check
```

**Example output:**

```
PAI OpenCode Adapter — Update Report
Timestamp: 2026-03-21T15:30:00.000Z
Mode: check

PAI: 4.0.3 (up to date)
OpenCode API: no changes detected

Total changes: 0
```

## Apply Updates (Creates Draft PR)

```bash
bun run src/updater/self-updater.ts --update
```

**Example output with changes:**

```
PAI OpenCode Adapter — Update Report
Timestamp: 2026-03-21T15:30:00.000Z
Mode: update

PAI: 4.0.3 → 4.0.4 (update available)
OpenCode API: 2 change(s) detected
  [auto-fixable] New event available in OpenCode plugin API: experimental.agent.spawn
  [manual-review] Event removed from OpenCode plugin API: tool.definition
  - Affected handlers: security-validator

Draft PRs created:
  - https://github.com/anditurdiu/pai-opencode-adapter/pull/1

Total changes: 3
```

## What the Self-Updater Does

1. **Fetches latest PAI release** — GitHub API call to `danielmiessler/Personal_AI_Infrastructure/releases/latest`
2. **Compares semver** — Determines if update is available (major.minor.patch)
3. **Fetches OpenCode plugin source** — Raw GitHub fetch of `packages/plugin/src/index.ts`
4. **Extracts events** — Parses available OpenCode plugin events via regex
5. **Detects changes** — Compares against stored baseline (`.opencode-api-baseline`)
6. **Classifies changes** — Auto-fixable (minor), manual-review (breaking), info-only
7. **Creates draft PR** — Uses `gh pr create --draft` with detailed analysis in PR body
8. **Identifies workaround retirements** — Flags workarounds that may become obsolete

## Cron Setup for Automated Checks

Add to your crontab (`crontab -e`):

```cron
# Check for PAI + OpenCode updates daily at 9 AM
0 9 * * * cd ~/projects/pai-opencode-adapter && bun run src/updater/self-updater.ts --check >> /tmp/pai-updater.log 2>&1
```

**Note:** The `--update` mode (which creates PRs) should **not** be automated. Always review changes manually before applying.

## GitHub Token Requirement

For self-updater to create PRs, set `GITHUB_TOKEN` in your environment:

```bash
export GITHUB_TOKEN=$(gh auth token)
```

Or add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
# GitHub token for PAI-OpenCode self-updater
export GITHUB_TOKEN=$(gh auth token 2>/dev/null || echo "")
```

---

[← Back to README](../README.md)
