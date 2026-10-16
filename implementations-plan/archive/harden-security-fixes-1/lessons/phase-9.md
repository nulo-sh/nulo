# Phase 9: the passkey RP trust note (C9), and PR C's review loop

- One SECURITY.md sentence on the browser trust the passkey derivation rests on; the closed `known-limit` issue is #597 (filed with the five sections, the trust boundary only, closed as not planned in the same breath).

## Review loop (PR C)

- Round 1, Codex (session 01a1459a): reject. #1 a merge that keeps older bytes before a restore (not reproduced on git 2.43; `--full-history --topo-order` added, with a test that fails under the old base); #2 an edit and its revert cancel in the diff, so "no change" needs an empty log too; #3 two comments removed; #4 a skill clause reworded. All applied (e734b02d).
- Round 1, Opus (alongside): accepted #1 the cap-cut hex run, #2 the squash-merge window (D7 amended), #3 topological order (already applied), #4 the slow first-publish test (one fast-import instead of a raised timeout), #5 a shallow clone refused, #6 field-sized bigints, #7 the define moved into `vite.shared.ts` so its test reads what the build uses, #8 the skill's scope, #9 a doc comment made inline (f6ba0cb2).
- Round 2, Codex (resume): reject, one material: the previous carrier search stays within the served carrier's parent ancestry (the parent of the served list's first carrier), not all of HEAD's. The test puts the previous list's bytes again on the first-parent line (the mirrored shape resolved correctly by chance); it fails without the scoping. One comment removed (5cb06719).
- Round 3, Codex (resume): approve, no finding; it found no omission from GitHub reverts or the merge-based promote and sync flows.
