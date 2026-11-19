# connected-app-build-1: recon

Read directly at `0dc22a9c5` (no recon agents: two components, one data file and their tests). The render lane's prototypes are `c0aecbb19` (K3) and `c09ff1da9` (the E1 to E4 look switch), read by hash.

## The Connection check section

- `apps/extension/src/popup/pages/settings/connected-apps/[id].vue:367` mounts `DappSessionVerification` when `verificationEmojis` (`:65`, `hashToEmoji(session.verificationHash)`) is non-empty. The page's only other read of `verificationHash` is the not-connected line (`:259-269`, testid `connected-app-not-connected`).
- `apps/extension/src/popup/components/modules/settings/connected-apps/DappSessionVerification.vue`: the `Connection check` label, `EmojiGrid` and "Emojis from the most recent connection. They should have matched what the app showed then." Testid `connected-app-verification`. It has no test and no stories, and no type-role manifest, complexity manifest or `components.d.ts` entry names it.
- `EmojiGrid` stays: the verify window (`popup/windows/verify/index.vue:212`) draws it; its type-role exception is keyed on its own file.
- The hash is written at establishment (`wallet-sdk/session-established.ts`), read by the verify flow (`verify/index.vue`, `confirmVerification`, `handleRefuse`); none of that is touched. The glossary's `connection-check` names the connect window (`discover/index.vue:205`), which stays.
- `[id].test.ts:67` mocks `hashToEmoji` to `""`, so the section never rendered in that file's cases.

## The e2e specs that reach the page

- `tests/e2e/network/connect-verify-mismatch.test.ts:83-85` (reconnect case) opens the app's page, waits for `connected-app-verification` and captures it. The step began as "the skip switch is off" (#58) and became "the page shows the last grid" (#631). The playground's bare `connect()` grants no capability and shares no account (`apps/playground/src/lib/wallet.ts:7`), so after the removal no element with a testid is specific to a connected app's page.
- `connect-check-window.test.ts` opens the page through `openConnectedApp(…, connected-app-not-connected)`; unchanged.
- `type-roles-windows.test.ts:184-192` sweeps the page with grants (anchor `connected-app-account-row`) and opens the capabilities window's Details; it reads no glyph name.
- Page-root testids on `SettingsPageShell` exist already: `manage-accounts-page`, `contacts-page`, `settings-developer-page`.

## The Details table and the rows

- `components/composite/capabilities/DetailsTable.vue:69-76` `COLUMNS`: `transact` → `check`, `details` → `info`; the cell yes-mark is `check` (`:126`). The head is `aria-hidden`; each row's spoken name carries the column keys, not glyphs.
- `popup/windows/capabilities/permission-rows.ts:161` (`contract-details`, `info`) and `:250` (`transaction`, `check`). Rows draw through `PermissionRow.vue` in the capabilities window only; the discover window's rows (`extension`, `app`, `eye-off`) and the connected-app page's authorizations row (`signature`) use other glyphs.
- `send` and `search` exist in `packages/design/src/core/glyphs.ts:33, :123`; elsewhere `send` marks an outgoing transfer in Activity and `search` a search field. Neither appears in the capabilities window today.
- Pins: `DetailsTable.test.ts:87` (head glyphs), `permission-rows.test.ts:217-242` (row icons; its title names `info`), `PermissionRow.test.ts:29` (a fixture "Every transaction" with `check`). No e2e spec reads a glyph name (`git grep` `data-name`, `"check"`, `"info"` under `apps/extension/tests/e2e`). The stories name neither glyph.

## Captures

- The render lane's kit captured through `e2e:agent` with a network spec and an uncommitted playground bundle `ca1-table` (`cde22c928`): a connected playground is a network fixture, so the smoke harness cannot draw the window or the page with grants.
- `ca1-table` grants contracts with `canRegister`, so its window shows "Add contracts" and never the `contract-details` row; one request that shows both swapped rows needs the contracts grant with `canGetMetadata` alone.

## Arc 2, read at `8ff0e6489`

- The page builds `grantedCaps` from `session.capabilityGrants` raw (`[id].vue:65-67`) and draws "If you allow, it can" (`:331-352`, the authorizations `PermissionRow` with its switch and write) and "Granted permissions" (`:354-358`, `GrantedCapabilitiesList`). The render lane's D1 is `28e8795d7`, with `782858322` defaulting `foot` to true; both draw behind a `layout` query switch.
- `buildDetailsTable(grants, knownContracts)` (`popup/windows/capabilities/details-table.ts:49`) is pure over `unknown[]`; accounts and the address book feed no column. The page, an L6 page, may import it; an L4 module may not (`biome.json`).
- The names: `knownContracts(...)` (`dapp-interaction/known-contracts.ts`) runs only in `DappInteractionService.requestCapabilities` (`service.ts:612-621`), over `fpcService.getOrComputeProtocolAddresses` and `tokenService.getVerifiedDefaults`, both worker-only. No RPC census pins the services' method lists; each list is checked against its `Methods` type.
- `DetailsTable.vue`'s narrow drawing is `@media (width < 359px)`. Measured in the capture page at the base (400 px, 2x): the window's table 342 px wide, every name whole; "Sponsored fee payer" 130.6 px, an address 103.8 px, "Any contract" 80.8 px; the page's column 312 px. Scrollbars are hidden everywhere (`base.css`), so `scrollbar-gutter: stable` takes no width.
- Only the cards call `CapabilityDetailPanel`; only it calls `ScopePatternList`, `ScopeAddress` and `ScopeClassId`; only `GrantedCapabilitiesList` calls `getCapabilityLabel`. The identifier-site inventory holds entries for `ScopeAddress` and `ScopeClassId` on the page's surface; `type-roles-windows.test.ts:184-192` presses `granted-capability-toggle` for them.
- E2E readers: `openConnectedApp` waits for `connected-app-authorizations-toggle` by default; `setConnectedAppAuthorizations` (used by `authwit-variants`) presses it; `cap-window` reads the table; `connect-check-window` and `connect-verify-mismatch` read the not-connected line and the page root. No smoke spec opens an app's page; `type-roles.test.ts` sweeps the list.
