---
plan: popup-policy-home-1
tier: light
status: planned
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 4d62d8c92
trunk: dev
post_implementation_hardening: not scheduled
---

# popup-policy-home-1: pure policy leaves `popup/**`, and lint closes the edge

Closes #1935. Live log: [STATUS.md](STATUS.md). Consults: [lessons/phase-1.md](lessons/phase-1.md). UI impact: none.

## Outcome & Quality Bar

**For whom.** The maintainer who reorganises `popup/` and must not break `composables/`, and the reviewer who must trust that a refactor changed no behaviour.

- Each moved module sits above everything it imports and below everything that imports it; Biome refuses a new `@/popup/**` import from `composables/`, `utils/`, `stores/` and `components/**` production files.
- `git diff -M` shows every move as a rename; the few files that are not pure renames are listed with their one change; no test expectation changes.
- Good enough: test files stay outside the ban (four compose a lower unit with its popup consumer on purpose), and so do layers the issue does not name.

## Assumptions

**Facts** (checked at 4d62d8c92):
- F1. The nine `@/popup/**` imports in the issue are the only ones from production files under `composables/`, `components/`, `utils/`, `stores/`. Test files add four: `useProfileBootstrap.test.ts` and `useSettingsRowHighlight.test.ts` (`route-guard`, `locked-state`), `StartBar.test.ts` (`start-grace`), `AmountCard.test.ts` (`pages/send-amount`). `onboarding/**` imports nothing from `popup/`.
- F2. `src/utils/` is auto-imported top level only: `vite.config.ts:113` lists the dir, and unimport 6.4.0 joins it with `*.{ts,…}` (no recursion). A top-level util joins `src/types/auto-imports.d.ts`, which CI rebuilds and diffs (`_build-extension.yml`). No name the top-level moves export is in that file today; `fee-helpers.ts` re-exports `formatGasBalance`, which `utils/fee-estimation.ts` already exports as a global.
- F3. Biome 2.5.13: when two overrides configure `noRestrictedImports` for one file, the later one's options replace the earlier one's (probe under `~/.cache`). That is why the components override repeats the wallet-clocks group. The components override (`components/{core,ui,composite}/**`) also covers test files.
- F4. Every scan guard roots at `apps/extension/src` (or wider): `storage-facade-ban`, `copy-dash-ban`, `red-text-ban`, `type-role-ban`, `toast-call-sites`, `log-payload-ban`, `stored-shapes.scan`, `unlock-conversions.scan`, `profile-ui-keys.scan`. The legal pin (`legal/call-sites.test.ts:44`) matches `auth-guard` anywhere in a path. No moved file has a complexity directive, a manifest entry or a reviewed entry in any ban.
- F5. `stale-takeover.ts` imports values `neverOpened`, `runsUnattended` from `composables/useStaleNetwork.ts` (a composable file). `fee-privacy.ts` and `reask-review.ts` import from `components/composite/send/publish-facts.ts`, which imports nothing.
- F6. `fee-helpers.ts` imports `FpcType` from `fpc/client`, which re-exports it from `fpc/spec.ts:16`.
- F7. `tests/e2e/helpers/profile-chaos/checkers.ts:105` names `should-advance-to-general.ts:3` in a doc comment, not through `cite()`, so the citation test does not read it; `profile-chaos-model.test.ts:1111` pins `ADVANCES_ON_OPEN` to `AUTH_ENTRY_ROUTES`.
- F8. Three route lists hold the same two names, `popup-auth` and `popup-register`: `AUTH_ENTRY_ROUTES` (advance to Home from them; `useArrivals` also skips them), `PRE_SESSION` in `stale-takeover.ts` ("before a session"), and `isPreAuthRoute` in `AccountIntegrityBarrier.vue` ("pre-session heal/retry vectors"). History: `PRE_SESSION` came with #486; the barrier pair and `AUTH_ENTRY_ROUTES` with the starting commit.

**Inferences**
- I1. The three lists answer one question, "is the popup on a screen shown before a session", so a merge changes no match. Evidence: identical members, and each comment names the pre-session state.

**Asks**: none for the owner; nothing a person sees changes.

## Architecture & Implementation

**Homes** (rule: deps ≤ home ≤ consumers; `utils` is the lowest app layer):

| Module (+ its test) | New home | Why |
|---|---|---|
| `popup/components/modules/send/fee-helpers.ts` | `utils/fee/fee-helpers.ts` | pure; consumers are composables, L4, pages; a subfolder keeps its `formatGasBalance` re-export and generic names out of the globals |
| `…/send/fee-privacy.ts` | `utils/fee/fee-privacy.ts` | pure; needs `publish-facts` below it |
| `components/composite/send/publish-facts.ts` | `utils/fee/publish-facts.ts` | pure, imports nothing; moved down so the two fee modules above sit above it; consumers are L3, L4, pages |
| `…/general/reask-review.ts` | `utils/fee/reask-review.ts` | pure (a fee re-ask's review facts); only consumer `useReaskReview` |
| `…/general/recent-activity-handlers.ts` | `utils/recent-activity-handlers.ts` | pure; consumers `useExecutingTask`, `RecentActivityView` |
| `popup/auth-guard.ts` | `utils/auth-guard.ts` | pure (injected read, timers only); consumers composables, popup |
| `popup/should-advance-to-general.ts` | `utils/should-advance-to-general.ts` | pure, imports nothing |
| `popup/stale-takeover.ts` | `components/stale-network/stale-takeover.ts` | pure, but imports a composable's helpers; its lowest consumer is `StaleNetworkTakeover.vue` in that folder, above `composables/` |

Each moved file changes only its import lines. One extra import-line change: `fee-helpers.ts` takes `FpcType` from `fpc/spec` (its home) instead of `fpc/client`, so `utils/` imports no client module (D3). Importers change import lines only. `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` are regenerated by the build for the three top-level utils.

**Route lists** (D4): `stale-takeover.ts` and `AccountIntegrityBarrier.vue` read `AUTH_ENTRY_ROUTES`; `PRE_SESSION` and the inline pair go. Its doc comment widens to the shared question in two lines, so the cited line 3 stays line 3. Separate commit after the moves.

**Lint** (D5), in `biome.json`, test files excluded:
- new override after the `apps/extension/src/**` one: `composables/**`, `utils/**`, `stores/**`, `components/**` → wallet-clocks group (restated, F3) + `@/popup` group.
- the `components/{core,ui,composite}/**` override splits: production files get its list + the `@/popup` group; its test files keep the list unchanged (no gate weakens).
- onboarding: add an `@/popup` group after its three, so the config enforces the ban CLAUDE.md § component model states (config was wrong, F1).
- the group: `["@/popup", "@/popup/**", "**/popup", "**/popup/**"]` (catches relative escapes; probe shows `Popup/` is not matched).

**Paths elsewhere**: `CLAUDE.md` (`feeJuiceBridgeUrl` path; one line stating the new ban), `ARCHITECTURE.md:246`, `.claude/skills/e2e-testing/SKILL.md:924`, `checkers.ts:105`, `profile-chaos-model.test.ts:4`, `tests/helpers/fee-race-in-process.ts:36`, `route-guard.test.ts:11` (`vi.mock` path).

**Not taken**: stale-takeover in `utils/` (needs two functions cut out of `useStaleNetwork.ts`: an extraction, not a move, plus four importers); a new `pre-session-routes.ts` module (renames a pinned constant for no added safety); `utils/` top level for the fee modules (globals collide).

## Security & Adversarial Considerations

No trust boundary moves: no wallet, storage, messaging or dApp path changes. The risks are silent: a guard that stops seeing a moved file (F4: none does), a route list merged that differed (F8), a lint override that drops an existing restriction (D5 keeps every group). Supply chain: no dependency change.

## Phase 1: moves, route lists, lint

1. `git mv` each module and its test to its home. Fix import lines in the moved files and their importers.
2. Run `bun run lint`, `bun run typecheck:all`, `bun run test`. Run `bun run --cwd apps/extension build` and commit the regenerated `src/types/`.
3. Commit the moves. Then merge the route lists in a separate commit.
4. Edit `biome.json`. Prove each new group refuses a temporary violating import in a `.ts` and a `.vue`, and an unchanged import passes. Revert the probes.
5. Fix every path named elsewhere. Run `git grep` for each old path; expect zero hits outside `implementations-plan/archive/`.

**Validation gate.** Commands: `bun run audit:vue`, `bun run test:all`, `bun run check:plans`, `git diff -M --stat origin/dev`. Pass: every command exits 0 at retry 0; the build leaves `src/types/` unchanged; every move reads `R100` except the files the PR lists. Layers: typecheck, lint, unit, component. No local e2e: a pure move; CI's five required checks are the e2e evidence.

## Decision ledger

Codex planning pass (`gpt-6.1-sol`, `high`): approve, confidence high ([lessons/phase-1.md](lessons/phase-1.md)).

- D1 homes (table above). Codex: `publish-facts` in `utils/fee/` is right; "fee" is a little narrow for its visibility facts, not worth a folder.
- D2 stale-takeover beside its component. Codex: agreed; cutting the two helpers out is needless work.
- D3 `FpcType` from `spec`. Codex: worthwhile, inside the bound; same enum, no client module loaded.
- D4 merge the three lists into `AUTH_ENTRY_ROUTES`. Codex: safe; `===`, `Set.has` and `includes` agree on string members and refuse non-strings; keep the evaluation order and do not coerce names.
- D5 lint shape. Codex: sound; adopted its one finding: the probes also prove the split keeps every old group (a composite production file and a composite test still refuse a store, a service client and the wallet clocks; only production refuses `@/popup`).

## Post-implementation

Cites `implementations-plan/README.md` § Post-implementation standard at 4d62d8c92. Bounded work: one Codex pass (`gpt-6.1-sol`, `high`, read-only) over this plan and the completed diff, with the standard's two verbatim rules and the adversarial asks from the lane (a home importing a layer above; a merged list that differed; an impure module in `utils/`; a scan that lost a file; an old path left). Then targeted verification of material fixes. Delivery: one PR against `dev`, ready, titled `refactor(utils): pure policy leaves popup for utils, and lint closes the edge`, `Closes #1935`. Close-out in the same PR: Outcome block, `git mv` to `archive/` in its own commit, index line moved. Merging is the orchestrator's; teardown is `agent-worktree done popup-policy-home-1 --merged` once `archive/popup-policy-home-1/plan.md` is on `dev`.

Seeds (not run): `/goal Land popup-policy-home-1 per implementations-plan/popup-policy-home-1/plan.md` · `/loop check the PR's checks and the plan's gate`.
