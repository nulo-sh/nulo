# Options: security-ui-1

The owner picks from these. Each option lists the exact component changes, the copy (full sentences, no em dash between clauses), the `data-testid`s it adds, and the e2e hook a later agent uses to build it as a throwaway commit and shoot it on Chrome in both themes. Paths are repo-relative. Existing testids stay as they are (CLAUDE.md § testid preservation).

## Shared shooting notes

- `shotSend(page, name, focus)` lives in `apps/extension/tests/e2e/fixtures/send-page.ts:209-235`. Import it from there. It does nothing unless `NULO_E2E_SHOT_DIR` is set, and it writes `<name>.png` plus `<name>-<other theme>.png`.
- Pass a `focus` testid that exists on the page. The default, `send-publish-strip`, is absent here, so the scroll would do nothing.
- Its second shot can land inside a 0.2 s colour transition (open item in `follow-ups.md`, Send amounts). Before you trust a button's or a popup's colour in the flipped shot, wait about 300 ms after the flip, or read that element in the first shot.
- Smoke runs: `cd apps/extension && NULO_E2E_SHOT_DIR=<dir> bun run test:e2e -- <file> --retry=0`. Network runs: from the worktree root, `NULO_E2E_SHOT_DIR=<dir> NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`.

---

## Surface 1: the full-backup export page (#34)

File: `apps/extension/src/popup/pages/settings/security/export/full.vue`. Route `#/popup/settings/security/export/full`.

### What the page does today

Agree, then (password profile) type the profile password and press Create Backup. When the backup is ready, an info banner reads "Backup is ready. You can download it right now, but we strongly recommend to encrypt it before downloading." Two buttons follow: Protect with Password (`protect-password-btn`) and Download Backup (`download-backup-btn`), and both are enabled. Download saves the unencrypted file at once. A passkey profile's first Protect press reveals two password fields; its second press encrypts.

What an unencrypted file exposes:
- **Password profile:** the master key, the recovery-phrase entropy and the imported-keys key, in plain text. Whoever opens it controls every account in the profile.
- **Passkey profile:** accounts, contacts, activity and registered contracts. It holds no key that moves funds without the passkey: the master key field is only the passkey's credential id, and the imported-keys key is sealed by the passkey.

### Option A: encryption required

No unencrypted file can leave the page.

- **Password profile.**
  - When the backup is ready, the info banner gets the testid `backup-ready-banner`. Its title is "Protect your backup". Its body reads: "Encrypt the file with your profile password before you download it. Without a password, anyone who opens the file controls this profile."
  - Protect with Password stays the primary button (`cta`).
  - Download Backup stays visible as `cta_outline` but is disabled until the status is `encrypted`.
  - After encryption, today's done banner and enabled Download stay as they are.
- **Passkey profile.**
  - When the backup is ready, the two password fields show at once, without the first Protect press.
  - The banner (`backup-ready-banner`) has the title "Choose a password for this file". Its body reads: "You need this password and your passkey to restore the backup. Download unlocks once the file is encrypted."
  - Download stays disabled until the status is `encrypted`.
  - What changes for them: every passkey backup now needs a password. If the person forgets it, the file cannot be restored, even with the passkey.
- **Code.**
  - Download's `:disabled` adds `backupStatus !== 'encrypted'`.
  - `showRecommendation` no longer hides the passkey fields.
  - `handleDownloadBackup` refuses any status other than `encrypted`, as a guard behind the button.
- **New testids:** `backup-ready-banner`.
- **Tests.**
  - Download is disabled at `finished` and enabled at `encrypted`.
  - Calling the download handler at `finished` writes nothing.
  - Encrypting, then downloading, saves a `NuloEncryptedBackup_` file.
- **E2E consequence.** Every helper and spec that downloads a plain backup must change; they are listed in `recon.md` § E2E hooks. Each one exports encrypted instead and opens the file in Node with the production codec, imported through `@/`.

### Option B: warn and confirm

The flow stays as it is. Downloading without a password asks first.

- **Banner** (`backup-ready-banner`). The title stays "Backup is ready". The body reads: "Protect it with a password before you download it. Without a password, the file is saved in plain text."
- **Download Backup before encryption.** The button opens `ConfirmPopup` through `cacheStore.confirm` and `popupStore.open("confirm")`:
  - `pre_title`: "Not encrypted"
  - `title`: "Download without a password?"
  - `description` (password profile): "This file will hold your recovery phrase and your keys in plain text. Anyone who opens it can take every account in this profile."
  - `description` (passkey profile): "This file will show your accounts, contacts and activity to anyone who opens it. It holds no key that can move funds without your passkey."
  - `confirm_color`: `"red"`. `confirm_text`: "Download anyway". The callback downloads the plain artifact. It captures `generation` when the confirm opens and does nothing if the page changed since or the plain payload is gone, because `ConfirmPopup` does not await it (`ConfirmPopup.vue:60-65`).
  - Cancel comes first and the red action second; that is ConfirmPopup's fixed order. Escape and Cancel download nothing.
- **Download Backup after encryption.** No confirmation; it works as today.
- **Enter.** At `finished`, Enter still encrypts, as today. It never opens the popup and never downloads a plain file.
- **What changes for passkey profiles:** the same confirmation, with the passkey description.
- **New testids:** `backup-ready-banner`. The confirmation reuses `confirm-pre-title`, `confirm-title`, `confirm-description`, `confirm-cancel` and `confirm-submit`.
- **Tests.**
  - Download at `finished` opens the confirm and writes nothing.
  - `confirm-cancel` writes nothing.
  - `confirm-submit` writes one `NuloBackup_` file.
  - Download at `encrypted` writes one `NuloEncryptedBackup_` file without a confirm.
  - Each profile type gets its own description.
- **E2E consequence.** Each plain-download helper adds a `confirm-submit` press after `download-backup-btn`.

### Option C: encrypted by default

The default path produces an encrypted file. A secondary control downloads without a password, after B's confirmation.

- **Password profile.**
  - Create Backup assembles the backup and then encrypts it with the profile password the person just typed, in one run. The status card shows "Creating your backup", then "Encrypting your backup".
  - When it finishes, the done banner reads "Backup is encrypted" with the body "It uses your profile password. You need that password to restore the backup."
  - The primary button is Download Backup (`cta`), which saves the encrypted file.
  - Under it sits a text-style button, "Download without password" (`download-plain-btn`, variant `text`). It opens B's confirmation, then saves the plain file.
  - Protect with Password no longer appears.
- **Passkey profile.**
  - When the backup is ready, the two password fields show at once.
  - The banner (`backup-ready-banner`) has the title "Choose a password for this file". Its body reads: "You need this password and your passkey to restore the backup."
  - Protect with Password is primary. "Download without password" (`download-plain-btn`) sits under it and opens B's confirmation.
  - After encryption, Download Backup is primary.
  - What changes for them: the password is the default, and the unencrypted file is still one confirmed step away.
- **Code.**
  - Extract the encryption body of `handleEncrypt` into a worker that runs under its caller's busy latch and `generation` fence. `handleBackup` calls it at the end for a password profile; calling `handleEncrypt` itself would hit the latch `handleBackup` still holds (`full.vue:279`, `:339`).
  - The download handler takes the artifact explicitly (`"encrypted"` or `"plain"`) instead of reading it from the status (`full.vue:379`), so "Download without password" after encryption still saves the plain file it names.
  - A new `handlePlainDownload` opens the confirm. Its callback captures `generation` when the confirm opens and downloads nothing if the page changed since; `ConfirmPopup` does not await the callback (`ConfirmPopup.vue:60-65`).
  - Enter at `encrypted` downloads the encrypted file, as today.
- **New testids:** `download-plain-btn`, `backup-ready-banner`.
- **Tests.**
  - A password-profile Create ends at `encrypted` with exactly one encryption.
  - `download-plain-btn` opens the confirm and writes nothing until `confirm-submit`.
  - The primary Download saves a `NuloEncryptedBackup_` file.
- **E2E consequence.** Plain-download helpers press `download-plain-btn`, then `confirm-submit`. `security-backup.test.ts` no longer waits for `protect-password-btn` on a password profile.
- **Styling risk.** No page uses the `text` button variant under a primary button yet. Expect to tune its spacing in the shot.

### Option D: split by profile type

Password profiles get Option A: no unencrypted file, and Protect with Password before Download. Passkey profiles get Option B: today's flow, plus the confirmation with the passkey description. Copy, testids and tests are the union of A's password parts and B's passkey parts. E2E consequence: plain-download helpers for password profiles change as in A, and the passkey specs add the `confirm-submit` press.

### E2E hook: the export page

- **Password profile (smoke).** Spec `apps/extension/tests/e2e/security-backup.test.ts`, test "full backup unlock surfaces protect + download CTAs" (`:34-57`), fixture `registeredExtension` from `tests/e2e/fixtures/extension.ts`. Its steps:
  1. `openPopup`, then `waitForHash(page, "#/popup/general")`.
  2. `navigateByHash(page, "#/popup/settings/security/export/full")`.
  3. `clickByTestId(page, "agree-continue-btn")`.
  4. `replaceInputValue(page, '[data-testid="unlock-password-input"]', PASSWORD)`.
  5. `clickByTestId(page, "unlock-submit-btn")`.
  6. Wait for the buttons; allow up to 30 s, since assembly is slow on a cold start.
- **Password profile shots.**
  - The ready state: `shotSend(page, "export-full-ready", "download-backup-btn")`. Use `backup-ready-banner` as the focus where the option adds it.
  - The confirmation (B, C, D): press `download-backup-btn` (C: `download-plain-btn`), wait for `confirm-submit`, then `shotSend(page, "export-full-confirm", "confirm-submit")`.
  - The encrypted state: press `protect-password-btn` (C: nothing to press), wait until Download is enabled, then `shotSend(page, "export-full-encrypted", "download-backup-btn")`.
  - To stop a real download, call `armBackupDownloadCapture(page)` from `tests/e2e/helpers/backup-export.ts` before any download press.
- **Passkey profile (smoke, local only).** Spec `apps/extension/tests/e2e/passkey-backup.test.ts`, test "passkey full-backup export: modal appears + status card + CTAs become available" (`:111-279`), fixture `freshExtensionPerTest` with `setupPasskeyVirtualAuth` and `registerPasskeyProfile`. It skips on CI (`process.env.CI === "true"`) and uses Chrome's virtual authenticator. Shoot it after its "CTAs available" wait, with the same names plus `-passkey`.

---

## Surface 2: the emoji check (#14)

File: `apps/extension/src/popup/windows/verify/index.vue`. Route `#/windows/verify?sessionId=…&verificationHash=…&isReconnect=…`. The same page serves a new connection, inside the connect window, and an untrusted reconnect, in its own window. One change covers both.

The settings row that shows the same flag is `apps/extension/src/popup/components/modules/settings/connected-apps/DappSessionVerification.vue` (`:20-32`), used by `settings/connected-apps/[id].vue`. Its copy changes with the window's.

### What it does today

The section label reads "Connection verification". Under the grid: "Verify these emojis match what the app displays to confirm a secure connection". The toggle reads "Always trust", with the sub-label "Skip verification on reconnect". The only button is OK (`verify-confirm-btn`). OK records the toggle, then closes the window. Closing the window keeps the session.

### Copy common to both options (corrects what overclaims)

| Where | Today | Proposed |
|---|---|---|
| Section label (window and settings row) | Connection verification | Connection check |
| Under the grid (window) | Verify these emojis match what the app displays to confirm a secure connection | Check that the app shows these same emojis in the same order. If they differ, the connection may not be safe. Choose They don't match. |
| Toggle label (window and settings row) | Always trust | Skip this check next time |
| Toggle sub-label (window and settings row) | Skip verification on reconnect | Only for this app on this network. |
| Caption under the grid (settings row) | Emojis from the most recent connection. They should have matched what the app showed then | unchanged, with a full stop added |
| Error line when the app's record could not be removed (new, window only) | none | The connection ended, but this app could not be removed. Remove it in Settings, Connected apps. |
| Error line when the refusal itself failed (new, window only) | none | Couldn't disconnect this app. Disconnect it in Settings, Connected apps. |

Option B names its control "These don't match". With B, the instruction's last sentence reads "Choose These don't match."

### Option A: two controls of equal weight

- The footer keeps the toggle row.
- OK is replaced by one row of two equal-width medium buttons:
  1. "They don't match": testid `verify-mismatch-btn`, variant `primary_outline`.
  2. "They match": testid `verify-confirm-btn` (kept), variant `primary`.
- **They match** runs today's `handleConfirm`: it records the toggle, then closes.
- **They don't match** runs a new `handleRefuse`:
  - It calls the new background `refuseVerification({ rowId, origin, chainId, profileId })` with the identity the window read from the wallet's own row at mount (plan.md, Arc 3). The background ends every live session of that app on that network first, on every path, then removes the saved row.
  - `"revoked"` or `"absent"` closes the window.
  - `"unavailable"` (the row could not be found or verified, for example because the wallet locked during the lookup) keeps the window open with the first error line: the connection has ended, and the line tells the person to remove the saved app. A thrown error keeps it open with the second line, since the wallet cannot tell whether the connection ended. Both use `verify-mismatch-error`, `role="alert"`.
  - It never records the toggle.
- **Both buttons** share one busy latch, are disabled while either runs, and refuse a repeat Enter (`refuseRepeatEnter`).
- **Effect.** The app disappears from Settings, Connected apps, with its permissions. Every open session of that app on that network ends, other tabs included. Reconnecting starts a new connection with a new check.
- **New testids:** `verify-mismatch-btn`, `verify-mismatch-error`.
- **Tests.**
  - The call order is `refuseVerification:row-1`, then the window close, in `index.window.test.ts`'s call log.
  - With the toggle on, "They don't match" never calls `setTrustedVerification` (the never-happens case). "They match" does call it (the success control).
  - `"absent"` closes the window; `"unavailable"` and a thrown error keep it open with the error line.
  - Service and background tests, as plan.md Phase 3.1 lists them: the live sessions end on every path; a locked wallet with the row present still deletes it; a lookup interrupted by a lock returns `"unavailable"`, never `"absent"`.
  - A double press runs once.
  - Fixtures are wire-shaped: a 64-hex `verificationHash` and `aztec:<chainId>:0x…` accounts.

### Option B: one primary control and a quiet refusal

- "They match" replaces OK. It keeps testid `verify-confirm-btn`, variant `primary`, full width.
- Under it, centred, sits a text-style button "These don't match": testid `verify-mismatch-btn`, variant `text`, size `small`.
- The behaviour, error line, latch, testids and tests are the same as in A.
- **Styling risk.** The `text` variant is unused in `src` today. Its contrast in the light theme needs checking in the shot.

### Call 3: closing the window

- **Yes, closing keeps the session (today).** Nothing more is built.
- **No, closing ends the session.** The page tells the background "They match" before it closes, and the background ends any session whose check window closes without that word. The mark binds to that window's own session and emoji hash, not to the app's shared record, which a second connection can overwrite. Mechanics are in plan.md § Arc 3, Phase 3.3. What a person would notice:
  - A check window closed by mistake disconnects the app. The person reconnects, and the check runs again.
  - An untrusted reconnect of an app used for months loses its permissions when its check window is closed.
  - Quitting the browser closes the window without the event that ends the session. Today a browser exit already ends every session, so nothing changes there.

### E2E hook: the emoji check (network suite only)

No smoke spec can open it. It needs a live handshake with the playground, and a hand-seeded session row fails its MAC.

- **New connection.** Write a throwaway network spec, for example `tests/e2e/network/zz-shot-verify.test.ts`, on the `registeredExtension` fixture, gated `test.skipIf(!hasConfig)` like `network/connect-dapp.test.ts`. Its steps:
  1. `openPlayground(ctx)` from `tests/e2e/fixtures/playground.ts`.
  2. `waitForPopup(ctx, "discover")` from `tests/e2e/fixtures/popups.ts`. Arm it before the click.
  3. `clickByTestId(dappPage, "pg-btn-connect")`.
  4. `const verifyPage = await approveConnect(ctx, discoverPage)`. This returns the connect window once it shows the check.
  5. `shotSend(verifyPage, "verify-new", "verify-emoji-grid")`.

  This is `connectPlayground` (`tests/e2e/fixtures/extension.ts:327-358`) stopped before `approveVerify`.
- **Untrusted reconnect** (no step bar):
  1. After a connection approved without the trust toggle, disconnect from the playground (`pg-btn-disconnect`).
  2. Arm `waitForPopup(ctx, "verify")`.
  3. Press `pg-btn-connect` again.
  4. Shoot the verify page that opens as `verify-reconnect`. `reconnectPlayground` in `tests/e2e/fixtures/send.ts:12-19` shows the waits.
- **Settings row.** After a connection (`dappConnectedExtension` fixture):
  1. Open the popup.
  2. Navigate to `#/popup/settings/connected-apps`.
  3. Open the app's row.
  4. Shoot with the focus on the toggle.
- **Error line.** It needs a failing delete, which a live run cannot produce cheaply. Shoot it from a Storybook story or a component mount instead, or skip the shot and show the copy in text.
