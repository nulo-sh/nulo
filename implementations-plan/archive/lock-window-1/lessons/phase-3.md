# lock-window-1: phase 3 (the fee payer's address edit and the discovery's log level)

- A service-side fix to a lost update can be undone by its caller: `EditFpcPopup.vue` re-read its own "changed" computed after the first await, and a service event had moved the row it compares against. Check the popup's flow after every await when a fix promises what a person sees.
- Every fee-payer remover emits `onFpcDeleted`, and the Edit popup closes on it before its pending call returns; the call then fails as a dropped port, not with the service's message.
- Consults: Codex round 1 `changes requested` (the popup revert, two wording nits), Opus `changes requested` (the same revert and wording, the debug line's text).
