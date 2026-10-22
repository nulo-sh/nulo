# Owner asks: encryption-at-rest-1

The plan is [plan.md](plan.md). Five asks. Each one says what ships if you do not answer. The arcs land in order, A1 first. OA-4 and OA-5 are answered (decision page 74, 2026-10-20), so A1 waits on no ask; A4 waits for OA-3; OA-1 and OA-2 block nothing.

**When A1 lands, answered (P74-01): A.** "In 1.0.0: #924 lands after #938, after your own build test and one green nightly soak; the promote waits for it." Your question about people on an earlier 0.3x build: nobody needs to uninstall or reinstall. Their saved data still reads after the update. The first unlock on the new build encrypts it in the background. An existing install updates in place with its data, which the update test proves, and old backups still restore.

## What changes for a person

- **On screen: nothing, except one rare case (OA-4).** Every screen shows the same things in the same place.
- **The first unlock after the update** works as usual. In the background, the wallet re-saves that profile's data in its encrypted form. The person sees no wait. If the browser closes halfway, the next unlock finishes the job, and nothing is lost.
- **Once that background re-save finishes** (seconds after the unlock), someone who copies the browser's files cannot read that profile's data without the password: contacts, history, app connections, balances, accounts and their names, tokens and networks.
- **What they can still read:**
  - profile names (OA-1) and how many profiles there are;
  - which tokens are pinned, which fee payer was picked, and the address of the account selected last. These four small settings are saved in a way the wallet's update checks do not yet let us change; a follow-up will move them;
  - roughly how many rows each profile has, and how big they are, including how many accounts it has on each network;
  - a profile nobody has unlocked since the update, until it is unlocked;
  - old history entries that came from an old backup without saying which profile they belong to, while the wallet cannot yet tell whose they are (for example, when two profiles share the account, or another profile has not been unlocked since the update). The wallet leaves them as they were;
  - while a profile is being deleted, or a network is being reset, the wallet keeps a short-lived record of that profile's account addresses. The record goes away when the job finishes.
- **Backups:** old and new backups both restore. The file format does not change.

## Your OPFS question

**No, and it would not help.** OPFS is just a place to keep files; it encrypts nothing by itself. The wallet's private chain database already lives there, but what protects it is the encryption we apply, not OPFS.

Moving these rows to OPFS would still need the same encryption. It would also lose three things the wallet relies on today:
- saving several rows in one step;
- the guard that stops a screen from reading during an update;
- the update and backup machinery.

So the rows stay where they are, encrypted.

## OA-1. What stays readable before unlock

The lock screen and the profile picker show each profile's name before any password is typed. To show it, the name must stay readable on disk.

- **A. Keep profile names readable.** Nothing on screen changes. *(Recommended; ships if you do not answer.)*
- **B. Hide them too.** The lock screen and the picker would show "Profile 1", "Profile 2" until unlock. That is a visible change; it would need pictures and its own sign-off, and a later lane.

Pictures: with A, both screens stay as they are today, so this run attaches none. If you lean to B, the shots to take are listed under "Pictures to take" below.

## OA-2. Two security choices the panel made (nothing visible; tell us if you disagree)

1. **The encryption key comes from the profile's master secret alone.** The master is what the recovery phrase produces.
   - Why: the wallet's repair mode ("Wallet keys need recovery") opens without the second key, and it must still read your accounts and the data its repair backup carries.
   - The price: someone who has your recovery phrase and a copy of your files can read this data. Someone with your phrase can already spend from every account the phrase creates. Separately imported accounts are different: their keys stay locked behind the second key, and that person still cannot use them. The panel judged the price acceptable.
   - App connections keep their own extra seal, so even that person cannot fake an app's permission.
2. **After you lock, the keys stay in memory until the browser closes, the wallet restarts or updates, or the profile is deleted.** The wallet's background process stays alive while the browser runs, so for a browser left open this can be hours.
   - Why: work that finishes after a lock (a transfer that was already sending, a "Stopped when the wallet locked" entry) must still be saved encrypted.
   - The wallet already does this for its private chain database. Someone who copies files from the disk does not see memory. Someone who can read the memory of the running browser is outside what the wallet defends against, today and after this change.

Ships as described. Say "drop keys at lock" if you want the stricter version. It costs a more complex design for little gain.

## OA-3. The privacy policy and the store listing (answered: A)

**Answered (P70-07, decision page 70, 2026-10-20): A.** "A patch bump with these words: not material, nothing new is collected or shared." Privacy 1.2.3 ships the proposed wording below as written, with the "what changed" line as its manifest `changes` text; the listing's account-address row and storage line say "encrypted". The effective date and every other BEFORE-LAUNCH blank stay the owner's.

Today `legal/privacy.md` § 4 says contacts, history, balances, networks and app permissions are "Stored without application-level encryption". After A4 that is no longer true. The store listing does not say it, but it can now say "encrypted".

**Proposed wording (please edit freely):**

- `legal/privacy.md` § 4, the three rows:
  - *Account addresses, profile names, settings, contacts*: "Contacts, account names and addresses: encrypted with a key derived from the profile's master secret, readable only after unlock. Profile names and settings: stored without application-level encryption."
  - *Tracked tokens, cached balances, cached prices*: "Tracked tokens and cached balances: encrypted as above. Cached prices: public data, stored without application-level encryption."
  - *Transaction history, activity records, networks, granted app permissions*: "Encrypted as above."
  - One sentence under the table: "A profile's data is converted to this form the first time it is unlocked after the update."
  - One more: "Exceptions: profile names; pinned tokens, fee-payer choices and the last-selected account; a profile not yet unlocked since the update; older transaction entries the wallet cannot attribute to one profile; and records kept while a deletion, a network reset or an account-integrity block is in progress."
- `apps/extension/store/listing.md`:
  - line 51, the "Account addresses" row: "Extension local storage, encrypted".
  - line 69: "Keeps profiles, accounts, contacts, settings and granted app permissions on the device, encrypted under each profile's key except profile names, settings and a few display preferences."

**Version:** the policy needs a new version number, and any bump shows "Privacy Policy updated" under Settings → About's Privacy Policy row until the person opens it. That line already exists; only its trigger fires.

- **A. A patch bump, not material.** Nothing new is collected or shared, and protection only improves; the precedent is 1.1.1 and 1.2.1. *(Recommended.)*
- **B. A minor bump, material.** Treats the stronger protection as news worth flagging, as 1.1 and 1.2 did for new data flows.

The "what changed" line (proposed): "Contacts, history, balances, accounts, tokens, networks and app permissions are now stored encrypted on your device, readable only after you unlock the profile."

Ships without an answer: A1-A3. A4 does not merge until you sign the wording and pick A or B.

## OA-4. Refusing an app right after the wallet restarted (answered: A)

**Answered (P74-02): A, accept.** You left it to the orchestrator, with this question: "Quick question: does this happen when the wallet restarted when the "Allow" pop-up was on? I'm trying to understand if the user should really go to Settings to remove it, or if we are being overly conservative damaginc UX." The answer: not with Allow. The Allow window answers a request that a restart ends, and it neither reads nor removes a saved connection. The case is only "They don't match" on the emoji-check window after a restart. #944 (merged on `dev` as `bf6a25f2`) closes the connect and emoji-check windows at every background restart, so that press can no longer happen. What remains is an app listed in Connected apps until the person removes it, or until it reconnects and passes the check. Nothing is granted meanwhile.


When an app connects, the wallet can show an emoji check: "Do these match?". Pressing "They don't match" today forgets that app and closes the window.

After A1, one case changes. If the wallet's background restarted while that window was open (a crash, or an update), it can no longer read the app's saved connection. So:
- the window stays open;
- it shows the message the wallet already has for this: "The connection ended, but this app could not be removed. Remove it in Settings, Connected apps.";
- the app stays in Connected apps until you remove it there.

Nothing is granted by accident: the next time that app connects, the emoji check shows again.

- **A. Accept.** It is rare, the message already exists and says what to do, and nothing is granted. *(Recommended.)*
- **B. Ask for something else.** For example, the wallet could ask you to unlock first and then finish the refusal. That needs new screens and a design.

Ships without an answer: A1 can be built and reviewed, but it does not merge until you pick, and the later arcs follow it.

## OA-5. A very long contacts list opens a little slower on Firefox (answered: A)

**Answered (P74-03): A.** "Accept: only Firefox pays, only with thousands of contacts, and the list still opens in under a third of a second."


The plan's rule: if a list opens more than 50 ms (a twentieth of a second) slower than today, the work stops until you decide. We timed the contacts list with 2,000 contacts, far more than most people keep.

- **Chrome:** no difference we can measure.
- **Firefox:** about 40 to 70 ms slower, on top of the 150 to 180 ms it takes today. Firefox takes about 20 to 35 millionths of a second to unlock each encrypted row, and with 2,000 rows that adds up. The browser's own memory clean-up adds pauses of 100 to 400 ms to both versions, so single timings swing from 12 to 250 ms slower.
- **With 50 contacts** the difference is one or two milliseconds on either browser.

- **A. Accept.** Only Firefox pays, only with thousands of contacts, and the list still opens in under a third of a second. *(Recommended.)*
- **B. Make it faster first.** The wallet would keep the unlocked contacts in memory after the first read, so later reads skip the work. That copy must be wiped on every path that wipes the keys, which is new state for a security review, so it would be a later lane.

Ships without an answer: A1 can be built and reviewed, but it does not merge until you pick.

## Pictures to take (for the orchestrator's shots run)

All shots at 400×600, in the light and the dark theme. Nothing here is built yet, so none are attached.

| Shot | Before | After |
|---|---|---|
| OA-1 B: lock screen profile pill | today's pill with the profile name | the same pill reading "Profile 1" |
| OA-1 B: select-profile popup | today's list of names | "Profile 1", "Profile 2" |
| OA-3: Settings → About, Privacy Policy row | no description | "Privacy Policy updated" (the existing line) |
| OA-4: the emoji-check window after "They don't match", following a background restart | the window closes | the window stays open with the red "could not be removed" message |
