# Phase 2: publisher

- `signedTree` in `test/tree.test.ts` copies the host files into a temporary root; the picture rule reads `README.md` from that root, so the helper copies it too.
- The six-entry list signs to a 13,373-byte envelope (of 65,536), measured with a throwaway key.
- The smoke suite needs the armed build first: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome` (and `build:firefox`); without it the global setup refuses and vitest reports "No test files found".
- Gate: `bun run lint` (one formatting fix in `check.ts`), `bun run typecheck:all`, `bun run --cwd infra/token-list check`, `bun run --cwd infra/token-list test` (93 passed), `bun run test:all`, `bun run test`, `bun run test:ci-gating`, smoke `tests/e2e/token-list.test.ts` at `--retry=0` on Chrome (2 passed, 45 s) and Firefox (2 passed, 67 s): all exit 0.

## Arc 1 review loop

- Codex round 1 (1 material: a digest in prose satisfied the provenance rule) and an Opus diff review (2 material, low: outside references through `image-set(`/`src(`/`xml:base`; tests masked by the element allowlist) ran in parallel; every finding was folded. Codex round 2 clean with one optional low (bare `image` over-refused), taken; round 3 clean.
- A "refuses X" case proves its rule only when the same input minus X is accepted: put the refused token on an allowed element (`<g href>`, `<s:path>`, `<rect style=…>`), and check by deleting the rule.
