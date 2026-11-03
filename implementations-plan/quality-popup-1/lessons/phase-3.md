# Phase 3: onboarding import refuses a repeat Enter

- Pin first in `onboarding/pages/import.test.ts`: on Decrypt backup, Import profile and Continue, a repeat Enter keydown is prevented and a fresh one is not. Red before the guard (3 failed, `expected false to be true`), green after.
- The guard is `@keydown.enter="refuseRepeatEnter"` on the three buttons, imported from `@/composables/usePopupEntity` as the popup's import page does. No testid, copy or layout changed.
- Gate: the onboarding import test file at retry 0 (39 passed), lint, `typecheck:all`.

## Arc 1 fix loop

- Codex R1 (`gpt-6.1-sol`, high, read-only, diff `cf9ed1e40..827194887`): approve. Gate functions and refusals byte-identical, both pick paths and the decrypt's fences preserved, citations correct. Nonblocking: four comments restated their declarations; three removed, the gate's nine-line doc cut to two.
- Opus `general-purpose` review beside it: conditional approve, no behaviour drift. F1 held: the race pin's re-pick (queued from the decrypted body's parse) lands before the earlier-passkey read starts, so moving the last stale check above that read stayed green. A second case queues the re-pick from inside the read (`EncryptionKey.getHashHex`, its first await); with the check moved up it fails, the parse case passes; restored, both pass. F2 (the read-failure pin rejected the chooser, not the read) and F3 (the name reset asserted from an unset name) fixed. Two comments that named their callers reworded.
