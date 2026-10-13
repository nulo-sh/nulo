# Arc 4 — lessons

## Build notes

- **The no-cap path must stay byte-identical.** Computing `getEstimatedFee` before checking for a cap threw on executor fixtures without gas settings; the comparison now runs only when a cap exists.
- **An estimate's reuse entry needs the sequence.** `estimateFee` without one records `sequenceEpoch` undefined, and `tryConsume` refuses it; a reuse test must estimate through `executor.sequence(req)`.
- **A real popup store in a view test needs an active Pinia.** `RecentActivityView` now reads `usePopupStore`, so every test that mounts it (including `incoming-row-parity.test.ts`) installs one.
- **A sheet behind a `v-if` on its own data never returns focus.** `Popup` returns focus only when `show` turns false; an unmount releases the trap without it. The re-ask sheet is drawn from a snapshot taken when it opens and stays mounted after it closes.
- **The burst account's private TST is a budget.** It holds 59 TST when the re-ask case starts; the first run sent 35 then 36 and B failed its build with `Balance too low` (the token's assertion; FeeJuice's `check_balance` uses the same words). The case sends 9 then 10.
- **Leaving the re-ask state unmounts the sheet but not its popup slot.** `v-if` drops the sheet when the record moves on, while `send_reask_review` stays on the stack; the close-on-change watch is what removes it, and the test checks the store, not the DOM.

## Codex round 1 (gpt-6.1-sol, high, session `01a1373c-806c-7fe0-ac72-e7e6f67e5a21`) over `c629d335..fc83597d`

Verdict: conditional approve. The eight lead questions answered "no path found", each with a trace.

Accepted:
- **Medium.** An accept arriving after the send's deadline but before the timer fired resumed the send, whose next `waitTurn` then failed it with the earlier-send wording instead of cancelling it (OA-12). `QueuedFeeAnswers.accept` now refuses past the deadline and settles `expired`; a fake-clock case fails without it.
- **Low.** The header's "nothing is signed" was false (the at-turn build signs); it now says the build is neither proved nor broadcast. Three narrating comments removed; the six-decimal rounding against the exact accepted fee is noted at `reaskReview`.

Rejected: none.

## Opus review (general-purpose, opus) over `c629d335..fc83597d`, alongside Codex round 1

Verdict: conditional approve. The eleven questions answered "no" with traces (no proof above the cap, no double broadcast, no slot held while deciding, no stranded record, no stale-fee resume, no overtaking, no retained request, no network read, no log or dApp change, no weakened assertion).

Accepted:
- **Medium.** Closing the re-ask sheet unmounted it in the same tick (`v-if` on the live record), so focus fell to `body` and the sheet skipped its exit. The sheet now draws a snapshot taken at open, stays mounted when closed, and a press on a closed sheet accepts nothing; a record the sheet cannot draw opens no slot; a scope switch drops the snapshot.
- **Low.** The deadline race (the same as Codex's medium, fixed there). `TransferFeeQueued.cap`'s doc named one figure for two. `isFeeAmount` moved beside `QueuedFeeReask` in `@nulo/wallet-core/jobs`, so the journal schema no longer imports the execution module.

Rejected:
- **An accept a few milliseconds before the deadline** still resumes, and the next turn's wait fails with the earlier-send wording. It needs a press inside the last instant of a 60-minute wait; nothing is sent, only the terminal wording differs, and mapping it adds a branch to the turn's error path for that instant.

## Codex round 2 (resumed session) over `fc83597d..9b6f7e5c`

Verdict: conditional approve. The deadline, focus, slot, snapshot and closed-press fixes verify; no regression in the product code; the eight safety conclusions stand.

Accepted (all e2e):
- **Medium.** The case kept the popup page it started with, which `reopen` closes; after the first accept it read the journal through the closed page. It now reads through `burst.page`.
- **Medium.** `expectEstimateQueued` passed with no Send button at all (`undefined === false` read as disabled), weaker than the base, which required a present, disabled button. It now fails when Send is missing.
- **Low.** Four test comments overstated or narrated their helpers; trimmed.
