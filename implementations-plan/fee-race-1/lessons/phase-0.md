# Phase 0: recon, root cause, plan audits

## Recon (2026-10-28)

- Two Sonnet explorers: the test infrastructure (composition harness, chaos pattern, e2e helpers, component tests, budget tooling) and the Send estimate's timeline during a dApp send. Their findings are in [recon.md](../recon.md).
- Planner trace: the worker refuses a Confirm with no authorization snapshot when discovery finds one (`preview-snapshots.ts:73-85`); only a landed estimate or preview writes it; the window waits for the fee figure only, and a sponsor is exempt (`fee-figure.ts:40-45`). The default-entrypoint preview gates nothing.

## Consult 1: Codex root cause (gpt-6.1-sol, high, read-only), 2026-10-28

Asked: is the bug 1 cause right; fix (a) in-flight hold, (b) landed-only, or (c) press-then-wait; is the 120 s TTL path real; rank the bug 2 mechanisms (M1 PXE line after the proof, M2 admission park, M3 an unordered Send against spent fee notes, M4 other); is the 60 s/90 s deadline inversion a cause.

Verdict and disposition:

- Bug 1 cause confirmed, high confidence. Correction accepted: embedded app payments return no discovered hashes at either end, so they never meet the refusal; the default-entrypoint path is real but runs on its own preview, not a fee estimate.
- Fix (a) for the reported race, including the debounce and `approve()`'s guard. Accepted. Codex notes (a) keeps D38's failed-estimate case open; kept, no new evidence against D38.
- TTL path real, high confidence, and worse than drafted: the snapshot is consumed at the operation's turn, so a Confirm pressed in time expires while queued. Codex: track separately. Accepted as Phase 1.2 under a new issue (D5).
- Bug 2: root cause unknown from the report; ranking M1 > M4 > M2 > M3. M3's premise refuted: the PrivateFPC `pay_fee` call is in `txCalls`, so the swap's row carries `fpc:<PrivateFPC>` (`fpc-strategy.ts:252`). Accepted; recon F9 records it.
- The deadline inversion is a real contract defect. Codex: fix budget ownership; if active work legitimately exceeds 60 s, use an asynchronous progress contract, not a larger timeout. Disputed: the draft aligns the popup's estimate deadline with the worker's own job bound (`executeTransfer` precedent) and records the asynchronous contract as Outline B, for the audit to settle (D8).
- Codex: "CI never proves" overstates it; the prover-ON canaries prove real sends. Accepted: they run one send at a time, so they never hold a proof while another estimate runs.

## Audit round 1, 2026-10-28

**Opus Plan leg: conditional approve.** Dispositions:

- Settled-handle sweep evicts snapshots at 120 s on any admission (high): accepted, recon F12; D5 sets the settled TTL to the longest stash's, with a fake-clock service red test.
- Missing owner ask for Confirm waiting minutes behind another send (high): accepted as OA1 with today's behaviour, the wait, and the 10-minute close; D6 ships only on its yes. Arc 1 does not depend on it.
- #1336 not reproduced; Phase 2.3 green on the base (medium-high): accepted. Phase 2.0 reproduces prover-ON with PrivateFPC on both sides and decides how #1336 closes (D11); Phase 2.3 is labelled an integration backstop, and 2.1's client test is the red.
- O1 contradicts D38 (medium): accepted, D13.
- Arc 3 driver would test a copy (medium): accepted. The driver runs the real popup rules; the approval-delta builder is extracted when arc 3 becomes its second caller; deadlines are read from the real client; faults are injected at seams.
- `estimateSendTransactionFee` is not a client method; `ESTIMATE_JOB_TTL_MS` is a reaper (low-medium): accepted; dropped, KL2 names the auth-registry estimates, D8's reason restated, KL3 added.
- Pre-admission read needs the op's network; requeue needs the attempt's params (low-medium): accepted into D6's text.
- Keep the snapshot off the port-reachable envelope (low): accepted; the claimed set stays in the worker.
- 60 s in D7 has no evidence (low-medium): accepted; D7 uses the helper's documented 120 s estimate-gate budget, and Phase 1.1 logs the timings.
- I1 holds ops that need no snapshot (low): rejected, D10 (the issue asks one rule; narrowing copies the worker's rule).
- Model under `tests/e2e/helpers/`, purity test (low): accepted; moved to `tests/helpers/fee-race/`, purity test dropped.
- Gates: proverless flag, per-file JSON duration, name the meaningful reds (low): accepted.
- N1 "seconds" contradicts F7; "both inside (a)" unsafe: accepted; both rewritten.

**Consult 2, Codex audit (resumed session): reject.** Dispositions:

- D8's bound does not exist; take B's asynchronous half (high): disputed. The call answers when its run ends, and the worker ends each request at 90 s and answers (`service.ts:691-728`); the TTL is cited as the constant kept above that chain, not as a work ceiling. B's obligations listed in Trade-offs; it is the path if the owner wants OA2's B. Argued in round 2.
- D5 misses the settled sweep (high): accepted (as Opus).
- D5 names the wrong ingress; ownership incomplete (medium): accepted. The claim runs in the acceptance tick, as `executeAndResolve`'s first statement; its existing `finally` releases; duplicate and foreign ids specified.
- N1 and the DoS argument lack evidence (high): accepted; N1 rewritten as unmeasured, FIFO precedence kept, tests for a send arriving and a cancel during an estimate added; the title's "never fails on a wait" dropped (KL1).
- OA1 assumed its behaviour (high): accepted; OA1 now asks the behaviour, with today's and the 10-minute close; A1/A2 replaced by S1/S2.
- Arc 3 exceeds the composition contract (high): accepted, D12; no new carve-out, landings seeded through the worker's own stash APIs.
- Oracles contradict retained behaviour (medium): accepted; outcomes per action, O3 against the journal's transition table, O4 after holds release and excluding a send cancelled in its proof.
- Proofs insufficient or unrunnable (medium): accepted; whole-file reverts replaced by seam-injected break fixtures, the client-method test dropped, e2e cases labelled backstops, N3/N4 measured.

## Consult 3, Codex round 2 (same session), 2026-10-28

Verdict: conditional approve. Dispositions:

- D8: Codex accepts the synchronous design over B's async half (a worker-side request timeout answers the call; only the admission place is held). Condition, demonstrated: the deadline also counts admission parking, and a parked call activated near the deadline fails on a healthy run. Taken as Codex's alternative: I3 narrowed to admitted calls, KL4 recorded; changing parking to a queued answer is a registry change for a case that needs four estimates admitted behind one proof.
- D5: ownership accepted (first-statement claim, existing `finally` release, every exit covered; a cancel after acceptance does not revoke by existing policy; the fee question stays in scope). Requirements folded: try right after the claim, release only own entries, idempotent, `evict` never reaches claimed entries; wording no longer says the snapshot and window expire together.
- Arc 3: seeded landings fit the reuse precedent; an early or post-120 s Confirm needs a rebuild and is out of the layer. Folded: per-action seam map, the driver stops at the snapshot lookup there, O2's transport proof stays in `client.test.ts`.
- Arc 1 depends on neither owner ask (Codex read #1335's Expected).
- The network command ran a root-only script from `apps/extension`: fixed.

## Consult 4, Codex final pass (fresh session), 2026-10-28

Verdict: conditional approve, then approve after one round. Conditions, all accepted and folded: O2 asserted an order among estimates that production does not give (a later estimate's poll can take the freed slot first; queued answers reserve no position), so O2 now asserts none and the mutex's order stays O3's; the model's colocated test sat outside the unit runner's `src/**` and `scripts/**` globs, so it moved to `src/wallet/services/execution/fee-race-model.test.ts`; the e2e configs default to two retries, so every e2e command carries `NULO_E2E_RETRY=0`; N2 overstated the retention cost's evidence and now says unmeasured. It found the F1-F12 causal claims supported, the claim-and-release design sound, and arc 1 independent of both owner asks.
