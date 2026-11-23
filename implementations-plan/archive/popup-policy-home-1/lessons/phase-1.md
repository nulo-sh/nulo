# Phase 1: moves, route lists, lint

## Consult 1: Codex planning pass (gpt-6.1-sol, high, read-only)

Verdict: approve, confidence high. Facts F2 (top-level-only auto-import scan) and F4 (scan roots) confirmed independently; F3 not re-probed (its sandbox would not write a scratch config) but judged consistent with the repeated wallet-clocks group. D1-D5 judged sound; D3 judged within bounds.

- Finding (low, plausible but unverified): the split of the components override could drop an existing group silently, and a popup-only probe would not see it. Adopted: the lint probes also check that a composite production file and a composite test still refuse a store, a service client and the wallet clocks, and that only the production file refuses `@/popup`.

## Gates at db014b10d

`bun run lint`, `typecheck:all`, `audit:vue` (1,050 extension test files, 18,861 tests), `test:all`, `test:ci-gating` (768 tests): all exit 0 at retry 0. The build regenerated `src/types/` once for the three top-level utils; a second build left it unchanged.

Lint probes (temporary files, deleted): a composite production file refuses popup, store, client and wallet-clocks imports; a composite test refuses store, client and wallet-clocks but not popup; composables, utils, stores and onboarding production files refuse `@/popup/route-guard` and `../popup/route-guard` and accept `@/utils/auth-guard`; a `.vue` under `components/stale-network/` refuses `@/popup/route-guard`; a file under `popup/` meets only the wallet-clocks group.

## Consult 2: Codex diff pass (gpt-6.1-sol, high, read-only)

Verdict: approve, no functional regression, confidence high. It confirmed the homes, the route merge (string, symbol and nullish names match as before), purity, every guard's coverage, zero old paths outside this plan, and that the Biome split keeps every old restriction.

- Two low findings on comments inherited by moved files (a misplaced doc block, a stale "spec is JS" suppression reason, narration and history). Rejected for this change: a move edits import lines only, the comments predate it, no consequence follows.

## Consult 3: Codex verify, resumed (D6)

The lead found that `publish-facts.ts` left the UI-primitives Biome override with its move, and that the moved `utils/` tests fell outside every group they had. Codex picked K1 (`utils/fee/**` joins that override) over a separate override or a recorded narrowing, and noted the test side. Applied to tests too; probes on the D6 head: `utils/fee/` files and tests refuse popup, store, client and wallet-clocks imports; `utils/` and `stores/` tests refuse popup and wallet-clocks; composable and component tests are unchanged.
