# Phase 0: planning consults

## Recon

- Two Sonnet Explore agents: a reuse sweep (no typed read-versus-decode error exists; `SealedEntityStorage` already reads an undecodable row as absent) and an error-path mapper (a throw out of `TokenListService.start` fails the boot for the lifetime; a rejected `config.load()` vetoes the boot; the alarm shim can start the boot before `rehydrate()` lands). Summarised in `recon.md`.

## Panel, plan round 1

- **Codex, gpt-6.1-sol, high, read-only** (session `01a19e50-468e-7370-b69b-375eccbfe450`): reject, three blocking findings, each traced. (1) D7 left the token list's rollback floor at 0 after a failed boot read (`fetchList` compares with `this.snapshot?.sequence ?? 0`), so a replayed older signed list would pass: already in the code, reached through #1464's path. (2) I2 was false: the alarm shim calls `runtime.start()` without waiting for the import. (3) D5's `loaded` flag and lazy re-read is a recovery state the issue did not approve; it named read, modify, write as the simpler shape. Also: a fixed decode-error message, codec and identity tests in T4, D6's liveness wording, and D7's unscheduled refresh as a disposition.
- **Opus 5.5, Plan agent**: conditional approve. Same rollback; D8's wait belongs in `applyRetentionPolicy()`, where `store.test.ts` can prove it, instead of a flag or `index.ts`; D5's no-op check must read storage (a restore of a default value over a stored one was lost); D5 is a recovery policy for the owner; listed the fault-path screen differences (seed rows, settings values) for sign-off.
- **Resolved:** D5 became read, modify, write (no state; both legs' concerns about the flag answered); D6's read-only answers keep today's fallback, so the seed rows and dApp answers do not change under a fault; settings values after a failed boot read become the stored ones, which changes no layout, copy, row or format. Three known limits for the close-out: the price cache, D7's unscheduled refresh, config readers on defaults after a failed boot read.

## Final fresh Codex pass

- **Codex, gpt-6.1-sol, high, fresh** (session `01a19e5d-8bb5-7972-8753-8de06bd85fe3`): reject. Round 1's three blockers verified resolved. New, traced and verified: D5 adopting every stored prop at `set()` fires `onUpdate` for them, and Display settings' `sidePanel` handler (`popup/pages/settings/display.vue:81-94`, through `composables/useSettingUpdate.ts:44-46`) opens the side panel and closes the popup, so an unrelated change could move the person's screen. Also: D7's adoption must use the same read, or a second failed read lets a fetch compare against 0. Folded: memory takes only the set key; D7 adopts from the one read.
- **Resumed:** **approve**, with one T5 case added (storage holds the value, memory differs).
