# Phase 6: the pin on Firefox 158 (held)

## 2026-10-28 · Full smoke on 158.0 (retry 0, the seam at `441d62d70`, the pin moved locally)

- Shards 1-6: 241 passed, 35 failed, 24 skipped, 40 min. Every failure has one of three causes:
  - `input.setFiles` refused in privileged scope: `pickFile`'s `ElementHandle.uploadFile` on a wallet page. It covers account import and export, contacts import, backup import and restore, the passkey backup, the toolbar panel's file steps and the type-roles case that loads a contacts file.
  - `network.addIntercept` refused: `interceptHealth`'s `page.setRequestInterception(true)` scopes the intercept to the extension page (`onboarding-tab`, `presto-host-permission`, `settings-proving`).
  - `runtime.getManifest()` returns `content_security_policy.sandbox: null` beside `extension_pages`, so `security.test.ts`'s equality with the source manifest fails.
  - `type-roles`' coverage check fails downstream: the identifier sites the file-pick case reads were never reached.
- What did pass on 158: `navigation` and `legal-acceptance`, the files that failed on the refused `activate` and `setViewport` before the seam; `page-error-capture` (2/2), so the relay's internals still hold; the drag test, whose `[select]` log still ends in `SETTINGS`.
- 158's `RootBiDiModule._getNavigable` refuses every root command that does not pass `supportsPrivilegedScope` or `skipPrivilegeCheck`. Read from the omni.ja: `activate`, `captureScreenshot`, `handleUserPrompt`, `print`, `setViewport`, `startScreencast`, `input.setFiles`, the page-scoped network commands (`addIntercept`, data collectors, extra headers, cache behaviour), `script.addPreloadScript` and `getRealms` with a context, and `storage.setCookie` with a context. Allowed: `getTree`, `locateNodes`, `input.performActions`/`releaseActions`, `script.evaluate`/`callFunction`, and `close`, `navigate`, `reload` and `traverseHistory`, which skip the check.
- Also read from 158's omni.ja: `AddonWrapper.reload` is unchanged from 153, `windows.getLastFocused` still answers `windowTracker.topWindow` whatever `windowTypes` says, and the screenshot rectangle code is byte-identical.
- Decision (D10): the pin holds at 153.0.4. Absorbing the file pick and the page's request interception needs driver mechanisms the plan never mapped, which is a plan change. #1111 stays open with this inventory, and the arc ships the seam alone.
