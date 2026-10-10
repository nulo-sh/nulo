# Owner asks: account-session-life

Four questions that no recorded decision answers. OA-1 to OA-3 block nothing: each part ships now in the form shown under "What ships now". OA-4 gates arc 4: nothing of it is built before the answer. Page 7 (records P7-01 to P7-04) is asked separately and gates arc 3.

## OA-1: profile create when the new profile does not start (#100)

**Surface.** Popup → New profile (`popup/pages/profile/new.vue`), after Create, when the new profile's start-up fails, never begins, or another profile is opened in its place.

**Today.** The button reads "Creating…" forever. If start-up failed, the wallet's usual "Something went wrong" toast also shows.

**Options.**
- **A. As today.** The button keeps reading "Creating…"; the person closes the popup and reopens it.
- **B. Say so and go to the unlock screen.** The toast reads "Something went wrong" with the line "Open the wallet again to unlock your new profile." The popup goes to the unlock screen with the new profile selected. If you want B to cover a start-up that is merely slow, name a time limit; past it, a start-up that would have finished lands on the unlock screen instead of the home screen.
- **C. Re-enable Create.** The button returns. Risk: pressing it again makes a second profile, because the first one already exists.

**Recommendation.** B. The profile exists, so the useful next step is to unlock it; C invites a duplicate.

**What ships now.** A. Arc 1 stops the page from loading or opening the wrong profile. Its wait gives up after 30 seconds only if the new profile's start-up never begins; once it has begun, a start-up that is slow but finishes still lands on the wallet's home, as today, and a failed one ends the wait at once. Either way the button keeps reading "Creating…".

## OA-2: Create account lands on an imported account's address (#99)

**Surface.** The accounts list → new account (`AccountsPopup.vue` → `NewAccountPopup.vue`), when the next account this profile would derive is one the person already imported from a file (for example, an account created on another install with the same recovery phrase and imported here).

**Today.** The imported account is replaced by the new derived account: same address and balance, a new name ("Account N"), and the "Imported" label goes away.

**Options.**
- **A. As today.** Replace the imported account.
- **B. Skip it.** Keep the imported account as it is and create the next account after it.
- **C. Refuse.** Show "This account is already in your wallet". Risk: the person can never create another account on that network until they remove the imported one.

**Recommendation.** B: "Create account" then always adds an account, and the person's name for the imported one survives.

**What ships now.** A, made safe against races: create, import and a rename of one address now take turns, and the replaced account's stored imported key is deleted in the same turn, since the derived key is the same key.

## OA-3: passkey window, Try again after an authenticator with no PRF support

**Surface.** The passkey window on Firefox's toolbar panel (`popup/windows/passkey/index.vue`), after a create whose authenticator returns no PRF output.

**Today.** The window says "Your passkey was saved but not confirmed. Try again to finish." Try again asks the same authenticator again, which cannot succeed; the person must close the window.

**Options.**
- **A. As today.**
- **B. Start over on Try again.** For this failure only, Try again starts a new passkey, so the person can pick an authenticator that works. The window's words stay.

**Recommendation.** B. The in-page create (arc 1) already starts over for this failure; B makes the window match.

**What ships now.** A. Arc 1 does not touch the window.

## OA-4: what the popup shows while the background service starts (#157, gates arc 4)

**Surface.** Every popup, tab and window of the wallet, while its background service starts or restarts: the full-screen loader ("INITIALIZING / Initial connection" before unlock, "RECONNECTING / Service worker dropped" after; `components/GlobalLoader.vue`), and the boot banner "The wallet service could not be reached." with RETRY (`popup/app.vue`).

**Today.** The popup treats the service as connected the moment it opens a channel to it, before the service has started. So the loader almost never shows. A call made while the service is still starting can fail; the start-up check retries it, sleeping about 1.5 seconds in total between attempts, under a 60-second overall limit. A service that never starts gets the banner after about 1.5 seconds when its calls fail at once, and after up to 60 seconds when they hang.

**Options.**
- **A. As today.** Arc 2 ships the fixes no one sees; the rest of #157 closes as "won't do".
- **B. Connected means started.** The popup counts the service as connected only when the service says it has started, and calls made before that wait for it. A call no longer fails because the service was still starting. The loader shows for as long as the service takes to start (usually under a second; a cold start of the browser can take several seconds). A service that never starts keeps the loader up until the start-up check gives up, up to 60 seconds; the loader then gives way to the banner, and RETRY works as today.
- **C. B, without the loader.** Calls wait as in B, but the loader keeps today's meaning, so start-up looks as it does today: the popup shows the unlock screen it shows today while it is still deciding. A service that never starts shows that screen for up to 60 seconds, then the banner.

Under both B and C, the banner for a service that never starts comes after up to 60 seconds, where today it often comes after about 1.5.

**Recommendation.** C: it fixes the failures without a new screen. B is the more honest picture if a visible "starting" state is wanted. If the 60-second banner is not acceptable under either, say so: the boot's own reads can keep a short bound, at the cost of the banner again showing for a service that is only slow to start.

**What ships now.** A. Arc 4 is built only on B or C.
