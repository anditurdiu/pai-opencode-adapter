---
task: Multi-model delegation with config and fallbacks
slug: 20260328-210000_multi-model-delegation-config-fallbacks
effort: extended
phase: complete
progress: 29/29
mode: interactive
started: 2026-03-28T21:00:00+01:00
updated: 2026-03-29T00:15:00+01:00
---

## Context

PAI uses a 3-tier model routing system (haiku/sonnet/opus) for its delegation system, where different agent roles use different models based on task complexity. The pai-opencode-adapter already has `PROVIDER_PRESETS` in config-translator.ts that map provider types to role-based model selections (intern, architect, engineer, explorer, reviewer). However:

1. **The model config is not user-editable** — presets are hardcoded, and the `pai-adapter.json` config has no `models` section users can customize
2. **No fallback mechanism exists** — if a model is rate-limited or unavailable, the adapter has no way to suggest alternatives
3. **Model info is not injected into system prompts** — PAI's delegation instructions reference haiku/sonnet/opus but the adapter doesn't tell the LLM what actual models those map to for the current provider
4. **No error classification** — provider errors (rate limits, model not found, unavailable) aren't detected or handled

### What was requested
- User-configurable model routing via pai-adapter.json
- Fallback chains for provider errors (rate limits, model not supported, not available)
- Evaluation of how PAI delegates (completed in OBSERVE research)

### Risks
- The adapter cannot intercept/retry LLM calls — fallback is advisory (system prompt tells LLM about alternatives)
- Deep config merging (user overrides + presets + fallbacks) needs clear precedence rules
- System prompt bloat — model routing info should be concise (~200 tokens max)

### What was NOT requested
- The adapter should NOT call LLM APIs directly
- No new UI components
- No changes to OpenCode core

### Architectural constraint
The adapter is a plugin — it cannot intercept or retry LLM API calls. Fallback logic must work by:
1. Providing fallback model suggestions in system prompt context
2. Exposing a `resolveModel(role, attempt)` function that returns the next model in the fallback chain
3. Surfacing model resolution info to the LLM via system prompt injection so it can self-correct

## Criteria

### Config Schema
- [x] ISC-1: PAIAdapterConfig.models accepts user-defined model overrides
- [x] ISC-2: PAIAdapterConfig.models.fallbacks accepts per-role fallback arrays
- [x] ISC-3: User overrides in pai-adapter.json merge over provider presets
- [x] ISC-4: Missing user overrides fall back to provider preset defaults
- [x] ISC-5: Config schema validates fallback entries are strings

### Model Resolver
- [x] ISC-6: resolveModel returns primary model for a given role
- [x] ISC-7: resolveModel returns fallback model on nth attempt
- [x] ISC-8: resolveModel returns null when fallback chain exhausted
- [x] ISC-9: Resolver loads config from pai-adapter.json at call time
- [x] ISC-10: Resolver merges user overrides over provider presets

### Error Classification
- [x] ISC-11: classifyProviderError detects rate limit errors
- [x] ISC-12: classifyProviderError detects model-not-found errors
- [x] ISC-13: classifyProviderError detects provider-unavailable errors
- [x] ISC-14: classifyProviderError returns "unknown" for unrecognized errors

### Hook-based Error Intercept
- [x] ISC-15: tool.execute.after detects Task/agent tool errors
- [x] ISC-16: Failed model + error type stored in session fallback state
- [x] ISC-17: Next systemTransform injects fallback suggestion as system-reminder
- [x] ISC-18: Fallback suggestion includes next model from fallback chain
- [x] ISC-19: Fallback state clears after suggestion is injected

### System Prompt Injection
- [x] ISC-20: System prompt includes concise model routing table
- [x] ISC-21: System prompt injection uses existing systemTransform hook

### Config Translator Integration
- [x] ISC-22: translateConfig preserves user model overrides from pai-adapter.json
- [x] ISC-23: translateConfig merges fallbacks from user config into output
- [x] ISC-24: Existing PROVIDER_PRESETS remain as defaults unchanged

### Tests
- [x] ISC-25: Model resolver tests cover primary resolution per role
- [x] ISC-26: Model resolver tests cover fallback chain traversal
- [x] ISC-27: Error classifier tests cover all three error types
- [x] ISC-28: Fallback state management tests cover set/get/clear
- [x] ISC-29: Config merge tests verify user overrides over presets

### Anti-criteria
- [x] ISC-A1: Adapter must NOT call LLM APIs directly
- [x] ISC-A2: Existing tests must NOT break (520 passing)
- [x] ISC-A3: Fallback state must NOT leak between sessions

## Decisions

### Plan

**Architecture — 4 new/modified files:**

1. **`src/lib/model-resolver.ts`** (NEW) — Pure logic:
   - `resolveModel(role, attempt?)` — returns model string or null from merged config
   - `classifyProviderError(errorMsg)` — returns error category
   - `getModelRoutingContext()` — returns concise system prompt block
   - `setFallbackSuggestion(sessionId, failedModel, errorType)` — stores pending fallback
   - `consumeFallbackSuggestion(sessionId)` — returns and clears pending suggestion
   - `clearFallbackState(sessionId)` — cleanup on session.end

2. **`src/adapters/config-translator.ts`** (MODIFY) — Extend `ProviderModels` with `fallbacks`

3. **`src/plugin/pai-unified.ts`** (MODIFY) — Wire:
   - `tool.execute.after`: detect agent/Task errors → `setFallbackSuggestion()`
   - `experimental.chat.system.transform`: inject model routing + consume fallback suggestions
   - `session.end`: `clearFallbackState(sessionId)`

4. **`src/__tests__/model-resolver.test.ts`** (NEW) — Comprehensive tests

## Verification

### Config Schema (ISC-1 through ISC-5)
- `PAIAdapterConfig.models` typed as `ProviderModels` at `config-translator.ts:140` — accepts all role overrides
- `ProviderModels.fallbacks` field with JSDoc at `config-translator.ts:186-197` — `Record<string, string[]>`
- `translateConfig()` deep-merges per-field at `config-translator.ts:337-349` — user overrides win, preset fills gaps
- Missing overrides fall through to preset defaults via `??` operator at `config-translator.ts:338-346`
- TypeScript enforces `string[]` for fallback arrays via `ProviderModels` interface

### Model Resolver (ISC-6 through ISC-10)
- `resolveModel()` at `model-resolver.ts:168-195` — returns primary at attempt=0, fallback at attempt>0, null when exhausted
- Config loaded fresh via `getModelConfig()` at `model-resolver.ts:120-157` — reads `pai-adapter.json` each call
- Merge logic at `model-resolver.ts:138-156` — user overrides > preset defaults

### Error Classification (ISC-11 through ISC-14)
- `classifyProviderError()` at `model-resolver.ts:237-255` — pattern matching against 3 error categories
- Rate limit: 7 patterns at `model-resolver.ts:199-207`
- Model not found: 8 patterns at `model-resolver.ts:209-218`
- Provider unavailable: 11 patterns at `model-resolver.ts:220-232`
- Falls through to "unknown" at `model-resolver.ts:254`

### Hook-based Error Intercept (ISC-15 through ISC-19)
- `tool.execute.after` at `pai-unified.ts:228-239` — detects Task/agent errors, calls `classifyProviderError`, sets fallback
- Fallback state stored via `setFallbackSuggestion()` at `model-resolver.ts:67-92`
- `experimental.chat.system.transform` at `pai-unified.ts:170-178` — consumes suggestion, pushes `formatFallbackReminder()`
- `consumeFallbackSuggestion()` at `model-resolver.ts:99-105` — returns and deletes (clears after injection)
- `setFallbackSuggestion()` resolves next model in chain via `resolveModel(role, 1)` at `model-resolver.ts:75`

### System Prompt Injection (ISC-20, ISC-21)
- `getModelRoutingContext()` at `model-resolver.ts:288-317` — returns `<model-routing>` block with role→model table
- Injected via existing `systemTransform` hook at `pai-unified.ts:164-167`

### Config Translator Integration (ISC-22 through ISC-24)
- Deep merge preserves user overrides at `config-translator.ts:337-349`
- Fallbacks carried from user config at `config-translator.ts:348`
- `PROVIDER_PRESETS` unchanged at `config-translator.ts:199-255`

### Tests (ISC-25 through ISC-29)
- 546 tests pass, 0 fail (31 files). 26 new tests in `model-resolver.test.ts`
- Primary resolution: `model-resolver.test.ts:70-111`
- Fallback chain: `model-resolver.test.ts:91-104`
- Error classifier: `model-resolver.test.ts:23-64`
- Fallback state: `model-resolver.test.ts:139-203`
- Config merge: `model-resolver.test.ts:115-135` (via `getModelConfig` tests)

### Anti-criteria (ISC-A1 through ISC-A3)
- A1: No HTTP/fetch calls in model-resolver.ts — only reads config file. Verified via grep.
- A2: 546 tests pass (520 original + 26 new). Zero failures.
- A3: `clearFallbackState(sid)` called on `session.end` at `pai-unified.ts:411`. Session isolation tested at `model-resolver.test.ts:180-193`.
