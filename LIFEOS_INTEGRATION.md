# LifeOS–OpenCode integration: current contract

The project state of record is [ISA.md](ISA.md). Unchecked ISCs remain open. This repository contains contract/inventory code, a read-side plugin candidate, an isolated reviewer carrier and a conservative per-span journal; none is registered as the Mac bridge yet. The older PAI plugin and documentation in this repository describe a different integration and do not establish LifeOS parity.

## Trust boundaries

- OpenCode config, the LifeOS USER tree and the MEMORY tree are independently resolved roots. A legacy harness path in LifeOS documentation is never a writable fallback.
- `src/lifeos/contracts.ts` inventories skill definitions recursively and reports nested collisions, missing frontmatter and selected effective paths. The effective selected paths must come from OpenCode discovery rather than guessing from the filesystem.
- `snapshotContracts` records hashes and relative filenames only. Its comparison fails open *claims*, not contracts: changed writer/event/plugin fields block; other changes require review. The four synthetic mutation scenarios are in `contracts.test.ts`.
- `reviewFixture` constructs an SDK child session with bounded sanitized input, all tools disabled, typed response checks, selected-model comparison and teardown. Host-local probes obtained typed no-ops from GitHub Copilot and ZAI on configured accounts, but have not proved plugin recursion suppression or full capture/write parity.
- `ReviewJournal` persists one span's attempts and dispositions with per-span locks. A crash between write intent and recorded completion becomes `uncertain-write`: no automatic duplicate mutation, but human or deterministic read-back reconciliation is required before it can count as recovered.
- `plugin.ts` is an observational candidate exercised through the plugin hook interface in a fixture: it injects primary-session read context, records feedback signal type by SDK session/message ID and throws on a narrow redirected-writer command. It is not registered on the Mac or enabled for canonical mutations; a live pre-tool block and permissions matrix still need testing.
- `completeExchanges` projects complete text exchanges from SDK-shaped message rows and flags a truncated fetch window. It is not a restart-safe transaction scheduler and cannot by itself prove that historical unreviewed messages were recovered.
- Host manifests, selected paths, USER/MEMORY content, reviewer exchanges and operational reports belong outside this public repository. Never commit machine-local reports, credentials or customer data here.

## Promotion gates

1. Skill discovery must show the installed top-level definitions selected for ISA, CreateSkill, Research and private samples. A release payload nested under a recursively scanned skills directory is a collision even if the loader returns a single winner.
2. Disposable LifeOS roots must prove the existing canonical Cortex writer resolves OpenCode paths, tier allowlists, proposal pins and read-back. Do not create a second hot-memory writer to work around a failure.
3. A reviewer must prove isolation, bounded output, executed provider/model, no write tools and no visible-session recursion on actual configured accounts before a scheduler is enabled.
4. Baseline read-side plugin probes must pass before replacing a live registration. A restart must show one effective plugin source and the same identity/TELOS/fresh-memory/skill-routing behavior.
5. Each host is independently verified. `verified`, `advisory`, `unavailable` and `unverified` are distinct row verdicts; a fixture cannot promote a host to `verified`.

## Fixture checks

`bun test src/lifeos` exercises explicit roots, nested skill collisions, contract changes, distinct feedback signals, fresh/stale read-side context, completed exchange filtering, reviewer scenarios, span-restart/concurrency, and read-side plugin hooks. `bunx tsc --noEmit` checks the package. These fixtures alone do not establish a live capture-to-recall loop; matching ISA claims stay open until boundary probes pass.
