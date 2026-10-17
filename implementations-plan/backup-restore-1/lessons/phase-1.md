# Arc 1 — implementation log

- Phase 1: the nested-envelope tests build a one-million-deep array in a loop; on Bun's JSC, `JSON.stringify` throws a `RangeError` well before that depth, through Vue's reactive proxy too, so the narrow catch is reached. All three new tests failed on the pre-fix composable and pass after.
- Phase 1: a second pick on the same page resets the password fields, so the "next pick imports" test sets them again before importing.
- Phase 2: `reset.imported` is required on the view, so every test fixture building `reset` gained `imported: []`.
- Phase 3: the guard's four refusal tests and the rewrite/delete control failed with the guard body emptied, and pass with it.
