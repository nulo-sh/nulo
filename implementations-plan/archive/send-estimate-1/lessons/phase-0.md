# Phase 0: planning consults

## Probes on the base

A scratch block appended to `apps/extension/src/popup/pages/send.test.ts` (reverted with `git checkout`) measured eight paths on `1531e5f9`, then again with the issue's `.valid` getter and with the `sendableAmount` computed spliced into `send.vue`. Table: [recon.md](../recon.md#probes-on-the-base-sendtestts-harness-scratch-copy-not-committed). First run of P3 was wrong: `mockResolvedValue([TOKEN])` hands back the same array, so a re-read set `tokens.value` to itself and nothing fired; a fresh `[{ ...TOKEN }]` reproduces the production re-read.

## Consult 1: plan audit

- Codex (gpt-6.1-sol, high, session `01a154a6`): conditional approve. Ship P5 as today through a second watch (its B″ watched a `sendableAmount` computed); state the Vue rule precisely; queue mode and a qualified load claim in Security; pin the shipped P5 with an edit-then-recover tail; build armed before smoke.
- Opus 5.5 (Plan): conditional approve. Verified the Vue mechanics in `reactivity.cjs.js` (job L1908, `isDirty` L391, `refreshComputed` L402-426). Proposed the boolean getter outside `deep` instead of B″ (no second schedule per valid keystroke); balance witnesses in T2/T3; T3 unconditional; the private reproducer on the real fee card; `audit:vue` in the gate.
- Decision: Opus's form (D3). Probed on a scratch splice of `send.vue`: P1 and P6 fixed with the typed amounts, P2 keeps the fee, P5 kept with no cancel, an edit while unsendable then a rise asks again, P4 and typing unchanged, the file's 86 tests green.
- Reading of the auto-continue rule: OA-1 ships as today, so the arc does not depend on it ("the arc ships without it", spawn note); recorded in STATUS.md.
- Codex final pass (resumed twice): conditional approve on the load wording and F5's scope, both applied; then `approve`.
