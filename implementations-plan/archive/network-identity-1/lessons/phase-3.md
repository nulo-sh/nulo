# Phase 3: the docs, then the arc gate

## Implementation review r1, 2026-10-17

- **Codex** (gpt-6.1-sol, high, session `01a14abd`): **reject**, three items.
  1. A chain-0 row on L1 31337 whose primary is not loopback still reaches use, because loopback is checked at adoption, construction and promotion only. Not adopted as a change: such a row comes only from an install made before this change (a full backup cannot carry a network row, `backup/README.md` § Retired slices), the wallet has no production users, and the metadata it builds stays on L1 31337, the development L1. The plan already scopes loopback away from use. Recorded with D5's known limit; argued in r2.
  2. `SECURITY.md`'s adoption sentence omitted that a Local target records 0. Adopted.
  3. The cache's three failures are cumulative, not consecutive: a success does not reset the count. Adopted in `SECURITY.md` and in `getNodeForUrl`'s doc comment.
- **Opus** (general-purpose): **conditional approve**. Every writer of a chain-0 row and every source of a new account's L1 traced and held. Adopted: the comments that still said a `local` kind alone grants chain 0 (`addEndpoint`, `updateEndpoint`, `_getChainId`, `seeds.ts`), and the same `SECURITY.md` adoption wording.

## Implementation review r2, 2026-10-17

- **Codex** (resume, session `01a14abd`): **approve**. The three fixes match the code. Item 1 was withdrawn as blocking: no supported path creates or restores the row, so it is a known limit, recorded with D5 at close-out.

## The arc gate, 2026-10-17

- The smoke run needs the armed Chrome build first (the global setup refuses a missing `dist/chrome` and prints the build command); built in 46 s.
- Smoke, Chrome, retry 0: `tests/e2e/endpoints.test.ts` 7 passed, 39.5 s.
- Network, Chrome, `e2e:agent`, `NULO_E2E_RETRY=0`: `endpoint-refused-recovery.test.ts` 21.0 s and `backup-edited-local-network.test.ts` 26.2 s, both passed; the run took 190 s (245 s with the build). No scenario was added.

## Implementation review r3, 2026-10-17

- **Codex** (resume, session `01a14abd`): **approve**, no material item. The round repeated the post-implementation standard's two rules and the adversarial ask verbatim, which the r1 and r2 prompts had paraphrased.

## The PR's checks, 2026-10-17

- First run on #685: every e2e lane green; `Build Storybook` red, so `quality-status` red. Reproduced locally with `bun run --cwd apps/extension build-storybook`: the chunk-cycle guard refused `FormPopup.stories` and `core`.
- Cause, measured by instrumenting the guard (reverted): Rolldown emits these modules in lazy initializers, and the `utils` barrel's initializer calls each member's. A function-only `chain-id.ts` had none; the added `LOCAL_L1_CHAIN_ID` gave it one. The bundler placed `chain-id.ts` with its only Storybook importer (`Popup.vue` → `explorers.ts` → `chain-ids.ts`), so the shared `core` chunk imported the story chunk that imported it. Bisect: base `chain-id.ts` builds; the new one fails even with base `chain-ids.ts`.
- Codex (resume, `01a14abd`) picked a dedicated entry point over a chunk-group config or a placement move: `@nulo/wallet-core/chain-id`, no longer re-exported by the barrel, imported by `chain-ids.ts`, `chain-identity.ts` and the node-factory adapter. Storybook, `build:chrome`, lint, typecheck, `test:all` and `test:ci-gating` pass with the guard unchanged (D6).
- Not promoted to `lessons.md`: it sits at its 8 KiB budget with no entry this supersedes. The gotcha: a barrel member that gains a top-level initializer can put two Storybook chunks on a static import cycle, which only `build-storybook` (CI's `quality-status`) shows; the earlier case is `archive/firefox-passkey-unlock/plan.md` § storybook-cycle.
