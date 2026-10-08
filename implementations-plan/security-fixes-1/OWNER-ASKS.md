# security-fixes-1 — owner asks

Each ask is something a person could notice. The plan ships the form closest to today, built only
from wording the wallet already shows, and pins it with a test; your answer decides whether a
follow-up changes it. OA-2 and OA-3 also ask you to acknowledge a change the lane mandates.

## OA-1 — the recovery banner after a profile rename (#31)

**Surface.** Home, the recovery-mode banner ("recovery-mode-banner"), after Settings → profile name →
Update, while the profile is in recovery mode (its imported-keys key failed to open).

**Today.** The rename returns the stored row, which never carries the recovery flag. The popup stores
that row, so the banner disappears after the rename and comes back the next time the popup opens. The
full-backup export page also reads the flag from the same place, so for that session it no longer
says that chain data is left out.

**Options.**

- A. Keep the banner. The rename returns the same projection as every other profile call, flag
  included. The banner stays until the profile leaves recovery mode, as it does everywhere else.
- B. Keep today's behaviour. The rename returns the name, id and type only. The banner disappears
  after a rename and returns on the next popup open.

**Recommendation.** A. The banner is the signal that chain data and dApp sessions are unavailable;
hiding it after an unrelated rename is a defect, not a design.

**What ships now.** B, pinned by a `(BUG PIN)` test that names this ask.

## OA-2 — a selector-binding refusal in the journal detail and to a dApp (#13)

**Surface.** (1) The activity record (journal) detail page in debug or developer mode, which shows a
failed operation's raw error text. (2) The failed send's label in the activity record. (3) The error a
dApp receives when a call's name does not match the function its selector resolves to.

**Today.** The raw text names the dApp's claimed function, the resolved function and the contract
address, for example `Scope violation: call name "transfer" does not match selector's function
"mint" on 0x1f…`. A failed send reads "Stopped before broadcast" ("Your wallet caught this before
reaching the network. Often balance, fees, or invalid call."), with the card subtitle "Transaction
failed". The dApp receives "The wallet could not process the request." with no code.

**What ships now (please acknowledge).** The lane requires the log viewer to lose the names and the
address, so the raw text becomes today's sentence without them: `Scope violation: call name does not
match selector's function` (or `authwit call name`). The row label and the dApp's error stay exactly
as today.

**Options for the follow-up.**

- A. Classify it as a scope refusal. The dApp receives code 4100 with "This request is outside the
  permissions you gave this app.", the same as a grant-check refusal, and the send reads
  "Not allowed" / "The app asked for more than you allowed. Nothing was sent." with the subtitle
  "Not allowed". This needs the journal's failure classification and the execution code channel to
  carry the scope refusal, not only a change of error class.
- B. Keep it unclassified, as shipped.

**Recommendation.** A. It is a scope refusal: the call claims a permission its selector does not have,
and a dApp developer can act on the specific code.

## OA-3 — a backup whose contract does not match itself (#27)

**Surface.** Import → full backup, the end of the restore: the warning block
(`import-full-backup-warning`), and the error details its "review the details" choice opens.

**Today.** A contract in the backup registers whatever artifact the file carries, even one that does
not belong to the contract's own class. The import finishes with no warning.

**What ships now (please acknowledge).** The lane requires such a contract to be refused, one contract
at a time. The import still finishes and every other contract restores; the screen shows the existing
warning "Profile import completed with some errors. You can review the details or continue.", and the
details list that contract with the existing text "Contract artifact doesn't match instance's current
class id". No wallet export produces such a file: it means the file was damaged or crafted.

**Options.**

- A. As shipped: the existing warning shows.
- B. Refuse silently: the contract is skipped, the import shows no warning, and the refusal goes to the
  debug log only. The person is not told that part of the backup was not restored.

**Recommendation.** A. A crafted backup is worth one warning, and the wording already exists.

## OA-4 — a stored dApp permission no wallet version writes (#29)

**Surface.** A connected app whose saved permission record is malformed (possible only from a
development build or a hand-made record; every permission the wallet saves is validated first). What
the app's calls do, and whether the connect window opens.

**Today.** Most malformed shapes crash the check with an internal error: the app's calls fail with
"The wallet could not process the request.", no connect window opens, and a send's queued row, if one
was created, reads "Popup closed early". One shape, a malformed contract address, instead refuses the send as "Not
allowed" and lets a re-request open the connect window.

**What ships now.** Every malformed shape is refused with the existing "Malformed … capability"
error: the app's calls fail with "The wallet could not process the request.", no connect window
opens, and a send's queued row, if one was created, reads "Popup closed early". The malformed-address shape moves from
"Not allowed" to that same result. Disconnecting the app in Settings → Connected apps clears the
record, as today.

**Options.**

- A. As shipped: refuse until the app is disconnected.
- B. Self-heal: ignore the malformed record, so the app's next request opens the connect window and
  the person's answer replaces it. Needs the session writers hardened first, and the window appears
  where today it does not.

**Recommendation.** A. The record cannot come from a wallet version people install, and refusing is
the fail-closed choice.
