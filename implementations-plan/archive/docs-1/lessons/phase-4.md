# docs-1 phase 4: #668

- The guard step in `.github/workflows/_build-extension.yml` refuses every set, non-empty `VITE_*` except `VITE_FEE_JUICE_BRIDGE_URL` and `VITE_NULO_ALLOW_IFRAME_DAPPS`, one `::error::` line per name.
- New `scripts/ci-cd/build-env-guard.test.ts` runs the step through `gh-step-harness.ts`; the harness starts from an env holding only `PATH`, so the runner's own variables cannot leak into a case.
- Red/green: against the base workflow, the new-e2e-flag, fee-multiplier and unknown-flag cases fail; the CoinGecko case and the controls pass on both.
- Gate: `bun run lint` 0, `bun run lint:actions` 0, `bun run test:ci-gating` 581 pass, `bun run typecheck:all` 0.
