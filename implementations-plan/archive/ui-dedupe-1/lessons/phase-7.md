# Phase 7 (arc A7): lessons

## Release (2026-10-18)

- Branch `ui-dedupe-1-a7` off `dev` at `9470d4e9`; A6 merged as #752. No open PR touches the A7 files; #743, #654, #579 and #762 name none of them.
- The question behind P44-02 showed seven rows. OA-1 had grown to twelve while it was out; A7 takes the seven (D701), and the other five are OA-3.

## Implementation (2026-10-18)

- New page cases written first and run over the base pages: the ten that pin a converged rule were red, every kept rule green. Base's ten replaced cases run over the new code: exactly those ten red.
- First mutation pass: 13 mutations of the hook's defaults and of each parent's options, each red.

## Review round 1 (2026-10-18)

- Opus (general-purpose): `findings`. P1: converging Holdings' unseen-update rule alone leaves a token a read landed over missing until a reconnect, because Holdings keeps `refetchWhenDirty: false`; on base the projector's next update re-listed it. Held (D704), asked in OA-3. P2: the Select token port-drop case drove an order the client cannot produce (D707). P3s folded.
- Codex (gpt-6.1-sol, high, read-only, session `01a14f06-7308-7921-aa0f-81e85f6ca399`): `findings`. F1: an identity fetch whose tokens answer late landed an older balance over a reconnect's newer one; Send now numbers every balance read (D705), which also made D702's `invalidate()` redundant. F2: Select token's reconnect read skipped `load()`'s whole-scope guard (D706).
- Second mutation pass: 16 mutations, each red, including the read number on both writers and the whole-scope fence.

## Review rounds 2 and 3 (2026-10-18)

- Codex round 2 (resumed): `findings` 1. Numbering Send's balance reads by their start made a refused newer re-read discard the identity fetch's only good balance. Fixed at the rule: a read gives way only to a newer one that landed (D708). The state reset at the fetch's start needed its own case (a re-read landed for the previous identity first); the first version of the case passed without it.
- Codex round 3 (resumed): `clean`. 18 mutations, each red.

## Pictures (2026-10-18)

- A scratch spec (kept outside the repo) wraps `chrome.runtime.connect` in the popup before the app loads, so a `token-balance` port can hold, refuse or drop a read; a drop is a counted reconnect without killing the worker (which would lock the wallet under strict mode).
- Two artefacts of the harness, not of the code: a refusal left armed swallowed the 2 s retry, so a refusal answers one read only; and Home's late balance read consumed that one refusal, so the spec leaves Holdings through Settings, which reads no balances. A refused first read on base is superseded by its own every-connect read, so it has no stable picture.

## Final gates (2026-10-18)

- Head `1f185f10` (code `fc230fd6`), `dev` at `9470d4e9` with nothing newer: lint, typecheck:all, test:all (extension 13875 passed), check:plans. Whole smoke suite at retry 0 on armed builds: Chrome 57 files passed, 6 skipped (standing env gates), 1952 s; Firefox 60 passed, 3 skipped, 2702 s. Network Chrome `send-picker` 1/1 in 211 s. No e2e scenario added.
