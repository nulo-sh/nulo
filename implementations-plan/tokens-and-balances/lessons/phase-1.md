# Arc 1 — implementation log

## Phase 1.1 (#206)

- 2026-10-10 — the reducers moved into `useTokenBalanceSnapshot` as planned. The BalanceView late-add test
  run against fd47407's `BalanceView.vue` (the new composable still returns `markDirty` and `inActiveScope`, so
  the base view mounts unchanged): `× a late add event for a row already shown holds nothing once that row's
  update lands` — `AssertionError: expected true to be false`. Green on head. Gate: lint, typecheck:all,
  snapshot + `modules/general` 259/259.

## Phase 1.2 (#94)

- 2026-10-10 — R1-R5 built as Architecture § Phase 1.2 says. Base-copy run (fd47407's `token/service.ts` and
  `network/service.ts` under the new tests): token tests 15 failed, 25 passed. Every test the plan marks "fails
  on base" is red, each on its own assertion (a lost row, two rows for one contract, an overwritten or deleted
  replacement, an emit for a missing row, a resolve where a rejection was due); the double-release test (no base
  claim) and the dead-chain own-row control pass on base, as planned. The three new-path tests are red on base
  too. Network R4 tests: both red on base (`expected true to be false`).
- Deviation: `purge-rows.ts` is unchanged. The purge's raw pass gets its guard from the storage view the token
  service hands `purgeMalformedRows` (`ownedRawTokens`): its `delete` checks `ownsLock()` in the turn it is
  issued and routes through the tracker, which R2 needs anyway, so the shared helper gains no parameter.
- Deviation: a tracked add write that rejects issues the `failed` transition from its own rejection handler,
  before it leaves the tracker. Found while writing the "set rejects while a successor drains it" test: with the
  failure journaled only in the attempt's `catch`, three async frames above the set, the successor's drain
  could see an empty tracker one turn before `failed` was issued. The `catch` still issues it for every other
  failure and awaits the same promise.
- Deviation: all Phase 1.2 tests live in `token/service.test.ts`; the composition file needed none (its ordering
  pin stays green unchanged). The owned-ticket R4 test drives a real `NetworkService` on the harness's storage
  (its `deleteNetwork` cascade calls the real `clearChainState`), since the stub `isNetworkLive` cannot show R4.
- Every existing add, restore and watchdog test stayed green unchanged, including the two-liveness-reads pin and
  the ordering pin. Gate: lint, typecheck:all, token + network + write log 296/296.

## Phase 1.3 (#93)

- 2026-10-10 — one `StorageArea` field replaces the constructor's four builds; `dropUiKeysBeforeAdoption(id)`
  runs first in `persistNewProfileHoldingLock` and `writeMarkerThenRowHoldingLock`. Base-copy run (fd47407's
  `profile/service.ts`): all three new tests red (the restore and passkey-import order checks, `expected [ …(2) ]
  to deeply equal [ …(3) ]` and `expected [ Array(1) ] to deeply equal [ …(2) ]`; the rejected-removal test,
  which base cannot fail on, resolves). Green on head. The tests live in `service.integration.test.ts`, the
  profile suite that drives real restore and passkey import. Gate: lint, typecheck:all, profile +
  profile-deletion + `utils/` + `usePinnedTokens` 1500/1500.

## Arc 1 review loop

- 2026-10-10 — Codex round 1 (gpt-6.1-sol, high, default login, session `01a12449`): approve with fixes, one
  Medium and one Low. Opus 5.5 review alongside: approve with fixes, four Lows and two nits. Both found the
  released deletion that removes its row and then refuses the emit (balance rows outlive the token). They
  disagreed on the fix; the emit now runs whenever the remove landed (D-arc1-3), because a successor must drain
  that remove and so cannot act before the emit's turn. Regression test red on the pre-fix head. Opus's two
  undisclosed race outcomes went into § UI impact and OWNER-ASKS.md (addendum to OA-3), both with messages the
  wallet already shows.
- Lesson: R5's "check before every observable step" over-applied to a step that follows a write in the same
  turn: refusing the announcement of a write that already landed is worse than announcing it.
- 2026-10-10 — Codex round 2 (resumed): approve, no new material code finding; it verified D-arc1-3's ordering
  with the extracted methods and a real `Lock`. One Low on plan wording (R5, § Security, § UI impact still
  stated the old rule), applied. Loop converged in two rounds.
