# discovery-allow-1: phase 0 consults

## Consult 1: Codex plan audit (gpt-6.1-sol, high, read-only), 2026-11-06

Packet: plan (outline A), outline B, recon, the four asks, five specific questions (D4, D5, D11, the gates, the budgets). Verdict: **conditional approve** (surface unsigned copy, settle the refusal and cancellation guarantees, retry-0 gates).
- D4's guarantee is bounded (eviction after 32, a failed write): accepted as stated limits, written into D4.
- D6 cannot enforce a worker-side cancellation before the write: resolved by making Turn on always write (the person's confirmed global choice), deterministic regardless of when the window sees a cancellation.
- Locked is not keyless (`rowKeys` survive lock and switch): the writes take the deletion fence, as `RegistrationAllowance.admit` does; the Security text corrected.
- D9 and D11 unsigned: D9 kept as the lane's factual call (precedent: iface-line-1 set `where` itself; copy-polish: `where` names where the term is dotted); D11 moved to OWNER-ASKS (OA-1), arc 2 only.
- Network gates did not force retry 0: `NULO_E2E_RETRY=0` added.
- I2 timing and D10's capability claim corrected (`Tooltip` has `side="top"`, `DottedTerm` does not pass it).
- A vs B: A on every point (B's plaintext read would let a Firefox storage writer plant `{ everySite: true }`).

## Consult 2: Opus 5.5 plan audit (Plan agent), 2026-11-06

Same packet. Verdict: **conditional approve**. It audited the draft before consult 1's folds landed in plan.md, so five of its points restate consult 1. New and accepted: keep `refuseVerification`'s channels-first order (emit, then start the record synchronously; `allows` reads under the policy's lock); no e2e sweeps the discover window's type roles, and `type-roles.test.ts` never visits Connected Apps (claims dropped); with the switch on every discovering site gets a stored row (OA-2); quote page 116's guard as the D4 rule; registration at `:373`; `approval-window-harness.ts` and the lifecycle pins in the change map; a plaintext row after unlock; the twin's token proved by queueing; `.strict()`. Rejected: D9 as an owner ask; carrying the grant in the interaction result.

## Consult 3: final fresh Codex pass (gpt-6.1-sol, high), 2026-11-06

New session, the consolidated plan and ledger. **Conditional approve:** D9's precedent is not a sign-off (now OA-3; it blocks arc 1); two test lines contradicted D4 and D6 (rewritten); a connection queued behind admission could finish after the switch is turned off (D5 re-reads the switch after admission); OA-1 and OA-2 were defaults posing as asks (now they gate arc 2's merge). Resumed: one stale D11 sentence; fixed. Resumed again: **approve**, high confidence. Confirmed: D4's ordering holds on `Lock`'s FIFO (`enter` pushes synchronously, `dispatch` shifts); rejecting D6 option B is right on the smaller boundary.

Outcome for the session: the auto-continue precondition fails (OA-3 concerns Settings → Glossary, which arc 1 touches), so the session ends at the plan report. Arc 1's draft code (the window body, the glossary entries, `DAPP_SESSION_DAYS`, the rewritten tests; 67 targeted tests green) is saved outside the repo and reverted from the worktree.
