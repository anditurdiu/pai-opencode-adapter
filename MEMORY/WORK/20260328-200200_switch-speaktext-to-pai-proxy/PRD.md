---
task: Switch speakText to PAI proxy preserving paradigms
slug: 20260328-200200_switch-speaktext-to-pai-proxy
effort: standard
phase: complete
progress: 10/10
mode: interactive
started: 2026-03-28T20:02:00Z
updated: 2026-03-28T20:03:00Z
---

## Context

The `speakText()` function in `voice-notifications.ts` currently calls the ElevenLabs API directly, but the API key in `pai-adapter.json` returns 401. Meanwhile, the PAI local TTS proxy at `localhost:8888/notify` works perfectly and is the same mechanism PAI's Algorithm voice announcements use (via curl). 

We need to switch `speakText()` to use the proxy, consolidate voice ID resolution to a single source (`pai-adapter.json` → `voice.voiceId`), and remove the hardcoded `"Rachel"` fallback and the separate `identity.ts` voice ID chain from voice-notifications concerns.

### Paradigm Contract (PAI Adapter → PAI):
- Config lives in `pai-adapter.json` — single source of truth for adapter settings
- `identity.ts` resolves identity (name, display) but voice TTS goes through the proxy
- The proxy at `localhost:8888` is the PAI voice infrastructure — adapter should delegate to it
- Voice ID is read from `pai-adapter.json` `voice.voiceId` field
- No direct ElevenLabs API calls from the adapter — the proxy handles auth

### Risks

- Proxy may not be running (must handle gracefully)
- Tests mock `fetch` calls to ElevenLabs — need to update for proxy URL

## Criteria

- [x] ISC-1: speakText sends POST to localhost:8888/notify
- [x] ISC-2: speakText payload includes message field
- [x] ISC-3: speakText payload includes voice_id from config
- [x] ISC-4: speakText payload includes voice_enabled boolean
- [x] ISC-5: Hardcoded "Rachel" fallback removed from source
- [x] ISC-6: Voice ID read from pai-adapter.json voice.voiceId
- [x] ISC-7: speakText gracefully handles proxy unreachable
- [x] ISC-8: Direct ElevenLabs API call removed from speakText
- [x] ISC-9: Existing tests pass after refactor
- [x] ISC-10: Build succeeds with no type errors

## Decisions

## Verification

- ISC-1: `PAI_VOICE_PROXY_URL` at line 14, `fetch(PAI_VOICE_PROXY_URL)` at line 91
- ISC-2: `message: text` at line 95
- ISC-3: `voice_id: config.voiceId` at line 96
- ISC-4: `voice_enabled: true` at line 97
- ISC-5: grep for "Rachel" in voice-notifications.ts = 0 matches
- ISC-6: `getVoiceConfig()` reads `adapter.voiceId` from `pai-adapter.json`
- ISC-7: catch block at lines 99-101, test "proxy unreachable" passes
- ISC-8: grep for `elevenlabs.io`, `callElevenLabs`, `playAudio` = 0 matches
- ISC-9: 535 tests pass, 0 fail
- ISC-10: Build succeeds, `pai-unified.js 59.17 KB`
