# fee-juice-link-1: recon

Read at `b8ec26b1f`. Paths under `apps/extension/src/` unless they name another root.

## Sites

`git grep -n "FEE_JUICE_BRIDGE_URL\|testnet.app.unleashed\|bridgeUrl"` outside the archives:

| Site | Testid | Words | Network it holds |
|---|---|---|---|
| `popup/components/modules/send/FeeSettingsCard.vue:514` | `send-fee-sheet-warning-bridge` | Get private Fee Juice | `props.network` |
| `FeeSettingsCard.vue:604` | `send-fee-get-juice` | `nudgeCopy.link`: Get private Fee Juice / Get Fee Juice | `props.network` |
| `components/composite/send/PublishLine.vue:35` via `popup/pages/send.vue:1142` | `send-fee-warning-bridge` | Get private Fee Juice | `appStore.network` (send.vue) |
| `popup/pages/send.vue:120` (`openFeeJuiceBridge`, the footer CTA at `:1153-1160`) | `send-get-fee-juice` | Get private Fee Juice / Get Fee Juice | `appStore.network` |
| `popup/pages/general.vue:121` (`onGetStartedSelect`) | `get-started-feeJuice` | Get Fee Juice (`GetStartedCard.vue:17`) | `appStore.network` |

`FeeSettingsCard` mounts in `popup/pages/send.vue:1181`, `popup/components/popups/ChangeAuthwitsRegistryPopup.vue:158`, `RevokeAuthwitsPopup.vue:251` (each `appStore.network`) and `popup/windows/execute/OperationCard.vue:455` (`op.network`, a full `Network`).

Docs stating the link: `CLAUDE.md:26` ("one link for every network"), `legal/privacy.md` § 5.10, the TSDoc at `fee-helpers.ts:337-341`. Config: `.github/workflows/_build-extension.yml:96` and `scripts/e2e/build-update-candidate.sh:40` allow `VITE_FEE_JUICE_BRIDGE_URL` and set it nowhere; `scripts/ci-cd/build-env-guard.test.ts:31` uses it as an allowed name.

## Chain identity

- `utils/chain-ids.ts`: `CHAIN_IDS.MAINNET = walletChainId(1, 2070860440)`, `TESTNET`, `SANDBOX: 0`; `MAINNET_L1_CHAIN_ID = 1` is "the trust root a stored `mainnet`-kind network row is checked against".
- The wallet chain id keys the popup's explorer URLs, the chain name "Alpha" and the sponsored FPC allow-list. `l1ChainId === MAINNET_L1_CHAIN_ID` guards resets (`wallet/services/network-reset/service.ts:83, 384, 455`): a protective test that should match every rollup on Ethereum mainnet.
- The seeded Mainnet network is named "Alpha" (`wallet/services/network/seeds.ts:81`); the Privacy Policy calls it Alpha.

## Tests that name the URL

`fee-helpers.test.ts:386-390`, `FeeSettingsCard.test.ts:3409-3415` (sheet link href), `send.test.ts:905` (publish line href). No test reads the nudge's href, the CTA's `window.open` or Get started's Fee Juice `window.open` (`general.test.ts:303-318` covers the Aztec row only). No e2e spec reads any of the URLs. Smoke specs reading the testids: `send-fee-privacy.test.ts:58`, `security-backup.test.ts:104`, `stale-network.test.ts:97-98`; network: `network/fee-methods.test.ts:381, 421-427`, `network/hero-prices-unavailable.test.ts:63`, and `fixtures/send-page.ts:108`, read only by network specs.

## Shield

`curl` of `https://shield.human.tech/fee-juice`: 200; description "Move your funds between Ethereum and Aztec with privacy. Shield is human.tech's programmable privacy bridge." FAQ (`https://support.shield.human.tech/faq`): "Is Shield on mainnet? Yes. Shield is live on Ethereum and Aztec mainnet (Aztec v6.0.0)"; it has a "What's the difference between public and private Fee Juice?" entry. Its hosting provider was not confirmed, so the text names none.

## Legal versioning

`packages/legal/README.md` § Shipping a new version: archive, edit, append the manifest entry. A privacy version never asks for acceptance (status derives from the Terms); Settings → About flags any newer privacy version, patch included (`utils/legal-about.ts`). Precedent for material: privacy 1.1 ("Names the site the … links open, which I operate"), 1.2 (a new host), 1.3 ("material, a new recipient", `BEFORE-LAUNCH.md` § 4). Unpublished versions keep `«FILL: effective date»` and get a `BEFORE-LAUNCH.md` § 4 block each.

## The text

§ 5.10 after (heading per #1806; "What it reveals" keeps its words for Unleashed and names no host for Shield):

> ### 5.10 The "Get Fee Juice" and "Get private Fee Juice" links
>
> **What it is:** the wallet links to a bridge application when an account cannot pay a transaction's fee, on the review screen when paying the fee would publish your address as the fee payer, and in Home's Get started list. On Alpha the links open `https://shield.human.tech/fee-juice`, Shield, a bridge application that human.tech, a third party, operates. On every other network they open `https://testnet.app.unleashed.systems`, a bridge application I operate as a separate project.
>
> **What it reveals:** nothing until you click. The link carries no account address or other wallet data and opens without a referrer, so a click is an ordinary website visit: the site and its host receive your IP address and browser headers. Cloudflare, Inc. hosts the application I operate.
>
> **After it opens:** the application runs on its own. The requests it makes, for example to an Aztec node, are not Nulo's, and this policy does not describe them.
>
> **Your control:** the site is contacted only if you follow the link.

## Known limits searched

`gh issue list --state closed --label known-limit --search "fee juice link"` and `"bridge url"`: none. Dedupe for the follow-up, `--search "unleashed alpha fee juice"` and `"shield fee juice"`: none.
