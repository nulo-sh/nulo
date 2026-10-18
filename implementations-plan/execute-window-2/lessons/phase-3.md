# execute-window-2: arc 1, phase 3 and the review loop

## Runs (all at retry 0, through `agent.sh` for network)

| Run | Commit | Result | Wall-clock |
|---|---|---|---|
| network Chrome: scope-refusal, authwit-lifecycle | `69ecbf64` | 3 passed | 393 s |
| network Firefox: the same | `132a3171` | 3 passed | 588 s |
| smoke Chrome (unarmed `dist`, invalid) | `132a3171` | 4 failed: `import-dead-rpc` x3, `backup-migration` | n/a |
| smoke Chrome, armed build | `132a3171` | 57 files, 262 passed | 1816 s |
| network Chrome + after pictures | merge `f466e3be` | 4 passed | 382 s |
| network Firefox | merge `f466e3be` | 3 passed | 590 s |
| smoke Chrome, armed build | merge `f466e3be` | 57 files, 263 passed | 1894 s |
| smoke Firefox, armed build | merge `f466e3be` | 60 files, 263 passed | 2697 s |

scope-refusal test 2 against test 1 on the same run, locally: Chrome 20.4 s / 20.4 s, then 24.4 s / 23.8 s; Firefox 25.0 s / 25.6 s, then 23.0 s / 21.7 s. On `dev` before the arc (CI): Chrome 11.2 s / 11.0 s, Firefox 21.4 s / 20.1 s. Test 2 now refuses in the window instead of at execution; its time stays level with test 1's.

- **Smoke builds nothing.** The first Chrome smoke loaded the network build `agent.sh` had left in `dist/chrome`: `import-dead-rpc`'s stub saw no traffic and `backup-migration` named the missing fixture. The plan's smoke command lacked the armed build the `e2e-testing` skill prescribes (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e`). Rerun armed: green. Not a flake and not the arc.

## Pictures

- Before and #777: taken at `dev` `97ffa088` (detached, the two scratch edits of Pictures step 2 applied, then discarded); after: at the merge `f466e3be`. Both in one `agent.sh` run each. `shotSend` writes the default (light) theme as `<name>.png`, renamed `-light`.
- The base window shows today's toast with Confirm on (Sponsored), and History after Reject reads "Balance Of Public / Transaction failed", the name the call claimed.

## Review loop

- **Opus 5.5 diff review** (`general-purpose`, beside Codex round 1): conditional approve, no divergence from D1-D7, no exploitable path. Taken: a T1 sub-assertion that passed whatever the storage guard did (now `refusalOf` of an approved id); the window and the dApp's answer could name two different refusals when an attempt already past the record check met a second one (`refusalBound` now answers the first recorded); a comment over the line cap. Its conditions (run Phase 3; OA-1's answer before merge) are the gates above and D10.
- **Codex round 1** (gpt-6.1-sol, high, session `01a150a0`, over `132a3171`): approve, no finding. Its one evidence gap, T2 and T3 red on the base, was then run: four tests red on the base copies of `execution/service.ts` and `queued-journal.ts`.
- The first Codex call passed the prompt as text; `run-codex.sh` takes a file path and exited at once. Rerun with the file.
- **Codex, resumed after the merge of `dev`** (`f466e3be`): approve, no new material finding. The loop converged.
