# Phase 1: the Terms answer (#1123)

## 2026-10-27 · Delivery

- gh-stack 0.3.0 has no `init --adopt`; `gh stack init --base dev worktree-e2e-infra-3` adopts the existing branch.
- A unit test of `answerUpdatedTerms` from `scripts/e2e/` fails `typecheck:all`: importing `helpers/legal-drivers` pulls the e2e fixture graph into `tsconfig.scripts.json` (inject keys typed `never`). The decision moved to `fixtures/legal.ts` (`updatedTermsAnswer`, imports only `@nulo/legal`), tested in `scripts/e2e/updated-terms.test.ts`.

## 2026-10-27 · Red proofs (S7 only, `--retry=0`)

- Old check (`isSheetPresent` alone), S7 waiting for Home before each call: 10/10 green, the control rejecting every time. With Home up, the old check sees the sheet.
- Old check, no Home wait before the stale control: 10/10 red (5 per browser), "promise resolved": the immediate absence check is vacuous after a reload.
- New check as first committed (verdict marker for any route), no Home wait: red 3/3 Chrome, 1/3 Firefox. A trace of hash and marker every 5 ms across the stale reload, both browsers: `#/popup/general` (no marker) → `#/popup/auth` (`hidden`) → `#/popup/general` (`shown`, sheet), about 70-280 ms apart. The reload lands on the lock screen first (the guard's answer before the session is checked), and the verdict there is `hidden` whatever the acceptance.
- Withholding the marker on the start location only: still red 1/5 on Firefox (the lock screen). Reverted.
- A wait for Home inside the helper: green 10/10, but it would time out the chaos run, whose steps can end on Settings (`profile-chaos/ui.ts:298`). Replaced.
- Shipped: the shell marks the verdict only where the route's meta has `isAuthRequired`. Trace: no marker on the start location or `#/popup/auth`, `shown` on general. S7 without Home waits: 10/10 green, Chrome 8.3-9.8 s, Firefox 16.6-19.2 s.

## 2026-10-28 · Review rounds (arc 1)

- Codex r1 (`gpt-6.1-sol`, high): `approve`. Opus (general-purpose), run beside it: `conditional approve` with six low findings, five taken (`5c7aef1d7`): read the verdict inside its wait; mark only where `legalSheetMayCover` holds (export and declined routes are auth-required but never covered); a hidden leaf instead of a wrapper testid, which had become every popup element's nearest testid in the type-role sweeps; rewrite two caller-naming comments. The fee-wait finding is in phase-2.md.
- A resume against the worktree as its codex-dir ran round 2 on `gpt-6-astra` and wrote its session files into the worktree root (moved out, never staged). Resume with the CODEX_DIR `run-codex.sh` printed. Round 3 ran on `gpt-6.1-sol` and re-verified both rounds: `approve`.
