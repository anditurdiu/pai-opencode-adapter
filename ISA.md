---
task: "Integrate LifeOS with OpenCode across supported hosts"
slug: 20260927-lifeos-opencode-integration
project: pai-opencode-adapter
phase: climbing
progress: 0/29
started: 2026-09-27T10:08:32Z
updated: 2026-09-27T13:52:21Z
principal_stated_goal: "Build one LifeOS-specific OpenCode integration, deliverable on the Mac and Proxmox host, that closes a verifiable local loop:"
principal_stated_goal_source: prompt
principal_stated_goal_signal: 4
principal_stated_goal_locked: 2026-09-27T10:08:32Z
context_sufficient: true
interview_invoked: false
---

## Problem

The installed OpenCode bridge supplies read-side context but has no verified feedback-to-Cortex-to-recall path. Existing Claude Code registrations and the older PAI adapter do not establish OpenCode parity by merely existing. Skill discovery, writer roots and reviewer isolation have unresolved compatibility boundaries.

## Vision

You correct me in one OpenCode conversation; the correction becomes a precisely classified signal, a completed exchange is reviewed without touching your visible session, an admissible fact lands in the canonical LifeOS authority and returns when relevant later. I can show exactly which plugin and skill were loaded, what was written, and what remains open on each machine.

## Out of Scope

- Shared cross-host Cortex until both local loops pass and conflict authority is decided.
- Silent changes to unrelated agent definitions, providers, credentials, USER content, or the LifeOS skill tree.
- Claiming a missing Proxmox, provider, stop-blocking or visual probe passed because a Mac fixture passed.

## Principles

- Authority lives in LifeOS USER/MEMORY and its typed governance, not in the adapter.
- A behavior is verified only by evidence at its consumer boundary; unknown is not green.
- Replaying the same exchange does not create the same mutation twice.

## Constraints

- One runtime plugin owner; replace the current registered bridge only after read-side replacement probes pass.
- OpenCode provider selection remains native; reviewer inference has bounded resources and no write tools.
- Public repository holds generic code and synthetic fixtures only; private host inventories and operational evidence stay local.
- All skill creation and structural skill edits use CreateSkill; unrelated Grok configuration requires separate authorization.
- The canonical Cortex writer must refuse writes until resolved roots, tier classifications and proposal pins are proven in disposable authority roots.

## Goal

"Build one LifeOS-specific OpenCode integration, deliverable on the Mac and Proxmox host, that closes a verifiable local loop:"

Principal message → correctly classified feedback → completed primary-session exchange → bounded review using an OpenCode-accessible provider → LifeOS-governed mutation or recorded no-op → relevant later recall → truthful health.

Preserve native OpenCode provider choice and LifeOS’s canonical USER/MEMORY authority. Treat Claude Code hook behavior as a source of requirements, not as code to invoke by filename. The public adapter repository carries generic code, synthetic fixtures, contract descriptions and non-sensitive documentation; installation-specific inventories and reports remain private.

## Test Strategy

| isc | type | check | threshold | tool | anchors_to |
|-----|------|-------|-----------|------|------------|
| ISC-1 | bash | effective registrations resolved from live settings and dispatch imports | complete matrix | private inventory probe | literal |
| ISC-2 | bash | host manifest distinguishes roots and records effective plugin sources | Mac and Proxmox individually | private host probe | literal |
| ISC-3 | bash | skill names and paths resolve without duplicate effective names | zero duplicate names | `opencode debug skill --pure` in valid config | literal |
| ISC-4 | bun-test | release packaging preserves updater and overlay behavior | both probes pass | overlay/update fixture | derived: discovery |
| ISC-5 | manual | four representative skill workflows reach intended root and outcome | four verified | isolated skill invocation log | literal |
| ISC-6 | bun-test | fresh install and upgrade have one plugin owner | one | config/plugin discovery fixture | literal |
| ISC-7 | bun-test | no USER/MEMORY or provider configuration overwritten | zero mutations | fixture diff | literal |
| ISC-8 | bun-test | read-side replacement supplies identity, TELOS, fresh memory and routing | all samples pass | plugin event fixture | literal |
| ISC-9 | bun-test | initialization and runtime health omit transcript and secrets | no leaks | plugin fixture | derived: privacy |
| ISC-10 | manual | bounded isolated reviewer succeeds with observed provider/model | one intended non-Claude provider plus Copilot per configured host | live SDK session probe | literal |
| ISC-11 | bun-test | reviewer cannot recurse, mutate or leak private spans | zero counterexamples | SDK fixture | literal |
| ISC-12 | bun-test | user signals retain correct distinct semantics | precision-first classifications | event-to-feedback fixture | literal |
| ISC-13 | bun-test | only completed primary exchanges are reviewed | no child/failed/aborted/compacted partials | session messages fixture | literal |
| ISC-14 | bun-test | backlog, retries, crash and concurrency are durable and idempotent | zero duplicate writes | restart/crash fixture | literal |
| ISC-15 | bun-test | typed writes hit canonical roots and preserve refusals | all four item types and refusal codes | disposable Cortex fixture | literal |
| ISC-16 | manual | later answer uses relevant canonical fact | retrieved ID and answer agree | live conversation and file read-back | literal |
| ISC-17 | bun-test | no-op and failed review report distinct honest health | no false success | health scenario | literal |
| ISC-18 | bun-test | native and pre-tool permissions stop disallowed operations | tool does not execute | allow/ask/deny fixture | literal |
| ISC-19 | bun-test | ISA/work observations survive restart and disk edits | registry and ISA agree | session/disk fixture | derived: parity |
| ISC-20 | manual | response enforcement states actual host capability | no unevidenced blocking claim | stop-hook live probe | derived: parity |
| ISC-21 | bun-test | compacted continuation preserves active ISA | correct handover | compact event fixture | derived: parity |
| ISC-22 | bun-test | contract checker blocks unknown or changed consequential fields | four synthetic mutations detected | update checker fixture | literal |
| ISC-23 | manual | maintenance workflow generated via CreateSkill passes routing and effect checks | verified | CreateSkill workflow | literal |
| ISC-24 | manual | Mac live replacement proves parity with captured baseline | host-specific passing scenarios | restart and private effect matrix | literal |
| ISC-25 | manual | Proxmox independently proves local flow or remains explicitly open | host-specific evidence | host manifest and scenarios | literal |
| ISC-26 | bun-test | Anti: public repository contains private host evidence or installed secrets | zero matches | staged-content privacy audit | derived: privacy |
| ISC-27 | bun-test | Anti: stale or test-only rating becomes fresh injected learning | zero matches | timed rating fixture | derived: precision |
| ISC-28 | bun-test | Anti: update automatically marks parity green after a contract mutation | zero matches | synthetic upstream diff | literal |
| ISC-29 | manual | active agents load intended prompts, routing, model carrier and effective native permissions | per-agent evidence; no inert safety settings counted as enforced | effective config inspection and agent invocation probes | derived: agent compatibility |

## Features

### F0 · Cross-cutting authority and truthful evidence
Why: the integration cannot count as working if a private destination or a failing host is painted green.

- [ ] ISC-2: Each supported host reports distinct resolved configuration, USER and MEMORY roots with its own contract evidence.
- [ ] ISC-17: No-op, failures and governance blocks remain individually visible in operational health.
- [ ] ISC-26: Anti: no private host evidence, identity, absolute home path or credential is committed to the public repository.
- [ ] ISC-28: Anti: a changed contract never silently retains a verified parity verdict.

### F1 · Baseline and skill discovery
Why: a named capability must resolve to the intended effective definition before it can be relied on.

- [ ] ISC-1: Effective settings and dispatcher imports yield a behavior-by-effect inventory with triggers, blockers, dependencies and probe names.
- [ ] ISC-3: Effective skill discovery has no ambiguous duplicate names and reports installed paths.
- [ ] ISC-4: The chosen packaging shape passes disposable OverlaySystem and Update workflow probes.
- [ ] ISC-5: ISA/Scaffold, CLI-backed, private and Claude-specific skills each have independently recorded listed/loaded/resolved/executed/outcome stages.

### F2 · Single plugin installation
Why: replacement is safe only when baseline context survives and there is no duplicate owner.

- [ ] ISC-6: Fresh install and upgrade load exactly one plugin after restart, with no duplicate registration source.
- [ ] ISC-7: Install and upgrade leave USER/MEMORY and provider/credential configuration unchanged.
- [ ] ISC-8: A read-only turn receives identity, populated TELOS, bounded fresh memory and correct skill routing at the correct turn.
- [ ] ISC-9: Plugin startup and runtime health are recorded without raw messages, transcripts or secrets.
- [ ] ISC-27: Anti: a stale or test-only rating is never injected as fresh satisfaction evidence.

### F3 · Provider-independent reviewer
Why: memory learning must run through the selected OpenCode carrier without speaking in or re-entering the visible session.

- [ ] ISC-10: A bounded SDK reviewer returns a typed result with executed provider and model evidenced on the configured host accounts.
- [ ] ISC-11: Reviewer sessions cannot self-trigger capture, call write tools or send private spans to inference or persistence.

### F4 · Cortex capture-to-recall loop
Why: a durable fact counts only when an admissible completed exchange reaches governed storage and later helps you.

- [ ] ISC-12: Explicit ratings, direct praise, unscored corrections and standing directives stay distinct under per-message dedup.
- [ ] ISC-13: Only terminally completed primary-session user→assistant exchanges enter review; older unreviewed spans are tracked.
- [ ] ISC-14: Backlog, crash and concurrent idle recovery never duplicate governed outcomes or advance a cursor early.
- [ ] ISC-15: Disposable writer tests read back memory, idea, knowledge and proposal from canonical destinations and validate refusal codes.
- [ ] ISC-16: A live later answer uses an actual relevant canonical record and private evidence names its source and freshness.

### F5 · Consequential parity by effect
Why: hooking an event is not the same as blocking an unsafe action or recovering work state.

- [ ] ISC-18: Allowed, asked and denied operations behave correctly; blocking pre-tool hooks prevent execution.
- [ ] ISC-19: Work/ISA observations reconcile on-disk changes, separate concurrent sessions and survive restart.
- [ ] ISC-20: Completed-response enforcement is claimed only after a live pre-display blocking probe; otherwise marked advisory.
- [ ] ISC-21: Compaction continues with the active ISA and excludes reviewer sessions.
- [ ] ISC-29: Active agent definitions have host-verified prompt, routing, model carrier and native permission behavior; Claude-specific metadata that OpenCode ignores is mapped or explicitly advisory.

### F6 · Update detection and rollout
Why: once verified, an upstream or host change cannot silently invalidate the local loop.

- [ ] ISC-22: A pinned baseline checker flags synthetic event-field, nested-skill, mutation-target and overlay-rule changes.
- [ ] ISC-23: CreateSkill produces and verifies the LifeOS maintenance workflow and its effect-matrix output.
- [ ] ISC-24: Mac replacement and restart retain the known-good baseline and pass the full local loop.
- [ ] ISC-25: Proxmox receives an independent host manifest and passes the same gates or remains explicitly open.

## Decisions

- 2026-09-27: The user-provided mission and seven-slice acceptance handoff are binding; public work can be built before a host rollout, but unchecked claims remain unchecked.
- 2026-09-27: The existing bridge remains registered until replacement read-side probes pass. Agent config errors were initially isolated for discovery; the principal later authorized correcting the invalid color fields in the live Mac install.
- 2026-09-27: Both config and canonical USER/MEMORY roots must be resolved explicitly; a `.claude` example path is never permission to write there.
- 2026-09-27: Parity is a per-host, per-row verdict: verified, advisory, unavailable or unverified, with probe and evidence.
- 2026-09-27: Host-specific skill discovery and writer compatibility findings are retained in a private baseline; collision and writer gates remain open in this public ISA.
- 2026-09-27: The previous adapter targets a different contract. It must not be installed as a LifeOS replacement based on generic tests alone.
- 2026-09-27: The added isolated contract/feedback fixture tests and repository TypeScript check pass. Full legacy adapter suite has one pre-existing dependency on a missing legacy skill directory; it is not evidence for LifeOS integration.
- 2026-09-27: Reviewer carrier fixture verifies SDK-shaped session creation, sanitized bounded input, disabled tools, typed result and teardown. It is not promoted to provider parity before actual configured-host model and recursion probes.
- 2026-09-27: A disposable installed-root probe reproduced refusal of all four types before repairing the canonical writer. After pinning USER to its linked personal authority and MEMORY to the installed config tree, synthetic writes, target pinning, audits, snapshot and refusal scenarios pass. ISC-15 stays open until all governance/refusal and read-back cases are covered.
- 2026-09-27: A symlink to an external release payload remained recursively discoverable in one isolated OpenCode probe; a simple rename inside `LifeOS/install` left `SKILL.md` discoverable and broke OverlaySystem's expected payload layout. No live skill packaging change was made. The required release/update-aware shape remains open.
- 2026-09-27: Following a correction about premature checkpoints, the build continued under this ISA. An isolated OpenCode SDK reviewer returned typed no-ops on actual configured Copilot and ZAI providers; DeepSeek returned incomplete. A read-side plugin candidate and per-span journal pass synthetic probes, but integration, cleanup telemetry and governed multi-item crash recovery are not yet verified.
- 2026-09-27: Plugin fixture now captures feedback by session/message identity and excludes synthetic and child-session parts; a supplementary pre-tool hook throws for attempts to redirect canonical writer roots. These are fixture observations, not live OpenCode permission or feedback-persistence parity.
- 2026-09-27: Proxmox SSH access is available, but the probed root account has no OpenCode/Bun executable on PATH and no observed LifeOS/OpenCode roots. Adapter rollout on that host awaits identifying its actual installation account or container; no installation was attempted.
- 2026-09-27: Refined the second-host target against private host references: the target is an AI runtime VM account, not the hypervisor root. Read-only discovery found OpenCode and Bun, a linked personal USER tree and MEMORY tree, but no `LIFEOS/USER` alias under OpenCode config. Writer roots now resolve the personal tree directly; host rollout remains open pending independent tests.
- 2026-09-27: Corrected the read-side plugin candidate to use the personal USER root independently of MEMORY, excluded template-only hot memory, and proved an off-path payload does not shadow top-level ISA in an isolated scanner fixture. Installer/update integration for off-path payload remains open; no live plugin switch occurred.
- 2026-09-27: A disposable complete-exchange fixture now reaches the canonical Cortex writer and reads back a synthetic hot-memory fact, with repeat idle causing no second write. The real SDK reviewer is not yet connected to that scheduler in an installed plugin, and crash reconciliation/backlog remain open.
- 2026-09-27: Startup catch-up now bounds session count and reports overflow; canonical search/get retrieval is separately probed for knowledge notes. The hot-memory fixture proves a later context read from the linked USER file, not yet a later model answer. No acceptance claim has been checked on fixture evidence alone.
- 2026-09-27: Mac and second-host disposable/read-only checks remain separate: the second host's actual OpenCode config validates, but its installed Cortex writer has not been changed or exercised with writes. The Mac's current OpenCode config cannot run fresh debug probes because of unrelated agent metadata; that configuration has not been edited.
- 2026-09-27: A template hot-memory file may retain `provenance: template` after the canonical writer adds a durable entry. Read-side retrieval now checks for entries rather than suppressing the whole file on that metadata value; fixture-probed, still pending a live model response.
- 2026-09-27: Authorized Mac startup repair: six active agent files used color values OpenCode's schema rejects. Their colors now use accepted theme values; normal `opencode run` reached the configured model and returned the startup probe. A separate agent-compatibility pass remains open: Claude-specific metadata is loaded as options rather than evidenced permissions/routing behavior.
- 2026-09-27: Reviewer teardown and session-create timeout were reproduced as failures and repaired; bare rating turns are excluded from durable review, journal health records bounded codes, and incomplete session authority fails closed. These are component/fixture checks; installed idle scheduling and real write/retrieval remain open.
- 2026-09-27: The scheduler now extracts the selected provider/model from the completed user message rather than hardcoding a reviewer carrier; a fixture confirms propagation. Registration of automatic idle review remains gated on host-specific isolation and retry reconciliation.
- 2026-09-27: An initial candidate startup probe unknowingly loaded both global and test plugins; it was invalidated. A separate-HOME isolated config reported one candidate plugin and its synthetic USER/MEMORY roots, and the candidate produced the constitutional banner with test instructions. This is a fixture, not Mac live replacement or provider-parity evidence; the real skill discovery collision remains open.
- 2026-09-27: The candidate plugin initializes as sole owner under a synthetic config root; read-only Cortex status on the Mac still resolves the local MEMORY authority. Mac live registration is unchanged. Host-specific provider, skill-discovery and read-side parity scenarios remain open before replacement.
- 2026-09-27: Operational health states now distinguish missing evidence, pending cadence, progress, success/no-op, retryable failure, and governance block in fixtures. The Mac plugin still reports review disabled, not success; host evidence collection remains open.
- 2026-09-27: A separate-HOME isolated OpenCode run with one candidate plugin and synthetic USER/MEMORY returned the constitutional banner under its available model. It does not establish Mac live plugin replacement or Copilot execution from that fixture HOME; both remain open.
- 2026-09-27: CreateSkill-guided installer/update candidate stages the full release and prior skill outside OpenCode's recursive skills tree, retains a bootstrap-only callable LifeOS skill, and forces a validated off-tree payload for DeployCore/OverlaySystem. Seven disposable packaging scenarios and shell syntax pass; live skill discovery, hygiene gate and update drill remain open.
- 2026-09-27: A read-side plugin candidate now requests bounded Cortex card→record retrieval on a relevant turn and records retrieval outcomes. A single-plugin separate-HOME run still returned the constitutional banner, but no later principal answer based on an actual live canonical fact has been checked. The review writer remains disabled in the installed plugin.
- 2026-09-27: The read-side candidate now strips explicit private spans before skill routing, feedback classification and retrieval queries. Fixture verifies stripped text does not return through system context; native OpenCode transcript privacy remains outside this boundary.
- 2026-09-27: Feedback journal now persists the exact explicit numeric rating with its session/message identity; praise, correction and directive remain unscored kinds and raw prompt text is omitted. A fixture verifies correction never receives a rating.
- 2026-09-27: OpenCode bootstrap detects a home-installed Bun binary (needed for the second host's noninteractive SSH PATH), and still verifies syntax plus disposable install/update gates. Second host's existing binary and missing config/USER alias were independently rechecked read-only; no VM rollout occurred.
- 2026-09-27: The candidate plugin's `noop` reviewer mode now has a plugin-hook fixture proving one completed primary exchange creates one SDK child review, reviewer idle is ignored, repeated primary idle does not repeat inference, and canonical writes remain blocked. Real-host mode activation and outcome health still require live probes.
- 2026-09-27: A governance-refused proposal now remains a single blocked journal disposition on repeated idle, with a fixture proving no second apply; manual/deterministic reconciliation of uncertain post-write crashes remains open.
- 2026-09-27: Independent second-host read-only baseline still reports OpenCode/Bun available and current config valid with the prior plugin. Disposable installer, writer and scheduler probes pass on the Mac fixture; neither host has been promoted to live writer/reviewer status.
- 2026-09-27: A genuine single-plugin isolated run did fire idle review but its provider returned a retryable failure; the initial health marker misleadingly said `reviewed`. Health reporting was corrected to derive from the durable journal, and a repeat isolated probe reported `failed-retryable`. No host was promoted on this failure.
- 2026-09-27: Idle scheduling now attempts at most one complete span per event, preserves older-first order and reports remaining spans/full-window ambiguity as backlog. This caps reviewer inference volume without pretending an exactly full SDK message window covers all history; fixture passed, host cadence remains unverified.
- 2026-09-27: Journal-based operational health now reads latest status and disposition counts; a later retryable failure outranks an older success in fixtures. This is only an adapter-local assessor, not proof the installed Cortex health gates recognize the new reviewer.
- 2026-09-27: A Mac run of the installed `MemoryHealthCheck.ts --json` returned critical with legacy-root missing hooks/writer/reviewer evidence, while `Cortex.ts status --adapter opencode` found the OpenCode MEMORY authority. This divergence blocks truthful green health until the canonical assessor is adapted; the adapter-local journal verdict cannot override it.
- 2026-09-27: The canonical health CLI now locates the OpenCode config root and reports missing Claude Code `settings.json` as an OpenCode plugin-registration WARN, not a false Claude runtime critical. Mac status is WARN (0 critical, 11 warn, 19 ok) with reviewer/retrieval evidence still absent. Green health remains blocked pending actual OpenCode registration and reviewer evidence checks.
- 2026-09-27: A full 80-message SDK fetch cannot prove the preceding history is absent. The scheduler now defers that window without inference or writes and reports backlog; fixture verifies no reviewer call. Older-history pagination/catch-up remains an open acceptance condition.
- 2026-09-27: Restart fixture confirms an `uncertain-write` span never invokes reviewer or writer again; it remains blocked pending explicit reconciliation. This proves no automatic duplicate application, not recovery or completion of the interrupted item.
- 2026-09-27: Operational health now reports `uncertain-write` separately from governance refusal, so an interrupted append cannot hide behind a generic block. The durable journal still needs authority-based reconciliation before that state can clear.
- 2026-09-27: Tier-B note appends and proposal queue writes can land before the journal's terminal row. An automatic retry based only on the current item digest was rejected; the canonical target and pre-write identity must be pinned for reconciliation. Until then an interrupted write stays visibly blocked, with no live autonomous writer enabled.
- 2026-09-27: `MemorySystem.add()` confirms destination selection happens after typed sanitization and before tier checks; a replay using changed schema could target a different file. Safe reconciliation needs the pinned canonical target and prior on-disk fingerprint, not only a journal status. The autonomous writer stays disabled.
- 2026-09-27: A canonical `prepareAdd` preflight now shares the typed sanitizer/registry/boundary with `MemorySystem.add()`. The adapter journal requires a resolved target plus a 64-hex pre-write fingerprint before invoking any mutation; no preflight means `failed-retryable` with zero writes. Disposable tests verify target/fingerprint are durable in `applying` before dispatch. Crash reconciliation itself still remains open.
- 2026-09-27: An advisory fingerprint comparator now reports unchanged/changed/unverifiable canonical bytes after an interruption. Neither unchanged nor changed alone proves whether this writer applied; concurrent writes and transient side effects prevent automatic terminal resolution. Replay remains blocked.

## Remaining Work

- [ ] Resolve isolated skill discovery collision and prove packaging against LifeOS OverlaySystem and Update on disposable installations — blocked on a design that preserves bootstrap.
- [ ] Probe existing canonical writer with disposable USER/MEMORY, then implement reviewer and per-session transaction path — waiting on proven tier/path authority.
- [ ] Run real provider, Mac and Proxmox integration scenarios and create maintenance skill via CreateSkill — waiting on the safe writer and host access.
