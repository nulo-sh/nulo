# Owner asks: scroll-cue-3

## Q1. Restore again: does it get the "more below" button too?

- **Surface**: Restore again (`apps/extension/src/popup/pages/restore-again.vue`), reached from a profile's "restore again" offer. It is the tenth screen on the same layout as the nine you signed (decision page 109, P109-02 = A); the page listed nine, and the sweep never reached this one.
- **Options**:
  - **A. Yes.** Its scroll area gets the same round button and the same 48 px of room at the end. One attribute on the page, plus its section marks (it shares the full-backup form with Import profile, which is already marked).
  - **B. No.** It stays as today. It follows #1658 after 1.2.0.
- **What it would look like**: with a backup picked and an error or a warning showing, the button sits at the bottom right of the scroll area, as on Import profile.
- **Recommendation**: A. Same layout and same form as Import profile; your P109-02 note reads "Afterwards, I'd to all the sweep list for after 1.2.0."
- **What shipped before the answer**: Restore again left out; the other nine screens did not depend on it.
- **Answer (the owner, 2026-11-04, in chat)**: "restore yes". Option A: Restore again passes `moreBelow` and marks its intro; the shared form's sections were already marked. Shipped in this PR.
