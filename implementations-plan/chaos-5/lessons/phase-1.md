# chaos-5 phase 1: the two races

## 1.1 `raceMethodChangeElsewhere`

- First Chrome run: the competitor's change ended `cancelled`. A page opened for the race takes focus, and Chrome refuses a WebAuthn call from an unfocused document, so the anchor's prompt failed as not confirmed. Fix: the race brings the anchor to the front before the control check, so a prompt the focus move ended would be caught there.
- Second run: the second page never showed Unlock method. A new page lands on Home once its bootstrap ends, over any route set before that; the race now waits for that landing first, as `secondWindow` does.
- The error's call site named only `run.ts`: `callSite` matches `profile-chaos/\w+\.ts`, which no hyphenated file name (`unlock-method.ts`, `accounts-io.ts`) matches. Not fixed here; noted for the review.
- Green on Chrome: new passkey 3.3 s, password 4.9 s, delete 3.9 s a step. Firefox: 6.2 s, 7.3 s, 6.7 s.
- Scratch break, never committed: `AbortController.prototype.abort` made a no-op on the second page before the competitor. The step ended `committed` after the 15 s abort wait and failed O5 ("ended committed; the model allows cancelled").

## 1.2 `raceMethodChangeDuringExport`

- The plan expected a change to a new passkey to leave the approval for Save to meet the service's refusal. On Firefox the page started over before Save, back at the account picker. Read: the change reopens the session in place (`SessionManager.open` emits `onActiveProfileChanged`); the window's bootstrap then runs `initNetworks`, which sets `appStore.network` to undefined before resolving it again (`apps/extension/src/composables/useProfileBootstrap.ts:153`); the page's watcher on `appStore.network?.chainId` (`export/account.vue:180`) resets a passkey profile's unmade file. The tree wins (D15): both changes are `cancelled`, and the driver waits up to its bound for the reset before it looks for Save.
- The watcher fires on any re-bootstrap of the window, not only on another window's network switch as its comment says; that goes into D11's comment issue.
- Green on Firefox: new passkey 6.8 s, password 5.6 s a step.
