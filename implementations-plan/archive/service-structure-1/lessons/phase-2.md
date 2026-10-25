# service-structure-1: arc 2, phase 2 (#545)

## Implementation

- Base 138e0ded. dapp-boundary-2 had added `PendingWindow`, `dedupeKeyOf` and `isRowInFlight` beside the discovery code; they move with it (D9).
- The moved ranges were cut by line number and diffed against the new module: the only differences are four `export`s, `isOriginKey` and its one use, and `handedOver` spelled out.
- Two source pins name files, not functions: `legal/call-sites.test.ts` (the `assertCurrent` callers) went red on the move, as expected, and was edited deliberately (D10); `useLogFilters.scan.test.ts` would have stayed green but lost the moved lines' owner pin, so it gains a row.
- `typecheck:all` failed once: the test read `settled`, which `Hold` has but the `VerificationHold` interface does not; it now reads `holds.unsettled()`.
- Mutation checks, each red: `end` without the lane delete; an unprobed field on the registry; a new field in `createSdkHandlerState`; `isOriginKey` without the separator.
- `test:all` failed once: `store/remote-code.md` cited `background.ts:1081` for `AccessLevel.Transactions`. The cite was already wrong at base (the line had moved to `:1364`); the move made it exceed the file, which is all `store-listing.test.ts` checks. It now cites `discovery-flow.ts:530`, the actual line.

## Codex round 1 (gpt-6.1-sol, high, session 01a14c56)

- Verdict: one low finding, demonstrated. `price/not-dapp-exposed.test.ts` read only `background.ts`, so the moved discovery code had left the PriceService pin. Accepted: the pin reads `discovery-flow.ts` too, each case with a control that the raw text holds the module's entry point.
- Confirmed: the moved ranges differ only as reported; no await or ordering moved; `end` keeps the delete order; the schema patch stays first.

## Opus review (alongside round 1)

- Verdict: findings, low. Byte-equal claim verified independently. Accepted: `session-tabClose` and `session-tabNavigate` e2e headers named `background.ts` for the returning-session auto-approve; the decrypt lane's moved comment ("the prior hand-rolled decrypt chain had no watchdog") described history, and now states the invariant (a force-release would let the next decrypt run beside a slow one). Kept: the allowlist test's real `background.ts` import.
- Note for the orchestrator: the active plan `consent-display-1` names `handleDiscovery` in `background.ts`; that code is now in `discovery-flow.ts`.

## Codex round 2 (resumed session 01a14c56)

- Verdict: clean, "no regression found". The loop converged at round 2.
