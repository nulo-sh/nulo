# Recon: proving-grant-row-1

One Explore agent (sonnet), read-only, 2026-10-20, at f73ce69d6.

1. **Withhold and re-grant helpers.** There is no shared helper. The spec's local `withhold()` (`apps/extension/tests/e2e/presto-host-permission.test.ts:20-33`) removes `WITHHELD` from a scratch page. Allow re-grants through `pointerClick` or Enter, under `launchExtension({ grantPermissionRequests: true })` (`fixtures/browser/firefox.ts:294,317`; tested in `scripts/e2e/firefox-driver.test.ts:79-96`). No code drives about:addons or calls `ExtensionPermissions`. Verdict: extend `withhold()` in place, and add no fixture.
2. **Probe headers.** No spec reads request headers. `interceptHealth` (`fixtures/presto.ts:29-40`) uses only the URL. The Firefox `http-on-modify-request` observer (`fixtures/browser/firefox-rpc-intercept.ts:36-51`) is scoped to the node origin and arms once. Verdict: nothing to reuse. Asserting `Origin` would need new code.
3. **`chrome.permissions` readers.** The composable's unit test fakes `contains`, `request`, `onAdded` and `onRemoved` (`usePrestoHostPermission.test.ts:33-38`). The spec is the only real-`contains` reader. Nothing calls `getAll`.
4. **Docs.**
   - `tests/e2e/FIREFOX.md:38` says withholding takes both loopback origins and `*://*/*`. It does not say which about:addons toggles those are.
   - `FIREFOX.md:52` says content-script patterns count as host permissions.
   - The spec header (`:1-6`, `:17`) and the composable TSDoc (`usePrestoHostPermission.ts:2-5`) cover the same ground.
   - `src/manifest.test.ts:208` says "A person can withhold these in about:addons".
5. **Scope.** `FIREFOX_ONLY.permissionRequest` (`fixtures/browser/index.ts:260`) is used only by this spec. No other spec withholds loopback.
6. **Unit cases** (13, `usePrestoHostPermission.test.ts:56-246`). None covers "`contains` is true while `getAll` lacks the loopback entries". It cannot, because `contains` is faked, so only the Firefox e2e proves it.

Known limits in the area (`gh issue list --state closed --label known-limit --search "permission loopback"`): #571, a probe sent before a grant, which is unrelated to this finding.
