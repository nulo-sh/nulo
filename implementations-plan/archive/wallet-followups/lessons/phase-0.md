# Phase 0: planning consults

## Recon

One Explore agent (sonnet), read-only, six capabilities in one batch: name validation in popups, config read-on-reconnect, logs document trimming, the balances fuzz harness, e2e coverage, plan collisions. Its findings are in `recon.md`; it did not run the fuzz.

## #259 replay

- `NULO_FUZZ_SEED=-2034686224 bun run --cwd apps/extension test src/stores/balances.store.fuzz.test.ts` fails after 10 tests on af4afcc, as the issue says.
- `NULO_FUZZ_TRACE` writes only digests (it exists for equivalence proofs), so it cannot show a schedule. The planner copied the fuzz file to a scratch directory, replayed the shrunk tape with a per-step print of key `p1/0xa1`, and ran it through a scratch vitest config that spreads the extension's config with `test.dir` set to the scratch directory (bare imports such as `pinia` and `fast-check` need aliases to the workspace's `node_modules`).
- The trace (recon § #259) shows the owed recovery committed at step 28, then a failed forced read at step 34 leaving `degraded` with no debt.
- A scratch copy with the corrected C1 and the tape in `examples` passed 3,000 random runs.

## Round 1 audits

- **Codex** (gpt-6.1-sol, high, read-only; session `01a12831-e531-72c3-9a08-907bf406f540`; default `~/.codex` login, `CODEX_ACCOUNT` unset as the brief says). Verdict: reject, three blockers. Every claim checked: CodeMirror's `\r\n` normalization reproduced with `@codemirror/state` (`EditorState.create({ doc: "a\r\nb\rc\n" })` holds `"a\nb\nc\n"`, and `state.toText` gives the same form); `lock.test.ts:12-13` fakes only `add`; `vitest.e2e.network.config.ts:40` retries twice unless `NULO_E2E_RETRY` is set; `sender-auth.ts:17-22` admits any sender from the extension's own origin. Its I1 point was right about the wording; the co-mount it worried about is unreachable (`Popup.vue:106` renders popup content only while shown; the fee-card popups open from Settings; the execute window is its own document).
- **Opus Plan agent** (same family, read-only). Verdict: conditional approve, four conditions. It replayed the seed independently and decoded the tape to the same five steps. Checked: `settings/accounts/import.vue:99, 280` (import refuses only a blank name); the `e2e-testing` skill's build-armed hazard (smoke loads `dist` as it is); `LogsViewer.vue:156-168` (Clear logs re-adds its listener only on success); `lock.test.ts:134` (the `update` helper calls only the first registered handler).
- **Disagreement** (D4): Codex found an own-name exception sensible; Opus held to the #256 record's wording. The record decides what ships without an ask, so the record's validator ships and the exception became OA-1.
- **Rejected** (D8): Opus 4, recording the owe only when debt is set, would let a store that forgot the debt escape C1.

## Final pass

- **Codex, fresh session** (gpt-6.1-sol, high, read-only; session `01a12841-e609-7f51-b53b-cde8580b69ba`; default login). The host's machine-local sandbox opt-in turned the requested `read-only` into the script's `approve-for-me` mode with a review-only instruction; nothing was written. Verdict: conditional approve, six findings, all verified and folded (plan.md § Audit verdicts).
- **Correction to round 1 above:** the co-mount is reachable. `PopupManager` sits outside `RouterView` (`popup/app.vue:465, 489`), the Authwits page closes no popup on teardown, only the lock path calls `closeAll` (`popup/app.vue:179`), and `fee-cards.comount.test.ts` mounts both cards on one Pinia. `Popup.vue:106` hides a closed popup's content; it does not close an open one on navigation. The oracle fix does not depend on it; the consequence is an issue at close-out.
- **Confirmation** (same session, resumed). Verdict: conditional approve, one condition (the seeds must accept a phase omitted under an approval fallback) and three wording fixes, all folded. Codex held deferring the co-mount to its own issue as the stronger call.
