# Phase 3 (arc A3): lessons

## A3, one `updateSetting` (2026-10-17)

- Branch `ui-dedupe-1-a3` off `dev` at `138e0ded`. sheet-1 had already removed Display's full-height row (#707), so A3's release condition held.
- The body moved verbatim but for the catch binding: Biome warns on an unused `catch (err)` in a `.ts` file (it does not in the `.vue` pages), so the composable writes `catch {`, as `useConfigRead` does. Same behaviour.
- `useToast()` now runs twice on Display and Privacy (the page's own, the composable's). The design package's toast is module state (`packages/design/src/composables/toast.ts:34`), so both calls share one toast.
- Developer's page imported `useToast` only for the moved toast; the import goes with it.
- Proof the new page cases test the page and not the change: with the three base `.vue` files restored over the new tests, Display, Privacy and Developer stay green (19/19); with the composable's toast removed, the Display and Developer failed-write cases go red.
- Developer's failed-write case reads `indicateFailures: true` from the store, so "no dependent written" has a success control: the retry writes `developerMode` then `indicateFailures`.
- Mutation run on the composable suite (12 cases): dropping the no-row guard, the unchanged guard, the write-before-apply order, the unawaited apply, the toast label, or the apply-on-failure rule each turns at least one case red.
- The build regenerates `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` with the new composable; both are committed, as A1 did for `useFullBackupExport`.
- Out of scope, filed: #735 (`enhancement`) carries F-21's other items from #520's comment, re-verified at `138e0ded`; #520 has a comment naming the split.

## Review round 1 (2026-10-17)

- Codex (gpt-6.1-sol, high, read-only, session `01a14c3f-de16-76d3-8867-bbb4226c1038`): `clean`. No TDZ path (no callback reaches `applySetting` before the binding line runs), no toast-state change, cascades and template arguments unchanged; tests realistic with success controls.
