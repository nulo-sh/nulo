# Arc 1 (phases 1.1-1.5) — implementation log

Every gate, consult and deviation, in order. Paths are repo-relative.

## Start (2026-10-09)

- Merged `origin/dev` at `79bbd7b` (#55, #58, #75 landed). #58 had merged, so Phase 1.4 converts
  all nine calls, `dapp-session/spec.ts` included (D8 resolves to nine; entry 132 closes whole).
- D-orch-1 and D-orch-2 recorded in the decision ledger (`fc0e099`).

## Gates

- 1.1 (`95aaa3b`): `transfer-estimate-reuse.pins.test.ts` (6 assertions red on base, green after),
  `account-state/service.test.ts`, `log-payload-ban.test.ts` green; `git grep "base fee fetch
  failed:"` empty.
- 1.2 (`badfaf1`): `profile/` + `token-balance/`, 24 files, 513 tests; smoke `profile-rename` +
  `auth-flows` on Chrome, retry 0, 7/7.
- 1.3 (`26e410a`): `purge-rows` + `account/`, 17 files, 183 tests (3 new cases red on base; the two
  never-happens cases red under a mutation that drops the re-read guard or lets the key override a
  parseable value); smoke `security-reset` + `passkey-retry` on Chrome, retry 0, 9/9.
- 1.4 (`b8d5451`): nine calls; `typecheck:all` exit 0; the six specs' services + `dapp-session`,
  35 files, 550 tests; `aztec-runtime` 367; `nativeEnum` grep empty.
- 1.5 (`4647f05`, `ea1b589`): `execution/` + `wallet-sdk/`, 83 files, 1,323 tests (15 assertions red
  on base); network `scope-refusal` + `err-scope-and-cap` on Chrome, retry 0, 5/5 with the throwaway
  shot spec, and on Firefox 4/4. The `TextEncoder` patch takes on Firefox: no case is skipped. Shot
  texts equal § UI impact's rows.

## Interruption

- The implementing session died on an account rate limit after 1.5's gate, with the Codex round-1
  consult already returned. A resumed session picked it up from the scratch record; no gate was
  re-run whose inputs had not changed.

## Codex fix loop

- Round 1 (gpt-6.1-sol, high, read-only; the run landed on the `alejo-icloud` Codex home; session
  `01a12134`): **approve with nits**, three minor findings, all verified and accepted (`ba12c4e`):
  1. Home's Recent activity card renders the same terminal-card subtitle as History, so it also
     reads "Not allowed". Option A's "the subtitle 'Not allowed'" covers it; § UI impact now names
     both lists, and the e2e reads Home's card before History's.
  2. `token-balance/spec.ts`: "one drain must fill exactly one chunk" was false (the queue drains per
     account, the projector chunks per chain). Now states the bound that holds.
  3. `account-state/service.ts`: the rewritten doc comment narrated; cut to its contract.
- Round 1, Opus leg (general-purpose agent, alongside): **approve with nits**, one material and two
  minor findings, all verified and accepted (`721fe5c`, plan): the wallet-bridge README's dApp-facing
  contract named only the grant check; the job-error producers list; § Security's log claim narrowed
  to windowless calls, since the execute window's own fee-estimate and preview lines still log at
  `error` (pre-existing; each needs a window the person opened).
- Round 2 (Codex, same session resumed with `ba12c4e` + `721fe5c`): **approve with nits**, "no new
  material finding". One minor plan wording (a fee-settings change re-runs the window's estimate,
  so "once per window" was wrong), accepted. Loop converged.
