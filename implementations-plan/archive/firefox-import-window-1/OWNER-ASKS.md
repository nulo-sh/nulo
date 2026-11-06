# firefox-import-window-1: owner asks

Every other surface this lane changes is named by the owner's pick P116-16 B (decision page 116, signed 2026-11-06), quoted in the plan's UI impact. The arc ships without this answer, in the "what ships now" form below.

## OA-1. Change unlock method in its own window: a change saved but not reopened

Surface: Firefox's toolbar panel → Settings → Unlock method, which runs in a window of its own. Rarely, the change is saved (or may have been) but the wallet cannot reopen the session over it, and locks.

- **A (ships now)**: today's ending, in the window. The window shows the lock screen with "Unlock method changed. Unlock Nulo again to continue." After the unlock, the window shows the Unlock method page again, which says how the profile now unlocks. The person closes the window with Back; the panel does not reopen by itself.
- **B**: the window closes and the panel reopens on the lock screen. After the unlock, the panel opens Home. The line "Unlock method changed. Unlock Nulo again to continue." does not show: the panel can carry a line only to a page with the session open, and after the unlock it would read wrong. This is what #1701's investigation proposed ("On `UnlockMethodChangedError`, hand back `/popup/general` with no snack").
- **C**: as B, but the panel reopens on Settings after the unlock, with no line.
- Recommendation: B. It matches what a successful change now does (the window never stays open), and the lock screen already says what to do. A keeps the one line that names what happened.
