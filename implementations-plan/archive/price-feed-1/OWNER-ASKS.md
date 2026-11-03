# price-feed-1: owner asks

The arc (#1605) depends on none of these and ships now: its code is the same under every answer.

## OA-1. When the first list with price feeds is published

**Surface**: the dollar values on Home, Holdings, Send, Activity and a token's page, for the tokens the list prices today (Test USDC, Test USDT and Test EURC on Testnet; cUSDC on Alpha Mainnet once #1603 is published).

**Today**: the wallet reads each token's price feed from a table built into the extension. After this change it reads it from the signed list only. The list served today has no feeds, and this change does not publish one. The release smoke and the nightly smoke check dollar values only when the published list prices a token, so they skip those checks until the publish.

**Options**

- **A (recommended).** Publish a list with the feeds right after this change merges, before the release that carries it. It carries the three Testnet records with today's values (and cWETH's, if you have chosen its id by then). Released wallets ignore the new field, so nothing changes for them. A new install of the release shows today's dollar values at once. An existing install keeps the list it already holds until its daily list refresh (a day to a day and two hours after its last one). So if it last refreshed before the publish, it can show no dollar value for those tokens for up to about a day after it updates.
- **B.** Publish after the release, as the lane brief says. From the release until that publish, and then until each install's next daily refresh, a person on the new version sees no dollar value for those tokens (the row shows the token amount only, as for an unpriced token today). Fee Juice keeps its dollar value.

**Recommendation**: A. It costs nothing (an older wallet reads the new list exactly as it reads today's) and shrinks the gap to at most one daily refresh. Removing even that gap means the wallet fetching the list again right after an update: a new fetch the Privacy Policy (§ 5.11) does not describe, which this change does not add.

## OA-2. The Privacy Policy's price sentence

**Surface**: Privacy Policy § 5.2 (in the extension's Legal pages and on the site).

**Today**: "with fiat values enabled, Nulo requests prices for the token-ID list bundled with that extension version." After this change the ids come from the signed token list (§ 5.11), plus AZTEC for Fee Juice. The request still does not depend on what you hold.

**Proposed wording** (yours to change): "with fiat values enabled, Nulo requests prices for the price identifiers the signed token list names (§ 5.11), and for AZTEC, which prices Fee Juice." A patch version (1.2.8), so nobody is asked to accept again.

**What ships now**: the arc leaves `legal/` untouched. Your wording lands before the release that carries this change: in the arc's PR if you answer before it merges, otherwise in its own PR.

## For the later token-list PR (not this lane)

cWETH's feed: its CoinGecko id (`weth` is the candidate), its band and its ticker ("WETH") are your call, as the lane brief says. A list feed can price a token from $0.0001 to $1,000,000 a unit, with a band at most 1000 times wide.

## Not an ask: the `prepare` step summary

No wallet surface changes here. The new text is the `prepare` step summary the owner reads before approving `sign`, as the token-list-live-check plan recorded for the live check, and its content is what the owner's direction names (the feeds the approver must see, an advisory CoinGecko check):

- The digest line reads "Tokens, flags and price feeds sha256 (`sign` refuses any other set)", and the publish PR's body line reads "tokens, flags and price feeds sha256".
- A "### Price feed changes" table with columns `| | price id | min | max | ticker |`, rows `+`, `−`, `was`, `now`, or "No price feed changes against the served list."
- A "## Price feeds against CoinGecko (advisory)" table with columns `| price id | band | result |`, results `inside`, `outside the band ($<quote>)`, `unknown to CoinGecko`, `not checked: <reason>`, under one line saying a keyless request from a shared runner is often rate-limited, so `not checked` proves nothing.

Change any of it with a one-line edit; nothing else depends on the words.

## Answers (recorded by the orchestrator on #1605, 2026-11-03)

- **OA-1 = A.** The owner: "OA-1 if it's backwards compatible, then yes, A." The first list with feeds is published right after this change merges, before the release that carries it; that publish is a later token-list PR.
- **OA-2 = the proposed wording, patch 1.2.8.** The owner: "OA-2: ok no problem." It landed in this arc's PR: `legal/privacy.md` 1.2.8 (effective date filled at the promote that publishes it, as for Terms 1.2.1), 1.2.7 archived, the manifest entry and the `BEFORE-LAUNCH.md` step.
