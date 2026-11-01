# wrap-3: recon

Base `f738cba62` (`origin/dev`). One Explore agent (Sonnet) ran the reuse sweep; the planner checked each claim used below against the tree. The planner measured the real layout with two uncommitted capture specs: the network suite's proverless build (`bun run e2e:agent`) for the dApp windows, and the armed smoke build for the takeover, the arrival and Full Backup. Both ran in Chrome and Firefox. Paths are under `apps/extension/` unless they name a package.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Wrap a one-word name inside its box | `overflow-wrap: anywhere`, local to each box: `.chain_banner` (`src/popup/windows/capabilities/index.vue:493-496`, #1365), `.warning_block` and `.reminder` (#1276), `TakeoverLayout.vue:180` (`.title` only), `StaleNetworkTakeover.vue:255` (`.title_progress` only), `StaleNetworkConfirm.vue:106` (`.title` only). `@nulo/design`'s `Banner`, `Text` and `Flex` have none. | reuse the rule, local to each box |
| Pin a module-CSS rule to its element | `scripts/type-roles/source-scan.ts` (`parseSource`, `elementByTestid` for a static testid, `walkElements`, `boundAttr`, `declarationsOf`), as `chain-switch.test.ts:181-186` uses it. `DappIdentityBlock.test.ts:22-29` has its own `declarationsOf` and pins `.dapp_hostname` the same way. | reuse as is |
| Rename a network in an e2e | `readNetworkRows` (`tests/e2e/helpers/identity-rows.ts:89`) for the rows, then `callService(page, NETWORK_SERVICE_NAME, "renameNetwork", [id, name])` (`tests/e2e/fixtures/session.ts:95`); the UI route exists twice as local helpers (`network/store-captures.test.ts:118-126`, `restore-outcome.test.ts:124-145`). The service takes any non-empty name; the fields cap it at 25 (`EditNetworkPopup.vue:116-123`, `NewNetworkPopup.vue:163-170`). | the service route, with a 25-character name |
| A layout gate at 240 px | `expectFitsNarrow` (`tests/e2e/fixtures/type-roles.ts:756`): text more than 1 px past its box, a box past the view, a sideways scroller, or text the window's own width shows whole and 240 px cuts. `restore-outcome.test.ts:187-188` already runs it with `"W".repeat(25)`. | reuse in `cap-chain-mismatch.test.ts` |
| Drive the takeover, the arrival and the reset notice | `seedStaleNetwork`, `takeoverScreen` (`tests/e2e/helpers/stale-network.ts`), `seedNetworkArrival` (`helpers/network-arrival.ts`), the holds of `helpers/stale-network-capture-seeds.ts` (Chrome only: on Firefox each `evaluateInBackground` runs in a fresh sandbox, so `globalThis.__staleHold` does not persist; the capture kept its hold state on `chrome.storage.local` instead). | reuse for the captures |

## Where a name reaches each place

- **Identity line.** `DappIdentityBlock.vue:45` (`.dapp_action`, rule at `:108-111`, `type--body`, no wrap rule), in a column `Flex` whose `.dapp_info` has `min-width: 0`. Six windows render the block; two put a network name on the line: capabilities (`index.vue:382`, `wants to connect on` / `wants more permissions on ${chainName}`) and discover (`index.vue:57`, `wants to connect on ${chainName}`). Both names are the row's (`resolveDappChain`). Execute, fee, network-unavailable and verify pass fixed text.
- **Execute scope banner.** `execute/index.vue:645-657`: `@nulo/design`'s `Banner`, `direction="vertical"`, `wide`, its action a button on a line of its own (`packages/design/src/ui/Banner.vue`). In the `chain` state the title (`Runs on <dApp chain>`), the body (`Your wallet is on <here>. It switches to <there>…`) and the action (`Stay on <wallet network>`) carry names (`scope-mismatch.ts:80-117`); the account states carry account names.
- **Full Backup's reset notice.** `full.vue:176-179`, `.reset_notice` (a column `div`) with a `type--meta` label (`FINISH THE <NAME> RESET FIRST`) and a `type--body` text (`backupNotice`, `components/stale-network/copy.ts:163-166`). It shows while the profile holds a reset journal (`network-reset/service.ts:244-252`), named by the row's current name (`full.vue:84`).
- **Takeover and arrival.** Both render `TakeoverLayout.vue`. Its `.content` column holds the eyebrow, the title, the body, the notice, the box (label and lines) and the note, and no button. Its `.top_bar` row holds the network chip (`max-width: 60%`) beside the Lock button. Its `.actions` column holds the full-width buttons, each on its own line, `height: 48px`. Names reach the title, body, notice, box label, box lines, chip and buttons (`stale-network/copy.ts`, `network-arrival/copy.ts`). The takeover's own progress and loading screens (`StaleNetworkTakeover.vue:186-209`) put the upper-case name in `.eyebrow_text`; the reset confirm (`StaleNetworkConfirm.vue`, rendered by the takeover) puts it in `.pre_title` and `.body`, beside a buttons row (Cancel, Reset).

## Measured

How far each text's last line ends past its own box, in px (`≤ 0` fits); the worst text of the place. Names: `w25` is 25 `W`s (the dApp windows' other side `W`×24+`M`), `real25` is `AztecSequencerTestnetEU01` (other side `AztecMainnetSequencerEU01`). Trials set the rule through the CSSOM (an extension page's CSP refuses a style element). Firefox gives the same numbers within 0.4 px and the same line counts.

| Place | Name | 360 base | 240 base | With the rule, 360 / 240 |
|---|---|---|---|---|
| Identity line (capabilities, discover) | w25 | 26.6 | 146.6 | −9.7 / −10.9 (on `.dapp_action`) |
| | real25 | fits | 8.2 | fits / −4.3 |
| Execute scope banner, `chain` | w25 | 38.5 | 158.5 | −5.3 / −0.2 (on the banner) |
| | real25 | fits | 40.0 | fits / −2.1 |
| Full Backup reset notice | w25 | 16.6 | 136.6 | 0 / 0 (on `.reset_notice`) |
| | real25 | fits | 29.0 | 0 / 0 |
| Takeover content (A1, A2, R1) | w25 | 39.0 | 159.0 | 0 / 0 (on `.content`) |
| | real25 | fits | 25.0 | 0 / 0 |
| Takeover progress pre-title | both | fits | 11.0 | 0 / 0 (on `.progress`) |
| Reset confirm pre-title, body | w25 | 27.0 | 37 / 147 | 0 / 0 (on the two texts) |
| | real25 | fits | 37 / 9.6 | 0 / 0 |
| Arrival content | w25 | 36.6 | 156.6 | 0 / 0 (on `.content`) |
| | real25 | fits | 25.0 | 0 / 0 |
| Network chip (takeover / arrival) | w25 | 103.7 / 88.7 | 175.7 / 160.7 | not tried (P94-14 bars it) |
| | real25 | 21.7 / 6.7 | 93.7 / 78.7 | |
| Full-width buttons (`RESET <NAME>`, `SWITCH TO`, `STAY ON`) | w25 | 64-66 | 184-186 | wrapped: contained sideways, but 6-25 px below the 48 px button; grown (`min-height`): 0 |
| | real25 | fits | 80-82 | wrapped: 6-7 px below; grown: 0 |

- Seed names (`Testnet`, `Alpha`, `Local Network`) overflow nowhere, under every trial.
- The A2 notice was measured with the paused-imported copy (`pausedImported(name, ["Imported 1"], true)`) set in its box; reaching it for real needs an imported account and a paused reset.
- In the dApp windows the scroll area clips the overflow (`cap-scroll-area`); in the popup the window's edge does. The chip's text runs under the Lock button.
- The capabilities chain banner (#1365) fits in every row.

## Open work and collisions

- Closed known limits searched with `gh issue list --state closed --label known-limit --search "network name"`: none covers these places.
- Open PRs touching these files: none at the base.
