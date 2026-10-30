# chaos-5 phase 1: the two races

## 1.1 `raceMethodChangeElsewhere`

- First Chrome run: the competitor's change ended `cancelled`. A page opened for the race takes focus, and Chrome refuses a WebAuthn call from an unfocused document, so the anchor's prompt failed as not confirmed. Fix: the race brings the anchor to the front before the control check, so a prompt the focus move ended would be caught there.
- Second run: the second page never showed Unlock method. A new page lands on Home once its bootstrap ends, over any route set before that; the race now waits for that landing first, as `secondWindow` does.
- The error's call site named only `run.ts`: `callSite` matched `profile-chaos/\w+\.ts`, which no hyphenated file name (`unlock-method.ts`, `accounts-io.ts`) matches. Fixed in the review round.
- Green on Chrome: new passkey 3.3 s, password 4.9 s, delete 3.9 s a step. Firefox: 6.2 s, 7.3 s, 6.7 s.
- Scratch break, never committed: `AbortController.prototype.abort` made a no-op on the second page before the competitor. The step ended `committed` after the 15 s abort wait and failed O5 ("ended committed; the model allows cancelled").

## 1.2 `raceMethodChangeDuringExport`

- The plan expected a change to a new passkey to leave the approval for Save to meet the service's refusal. On Firefox the page started over before Save, back at the account picker. Read: the change reopens the session in place (`SessionManager.open` emits `onActiveProfileChanged`); the window's bootstrap then runs `initNetworks`, which sets `appStore.network` to undefined before resolving it again (`apps/extension/src/composables/useProfileBootstrap.ts:153`); the page's watcher on `appStore.network?.chainId` (`export/account.vue:180`) resets a passkey profile's unmade file. The tree wins (D15): both changes are `cancelled`, and the driver waits up to its bound for the reset before it looks for Save.
- The watcher fires on any re-bootstrap of the window, not only on another window's network switch as its comment says; that goes into D11's comment issue.
- Green on Firefox: new passkey 6.8 s, password 5.6 s a step.

## 1.3 Campaign

- Model test: 30 consecutive retry-0 runs, 266 tests each, all green.
- Smoke seeds 9001-9010, retry 0: Chrome all pass, per seed 70.9, 40.3, 43.1, 34.9, 44.1, 44.8, 46.7, 49.2, 55.2, 50.3 s (mean 48 s; chaos-3 measured 54 s). Firefox all pass, per seed 77.4, 87.1, 76.5, 65.2, 75.8, 67.6, 62.6, 71.0, 75.8, 72.7 s (mean 73 s; chaos-3 76 s). Steps left incomplete are only the planned background restarts. The new races were drawn once on Chrome (9001#7) and four times on Firefox.

## Consults

### Codex round 1 (gpt-6.1-sol, high, read-only)

Verdict: conditional approve (with conditions: positively verify the export page reset). Two findings, each checked against the tree; both accepted.

1. The export race reported `cancelled` when Save left the page, and Save also leaves a page whose profile is no longer a passkey one (`apps/extension/src/popup/pages/settings/security/export/account.vue:499`), whose network watcher then returns early (`:182`): with the type watcher gone, the password variant stayed green. Fixed: Save must be offered before the competitor, the picker must come back (`export-account-row`), and neither is `refused`. Verified with a scratch build whose type watcher does nothing: the password variant went red on O5 (`refused`), then the source was restored and the dist rebuilt.
2. The export driver's four-line comment restated its body. Cut to the invariant.

### Opus review (general-purpose), beside round 1

Verdict: conditional approve. Five findings, each checked; all accepted.

1. As Codex 1.
2. The network clause was cited for a change to a password, where the watcher returns early. Now only for a new passkey; the README says the password reset comes by the type.
3. `SHOWS_MS`'s comment had the order wrong: `reset()` queues the dialog's unmount before the run's catch, so the abort comes first and any toast follows in the same task. Reworded.
4. `competitorInvalid` said "the competing change is approved" when it was not. Reworded.
5. `callSite` missed hyphenated file names. Fixed in both regexes of `run.ts`.

### After the fixes

- `waitForSelector('[data-testid="export-account-row"]', { visible: true })` resolved null at once on Firefox without throwing, so the first fixed run read a start-over as missing and went red (`refused`). The suite's `firstSignal`, which polls visibility in the page, waits correctly: green, new passkey 4.5 s, password 5.3 s.
