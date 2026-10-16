# Phase 3 and the review loop over phases 1-3

## Gates

- Phase 1, 2 and 3 gates each green on the first run (lint, typecheck:all, test). Red proofs taken from 7697c376 copies: both #565 site cases, the three #566 lock cases, the #567 second-warning case (blank dialog: `title` undefined). On the base composable the next case, "a NON-duplicate error", also reds: a cascade, the stuck base import leaves a `mockResolvedValueOnce` that `vi.clearAllMocks` does not drop.

## Review round 1 (phases 1-3; Codex gpt-6.1-sol high, session 01a14599-c2a6-79c1-851a-672a118e2627, with one Opus 5.5 general-purpose review)

- Codex: **approve**, two P3s. (1) The second-warning test could confirm a dialog never opened: accepted, `confirmDialog` asserts the popup is open and the case asserts two import calls before the confirm. (2) The fake's "current state first" comment narrates: accepted, removed.
- Opus: **approve** with one medium. (M) The held-snapshot case stays green with an unmount `disconnect()`, the regression the D5 comment guards, because the fake's `disconnect` cancelled nothing: accepted; the fake's disconnect now rejects the in-flight snapshot and its subscribe swallows it, as the real client does. Mutation check: `onClose()` added to `onUnmounted` reds that case. (L1) The helper's doc said each character, the regex maps each run: accepted, reworded. (L2) Skip the payload read once the snapshot closed the window: rejected, the plan's Security section accepts the one-read render and the change adds a state flag for a flash nobody saw. (L3) D5 keeps `unsubscribe`; the code does not: a deviation, recorded in the plan (the disconnect ends the subscription, nothing reconnects after it).
- Round 2 (resume, same session, fix diff bdaa8dd9): **approve**, "no new material findings". Phases 1-3 converged.
