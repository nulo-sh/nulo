# Phase 0: planning consults

## Recon (2026-10-18)

Three Sonnet Explore agents at `18d29f23`: the #735 reuse sweep, the #750 map re-verification, the #680 and #730 traces. Findings in `recon.md`. Two issue claims did not hold: #735's fee-valuation copy (both pages already call `feeDisplay`) and #680's file (`discovery-flow.ts`, not `background.ts`). #750's map holds unchanged (`service.ts` byte-identical to `00f31d32`).

## Dual audit, round 1 (2026-10-18)

- Codex, gpt-6.1-sol, high, session `01a14ecb-6507-7a91-a762-cd172272bd83`: `reject (with blocking findings: unresolved enhancement authorization, incomplete validation gates, and an unguarded test-ownership collision)`, 10 findings.
- Opus 5.5 Plan lens: `conditional approve` with five conditions (a real reproducer, the arc-2 collision, the owner asks, runnable gates, the type role), 13 findings.
- Verified before acting: Codex's F4 claim, with `@vue/compiler-dom` on `<Text> {{ title }} </Text>` (it compiles to the interpolation alone), so Opus's contrary claim was rejected; Opus's I2 check against `packages/design/src/core/Flex.vue` (props declared, class order fixed); the armed smoke build in `tests/e2e/global-setup-smoke.ts:20` and `NULO_E2E_CSP_REPORT` in `tests/e2e/README.md`.
- Dispositions: `plan.md` § Audit verdicts. Plan revised in place.

## Round 2 (2026-10-18)

Codex resumed (same session): `conditional approve` with four conditions (named mechanical test edits, `NULO_E2E_RETRY=0`, class-token normalisation and a single owner for the role class, arc 3 after arc 1). Verified `NULO_E2E_RETRY` in `apps/extension/vite.shared.ts:117-123` and `Text.vue` emitting `type--<variant>`; all four applied.

## Final fresh pass (2026-10-18)

New Codex session `01a14edf-78b9-7fd0-a7c6-3faa6622dec6`: `conditional approve` (arm incoming-arrival with `NULO_E2E_PROVERLESS=1`; store-captures skips unless `STORE_CAPTURES`). Both verified in the e2e sources and applied (store-captures dropped from the gate). Resumed on the two edits: `approve`.
