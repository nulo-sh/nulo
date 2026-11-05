# e2e-flakes-3, phase 2: the default simulation cap is the predicted worst minimum

Base: `origin/dev` at 5f95ea108. Network runs from the root through `agent.sh`: `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent …`, with `NULO_E2E_BROWSER` set to the browser.

## Red and green

- Unit, `fee-options.test.ts` case 7 at base: red. It expected (240, 750) and got (150, 300), the current minimum × 1.5. After the change: 8 of 8 green, and 17 of 17 with `fee-juice.test.ts`.
- Probe `_probe-fee-rise.test.ts` (uncommitted, deleted after): a loopback proxy serves the wallet a quarter of the node's `aztec_getCurrentMinFees`.
  - At base: red on Chrome (142 s) and Firefox (169 s). The proxy rewrote 6 current-fee replies, the node logged 5 refusals, and no toast came within 60 s.
  - With the fix: green on Chrome (84 s; the test 13.8 s) and Firefox (83 s; 15.5 s). No refusal, 3 `aztec_getPredictedMinFees` calls, and no current-fee call left to rewrite.

## Gate

- `bun run lint` (after deleting the probe, which the linter also reads), `bun run typecheck:all`, `bun run test` (993 files), `bun run test:all`: exit 0.
- `token-add-auto-trust.test.ts` with `pin-to-home.test.ts`, 5 runs per browser, retry 0, all green:

| Browser | Run wall-clock (s) | `token-add-auto-trust` (s) | `pin-to-home` (s) |
|---|---|---|---|
| Chrome | 130-175 | 24.4-27.6 | 42.1-56.1 |
| Firefox | 138-155 | 28.0-32.4 | 47.8-56.7 |

Before the fix, inside the instrumented shard 2/5 runs (lessons/phase-0.md): Chrome 33.8 s each; Firefox `pin-to-home` 42.0 s.

- Shard 2/5, once per browser, green. Chrome: 27 files, 2018 s (`token-add-auto-trust` 24.4 s, `pin-to-home` 31.6 s). Firefox: 26 files and 3 skipped, 1771 s (`pin-to-home` 51.8 s). Before, instrumented: Chrome 2094 s, Firefox 1770 s. The shard cannot hit the trigger; the probe does.

## Review loop

- Codex round 1 (gpt-6.1-sol, high, read-only, `git diff origin/dev`): approve-with-changes. One finding: row 70 stated the inferred trigger as fact.
- Opus diff review, run beside round 1: approve-with-changes, six findings (plan.md § Audit verdicts).
- Codex round 2, resumed: approve.
- Codex round 3, resumed with the README's verbatim review rules and adversarial ask, which rounds 1 and 2 had left out: two comment nits, both applied. Converged.
