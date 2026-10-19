# Phase 2: the guard

- First run on the untouched tree (`2f591ddd` + the guard): the tree test listed exactly the 19 recon rows (row 11 once), the self-tests and `ProcessingErrorNote.test.ts` green. Two setup misses fixed before the gate: the file-count floor (the vue/css/scss policy reads 268 files, so the floor is 200, not 300), and Banner's reviewed entry, whose nested rule resolves to `.wrapper.error .icon svg`, not `.base.error …` (the stale check caught it).
- Template findings key on the tag and the attribute as written (`<Text color="red">`), stylesheet findings on the resolved selector and the declaration, so a moved line needs no edit.
- Gate: lint 0, `typecheck:all` 0, the guard red with 19 open findings and none stale.
