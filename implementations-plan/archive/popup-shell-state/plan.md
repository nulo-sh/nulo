# Popup shell and state decomposition

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the popup shell, store and input modules were decomposed under the complexity budget with no behavior change: `apps/extension/src/popup/route-guard.ts`, `apps/extension/src/stores/app.store.ts`, `apps/extension/src/popup/components/modules/settings/contacts/useContactImportExport.ts`, `apps/extension/src/popup/components/modules/general/recent-activity-rows.ts`, `apps/extension/src/utils/activity-rows.ts` and `apps/extension/src/utils/files.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Remove 13 complexity acceptances from one family of shell, state and input functions, in two changes: the shell and state batch (contact import and export, the app store, recent-activity rows, activity rows, the unlock page, the new-network popup, the popup route guard), then a mechanical rider (the dropdown, the design `Input`, file picking). Behavior-preserving only, with pins committed first wherever the existing suites left a gap. Never raise a ceiling or hand-edit the baseline manifest.

## Why

The functions' branches were not their specification, so the acceptances were debt. The risk was in the timing contracts the code relied on without saying so, hence the await-parity rules: sync helpers for zero-await spans; an awaited helper only where the caller already awaited that exact span; a promise that settles synchronously today keeps settling synchronously; and narrowing does not survive extraction, so pass the narrowed value.

## What shipped

- The route guard moved into `route-guard.ts` as a pure early decision plus an awaited late decision. The callback calls `next` synchronously for the three early branches, before the first suspension, which the cold-boot path depends on. A test pins that `next` runs before the callback's promise settles.
- The app store keeps one Pinia setup store. It is built from module-level factories (in-flight tracker, account actions, network actions, activity bridge) called in the original statement order and returned as an explicit object in the original key order. Pins cover state keys, `storeToRefs` keys, member classification, watcher registration order, and one journal client with listeners added once.
- Contact import became module-level functions over an injected deps object. The picker, size cap, parse and try/catch/finally stay in the main body, and the import-promise controls are registered before the popup opens.
- The unlock error ladder, the new-network outcome toasts, the recent-activity row math, `pickFile` classification (a plain file still resolves synchronously inside `onchange`), and the dropdown focus and key handling were extracted the same way.
- Gotchas worth keeping: a helper that returns `promise.then(ok, warn)` hands the caller a derived promise, which adds a microtask and moves the call out of its original `try`, so mixed awaited and sync spans stay inline. A Pinia setup store wraps each returned function separately, so an alias is not identity-equal and must be pinned by behavior. Helpers called from untyped `.vue` scripts need the real domain types or their own shape interfaces will lie. A route guard's early branches are a timing contract, so extract the guard callback itself to test it.
