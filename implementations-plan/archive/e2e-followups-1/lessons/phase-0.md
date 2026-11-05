# Phase 0: recon, baselines and consults

## 2026-10-28 · Recon

- Three Explore agents (sonnet), one per issue; findings in [recon.md](../recon.md).
- In zsh, `git show $t:apps/…` applies the `:a` modifier to `$t` and reads nothing; write `"${t}:apps/…"`.

## 2026-10-28 · Baselines at `210d02f1f` (Chrome 155, candidate 1.1.0.1, retry 0, load about 95)

- Candidate build: `bash apps/extension/scripts/e2e/build-update-candidate.sh chrome`, 35 s.
- Seed 3001 from v1.1.0: red at the start check, `O2 P2 is listed not as retired after the update | O1 the lock screen on retired P2 does not show Set up again | O1 the lock screen offers retired P2 an unlock`; test 10.5 s.
- Seed 3001 from v1.0.0: start clean; steps 0-3 committed (`unlockPassword` at step 3 opened P1); step 4 red, `O5 the update's first open could not be answered`, detail `no network-reset screen … Waiting failed: 30000ms exceeded (from run.ts:493)`; test 48.0 s.

## 2026-10-28 · CI forensics for #1300

- Attempt 1 job 122558104944 and attempt 2 job 122583716388 of run 40609217178, plus heavy-shard jobs of five green runs (40662874339, 40625595797, 40621695395, 40619906650, 40644402399), read with `gh api repos/nulo-sh/nulo/actions/jobs/<id>/logs`.
- `Script terminated by timeout`: attempt 1 once (zod parse under `proveTx`, 01:11:09); 40625595797 once (ABI decode); the others none.
- `[same-token] re-ask 1` is printed by every green run (fee 239127978458250 over cap 143000000000000, or 229339110766500 over 137000000000000) and missing from attempt 1.
- The run kept no artifact.

## 2026-10-28 · Codex r1 (gpt-6.1-sol, high, fresh session)

- Verdict `reject`, seven findings: H1 needs attribution, not a correlated gap (high); no reproduction is not a known limit by itself (high); the picker probe's privileged calls move focus and its outliers must not authorize a change (high); H2's trajectory misses the no-re-ask path (medium); D5's claimed failure was undemonstrated and `verifyAll`'s nested opens bypass the hook (medium); the credential is compared only after the first step (medium); gates not copyable (medium).
- Verified before acting: `chromeScript` switches to the first window (`webdriver-classic.ts:124-132`); `verifyOne` opens profiles and never consults `s.afterUpdate` (`verify.ts:127-152`); the spec logs fee and cap only on an asking row (`same-token-concurrent-sends.test.ts:636-656`).
- Taken: stack-only attribution and the profile; #1300's closure kept only as the lane brief directs and without a `known-limit` label, #1222 left open (A1, D9); the two-stage picker probe and the 10 s bound for a change; B's full trajectory and H2′; D5 restated as coverage, with I3 and its control; `checkProfiles` at the start; copyable gates; the collector watching the parked page first.
- Kept: D1, D2, D4 (Codex agreed after reading the three tags' `getNetworks` and the v1.1.0 New-profile path).

## 2026-10-28 · Firefox baselines at `210d02f1f` (Firefox 153.0.4, candidate 1.1.0.1, retry 0)

- Seed 3001 from v1.1.0: the same three start violations as Chrome; test 20.8 s, run 30 s.
- Seed 3001 from v1.0.0: step 4 red, the same O5 first-open violation; test 64.9 s, run 73 s.

## 2026-10-28 · Opus Plan leg

- Verdict `conditional approve`, nine findings. The high one, read from the code: a queued send reaches `proving` without an ask only when its fee fits its figure (`transfer-executor.ts:364-373`), so #1300's second failure cannot come from a stall, and the spec records fee and cap only on an asking row. It named H2b: the basis is the newest same-shape UI row (`queued-fee-cap.ts:66-88`), so a newer row of that shape replaces the hour-old seed.
- Its other eight: hidden-page timers are clamped (FIREFOX.md:61), so a gap counts only while visible, beside a quiet control; the picker probe's focus; D6's numbers and split; branch (a)'s bar; the newly reachable no-takeover branch needs `shownOverlays`; `checkProfiles` at the start; the model loops over three starts; D5's Terms per open.
- Taken: all nine (plan.md § Audit verdicts). Its two asks became A2 and the 100-run grep.

## 2026-10-28 · Codex r2 (resumed)

- Verdict `conditional approve`; r1's seven verified. New: a background-page sampler dies with the case's own restart of the background (`same-token-concurrent-sends.test.ts:269-275`) (high); D5 promised Terms checks the steps did not (low); the intro and OWNER-ASKS disagreed with A1 (low).
- Taken: the background sampler is gone; each reopened popup carries its own, re-armed per page, and a missing one is incomplete evidence. D5 and the ask records synced.

## 2026-10-28 · Codex final (fresh, gpt-6.1-sol, high)

- Verdict `conditional approve`, three findings, each checked against the code: reading the first Terms expectation from the candidate's record lets a wrongly written acceptance pass (medium; Codex ran the helper in memory); Send replaces its queued cap on every answer until submit (`send.vue:430-434`, `:505`), so the fee card's earlier text may not be what B carried (medium); recon called the rollup version `679261766` the chain id, which is `685146337` (`chain-ids.ts:32-35`) (low).
- Taken: all three (plan.md § Audit verdicts). D1-D4 and D6-D9 agreed.
