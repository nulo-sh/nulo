# flake-1 recon

Base: `dev` at `9ce6bb0bd`. One Explore sweep (sonnet) over `apps/extension/tests/e2e`, `scripts/`, the workflows and the e2e skill, plus a probe of the suite's Firefox 158.

## What feels a change to the Firefox file pick

- **Every Firefox pick goes through one function**: the driver's `pickFile` (`tests/e2e/fixtures/browser/firefox.ts:731`), reached through `pickFile` in `fixtures/browser/index.ts:357` (which runs `expectPickerLists`, `index.ts:368`) and `pickFileByTestId` (`fixtures/dom.ts:317`).
- **Callers that run on Firefox.** Smoke: `account-import-export` (1), `backup-roundtrip` (1), `backup-imported-account` (1), `restore-outcome` (1), `toolbar-panel` (1, Firefox only), `contacts-import` (15 through `helpers/contacts.ts:76`), `type-roles` (1), `own-window` (through the helpers), `helpers/import-drivers.ts` (3), `helpers/account-io.ts` (1), and the chaos helpers `helpers/profile-chaos/backups.ts` (2) and `helpers/chaos-session/serve.ts` (1). Network: `contacts-import-stop` (2), `senders-advanced` (1), `account-balance-orphans` (1), `restore-again` (1). `import-dead-rpc` picks on Chrome only.
- **The one click that bypasses `pickFile`**: `toolbar-panel.test.ts:572`, the contacts card's Choose file, then a 10 s poll for the input to leave the page (`:574-578`). It relies on the picker cancelling at once.
- **Pending-input plumbing**: `PENDING_FILE_INPUT` (`fixtures/file-accept.ts:3`, `:not([data-e2e-stale])`), read by `expectPickerLists` and by Firefox's `pickFile`; only Firefox's `pickFile` stamps `data-e2e-stale` (`firefox.ts:734`). `setFileInput` (`fixtures/browser/webdriver-classic.ts:199`) has one caller, `firefox.ts:738`.
- **Privileged scope**: `callInFirefoxScope` (`firefox.ts:467`, BiDi in a chrome context, no window switch; used by `setViewport` and `answerRequests`), `session.chromeScript` (classic; switches to the first browser window). The launch's one privileged setup is `armPageErrorRelay` (`firefox.ts:137`, `fixtures/browser/firefox-page-errors.ts:293`).
- **Prior art for a process-lifetime privileged object**: the page-error relay evaluates its source in `Cu.Sandbox(systemPrincipal, { freshZone, sandboxName, wantGlobalProperties: ["ChromeUtils"] })` under the label `resource://nulo-e2e/page-error-relay.js` (`firefox-page-errors.ts:258-271`) and answers reads on an observer topic (`STATE_TOPIC`, `:20`, `:273-280`).
- **No session sets** `unhandledPromptBehavior` or `remote.bidi.dismiss_file_pickers.enabled` (`capabilities()`, `firefox.ts:292-316`; `FIREFOX_LAUNCH_PREFS`, `:255-258`).
- **The cancel path below e2e**: `src/utils/files.test.ts:15` (a cancel rejects with `FilePickCanceledError` and removes the input), `src/popup/pages/settings/contacts/index.test.ts:172` (a pick that ends before the selection keeps the card), `useContactImportExport.test.ts:359`.
- **Docs that describe the pick**: `tests/e2e/FIREFOX.md` lines 38, 43 and the table row at 59 ("A pick that answers the picker itself is #1222's fix"); the e2e skill (`.claude/skills/e2e-testing/SKILL.md:28`, `:34`) names the helpers only.
- **CI**: both Firefox PR lanes (`pr-extension-smoke-e2e-firefox.yml`, `pr-extension-network-e2e-firefox.yml`) filter on `apps/extension/**`, so a fixtures change runs both full lanes.
- **Runtime record**: chaos-5 measured `toolbar-panel.test.ts` on Firefox at 125.1 s before, 123.0 s after, 137.0 s on a loaded host (`implementations-plan/archive/chaos-5/plan.md`, Budget line).
- **"Seeds 9001-9005"**: no smoke-lane mechanism by that name. The smoke file that takes a seed and picks files is `profile-chaos.test.ts` (`NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=<n> NULO_E2E_CHAOS_RUNS=<k>`, `tests/e2e/README.md` § Profile chaos).

## Firefox 158 facts (from its `omni.ja`, `chrome/remote/content/`)

- `shared/webdriver/FilePickerHandler.sys.mjs`: the Remote Agent dismisses pickers by registering its own factory for `@mozilla.org/filepicker;1` whose `open` calls `done(returnCancel)`.
- `shared/webdriver/Session.sys.mjs:319,392,480-491`: it does so only for a BiDi session whose `unhandledPromptBehavior` sets `file` to anything but `ignore`. No file in the build reads `remote.bidi.dismiss_file_pickers.enabled`.
- `webdriver-bidi/modules/windowglobal/input.sys.mjs`: `input.fileDialogOpened` fires from the `file-input-picker-opening` notification; `input.setFiles` is the only BiDi way to give a file, and 158 refuses it on an extension page (`FIREFOX.md:36`). No BiDi command answers or closes an open picker.

## Probe (Firefox 158.0 headless, geckodriver, a web page, its window focused; host load1 74-81)

A JS factory for `@mozilla.org/filepicker;1`, evaluated in a system-principal sandbox from the chrome context and registered with `nsIComponentRegistrar`, replaced the native picker:

- A pick nobody asked for, answered `returnCancel` in `open`: the input's `cancel` fired and the input left (145 ms, polling included).
- An asked pick, held in `open`: the input stayed in the page; after the driver set `file` to an `nsIFile` and called `done(returnOK)`, `change` fired with the file (`contacts.json`, 30 bytes) 37 ms later.
- The next unasked pick was cancelled again. `init` came with mode 0 and the filters `*` and `*.json` for `accept=".json"`.
- `Cu.evalInSandbox` with the system principal refuses a label without a `chrome://`, `resource://` or `moz-src://` scheme ("unsafe filename"); `resource://nulo-e2e/…` passes, as the relay's does.
