---
plan: toast-hide-1
tier: light (thinned: no plan audit round, no Opus leg; one Codex pass over the plan and the net diff)
status: planned
issues: "closes #1796"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon inline (one composable, one sheet, read by hand); Codex gpt-6.1-sol high, read-only
base: origin/dev at b8ec26b1f
trunk: dev
post_implementation_hardening: not scheduled
---

# toast-hide-1: an earlier send's toast steps aside while a review sheet is open

While a popup send is in flight its info toast "Sending … to …" stays up until it is closed, and every review sheet's Send now carries `v-snack-footer`, so the toast lands 12 px above Send, over the fee row: on the re-ask it covers "Fee is now …, above the … you accepted.", the one fact that review exists to show (#1796).

The owner picked on decision page 190, 2026-11-18, at `b8ec26b1f`: **P190-01 = H**, "Where an earlier send's toast goes while a review sheet is open: over the fee row (today), hidden until the sheet closes (H), above the sheet (A), or in a band the sheet makes for it (R)", picked **H**: "The toast steps aside while any review sheet is open and comes back with the same words when the sheet closes. Send, the fee row and the sheet's height do not move. On the re-ask the sheet names the send under review, so nothing is lost while the toast is away."

**UI impact** (signed: the pick above, quoted as the sign-off):

- **Send's review sheet and Home's re-ask review** (`SendReviewSheet`, both uses): while either is open, the Sending toast is out of view and out of the Tab cycle; when it closes the toast comes back with the same words. Before: the toast over the fee row (`ts1-today-*`). After: page 190's H frames (`ts1-h-reask-*`, `ts1-h-plain-*`). Send, the fee row and the sheet's height do not move. No new copy.
- Every other toast, and every other sheet, keeps today's placement: an error the review itself raises shows above Send as today.
- Motion: the toast leaves and returns through its usual 150 ms fade (`ToastManagerBase`'s transition); on the close it fades back in while the sheet fades out, as in the drawn prototype. A fade call under the owner's 2026-10-19 delegation (D2, D3).

## The facts (verified at b8ec26b1f)

The issue holds as written. `SendReviewSheet.vue:246` puts `v-snack-footer` on Send; `snackInset.ts` places the snack `SNACK_GAP` above the top sheet's footers. `Popup.vue` (`trapContainers`) adds `#toast` to the sheet's focus trap, so the toast's × sits in the review's Tab cycle today. The Sending toast is owned by `sendingToast` in `apps/extension/src/composables/useSendsInProgress.ts`: it names the newest in-flight popup send not dismissed, relabels in place, and already waits while another message is up (`show`). `send.vue`'s `submit` closes the sheets and leaves the page before the new send's record lands, so the next Sending toast never opens over a closing review. The render lane's `ToastManager` id rule (hide the toast up when the sheet opened) has a traced hole: the Sending toast replaced by another message during the review, that message closing, `onToastChange` → `reconcile` → `openToast` with a new id, drawn over the fee row again (D1).

## Decision ledger

- **D1, where H is built: at the Sending toast's owner.** While a review sheet is open, `sendingToast.reconcile` closes its own toast quietly and shows nothing, as `show` already waits while another message is up; the watch that reconciles it also follows the review flag, so the toast opens again as the sheet starts closing. The gate sits in `reconcile`, ahead of the label wait, so a toast left up while a newer send's label is read cannot stay over the review (built there rather than in `show`, as first written, for that path). This covers the replaced-then-closed path the drawn id rule misses, keeps any toast the review raises visible, needs no prop in `@nulo/design`, and touches no geometry. Rejected: the drawn `ToastManager` + `ToastManagerBase` `hidden` rule (the hole above; a design-package prop for one caller).
- **D2, close and reopen, not keep and hide.** The toast is closed under `withQuiet`, so `onToastChange` never reads it as the person's ×: nothing is dismissed, nothing is stored. It reopens through the existing `show` path, which reads the same record's label: the same words, a new id. A closed toast leaves `#toast` empty once its 150 ms fade ends (the leaving card keeps its inert ×), so it is out of view, out of the live region and out of the Tab cycle with no new state. Its fade out and back in is the toast's own transition.
- **D3, the review signal: a registry beside `vSnackSheet`.** `snackInset.ts` gains `vSnackAside`, a directive counting the marked elements mounted, and `snackAside`, a computed true while any is. `SendReviewSheet` marks its dialog, which `Popup` mounts only while shown. Vue runs a directive's `unmounted` as the sheet's 150 ms leave starts (only the DOM removal waits), so the toast fades back in while the sheet fades out: the moment `vSnackSheet` already hands placement back, and the drawn prototype's timing. Holding the mark to the leave's end was weighed and left out: it needs an `after-leave` emit on the shared `Popup` and a held state in the sheet, for a 150 ms cross-fade over a sheet already closing (round 1). `useSendsInProgress` takes it as an option, `reviewing: () => boolean`, wired in `popup/app.vue` (the composable keeps every dependency injected). Rejected: a store flag (a second source of "open" beside the popup stack), and `useSendsInProgress` importing the registry (untestable without the DOM).
- **D4, scope: `SendReviewSheet` only**, both its uses (Send's review and Home's re-ask): the review sheets of the pick. Other sheets keep today's placement; other toasts are not moved.
- **D5, tests.** `useSendsInProgress.test.ts`, three cases: (a) a review opening closes the toast, and its close is not a × (no dismissal stored), and it reopens with the same words when the review closes, after which a × still dismisses (the success control); (b) a send that starts during a review opens only after it closes; (c) a message raised during the review shows, and once it closes the toast stays away until the review closes (the drawn rule's hole). `snackInset.test.ts`: `snackAside` stays true until the last of two marked elements unmounts. `SendReviewSheet.test.ts`: shown, the sheet holds `snackAside` true; closed, false. E2E: in `network/same-token-concurrent-sends.test.ts`'s first re-ask, the Sending toast is up on Home before the row is pressed (control) and gone while the re-ask sheet is open, so the whole chain (sheet mark, `app.vue` wiring, toast owner) is proven in both browsers; no new scenario, two bounded waits in an existing step.

## Assumptions

- **Ask (none for the owner).** The pick is the whole visible budget; the build adds no word and moves nothing on the sheet. `OWNER-ASKS.md` says none.

## Security & adversarial considerations

No trust boundary moves. The change reads only in-document UI state (which sheet is mounted) and re-opens a toast whose label the wallet already derives from its own journal; no dApp-supplied string reaches it, no stored shape, permission, message or dependency changes. The one hazard is a dismissal written or lost by mistake: the quiet close (D2) never stores one, and a × after the reopen still does, both pinned by D5(a). A stuck mark could hold the toast away: a directive's `unmounted` runs whenever its element leaves, including a page teardown, so the count returns to zero.

## Phase 1: the Sending toast steps aside while a review sheet is open

**Change map** (paths under `apps/extension/`):

- `src/composables/snackInset.ts`: `vSnackAside`, `snackAside` (D3).
- `src/popup/components/modules/send/SendReviewSheet.vue`: `v-snack-aside` on the dialog.
- `src/composables/useSendsInProgress.ts`: the `reviewing` option; `reconcile` steps aside (D1, D2); its watch follows the option.
- `src/popup/app.vue`: `reviewing: () => snackAside.value`.
- `src/types/auto-imports.d.ts`, `src/types/.eslintrc-auto-import.json`: the two new exports, as the auto-import plugin writes them.
- Tests: `src/composables/useSendsInProgress.test.ts`, `src/composables/snackInset.test.ts`, `src/popup/components/modules/send/SendReviewSheet.test.ts`, `tests/e2e/network/same-token-concurrent-sends.test.ts` (D5).

**Captures** (untracked, never committed as code): the render lane's kit adapted, a capture story mounting the real `SendReviewSheet` and the real `ToastManager` with the toast opened by the real `useSendsInProgress` over a fake journal (one in-flight popup send), `reviewing` wired as `app.vue` wires it; a static Storybook build served on a port claimed in the host registry; Puppeteer at 360 × 600, 2x. Frames `th1-reask`, `th1-plain` (sheet open, toast away) and `th1-after` (sheet closed, toast back), light and dark, with `captions.json`, into the lane's scratch `shots/`. Then one `pr-captures/toast-hide-1/` commit holding them beside page 190's H frames, embedded in the PR body, and the next commit removes them.

**Validation gate** (retry 0, in order, once):

1. `bun run lint`; `bun run typecheck:all` (root).
2. From `apps/extension`: `bun run test -- src/composables src/components/ui src/components/Popup src/popup/components/modules/send src/popup/pages/send type-role-ban copy-dash-ban red-text-ban`. Red/green: D5(a)–(c) and the sheet case fail with the source change reverted.
3. `bun run check:plans` after staging.
4. Smoke, from `apps/extension`: `bun run test:e2e -- tests/e2e/snackbar.test.ts` on Chrome, then `NULO_E2E_BROWSER=firefox`.
5. Network, from the root: `bun run e2e:agent tests/e2e/network/same-token-concurrent-sends.test.ts tests/e2e/network/in-flight-send-guard.test.ts tests/e2e/network/snack-placement.test.ts` on Chrome, then `NULO_E2E_BROWSER=firefox`. Pass: every file green; counts per browser in the PR body.

No e2e scenario is added, so no suite wall-clock is measured.

## Post-implementation (single arc, bounded work)

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at b8ec26b1f, bounded-work form: ONE Codex pass (`gpt-6.1-sol`, high, read-only) over this plan and the net diff, with the standard's two verbatim rules and adversarial ask, plus the lane's questions: can the toast stay away after every review is gone, can a quiet close ever be stored as a dismissal, and does any path draw the Sending toast over an open review. A second round only on a material finding. No Opus leg, no `/code-review`.

## Delivery

Branch `toast-hide-1-a1` off `worktree-toast-hide-1`, carrying the plan commit; one PR against `dev` with `gh pr create`, opened ready after the gates and the Codex pass, no label at creation. Title: `fix(send): an earlier send's toast steps aside while a review sheet is open` (75 characters). Body: the pick quoted as the sign-off, the captures beside page 190's H frames, the tests, the e2e counts per browser, the Codex verdict, the fade call under the 2026-10-19 delegation, `Closes #1796`. The close-out (Outcome, `git mv` into `archive/`, index lines) is the same PR's final commits. Never merged here: the orchestrator reads the captures against the pick and lands it.

## Seeds (not run)

- `/goal` While a `SendReviewSheet` is open the Sending toast is closed quietly and reopens with the same words once it closes, pinned by `useSendsInProgress.test.ts` and the re-ask e2e; PR closing #1796 open and green.
- `/loop` Babysit the `toast-hide-1-a1` PR's checks: a known flake gets one rerun, real breakage a fix and a targeted re-verify; stop at green.

## Audit verdicts

**Round 1** (Codex `gpt-6.1-sol`, high, read-only, over this plan and `b8ec26b1f..279650321`): changes needed. Each claim verified against the tree:

- *Material as a claim, accepted; behaviour kept.* D3 said the toast returns once the sheet has gone; Vue runs a directive's `unmounted` as the leave starts (only the DOM removal waits), so the toast fades back in during the sheet's 150 ms fade out (reproduced by Codex in memory). Fix: the `vSnackAside` comment, D3, the Motion line and `recon.md` now state the real timing. Holding to `after-leave` rejected (D3): a `Popup` emit and held sheet state for a cross-fade with no consequence that matters, the same moment `vSnackSheet` hands placement back and the drawn prototype's timing.
- *Nit, accepted.* D2 overstated the Tab-cycle exit: the leaving card keeps its inert × through its 150 ms fade. D2 now says so.
- *Nit, accepted.* The doc comment on `snackAside` restated its line: removed.
- Confirmed fine: the quiet close never stores a dismissal and a × after the reopen does; the gate precedes the label wait and the relabel; no stuck count or missed reconcile; dApp windows, `endScope` and a second document unaffected; no new input or trust boundary.

**Round 2** (the same session resumed over `279650321..6f2a5f0f4`): approve, high confidence; the cross-fade has no material consequence and keeping the lifecycle is proportionate. One nit, accepted: D1 said the toast opens again "once the sheet is gone"; now "as the sheet starts closing".
