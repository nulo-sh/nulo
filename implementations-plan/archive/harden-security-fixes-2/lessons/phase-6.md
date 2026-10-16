# Phase 6: the network scenario

Paths are repo-relative.

## Attempts

- **1, Chrome.** `selectFeeMethod(execPopup, "public")` timed out: "Public Fee Juice" stayed disabled for 45 s. The approval window read the account's balance before `fundPublicFeeJuice` landed and kept that read. Fix: the test estimates through the worker on `{ kind: "fj" }` and asserts no `feeJuiceShortfall`, so it no longer depends on the card's balance read; the approval already went through the worker's entry.
- **2, Chrome.** The hold, the queued record, the window and its four texts all passed. The check that the dApp had no answer yet failed (seq 1 → 2): the playground writes a `pending` result row when the request starts, and `snapshotResultSeq` counts it. Fix: count only settled `sendTx` rows past the snapshot.
- **3, Chrome, then Firefox.** `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-default.test.ts --retry=0`, then the same under `NULO_E2E_BROWSER=firefox`: both exit 0.

## Wall-clock

The file's test time; "before" is its one earlier case, which the arc does not change, timed in the same run (load1 under 150, other agents running).

| Browser | Earlier case | New case | File before → after |
|---|---|---|---|
| Chrome | 48.2 s | 65.3 s | 48.2 s → 113.5 s |
| Firefox | 123.5 s | 140.2 s | 123.5 s → 263.7 s |

The plan estimated +60 s per browser; Firefox costs more, as its earlier case does, from its slower proving.

After merging `dev` twice (its reworked operation card, then arc 1), the same file on the final head, retry 0, exit 0 on both:

| Browser | Earlier case | New case | File before → after |
|---|---|---|---|
| Chrome | 45.5 s | 67.1 s | 45.5 s → 112.5 s |
| Firefox | 113.3 s | 128.5 s | 113.3 s → 241.8 s |

After the first PR CI run (D38 revised) and merging `dev` again (#604), the three files that run the changed gate, at retry 0, exit 0 on both browsers: this file, `authwit-lifecycle.test.ts` and `scope-refusal.test.ts`. This file's numbers on that head:

| Browser | Earlier case | New case | File before → after |
|---|---|---|---|
| Chrome | 42.9 s | 58.6 s | 42.9 s → 101.5 s |
| Firefox | 92.8 s | 109.6 s | 92.8 s → 202.4 s |

After merging `dev` once more (#608, which reworked the app-paid fee row beside the fee slot), the same three files passed again on both browsers; this file there: Chrome 35.8 s → 90.0 s (new case 54.2 s), Firefox 76.7 s → 169.9 s (new case 93.2 s).

The first CI run's lesson: a change to when Confirm enables reaches every network file that presses it, not only the arc's own; `authwit-lifecycle` and `scope-refusal` press it on requests whose estimate fails by design. Run the files that press Confirm on a refused request before opening the PR.

## Screenshots

- A local scratch copy of the case (never committed) shoots the waiting Confirm and the window in both themes; its first run passed the whole flow in 75.8 s.
- That run's window printed "Available 0 FJ" for an account that then paid: the gas-balance cache (five minutes) held the read the fixture made before the test funded the account from outside the wallet, which invalidates nothing. The window now reads past the cache, one read per question; attempt 1's disabled "Public Fee Juice" was the same cache on the execute window's card, which the arc does not change.

## Reviews after the implementation

- **Round 1.** Codex `gpt-6.1-sol` high, read-only: approve with changes, 1 finding (the fee window dropped the approved authorization rows), fixed. An Opus 5.5 general-purpose review ran beside it: approve with changes, 6 findings; the plan's verdict table records each.
- **Round 2.** Codex, the same session: approve with changes, 1 finding. An app's own payment naming the PrivateFPC as payer charges the account's Private Fee Juice, and the playground's PrivateFPC routes reach it (`apps/extension/tests/e2e/network/selfpay-phase.test.ts`), so the first answer (an owner ask that shipped the exemption) narrowed the owner's pick. Fixed as D41.
- **Round 3.** Codex, the same session: approve, no findings. The loop ends here, inside its three rounds.

## Cross-arc pass

- A fresh Codex `gpt-6.1-sol` high session over the net diff from `c5e9c8e8`, after arc 3 (#611) merged: approve with changes, 2 findings. The fee window gave the card no grant decodes, so a held send with a public grant read "Reading arguments…" for good while "Send for" stayed live; both windows kept the token list they read at open. Fixed in `a52afd5f`; the same session re-read it: approve, no findings.
- Merging arc 3 turned two of its execute-window grant tests red: they press Confirm on a send the person pays with no estimate landed, which D38 now holds. The tests land an estimate; the hold is the behaviour the owner picked (OA-F2 part 2 C).
- The close-out head (`dev` merged through #609): lint, typecheck:all, test:all (extension 13,210), test:ci-gating and check:plans green; the five network files that open or press the changed windows (this file, `authwit-lifecycle`, `scope-refusal`, `type-roles-windows`, `authwit-consume-smoke`) at retry 0, exit 0 on Chrome and Firefox, under a host load near 140. This file there: Chrome 41.2 s → 106.5 s (new case 65.3 s), Firefox 83.9 s → 191.6 s (new case 107.7 s).
