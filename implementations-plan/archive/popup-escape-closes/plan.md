# Escape closes the top popup

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Escape handling in `apps/extension/src/components/Popup/Popup.vue`, `apps/extension/src/components/ui/Dropdown/DropdownRoot.vue` and `apps/extension/src/components/passkey/PasskeyCeremonyDialog.vue`, the e2e cases `apps/extension/tests/e2e/popup-stack.test.ts` and `apps/extension/tests/e2e/network/popup-escape-layered.test.ts`, and the ownership teardown in `apps/extension/tests/e2e/fixtures/browser/ownership.ts`.
- **Open items**: none; the passkey ceremony dialog's missing focus trap was added by [firefox-passkey-unlock](../firefox-passkey-unlock/plan.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Escape inside any registry popup closes that popup and only that one, and hands focus back to the control that opened it. `closeOnEscape` now defaults to on, and an opt-out keeps the focus trap (`escapeDeactivates: false`), so a prompt that must be answered by a control holds the keyboard and must also block the outside tap. The popup records its opener before any child's queued focus runs and passes it as the trap's return-focus target. Whatever acts on an Escape marks it handled with `preventDefault()`, which now includes the shared dropdown menu and the passkey ceremony dialog. Three follow-up fixes rode along: an e2e ownership-teardown flake, a Firefox build on every extension PR, and the dialog's Escape.

## Why

A popup that did not opt in let the focus trap handle Escape its default way: the trap was released but the popup stayed on screen, so Tab moved controls the user could not see. Flipping the default is the contract; opting every registry tag in by hand would be the same behavior with a new popup shipping without it. The trap library defaults `escapeDeactivates` to on, so merely omitting it on opt-out reproduces the defect.

Chrome closes the whole toolbar popup on an Escape the page leaves unhandled. A menu inside a popup used to close on Escape and leave the key unhandled, which closed the wallet, so the fix is to mark it handled. Firefox's toolbar panel closes on every Escape regardless, so the behavior shows there only in a tab or window.

## What shipped

- The default flip, the held trap on opt-out, the captured opener and component tests for each, including a child that focuses another node before the trap activates. The Send review sheet's now-redundant opt-in is gone.
- `DropdownRoot` calls `preventDefault()` before closing its menu, so Escape closes only the menu, on pages as well as inside popups.
- `PasskeyCeremonyDialog` marks its Escape handled before cancelling and leaves an Escape alone once the ceremony has settled. A cancel still resolves to the user-rejected error and nothing is approved by Escape.
- A smoke case on the accounts then new-account stack (Escape closes the top popup, focus lands on its opener, a second Escape closes the next) and a network case for a menu inside a registry popup, which proves the popup stayed open by containment rather than visibility.
- The ownership teardown waits for a sighting of a child carrying its marker, signals each marked process once per phase, rescans on every poll and deletes the profile only after two empty scans a poll apart. A launch that outlives the kill keeps its profile for the next sweep.
- The Firefox build job now runs on the same condition as the Chrome one, with the gating test pinned to match.
- The keyboard rule is in `CLAUDE.md` and the e2e skill.

## Lessons

### Still control

`pointerClick` read a control's centre as soon as it was visible, which is mid-slide in an entering popup, and pressed a round trip later; a 16 px control missed on any move over 8 px. The helper now waits until a control's box and its pending enter state are both unchanged across consecutive reads, then presses. Comparing boxes alone is not enough, because an enter transition that has not started yet reads as still. The fix sits in the helper because every caller pressing into an entering popup shares the race.

### Spawn environ

Bun's `spawn` returns while the child is still inside execve, and until the new image exists its `/proc` environ reads empty, so a marker scan misses a live child. Reading straight after `spawn()` came back empty about 99 percent of the time under Bun and never under Node. A full scan usually outlasts the exec, which is why only a loaded runner failed. The helper now returns once a scan has seen the child with its marker.
