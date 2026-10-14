# Phase 3: arc 3a

Base `7e9eb0f` (`origin/dev`, arcs 1 and 2 merged as #255 and #282).

## Re-check of § Arc 3 against the tree

The tree wins; each disagreement is also in `plan.md` (§ Assumptions, "Arc 3 re-check").

- F18, F19, F20 and F22 hold at moved lines (listed in the plan). H6's one `setExpiryDeferral` caller is `execution/service.ts:305`.
- No 500-row file exists in `contacts-import.test.ts`; 3.3 generates one.
- Arc 1 pinned the re-open gap but no network-name behaviour; 3.9 adds tests.
- #287 already gave the account popups the blank-name refusal 3.9 follows.
- G1 (#169) merged: no host `flock` for `e2e:agent`.
- `useContactImportExport.pins.test.ts:146` pins "contact before sender"; 3.1 inverts it.

## Consults
- 2026-10-14: plan revision review, Codex gpt-6.1-sol high, session `01a13bee` on the default `~/.codex` home. Round 1 reject (5 findings, all accepted), round 2 conditional approve (1 accepted), round 3 approve. Verdicts in `plan.md` § Audit verdicts.
- 2026-10-14: found while waiting on round 1: `Skeleton.vue` already is the shared shimmer (F30); 3.7 reuses it (D-arc3-7), which round 2 judged sound.

## 3.2 the running state

- Mutation check on `useLockWallet`: dropping the confirm's named-imports check, the post-read hold check, or the import count each reds the new cases. Dropping `lockWallet`'s own hold check reds nothing: a hold starts only when the set goes from empty to one, so the import that holds is never one the confirm named, and the named-imports check abandons first. Kept as the last-line invariant, cheap and order-independent.
- Complexity: `importContacts` (16) and `lock` (17) went over budget with the hold; `applyHoldingLock` and `decide` carry the new branches.
