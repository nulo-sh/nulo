# test-issues-1: phase 2 (#1743, the held Mainnet request)

The reproduction ran while planning (`phase-0.md`): Chrome 10/10, Firefox 5/5 green. Phase 2 lands the diagnostic only.

## Gate

- `bun run lint:actions`, `bun run test:ci-gating` (755 pass), `bun --bun vitest run scripts/e2e/egress-guard.test.ts` (39 pass): green.
- `bun run test:release`: 381 of 388 pass. The 7 failures are `zip-read.test.ts` and `zip-reproducible.test.ts`, each `Executable not found in $PATH: "zip"`: this host has `unzip` but no `zip`. The diff touches neither file nor `scripts/release/`; CI's quality-status runs them where `zip` exists.
- Smoke, retry 0, `NULO_E2E_INTERCEPT_LOG=1`, load 204 to 217:

| Spec | Browser | Result | Wall-clock | Guard lines |
|---|---|---|---|---|
| `egress-guard.test.ts` | Chrome | 11/11 | 15 s | one `aztec-testnet.drpc.org:443 held`: the page-request control, by design |
| `network-arrival.test.ts` | Chrome | 3/3 (2 capture tests skipped) | 49 s | two `rpc.nulo.sh:443 not held`, in the fresh-profile tests |
| `egress-guard.test.ts` | Firefox | 11/11 | 28 s | none: Firefox's observer answers the page's request with the stand-in |
| `network-arrival.test.ts` | Firefox | 3/3 | 63 s | one `rpc.nulo.sh:443 not held` |

The `not held` lines are new information: the fresh-profile tests' `stopBackground` releases every stand-in, and the Mainnet relay's request in that window reaches the guard, refused and passing, as README § Egress guard describes. Before this change nothing showed it.
