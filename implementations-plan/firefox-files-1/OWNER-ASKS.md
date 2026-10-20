# firefox-files-1: owner asks

The three picks (P74-05, P74-06, P74-07) are on decision page 74; the plan builds on the recommended options (A, B, C) until they are signed. These asks are what the page's records do not settle. The arc ships the "what ships now" form of each, which keeps today's behaviour, and applies the owner's answer before the PR leaves draft when it arrives with the picks.

## OA-1: the done card after a passkey profile's plain (unencrypted) file

- **Surface**: Settings → Backup → Full Backup, after Download Backup → Download anyway (passkey profiles only).
- **Why it is an ask**: P74-06 B reads "the card reads "Saved to your downloads" with the password reminder". The reminder ("Don't forget your password, as it will be required to restore your backup.") names a password a plain file does not have: the passkey opens it.
- **Options**:
  - **A (recommended)**: the same done state with the title "Saved to your downloads" alone, and Close. Nothing false is said.
  - **B**: the title plus a passkey line, for example "Your passkey opens this file. Anyone who has the file can see your accounts, contacts and activity." New copy, yours to word.
  - **C**: no done state for a plain file: Download and Protect with Password stay, as today.
- **What ships now**: C (today's page) until you answer.

## OA-2: what the wallet's window shows after an import

- **Surface**: the 380x660 window a panel import opens (Firefox).
- **Why it is an ask**: P74-05 A says where the import starts, not where the window goes after it.
- **Options**:
  - **A (recommended)**: each page's usual next screen, in the window: Contacts stays on Contacts (its back arrow closes the window); an account import goes to the accounts list and Restore again's Continue goes Home, after which the window is an ordinary wallet window you close yourself. This is how the Full Backup restore's window behaves today.
  - **B**: the window closes by itself once the import or restore finishes.
- **What ships now**: A.

## OA-3: two checks on your Mac

- **Firefox (acceptance)**: from the toolbar panel, Import contacts, Settings → Accounts → Import account's Choose file, and Home's Restore again → choose the file: each opens the wallet's window, and pressing the same control there opens the file picker and imports. Headless Firefox cannot show a picker, so this is the only proof.
- **Chrome (unknown today)**: from Chrome's toolbar popup, Import contacts: does the popup survive the file picker? Your #160 check covered Firefox only. If it closes, the same hand-off can cover Chrome in a later lane.
- **What ships now**: the Firefox hand-off; Chrome unchanged.

## OA-4: "Saved to your downloads" means the browser accepted the file

- **Surface**: the done card (P74-06 B).
- **Why it is an ask**: the wallet learns that the browser started the download, not that the file was written. If you cancel a Save As dialog (Chrome's "Ask where to save each file" setting) in a surface that stays open, or the write fails later, the card still says saved; you would export again.
- **Options**:
  - **A (recommended)**: keep your words; the case is filed as a known limit, and the lane tries to reproduce it on Chrome before the PR leaves draft.
  - **B**: words that say what is known, for example "Sent to your downloads".
  - **C**: wait for the file to be written before the card shows (more code: the wallet watches the download).
- **What ships now**: A.
