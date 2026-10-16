# Phase 10: the cross-arc pass and the final gates

## Cross-arc pass (A merged, B, C)

- Round 1, Codex (fresh session 01a145c3, over A's merge commit, B's and C's diffs, read through git refs): conditional approve, no material finding. Accepted: a queued title and the planner's title now clean each call name with `wireTitle` before `pickPrimaryMethod` picks, as a settled record does (D8; tests compare a queued and a settled pick over a fee call and a transfer, and fail with the old order); a long comment in B cut to two lines; the recon's exclusion rows reduced to their issue numbers; the plan's Scope, Architecture, Phases 7-8 and D7 brought to the build.
- `dev` (#594, #595) was merged into B and C before round 2. The one conflict was the type-roles digest manifest: B's planner digest, dev's dispatcher digest, both re-checked by the inventory test.
- Round 2, Codex (resume): conditional approve, one committed-text correction in this plan and its lessons (review lines now state the invariant), applied. B's fix verified against what #594 and #595 changed in B's files; both inventory digests match; B and C merge cleanly (`git merge-tree --write-tree`).

## Final gates

- Static scans that read the whole tree (copy-dash-ban, log-payload-ban, profile-ui-keys.scan, storage-facade-ban) and a hook that imported the content script per test timed out at their 5 s and 10 s limits at a load of about 200. The hook now imports the module once, at collection; the scans pass alone. Neither limit was raised.
