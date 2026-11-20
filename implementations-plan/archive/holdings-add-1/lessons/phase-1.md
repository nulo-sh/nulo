# Phase 1 — extraction (and the plan audit)

- Plan audit, Codex `gpt-6.1-sol` high: conditional approve; six conditions, all adopted except D6 (plan.md § Decision ledger).
- Opus 5.5 lens (Plan agent): conditional approve; adopted except trimming the page refusal tests (the brief asks one per class on Holdings) and the follow-to-fold watcher (D8).
- The popup's 32 tests passed unchanged on the first run of the extraction: the composable imports the same mocked toast, app store and `ContentKind` modules, so the popup tests' mocks reach it.
- Biome's complexity budget (cognitive ≤ 15, ≤ 80 lines) refused the first composable (47, 124 lines): the balance wait and the parse → add → wait steps moved to module-level functions over an `ImportRun` view of the hook.
- `biome check --write` on a `.vue` file rewrote `import TokenList` to `import type` because the script used it only in `InstanceType<typeof TokenList>` (the template is invisible to it), which unmounts the component; the template ref is typed by its exposed method instead.
