# wrap-2: recon

Base `9ce6bb0bd` (`origin/dev`). One Explore agent (Sonnet) ran the reuse sweep; the planner checked each claim used below against the tree. The planner measured the real layout with an uncommitted capture spec on the network suite's proverless build (`bun run e2e:agent`), in Chrome and Firefox.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Wrap a one-word name inside its box | `overflow-wrap: anywhere`, local to each box: `RestoreOutcomeBanner.vue:109-112`, `ImportFullBackupForm.vue:223-225` (#1276), `StaleNetworkConfirm.vue:106`, `TakeoverLayout.vue:174`. `@nulo/design`'s `Banner.vue` has none, and no global rule exists. | reuse the rule, local to the banner |
| Pin a module-CSS rule to its element | `apps/extension/scripts/type-roles/source-scan.ts` (`parseSource`, `elementByTestid`, `boundAttr`, `declarationsOf`), used as is by `RestoreOutcomeBanner.test.ts:148-153` | reuse as is |
| Mount the chain banner | `src/popup/windows/capabilities/chain-switch.test.ts` renders `cap-chain-banner` through a stub `Banner` (`:105-112`) and reads its title, text and action (`:167-224`). `index.test.ts` never renders it. | add the scan case to `chain-switch.test.ts` |
| Real layout of the banner | `tests/e2e/network/cap-chain-mismatch.test.ts` reaches both states with seed names only ("Local Network", "Alpha") and no width check. `tests/e2e/network/type-roles-windows.test.ts:141-160` runs `expectFitsNarrow` on the capabilities window, but its fixture connects on the dApp's chain, so no banner shows. | no e2e reaches the banner with a long name (plan D4) |

## The issue's claims, checked (#1365)

- **Full backup's added-networks banner: does not hold.** `addedNetworksText` (`popup/pages/settings/security/export/full.vue:70-75`) builds its sentence from two counts (`AddedNetworkImports = { accounts: number; networks: number }`, `composables/useFullBackupExport.ts:34`). No network name reaches it, so a long name cannot overflow it.
- **Capabilities window's chain banner: holds (demonstrated, below).** The name reaches the title, the description and the action: `Switch wallet to ${dappChain.name}` (`popup/windows/capabilities/index.vue:386-405`). The issue did not name the action.
- **Where the names come from.** `dappChain.name` is the profile's row name, else `getChainName(chainId)` (`capabilities/chain-mismatch.ts:20`), which is `Aztec:<id>` for an unknown id (`components/ui/utils.ts:30-40`). The id is a u32 (`wallet-sdk/session-established.ts:24-26`), so that label is at most 16 characters, and a dApp on a chain with no network gets no connection (`tests/e2e/network/connect-unserved-chain.test.ts`). A row name is a person's: the rename field caps it at 25 (wrap-1's Fact 1), and `renameNetwork` accepts any row, seeds included (`wallet/services/network/service.ts:598-612`).
- **The width.** The window opens 400 px wide (`wallet/services/dapp-interaction/service.ts:608`); a person can narrow it. The repository holds windows to the 240 px narrow width too (`type-roles-windows.test.ts` `sweepWindow` → `expectFitsNarrow`; `fixtures/type-roles.ts:715`).

## Measured

Uncommitted spec (`~/.cache/nulo-backlog/wrap-2/capture/`): connect the playground without switching, rename Local Network (the dApp's chain) and Alpha (the wallet's) through the network service, request capabilities, read the banner in the mismatch state, press the switch, read the switched state. Each value is how far a part's last line box ends past the banner's content edge, in px (`≤0` fits): title / description / action. Names: `seed` (no rename), `real25` (`AztecSequencerTestnetEU01` and `AztecMainnetSequencerEU01`), `w25` (25 `W`s, and 24 `W`s + `M`). The table is Chrome's. Firefox's base gives the same overflow values within 0.1 px; its action labels end up to 1 px further right, so at 400 px with `real25` Chrome fits the action on one line (−0.7) and Firefox breaks it (−60.7, banner 127.6 px high, not 113.6). Trials ran in Chrome on the base build, set through the CSSOM (the page's CSP refuses a style element): **t1** `overflow-wrap: anywhere` on the banner's two text spans; **t2** on the banner's root, which the action inherits.

| State, name | 400 base | 360 base | 240 base | 240 t1 | 240 t2 |
|---|---|---|---|---|---|
| mismatch, seed | −142/−5/−92 | −102/−3/−52 | −35/−4/−19 | — | identical to base |
| mismatch, real25 | −57/−46/−1 | −17/−6/−41 | **15/20/39** | **15/20/39** | −7/−2/−3 |
| mismatch, w25 | −2/−9/−20 | **39/31/20** | **159/151/140** | **109/112/121** | −4/−1/0 |
| switched, seed | −121/−40 | −81/0 | −13/−6 | — | identical to base |
| switched, real25 | −36/−129 | −105/−89 | **15/14** | −7/−2 | −7/−2 |
| switched, w25 | −2/−9 | **39/31** | **159/151** | −4/−6 | −4/−6 |

- At 360 px under t1, `w25`'s action is still 0.5 px past; under t2 it is −5.3. t2 fixes every row at every width (w25 at 360: −12/−8/−5).
- Where text overflows, `cap-scroll-area` clips it: the end of the name and of the action are lost. The window never scrolls sideways.
- **t1 fails because of the action.** The action's label (`type--label-section`, upper case) carries the name as one word; its min-content width holds the banner's column wide whatever the texts do.
- **t2 leaves seed layouts unchanged to the pixel** (heights 99.2/99.2/156.3 and 62.8/62.8/91.6, the same line counts). The action's other words stay whole: "SWITCH WALLET TO" keeps its line, and only the name breaks.
- **Outside the banner,** the identity line "wants to connect on <name>" (`DappIdentityBlock`, `actionLabel`) runs past its box too: `w25` 26.6 px at 360 and 146.6 at 240, `real25` 8.2 at 240. The status strip's network name fits.

## Other places a typed name shows (out of scope; plan D5)

From the sweep, unmeasured: the execute window's scope banner (`popup/windows/execute/index.vue:645-657`, names from `execute/scope-mismatch.ts:89-100`); the full backup page's reset notice (`full.vue:176-178`, `backupNotice` in `components/stale-network/copy.ts:163-166`), which can name a renamed seed or a custom network with moved addresses (`stale-network/classify.ts:32-43,60-66`); the stale-network takeover's body and notice, and the network arrival (`StaleNetworkTakeover.vue`, `TakeoverLayout.vue`, `network-arrival/`).

## #1375, checked

**Holds.** The comment above the watcher (`popup/pages/settings/security/export/account.vue:177-178`) says the flow ends "with a network switched from another window". The watcher reads `appStore.network?.chainId` of the page's own store. A switch in another window never reaches that store (`utils/guarded-network-activation.ts:11-18`); this is known limit #1374. What fires it: this window's bootstrap, which clears `appStore.network` and resolves it again (`composables/useProfileBootstrap.ts:150-168`), run after a profile change made in any window (`popup/app.vue:350-370`) or a reopened session. A switch in this window cannot fire it while the page is shown: the page hides the header (`account.vue:5`, `components/Header.vue:172`), and the takeover and the arrival replace the router view (`popup/app.vue:659-680`). A completed network reset reloads the row in every popup document of the profile (`popup/reset-completion.ts:23-31`, from `composables/useStaleNetwork.ts:271-280`), but the takeover has already replaced the page then (unverified).

## Open work and collisions

- Closed known limits searched with `gh issue list --state closed --label known-limit --search "network name"`. Relevant: #1374 (the cross-window switch above). None covers the chain banner.
- Collisions: the one open PR, #1377 (store images), touches none of these files.
