# Owner asks: account-session-life

Nine questions. Page 7 answered OA-1 to OA-5 on 2026-10-14, and its re-signing the same night answered OA-6 (P7-10 = B), OA-7 (P7-11 = A) and OA-8 (P7-12 = B) (§ Answers); arcs 4 and 5 build those picks. OA-9 (found building arc 5) is open and ships in its "What ships now" form.

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

## OA-5: Delete Profile that outlives the popup's 60-second call limit (found in arc 2's review)

**Surface.** Settings → Security → Delete Profile (`popup/pages/settings/security/reset.vue`), while the deletion waits for an in-flight proof to finish.

**Today.** After 10 seconds the page shows "Waiting for an in-flight operation to finish. This can take up to ~30 minutes while a transaction is proving. Keep this window open." But the popup gives every call to the background 60 seconds (`DEFAULT_RPC_TIMEOUT_MS`; the profile client sets no longer limit for this one). At 60 seconds the page drops the hint and shows "Couldn't delete profile. Try again", while the background keeps deleting: it has already removed the profile and is erasing its data. Try again then fails, because the profile no longer exists. The same holds for any deletion slower than 60 seconds, such as a cold start of the PXE document.

**Options.**
- **A. As today.**
- **B. Give this one call the time the page promises.** The popup waits for `deleteProfile` up to the hint's 30 minutes plus the start-up allowance, so the page keeps "Deleting…" and its hint until the background finishes, then shows "Profile deleted" as on the quick path. No new words.
- **C. B, and say "Profile deleted" once the profile is gone.** The page treats the deletion as done when the profile leaves the list, and the erase finishes in the background, as a resumed deletion already does after a restart.

**Recommendation.** B: it makes the page do what its own hint says, with no new words.

**What ships now.** A. Arc 2 adds no time to it: `deleteProfile`'s new wait for the deletion coordinator shares the 30-second budget the call already spends waiting for the service to start, so the call reaches its first write no later than it does today.

## OA-6: the unlock screen's error toast after a retry that succeeds (found in arc 3's review)

**Surface.** The unlock screen (`popup/pages/auth.vue`), password profile, after an unlock fails and a later attempt succeeds.

**Today.** An error toast stays until it is closed, on every screen. So after "Unlock timed out. Please try again", and from arc 3 on after "Something went wrong" with the line "Try unlocking again.", a retry that unlocks lands on the wallet's home with that toast still showing, until the person closes it. A retry that hits a wrong password shows the inline "Wrong password" beside it.

**Options.**
- **A. As today.** The toast stays until it is closed.
- **B. A new attempt takes the last failure's toast away.** Pressing Continue again closes the unlock screen's own failure toast, so a success leaves nothing behind and a second failure shows its toast afresh. The passkey prompt already does this with "Passkey not confirmed. Try again." No new words.

**Recommendation.** B: it matches the passkey path on the same screen.

**What ships now.** A. Arc 3 adds the approved toast and changes nothing about how any toast leaves.

## OA-7: the unlock screen before the service has answered (#157, arc 4)

**Surface.** The popup's unlock screen (`popup/pages/auth.vue`) on a cold start, before the background service has said it has started (P7-08b = C: the unlock screen at once, with the 2 px bar).

**Why it is asked.** The record says the profile name stays blank until the service answers. The screen's heading ("Password required" or "Passkey required"), its line and its form also depend on the profile, which is unknown until then. The shot showed the password form, so a passkey profile would see the password form and then a swap.

**Options.**
- **A. Keep their place, hidden.** Until the profile is known, the heading, its line and the form keep their place but do not show: the screen shows the NULO wordmark, the lock, an empty profile pill, "Delete profile" and the bar. A password profile's form then appears in place, and the cursor goes to the password field. A passkey profile's shorter form appears, and the column re-centres once.
- **B. As the shot.** The password heading and form show at once. A passkey profile sees them for about a second, then the passkey form.
- **C. Nothing moves.** Everything below the bar stays hidden until the profile is known, then the whole unlock screen appears at once in its final place. Until then the popup shows only the bar, as the screen did before it, so this is the furthest from "the unlock screen at once".

**Timing, in every option.** The record says "at once"; as built, the unlock screen comes once 200 ms pass without the service's answer, the same delay the bar has, counted once per opening. On a normal open the service answers sooner, so the popup looks exactly as today. Showing the screen at 0 ms would show the empty pill and the swap on every normal open. Say so if you want 0 ms.

**A wallet with no profile.** On a cold start, a popup opened with no profile at all shows the unlock frame until the service answers, then the Create profile screen replaces it. Today it is empty until then, then the Create profile screen. Say so if this needs a different first frame.

**Recommendation.** A: no screen ever shows a form for the wrong kind of profile, and only a passkey profile's column moves, once.

**What ships now.** A, with the 200 ms delay. Arc 4's PR may open before you answer; its merge waits for it. Any option is a local change to the unlock page.

## OA-8: a new profile that does not open: the time limit, another profile taking over, reopening (#100, arc 5)

**Surface.** Popup → New profile, after Create, when another window opens another profile while the new one starts (or the page's last steps fail after the new profile opened).

**Why it is asked.** P7-05 = B sends the popup to the unlock screen with the new profile selected. Here another profile's session is open in this popup, and the unlock screen is only reachable by locking it, which would also lock the other window.

**Options.**
- **A. As today.** The button keeps reading "Creating…"; the person closes the popup and reopens it on the profile that is open.
- **B. Say so and stay on the open profile.** The toast reads "Something went wrong" with the line "Open the wallet again to unlock your new profile.", and the popup goes to the open profile's home.

**Recommendation.** B: the person learns the new profile exists without losing the open one.

**What ships now.** A.

**The named time limit.** P7-05 asks for a named limit on a slow start without a value. As built: 60 s after the new profile exists, the limit every popup call already has. The time spent naming the profile, creating it and on a passkey prompt is not counted. Name another value if you want one.

**Reopening after the hand-off.** The new profile's session stays open in the background, so after the toast "Open the wallet again to unlock your new profile." a reopened popup goes straight to its home, without asking to unlock. Locking it at the hand-off would close a session the record does not name. Say so if the toast's second line should change.

Arc 5's PR may open before you answer; its merge waits for it.

## OA-9: which toasts Continue closes on the unlock screen (#137, arc 5)

**Surface.** The unlock screen (`popup/pages/auth.vue`) when Continue is pressed with a toast showing that the screen's own unlock failure did not open.

**Why it is asked.** P7-10 = B closes "the unlock error toast" on a new attempt, "as the passkey ceremony does", which closes only its own. Two other error toasts can sit over the unlock screen: the wallet's "Something went wrong" (no line) when an unlock's start-up fails, which the shell opens; and P7-05's "Something went wrong" with the line "Open the wallet again to unlock your new profile." after a new profile did not open.

**Options.**
- **A. Only its own.** Continue closes the toasts the unlock screen's failures opened ("Unlock timed out. Please try again", "Something went wrong" with "Try unlocking again.", the passkey lines). The two above stay until closed, so an unlock that succeeds can land on Home with one of them.
- **B. Any error toast.** Continue closes whatever error toast shows, so a successful unlock always lands on a clean Home.

**Recommendation.** B: both toasts are about the attempt the person is now making again.

**What ships now.** A. Either is a one-line change on the unlock page.

## Answers

Decision page 7, signed by the owner on 2026-10-14 and applied to the issues the same day (each issue's `## Decision` block). Each pick below changes what arc 1 or arc 2 shipped as "what ships now"; the 2026-10-14 revision of the plan builds them in arcs 4 and 5.

- **OA-1 (P7-05, #100): B.** Say so and go to the unlock screen: the toast reads "Something went wrong" with the line "Open the wallet again to unlock your new profile." and the popup goes to the unlock screen with the new profile selected. Owner note: "Should we give some more information to the user? How can we help him here?"
  - **The named limit (the note the record asks for):** 60 seconds after the new profile exists, the planner's value, listed on OA-8 for confirmation. It is the bound every popup call to the service already has, and the limit after which the start-up banner appears. Past it, a start-up that would have finished lands on the unlock screen, and finishing later does not move the screen. Built in arc 5. A second line for a slow start ("The wallet is taking long to start."), offered in chat, has no answer, so B's words ship as recorded.
- **OA-2 (P7-06, #99): B.** Skip it: keep the imported account as it is and create the next account after it. Built in arc 5.
- **OA-3 (P7-07, #159): B.** Start over on Try again, for this failure only: Try again starts a new passkey so the person can pick an authenticator that works. The window's words stay. Built in arc 5.
- **OA-4 (P7-08, #157): C.** B without the loader: calls wait as in B, but start-up looks as it does today (the unlock screen while it is still deciding). A service that never starts shows that screen for up to 60 s, then the banner. Owner note: "How does it look today? As an empty screen? If so, showcase to me 4/5 options for this. though it shouldn't be more than less than 1 sec, but Im intrigued now." The options for the start-up moment went to a separate shots worker (`program-2-shots-157`), not to this lane.
- **OA-4 follow-up (P7-08b, #157): C**, picked 2026-10-14 19:20Z: "The unlock screen at once with a 2 px bar sweeping along the popup's top edge until the service has started. Nothing else changes and nothing moves. On a normal open at most one frame of the bar, none with a 200 ms delay before it shows; on a cold start the bar runs about a second and the unlock screen appears about a second sooner than today. The profile name stays blank until the service answers." Built in arc 4; OA-7 asks the details it leaves open.
- **OA-5 (P7-09, #157): B.** Give this one call the time the page promises: the popup waits for `deleteProfile` up to the hint's 30 minutes plus the start-up allowance, so the page keeps "Deleting…" and its hint until the background finishes, then shows "Profile deleted" as on the quick path. No new words. Built in arc 4.

Page 7 re-signed on 2026-10-14 21:59Z (the `## Decision` blocks on #137, #157, #100):

- **OA-6 (P7-10, #137): B.** "Close it on a new attempt, as the passkey ceremony already does: pressing Continue again dismisses the toast before the new attempt, so a retry that unlocks lands on a clean Home." Built in arc 5; OA-9 asks which toasts count.
- **OA-7 (P7-11, #157): A.** Keep their place, hidden, as arc 4 built it.
- **OA-8 (P7-12, #100): B.** "Say so and stay on the open profile. The toast reads 'Something went wrong' with the line 'Open the wallet again to unlock your new profile.', and the popup goes to the open profile's home." Built in arc 5, with the 60 s limit as listed.

Page 7's arc 3 records, built in arc 3 as approved: P7-01 (#24, no recovery bearer), P7-02 (#137, the unlock toast), P7-03 (#208, one eye per change-password field). P7-04 (#208, backup autocomplete) was not struck, so it stands; it is built in Phase 3.4, deferred by D-orch-7.
