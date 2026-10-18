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
