# Phase 0: planning log

## Recon (2026-10-16)

- Three Sonnet explorers: call-site inventory, font/notices/build, tests/screenshots. Findings consolidated in `recon.md`.
- The sheet files the lane brief names (`vd-icons-sheet-b-*`) do not exist; the sheet is `vd-gs-d2.png` and the geometry is in the prototype's `template.html`. The prototype is still edited for decision page 33, so the 20 settled geometries were copied into `recon.md`.
- `chevron-down` (`settings/privacy.vue:141`) is not an icons.json key and renders blank today; `BarrierOverlay.vue:13`'s `color="--red"` yields a class that matches nothing.

## Consults

- **Codex audit, round 1** (gpt-6.1-sol, high, session `01a146e6`): `conditional approve` — repair the phase gates, bound the name guard, preserve rotations, owner sign-off for unresolved visual changes. 8 findings (2 high); dispositions in plan.md § Audit verdicts. Claims verified: `Input.vue`/`ToastManagerBase.vue` are `lang="ts"` (Phase 1 typecheck would fail), `vitest.e2e.network.config.ts:26` retries twice unless `NULO_E2E_RETRY` is set, `copy-dash-ban.test.ts` already parses SFCs with `@vue/compiler-sfc` and `typescript`.
- **Opus audit, round 1** (Plan agent): `conditional approve` — gates and untyped forwarding props, guard blind spots (`TransactionCard.vue`, `Navigation.vue` keep names in plain-JS script), the five chevron sites whose caller `transform` overrides `rotate`, `fill` rules that paint nothing today (`Icon.vue:38`'s inline `fill`) and would start to apply, `StaleIcon` paths sharing endpoints with Lucide, the capabilities window's merged pictures. 10 findings, all accepted; dispositions in plan.md § Audit verdicts.
- Both legs endorsed one PR for arc 1 (Opus: #602 B needs both families out of the same release) and the `color` paint model over outlined strokes.
- **Revision**: Phases 1 and 2 merged; guard bound to an attribute convention with a completeness rule; no picture merged unless the sheet merges it (catalogue grew to 58); `StaleIcon` folded in; OA-4 withdrawn; captures moved onto existing `shotSend` tests plus two added calls.
- **Codex final pass** (fresh session `01a146f7`, gpt-6.1-sol, high): `conditional approve` — the Icon phase's guard still saw Material attributes (phases merged into one migration phase), `FeeMethodSelector.vue` binds a script constant in a plain-JS SFC, smoke runs need the armed build (`global-setup-smoke.ts:34` never builds), design stories are excluded from typecheck, PNG counts did not match the reused captures. All accepted and applied; resumed the same session to verify.
- **Codex final pass, resumed** (same session): `approve`; the five fixes verified present, no regression.
