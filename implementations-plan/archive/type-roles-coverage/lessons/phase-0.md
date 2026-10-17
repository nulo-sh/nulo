# Phase 0: planning consults

Every panel consult, its verdict, and what changed.

## 2026-10-16 recon

Three Sonnet explorers: smoke reachability of the 49 states, network reachability of the 20, harness and budget. The planner re-read every load-bearing claim. The smoke explorer's plan to seed the in-flight import before the restart would have been reaped (Codex finding 2), and it missed that the `call` authwit pair is seedable (Opus finding 3).

## 2026-10-16 Codex round 1 (gpt-6.1-sol, high, read-only)

Verdict: `conditional approve`. Seven findings, each checked against the tree:
1. High, demonstrated: the unnamed-FPC selector also matches the synthetic and named rows (`FpcRow.vue:34` picks `row-title` for a name). Accepted; fixed in the expected file (D6).
2. High, demonstrated: the boot sweep fails a pre-restart in-flight import (`reaper.ts:141-152`, `:228`). Accepted (D5).
3. Medium, demonstrated: `kind: "at"` reads hidden matches; sibling branches share `activity-row-hash`. Accepted (D7).
4. Medium, plausible: a failed attempt's readings survive a retry. Partly accepted (push after a pass); per-attempt buffers rejected (linear bodies).
5. Low: D3 is an honest precondition; scope stated.
6. Medium: local and CI timings are not comparable; A1 is a proposal. Accepted (D9, A1); `NULO_E2E_RETRY=0` on agent runs.
7. Medium: A2 must be an approval boundary. Accepted.

## 2026-10-16 Opus Plan leg

Verdict: `conditional approve`. Accepted: the FPC selector (its expected-file form won over Codex's spec-local remap); the `call` authwit pair is smoke-reachable (moved, 51 / 18); AddressDisplay sites read as `name` (D8, a close-out known limit for the two own-account sites); S9–S12 in a new per-test test (D4); A1 on CI numbers; a stop rule; the `refuseTestnet` decision; logged counts; per-file coverage for arc 2. Rejected: "no startup step clears an in-flight import" (the boot sweep does). Checked and kept out: connected-app grants cannot be seeded in smoke (dApp sessions carry a MAC, `dapp-session/spec.ts:64`).

## 2026-10-16 Codex resume (verification)

Verdict: `conditional approve (with conditions: make D6's selector exact; prevent protocol discovery in S11)`. Both checked against the tree and met as specified:
1. Medium, demonstrated: a `data-fpc-name^="0x"` selector also matches an FPC a user named `0x…` (`NewFpcPopup` allows it). Fixed with `data-fpc-unnamed` on `FpcRow.vue`, Codex's second option; its first (the seed's `data-fpc-id` in the expected file) would tie the inventory to one test.
2. Medium, plausible (dependency traced): with a canonical FPC row missing, `getFpcs` registers it through the PXE before answering (`fpc/service.ts:140-181`), so S11 would wait on Testnet. Fixed: `seedProtocolFpcs` beside the unnamed row, and `refuseTestnet` held for the whole new test.
Every other disposition confirmed. The panel budget (one audit, one resume) is spent; no further round.
