# Recon: firefox-pin-1

Base: `origin/dev` at `5ef0c119d`. Two Explore agents (sonnet): a reuse sweep over the four capabilities, and a sweep of every call the suite makes that Firefox 158 refuses on an extension page. The driving session read the Firefox 153.0.4 and 158.0 sources from the cached builds' `omni.ja` (`chrome/remote/content/**`, the extensions schema, DevTools' `NetworkObserver.sys.mjs` in `browser/omni.ja`). `E` = `apps/extension/tests/e2e`, `B` = `E/fixtures/browser`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Set a file on the wallet's pending input without BiDi `input.setFiles` | `B/webdriver-classic.ts` has no Find Element or Element Send Keys (searched `/element`, `element-6066`, `sharedId`, `sendKeys` over `apps` and `scripts`). Its `exclusive()` queue (:103-107) orders every window switch. Marionette's Element Send Keys on a file input runs `interaction.uploadFiles` (`File.createFromFileName`, `mozSetFileArray`) then `input` and `change` (158 `marionette/interaction.sys.mjs:565-590`, :690-693), the same body and the same `Event.sys.mjs` calls as BiDi's `setFiles` (158 `webdriver-bidi/modules/windowglobal/input.sys.mjs:47-104`). | adapt: two classic calls behind `exclusive()` |
| The pending input and its accept check | `E/fixtures/file-accept.ts` (`PENDING_FILE_INPUT`, `acceptLists`); the seam's `expectPickerLists` (`B/index.ts:338-360`); Firefox's stale marking (`B/firefox.ts:711-722`) | reuse as is |
| Answer a page's Presto health probe on Firefox | `E/fixtures/presto.ts:27-39` uses `page.setRequestInterception(true)`: BiDi `network.addIntercept` with the page's context, refused. `B/firefox-rpc-intercept.ts` (a parent-process `http-on-modify-request` observer) refuses or redirects per origin, and cannot answer with a body. Firefox's `nsIHttpChannelInternal.setResponseOverride(nsIReplacedHttpResponse)` is how its own BiDi `provideResponse` answers (158 `root/network.sys.mjs:1483-1517`, `shared/NetworkRequest.sys.mjs:334-337`; 153 has the same). DevTools applies overrides at `http-on-before-connect`, before the server is reached (`NetworkObserver.sys.mjs:425-426`). | build new: a driver method, Firefox's body modelled on the observer |
| Answer it on Chrome | the current `interceptHealth` body (page interception over CDP). `cdpInterceptRpc` cannot serve: it attaches no page target, so WebAuthn authenticators survive (`B/chrome-rpc-intercept.ts`, its doc comment). | reuse: move the body behind the driver |
| The page's probe count | `settings-proving.test.ts:11-17` and `presto-host-permission.test.ts:57-61` count `page.on("request")` events | adapt: read the answerer's own count |
| Compare the loaded CSP with the source | `E/security.test.ts:215-221`, `toEqual` on `runtime.getManifest().content_security_policy`. Source: `manifest/manifest.config.ts:47`, `extension_pages` only. Firefox 158's schema adds an optional `sandbox` (`schemas/manifest.json:235-240`); 153's has `extension_pages` alone. | adapt in place |
| Ban a direct call | `apps/extension/scripts/e2e/browser-seam.test.ts:204` `DRIVER_PAGE_CALLS` plus its bite tests | adapt: two more names |
| The pin | `B/firefox-revision.ts`, read by `B/firefox.ts:240`, `scripts/e2e/install-firefox.ts`, `scripts/e2e/firefox-driver.test.ts:129-153`, and `.github/actions/setup-puppeteer/action.yml` (cache key = the file's hash). Puppeteer 25.14.0 pins `stable_158.0` (`puppeteer-core/lib/puppeteer/revisions.js`). geckodriver 0.37.1 (`setup-geckodriver`), the version on this host too, opened every 158 session of e2e-infra-3's phase 6. | reuse; edit the value |

## Other refused calls (158 on an extension page)

- `pickFile` is the only one the network suite reaches (`network/account-balance-orphans.test.ts:157`, `network/restore-again.test.ts:134`).
- `page.screenshot` (`captureScreenshot`): `fixtures/shots.ts` `shotSend`, opt-in under `NULO_E2E_SHOT_DIR`, which CI never sets; the chaos session's `screenshot` verb (`helpers/chaos-session/serve.ts:482-486`). The capture suites already skip Firefox. No failure-time screenshot hook exists.
- `evaluateOnNewDocument` (`script.addPreloadScript`): `helpers/chaos-session/pages.ts:56`, error swallowed; `armDownloads` re-arms before every command (`serve.ts:448`).
- Searched `.pdf(`, `"dialog"`, `screencast`, `FileChooser`, `setExtraHTTPHeaders`, `setCacheEnabled`, `setOfflineMode`, `emulateNetworkConditions`, `.content()`, `.buffer()`, `exposeFunction`, `setCookie`, `cookies(` under `E`: no other hit on an extension page.

## The picker path (#1222)

- Every `pickFile` caller opens the picker with `clickByTestId`, which runs `prepareClick` (classic `selectWindow` on the page) first (`E/fixtures/dom.ts:250-251`, :301). An evaluated click carries no user activation, so Firefox opens no picker and the input stays pending (FIREFOX.md row "An evaluated click is not a user gesture").
- #1222's case presses the control with a hit-tested click, which opens the native picker, and waits for its `cancel` (`E/toolbar-panel.test.ts` around :490). That path never reaches `pickFile`'s file step.
- 158 dismisses pickers only when `unhandledPromptBehavior` is set with `file` other than `ignore` (`shared/webdriver/Session.sys.mjs:478-490`). The suite sets none (`B/firefox.ts:291-316`), so 158 opens the native picker as 153 does. 153's switch was the pref `remote.bidi.dismiss_file_pickers.enabled` (153 `Session.sys.mjs:45-46`, :391-395), which 158 no longer reads.

## Collisions

- e2e-followups-1 arc 2 (#1222) may ship a picker dismissal by the 153 pref; on 158 that pref does nothing.
- No launch holds an interception on a Presto origin: `holdRpcInterception`'s one caller is the node stand-in (`E/fixtures/node-stub.ts:53`).
- Closed known limit #1306 records chaos-session gaps; the 158 screenshot and preload refusals are new.
