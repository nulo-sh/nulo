# Phase 1: #316, the edit form's address rule

- 2026-10-15: `EditFpcPopup.vue` refuses another row's address (`sameFieldAddress`, the edited row excluded by id) with "Already added" beside the field, only while the address differs from the row's own; the submit gate's existing `addressChanged` branch also reads the field's error. `NewFpcPopup.vue` reads "Already added" for a stored address; its name rule keeps "Already exist".
- Tests: `EditFpcPopup.test.ts` § duplicate addresses (never: another row's address in upper case warns, Save disabled, Enter calls no `updateFpcAddress`; controls: a fresh address saves, a rename beside an untouched shared address saves). Mutation check: dropping the gate's error read reds the never-case.
- Gate F: lint 0 (27 warnings, none new), typecheck:all 0, test 0 (795 files, 12863 tests).

## Phase 1b, OA-4 B (arc 2, 2026-10-16)

- `EditFpcPopup.vue`: `addressChanged` is false when the field is the row's own address by exact spelling or by `sameFieldAddress`, so a re-cased own address is no change (Save disabled, no warning, nothing stored); a rename beside it saves the name alone.
- Test: `EditFpcPopup.test.ts` § duplicate addresses, the re-cased own address (never: no warning, Save disabled, Enter updates nothing; control: a rename beside it calls `updateFpc` only). Mutation check: dropping the `sameFieldAddress` arm reds it.
- Gate F: lint 0 (27 warnings, none new), typecheck:all 0, test 0 (797 files, 12901 tests).
