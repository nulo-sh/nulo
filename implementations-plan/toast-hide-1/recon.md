# toast-hide-1: recon

Read by hand at b8ec26b1f (one composable, one sheet; no Explore agents needed), starting from the render lane's notes and its H commit, read with `git show`.

- `apps/extension/src/composables/useSendsInProgress.ts`: `sendingToast` owns the one Sending toast (info, stays until closed). `show` relabels its own toast in place, waits while another message is up, else opens one under `withQuiet`; `onToastChange` (sync watch) reads its own toast closing as the person's × (`dismissRunning`, stored per session) and another message closing as a cue to `reconcile`. `closeOwn` closes quietly.
- `apps/extension/src/popup/app.vue`: the one `useSendsInProgress` call, every dependency injected (`toast`, `openToast`, `updateToast`, `closeToast`).
- `apps/extension/src/composables/snackInset.ts`: module-level registries `footers` and `sheets`, each fed by a directive (`vSnackFooter`, `vSnackSheet`). No review flag exists.
- `apps/extension/src/components/Popup/Popup.vue`: content under `<Transition name="sheet"><template v-if="show">`, so a child's directive mounts on open and unmounts after the leave transition; `trapContainers` adds `#toast` to the trap.
- `apps/extension/src/popup/components/modules/send/SendReviewSheet.vue`: used by `popup/pages/send.vue` (review) and `popup/components/modules/general/RecentActivityView.vue` (re-ask); Send carries `v-snack-footer`.
- `apps/extension/src/popup/pages/send.vue` `submit`: `closeSheets()` then `leaveSend()` before the transfer settles.
- `packages/design/src/composables/toast.ts`: one snack across all callers; `closeToast` sets it null, `openToast` gives a new id.
- Render lane's H (`worktree-toast-sheet-1`, 6cedf8f7b): `vSnackAside` counter in `snackInset.ts`, a `hidden` prop on `ToastManagerBase`, a `ToastManager` id rule. Its notes trace the id rule's hole (a replaced Sending toast reopens with a new id over the fee row).
- E2E reading the Sending toast: `network/in-flight-send-guard.test.ts` (sheet closed throughout), `fixtures/send-burst.ts` (reads only "estimate fee" snacks). The re-ask (`network/same-token-concurrent-sends.test.ts`, first ask) shows the toast over the sheet today: the issue's own evidence.
- Closed known limits searched (`toast`): #1715 and #1717 (Sending toast dismissal across documents and sessions), neither touched by this change.
