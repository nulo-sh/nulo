# Phase 0: planning consults and evidence

Planning-time log: every panel consult (including failed ones) and the evidence gathered before implementation.

## Recon (2026-10-11)

- Two Explore agents (sonnet): a caller and reuse sweep for #297, and a logging and Firefox-runner sweep for #295 and the validation plan. Findings in `recon.md`.
- Engine check: `structuredClone({ a: new Proxy({ b: 1 }, {}) })` throws `DataCloneError` on Bun 1.4.2 ("The object can not be cloned.") and on Node ("#<Object> could not be cloned."); the same for an element of a Vue `reactive` array on Bun.

## Dual audit, round 1 (2026-10-11)

- **Codex** (gpt-6.1-sol, high, read-only; session `01a12a9b-f22d-7952-ab23-9bf5b4bb6a96`; ran on the roster account `CODEX_ACCOUNT=best` picked). Verdict: conditional approve (with conditions: correct D6's log assertions, preserve guarded-write semantics, and test the same-identity prefill path).
- **Opus 5.5 Plan agent.** Verdict: conditional approve (with conditions: fix the Phase 2 assertion shape; a base-red "remembered" pin with a cloning `get` and a hand-added sponsor; positive Firefox evidence).
- Verified by the planner: `LoggerStore.log(source, level, ...data)` keeps the message as `data[0]` (both legs right, plan wrong); `jsonStringify` turns a `Map` into an entries array and a `Set` into an array (Codex right, plan wrong); `grep -c` exits 1 on zero matches (Codex right); `bun run test -- <path>` runs only that file (checked: 1 file, 9 tests).
- Disagreements taken back to Codex (resume): clone timing, projection width, the Phase 1 pin, a positive Firefox check, D4's reason, the residual-trust disposition.
- **Codex, resumed** (same session): agreed to all six settlements (clone on entry with the contract documented and a skip-refusal test; the `{ id, isProtocol }` trim; the hand-added-sponsor pin with cloning `get`/`set`, fresh Pinia and a deferred read; the e2e readback, strengthened to an empty record before the pick and the exact sponsor id; dropping D4 and widening D8; D10 as a disposition, noting the FPC settings page's delete as a second writer). Added: run the same-identity test for both sponsor kinds. Verdict: conditional approve (with conditions: adopt these settlements, test both sponsor classifications during same-identity prefill, and make browser readback prove the new pick's exact identity).
- Plan revised to v2 with every accepted finding; ledger D1-D12 records both legs and the outcome.

## Final fresh Codex pass (2026-10-11)

- Codex (new session `01a12aac-47f2-7d32-867e-6bd20f44207c`, gpt-6.1-sol, high). Verdict: conditional approve (with conditions: pin clone-on-entry snapshot semantics across a migration wait; correct F12's production-migration claim).
- Both conditions adopted (Phase 1 step 6's snapshot case; F12 and A2), plus its Low findings (I1 wording, red/green classes, the re-run test proving the re-run started, the readback through `execPopup` on the fixture's `accountAddress`, recon's `jsonSanitize` line, `lint:actions`). No finding rejected. Plan v2.1.

## Phase 0: Firefox baseline on base (2026-10-11)

Tree: the plan commit merged with `origin/dev` at ca79036 (merge 403623d), `src/` untouched. Both calls ran with `NULO_E2E_BROWSER=firefox NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0` through `bun run e2e:agent`, one after the other.

| Call | File | Tests (retry 0) | `DataCloneError: Proxy object could not be cloned` | Test in flight when it printed |
|---|---|---|---|---|
| A | `same-token-concurrent-sends` | 14/14 pass | 1 | the file's first case, "different tokens: the second send does not wait for the first" (the last test to print) |
| A | `concurrent-sendtx-approve` | 1/1 pass | 1 | its only test |
| A | `concurrent-sendtx-confirm` | 1/1 pass | 2 | its only test |
| B | `selfpay-phase` | 1/1 pass | 1 | its only test |
| B | `authwit-lifecycle` | 1/1 pass | 3 | its only test (three fee popups) |
| B | `popup-escape-layered` | 2/2 pass | 1 | "escape closes a menu inside a popup first and the popup second" |
| B | `tx-sendTx-sponsoredFpc` | 1/1 pass | 1 | its only test |

Counts: call A 4 (`grep -c` exit 0), call B 6 (exit 0), total 10, matching the issue's count and recon's per-file pick count. Both runs exited 0. Firefox prints each as `JavaScript error: undefined, line 0: Error: DataCloneError: Proxy object could not be cloned.`, with no location.
