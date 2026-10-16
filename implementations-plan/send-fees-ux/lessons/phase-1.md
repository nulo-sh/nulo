# Phase 1: #316, the edit form's address rule

- 2026-10-15: `EditFpcPopup.vue` refuses another row's address (`sameFieldAddress`, the edited row excluded by id) with "Already added" beside the field, only while the address differs from the row's own; the submit gate's existing `addressChanged` branch also reads the field's error. `NewFpcPopup.vue` reads "Already added" for a stored address; its name rule keeps "Already exist".
- Tests: `EditFpcPopup.test.ts` § duplicate addresses (never: another row's address in upper case warns, Save disabled, Enter calls no `updateFpcAddress`; controls: a fresh address saves, a rename beside an untouched shared address saves). Mutation check: dropping the gate's error read reds the never-case.
- Gate F: lint 0 (27 warnings, none new), typecheck:all 0, test 0 (795 files, 12863 tests).
