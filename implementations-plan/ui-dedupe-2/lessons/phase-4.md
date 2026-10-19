# Phase 4: validation, review loop, pictures

## Review round 1 (2026-10-19)

- Codex (gpt-6.1-sol, high, read-only, session `01a153d7-d8ff-72f3-853e-70f1d28ceaf4`) over `git diff 948670ca HEAD -- apps`: `findings 1`. F1 (Low, demonstrated): the paragraph kept above Home's `resnapshotJournal` said journal and task reloads share one fence and that journal events begin runs; both false (per-loader fences, `RecentActivityView.vue:159-166`). Taken: the paragraph goes, one line says the mirror retries.
- Opus 5.5 (`general-purpose`), same diff: `findings 3`. F1 (Medium, demonstrated): the build also regenerates `types/.eslintrc-auto-import.json`, which still listed `JournalAddRules`; CI's unchanged-sources step would fail. Taken: the Chrome build's regenerated file is committed (`auto-imports.d.ts` came out byte-identical to the hand edit). F2 (Low): the mirror's docblock said "until one lands", but an `undefined` answer ends the retry too. Taken: "until one answers". F3 (nit): a missing blank line in `send.test.ts`. Taken.
- Neither found a behaviour difference on Home or a request after unmount.

## Review round 2 (2026-10-19)

- Codex, same session resumed, over the fix diff and the full arc: `clean`. Loop converged after two rounds.

## Host load

- The final armed Chrome build started at load1 167: its wait loop timed out and the build ran anyway. A wait must gate the run, not precede it. Every later build and e2e run checks load1 < 150 in the same command and refuses otherwise.

## Gates and pictures (2026-10-19)

- `lint`, `typecheck:all`, `test:all` and `audit:vue` exit 0 on the final head; the build left `apps/extension/src/types/` unchanged.
- Smoke, armed builds, `--retry=0`: Chrome 6 files, 30 passed and `type-roles`' Firefox-only block skipped, 241 s; Firefox 6 files, 31 passed, 433 s. No e2e scenario added or changed.
- Row 5's after pictures: ui-dedupe-1's scratch spec, copied into `tests/e2e/` for the run and removed after (never staged). Same real events (the node held then refused, the journal port closed and reopened late, the reopened port's first read sent 62 s late, past the client's 60 s timeout). The log shows the add failed, Home still listed it at the reconnect, and after the refused re-read and the 2 s retry Home listed no import, as a page opened then. Shots: `screenshots/row5-home-import-after-refused-reread{,-dark}.png`, `screenshots/row5-home-reopened-after{,-dark}.png`.
- A foreground Bash call is capped at 600 s: a longer `timeout` moves the call to the background with a further 10 min limit, so a long e2e run goes in the background from the start and is polled.
