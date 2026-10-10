# Owner asks: backup-import-export

Page 1 (Backup and export) already carries this lane's big calls, P1-01 to P1-08. The asks below are the smaller questions the plan found inside those proposals, where the page's text does not fix what a person will see, plus two consequences the owner should know before signing. Each ask has the planner's recommendation and a "what ships now" line: what the arc builds while the ask is open. An open ask always leaves its part as it is today; the rest of the phase ships.

Arcs 1 and 1b add no screen and no words. OA-6 and OA-9 state the two things arc 1 changes that a person could reach, both only with a broken migration or a hand-edited file.

## OA-1. #189: what M counts in "N of M networks still not restored"

**Surface:** the full-backup import's errors screen (popup and onboarding), the line above Retry after a Retry that fails again (P1-02).

| Option | What the person reads after retrying two networks, one of which fails again, from a backup with three networks |
|---|---|
| **A. The networks Retry tried** | "Retry didn't work · 1 of 2 networks still not restored" |
| **B. Every network in the backup** | "Retry didn't work · 1 of 3 networks still not restored" |

**Recommendation: A.** The line answers "did my Retry do anything", and Retry only ever tries the networks that failed.

**What ships now:** no line. A Retry that fails again looks as it does today. The rest of P1-02 ships if it is approved.

## OA-2. #189: the onboarding notice's sentence naming the networks

**Surface:** onboarding import, the notice that opens from "View errors". Today: "Import completed with errors" / "Some entries from the backup couldn't be restored. Check the developer console for details."

P1-02 removes the developer-console sentence and says the notice names each network, but gives no wording (C8: new copy is approved word for word).

| Option | Notice description |
|---|---|
| **A. Name the networks** | "Some entries from the backup couldn't be restored. Testnet and Local Network didn't finish restoring." (one network: "Testnet didn't finish restoring.") |
| **B. Remove the sentence only** | "Some entries from the backup couldn't be restored." |

When no network failed (only a contact or token row did), both options read as B.

**Recommendation: A.** It reuses P1-01 option A's "didn't finish restoring", so the two surfaces agree.

**What ships now:** B, which is the removal P1-02 already states, using only existing words, if P1-02 is approved. Naming waits for this answer.

## OA-3. #189: how the popup's error viewer names a network

**Surface:** popup import, "View errors", which opens the data viewer on the raw error list. A failed network's row is keyed by its network id, eight hex characters such as `3f2a9c1e`.

| Option | What a failed network's row shows |
|---|---|
| **A. The name replaces the id** | `"networkId": "Testnet"` |
| **B. The name beside the id** | `"network": "Testnet", "networkId": "3f2a9c1e"` |

**Recommendation: B.** The id stays for a bug report; the name is what a person reads.

**What ships now:** the viewer as it is today (ids only).

## OA-4. #192: whose restore the reminder belongs to, and what a deleted network does to it

**Surface:** whichever surface P1-01 picks (the Home banner, the import result screen, or the Settings row).

**(a) Switching profiles.**

| Option | What happens when the person switches to another profile |
|---|---|
| **A. The restored profile only** | The reminder shows only while the restored profile is active, and returns when they switch back to it. |
| **B. Every profile** | The reminder shows on every profile until dismissed. |

**Recommendation: A.** "Restore the backup again" only makes sense for the profile the backup restored.

**(b) A network that did not restore is deleted from Settings → Networks before the reminder is dismissed.**

| Option | Effect |
|---|---|
| **A. It drops out** | The reminder stops naming it; if it was the last one, the reminder disappears. |
| **B. It stays, by its last name** | The reminder keeps naming it until dismissed. |

**Recommendation: A.** Restoring a network the person has since deleted cannot be what they want.

**What ships now:** no reminder. The wallet records an unfinished restore from the arc's first build (it has no reader), so the reminder can show as soon as these answers and P1-01 arrive.

## OA-5. #98: an older wallet version cannot open a backup that carries deleted-token markers

**Surface:** importing, on an older Nulo version, a full backup made on the version that ships #98, when the backup's profile had deleted a default token.

The older version refuses the file with its existing "unknown backup slice" failure. A backup with no deleted default token stays readable by older versions, because the export leaves the new part out when it is empty. Charter C7 (page 0) makes backup-shape changes something you accept by name before v1.0.0.

| Option | Effect |
|---|---|
| **A. Accept** | Ships as planned: the markers travel as a new part of the backup; older versions refuse such a file. |
| **B. Carry them where older versions ignore them** | The markers travel in a field outside the backup's data, which older versions skip: an older version restores the file and the deleted token comes back there, as today. The field is not covered by the backup's version upgrades, so a later change to its shape is handled by hand. |
| **C. Do not carry the markers** | #98 closes as not planned; a deleted default token comes back after a restore, as today. |

**Recommendation: A.** There are no production installs on an older version yet, and the refusal is honest. B is the choice if reading new backups on old versions matters more.

**What ships now:** nothing of #98, even if P1-04 is approved, until this is answered.

## OA-6. #146: a migration that stops responding ends on the recovery screen after 60 seconds

**Surface:** the "Updating" screen that holds the wallet while a storage migration runs, and the full-backup import's "could not be upgraded" message.

Today a migration whose step never finishes keeps the wallet on "Updating" until the browser ends the extension's background. After arc 1, after 60 seconds the wallet shows the existing migration recovery screen, whose reason line reads, word for word, "migration N was interrupted mid-write (restored cleanly)" (N is the migration's number). The import page shows the same sentence inside its existing message. No wallet can reach either today: the wallet ships no migration yet.

| Option | Effect |
|---|---|
| **A. Keep the existing sentence** | Ships as planned. |
| **B. A dedicated sentence** | You give the words; for example "Migration N stopped responding and was undone." |
| **C. No watchdog** | #146 ships the journal decision and the tests only; a stuck migration keeps the wallet on "Updating", as today. |

**Recommendation: A** for now, B when the first real migration ships.

**What ships now:** A, which adds no words: #146 asks for the watchdog, and the sentence is the engine's existing one.

## OA-7. #192: what "Restore again" does (know before signing P1-01)

**Surface:** P1-01 options A and C, the "Restore again" control.

"Restore again" opens the full-backup import, as page 1 says. The restored profile already exists, so:
- **a password profile:** the import shows the existing "You already have this wallet" dialog; "Add anyway" creates a second profile holding the same accounts, and the first one stays.
- **a passkey profile:** the import refuses, because the same passkey already belongs to the restored profile ("Passkey profile already exists").

Neither restores the missing networks into the profile that needs them.

| Option | Effect |
|---|---|
| **A. As page 1 says** | Ships as above. |
| **B. Restore only the missing networks** | "Restore again" asks for the backup file again and restores only the account state of the networks the reminder names, into the same profile. A new import path: more work, and its own copy for you to approve. |
| **C. No "Restore again"** | The reminder names the networks and offers only "Dismiss". |

**Recommendation: B**, if the reminder is meant to be acted on; otherwise C. A leaves a passkey profile with a button that always fails.

**What ships now:** no "Restore again" control until this is answered; the reminder itself still waits on OA-4.

## OA-8. #230: the wallet no longer makes an unprotected account file (know before signing P1-06)

**Surface:** Settings → Security → Export account.

P1-06 makes Download wait for the password. After it, no screen produces an account file without a password; today "Download" right after "Create Account File" saves one. A person who wants a plain file (to move a key into another tool) has the recovery phrase for the accounts it derives; an imported account then has no plain export at all. The import still accepts plain account files made by older versions.

**Recommendation:** ship as P1-06 says.

**What ships now:** P1-06 as signed. This is information, not a new choice; answer only to change P1-06.

## OA-9. #226: what a backup with a malformed profile part shows

**Surface:** full-backup import (popup and onboarding), when the backup's profile part is missing or malformed. Only a corrupted or hand-edited file does this; every file the wallet exports passes.

Today: a plain file with no profile type is refused at selection ("Unrecognized Backup File" / "The selected file is not a valid backup. Please select a correct backup file."); without a profile type, Restore stays disabled; a type other than password or passkey passes both and fails after Restore, with a message that depends on what else the file carries (for example "Restore secret type does not match profile type" under "Import failed"). Other malformed parts (a missing name, a missing or odd id) get further and fail, if at all, with whatever raw error the unchecked read produces.

| Option | What the person reads |
|---|---|
| **A. As today** | The cases above, unchanged. |
| **B. The existing integrity message for any malformed profile part** | "Backup Integrity Check Failed" / "The backup file appears to be corrupted or has been tampered with. Please ensure you have the correct backup file." (what a file with a bad checksum already shows), right after Restore, before anything is written. |

**Recommendation: B.** A malformed profile part is a corrupted file, and the wallet already has words for that.

**What ships now:** A. The code stops claiming a check it does not make, with no new check.

One change ships either way, with no words: a password restore no longer keeps a profile id the wallet would not generate (it picks a fresh one, as it already does when the id is taken), so a backup file cannot choose the storage key its profile lands under. A file the wallet exported restores exactly as today; a hand-edited file with a non-text id now restores under a fresh id. Answer only to object.
