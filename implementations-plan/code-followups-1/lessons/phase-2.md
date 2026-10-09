# Phase 2 — the awaiting-card hydration race

## Change

- `same-token-concurrent-sends.test.ts`: `readAwaitingCard` (wait for any card, then read the first) is
  replaced by `readAwaitingCards` + `waitForAwaitingCard(page, stage)`: a Node-side loop, one
  `page.evaluate` per 250 ms, that returns only when exactly one `tx-awaiting-card` exists, its
  `data-stage` equals `stage` and its `tx-awaiting-cancel` is present. A sample with two or more cards
  throws at once; 30 s for a first card, then 10 s for the condition; each timeout throws with the last
  snapshot of every card.
- The sibling case keeps its `toEqual` on the snapshot, now with `cancel: true`. The case that failed
  in CI first reads its journal row through `waitForTransferStage` with every stage accepted and
  asserts `queued`, then waits for the card, then clicks cancel.
- Deviation from the plan's text: the cancel case no longer wraps the wait in
  `expect(...stage).toBe("queued")`. The helper returns only at that stage, so the assertion could never
  fail; the wait itself is the assertion (decision ledger D14).
- `RecentActivityView.test.ts` gains "hydration order": the executing-task snapshot lands, the journal
  snapshot is held; one stage-less, non-cancellable card renders (the orphan card). The journal
  resolves with the send's queued record; one card remains, at `queued`, cancellable. Checked once by
  a throwaway edit (an op whose `tokenId` the task does not match): the test fails, as a duplicate
  card must.

## Probe (live, Chrome, proverless; never staged; kept under the lane's scratch dir)

A copy of the cancel case confirms A and B from two windows, closes the second window, then reopens the
popup 12 times while B waits at `queued` (mining held). Per reopen it installs a `MutationObserver`
right after `openPopup` returns (records every distinct card state with `performance.now()`), runs the
BASE helper (`waitForSelector` then read the first card), polls every 100 ms for 3 s, then runs the new
helper.

- 12 of 12 reopens showed a stage-less card with no cancel control first, for 3 to 14 ms
  (e.g. `[475,"NOSTAGE"] → [480,"queued+cancel"]`, `[704,"NOSTAGE"] → [718,"queued+cancel"]`), then
  the one `queued` card. The mechanism holds live: the executing-task snapshot lands before the
  journal's.
- The BASE helper read `stage: null` in 0 of 12: the stage-less window is shorter than its
  select-then-read round trip, so the base fails only when the journal read is slow, consistent with
  one failure in about 100 CI runs.
- No sample held two cards (observer and polls). The new helper returned `queued` on every reopen.
- Control: `waitForAwaitingCard(page, "submitting")` threw after its budget with the snapshot
  `no sole awaiting card at submitting with a cancel control: [{"stage":"queued",…,"cancel":true}]`.
- The probe's tail (cancel B, release mining, settle, ledger) passed: 1 passed, 13 skipped (`-t probe:`).

## Limit

Repeated greens cannot certify a flake seen once in about 100 runs (zero failures in 100 exposures
still allows about 3 %). The claim rests on the code reading, the live probe and the component test.

## Arc 1 Codex round 1 + Opus review (2026-10-09)

Codex (session `01a11e40-4180-74c0-99da-e5b7a033bc03`) and Opus both found the helper waited through
any non-matching card, so a card first rendered at the wrong stage (e.g. `pending`, then `queued`)
would pass where the base read failed. Fixed: only a sole stage-less card is waited through; a staged
card returns or throws on sight; the deadline is checked against each sample's start before it can
return; `count` dropped; the cancel case's pre-check is `waitForTransferStage(…, ["queued"], 5_000)`.
Nits accepted: the `ANVIL_PORT` comment, the setup line names `scripts/aztec.sh`, the component
test's comment no longer names its consumer. The Chrome gate above (5/5 + 13/13) ran on the pre-fix
helper; the gate is rerun on the fixed one.

## Gate runs

- Chrome, pre-fix helper (2026-10-09): `-t "two windows"` 5/5 green (2 passed, 11 skipped each);
  whole file 13/13 green (525 s).
- Codex round 2: one new finding, accepted (the sample's timestamp is taken after the read, so a
  slow `page.evaluate` cannot pass after the deadline). Round 3: `clean`.
