# Phase 0: planning consults

## Recon

- Two Sonnet explorers: a reuse sweep and a map of the mount suites' reach. Findings in `../recon.md`.
- Biome 2.5.13 was measured on scratch copies outside the repo, with the repo's `biome.json` and its thresholds lowered: a nested function pays one extra nesting level per structural increment, and the outer function's 80-line count includes nested functions (comments and blank lines excluded). `refetchIdentityScopedState` scores 14 at module level and 19 nested, so it becomes the module-level `fetchIdentity`.

## Plan audit, round 1

- Codex, gpt-6.1-sol at high, session 01a20edc: **conditional approve**. (1) F1 overstated Vue's order: a watcher whose dependency drops and returns is re-appended to the source's subscriber list (probe on Vue 3.5.42), so creation rank is not the invariant; the invariant is the same getters, first evaluations, dependency changes, writes and flush modes in the same sequence. (2) The fiat draft's `gateAt(now…)` reads the ticker before the other inputs, and `usePrices` subscribes to the same ticker: keep both object expressions verbatim. (3) D14 let a page case be appended, against the unedited-suite contract. (4) The W2/W3 swap mutant has no consequence: the callbacks commute. All four accepted.
- Opus 5.5 (Plan): **conditional approve**. Accepted: I1 states its condition (no effect created, no computed evaluated at the call); D11's move is not required; D8 cites the C1 dispose lesson and the pre-existing path KL-1 (an add-token import resolving after unmount reopens the token client's port through `reloadTokens`); a tenth fiat case; the subscriptions row; `onIdentityLoaded` as a declaration; six resets; `onReadFailed` returned rather than exported (an export from `src/composables/` is a global auto-import). Rejected: its line counts (80, 50, 49) count bracket-only lines by hand; a scratch probe shows Biome skips them (75 code lines plus 10 `})` lines report 85, not 95), so the gate's numbers stand (64, 42, 41).

## Final pass

- Codex, gpt-6.1-sol at high, fresh session 01a20eeb: **conditional approve**. (1) Retry zero was not enforced: `vitest.e2e.network.config.ts` retries twice unless `NULO_E2E_RETRY` is set. (2) Two mutants were equivalent (an in-memory Vue probe gave `W5, W7, W6` in both arrangements): replaced. Both accepted. Checking the trace surfaced KL-2: the unmount's `cancelFeeEstimate()` runs after `disconnectExecution()`, and the engine's remote cancel reopens the execution port.
- Resumed: **approve**. KL-2's trace confirmed; one closed known-limit issue for KL-1 and KL-2, the class of #457.
