---
plan: price-feed-1
tier: mid
status: approved by the panel (final Codex pass approve); arc 1 implementing
issues: "#1605"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit rounds + Opus Plan leg; final fresh Codex pass
base: origin/dev at c77e77f13
trunk: dev
post_implementation_hardening: not scheduled
---

# price-feed-1: the signed token list carries each token's price feed

One arc. The signed list gains a `priceFeeds` map: for each CoinGecko id its entries name, the USD band a quote must fall in and the ticker the wallet shows. The wallet prices a listed token only through the feed its list carries. The compiled table goes, except Fee Juice's `aztec` feed, the one fixed entry. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Decision (owner, #1605)

"seems that we need to outsource (or add to the token list the usd feed price and remove it from the app so this never happens again)." On Fee Juice: "Fee Juice = $AZTEC pricing on Ethereum. Always. The price feed we already use."

## Outcome & Quality Bar

- **For whom**: the owner listing a token (cWETH on Alpha Mainnet first), and a person who holds it and reads its dollar value in Home, Holdings, Send and Activity.
- **Excellent**: (1) a token the list prices shows fiat with no extension release; (2) a quote outside the band the list names is never shown or used, at write, merge or read; (3) the approver sees every feed change in the `prepare` summary, and `sign` refuses a feed set the approver was not shown; (4) an older wallet reads a list with feeds exactly as it reads today's.
- **Good enough**: no new screen, setting, copy or fetch trigger; the provider stays CoinGecko; the first publish with feeds is a later PR.

## Assumptions

**Facts** (verified at the base; `recon.md` has the trail)
- F1. Wallet mode ignores unknown keys in the payload and in each entry (`parse.ts:67-74`), so a `priceFeeds` key reaches an older wallet as nothing.
- F2. The stored list is the raw envelope, re-parsed at each start (`token-list/service.ts:~165`); an old envelope without `priceFeeds` must still parse. At boot the service fetches only when its stored deadline has passed, a day plus up to two hours after the last success (`token-list/service.ts:59-62,144-148`).
- F3. `usableQuotes` is the stored-shape decoder of `nulo:core:token-prices` and applies the compiled band; the registry calls it with `(value, now)` only (`stored-shapes.ts:67,241`).
- F4. The approver's digest covers tokens and flags only (`sign.ts:32`); `behavior-gating.test.ts` pins the output name `tokens_sha256`.
- F5. `send.vue:287` takes the proxy ticker from the compiled table; it renders in `AmountCard.vue:265` ("Priced via USDC, at today's rate").
- F6. `price/service.ts:359` joins ids into the URL unescaped; the ids are compiled today.
- F7. Privacy Policy § 5.2 says prices are requested "for the token-ID list bundled with that extension version".
- F8. The published list (`infra/token-list/public/v1/list.json`) carries no feeds, and this lane does not publish one.

**Inferences**
- I1. Escaping each id and keeping the commas literal leaves today's URL byte-identical (every id matches `[a-z0-9-]`), so CoinGecko sees the request it sees today.
- I2. 32 feeds fit the 16 KiB response cap: a reply row is at most about 130 bytes at a 64-character id. The URL stays near 2 KB.

**Asks** (each with the working assumption the plan proceeds on)
- A1 → OA-1. A wallet with this arc and a list with no feeds prices only Fee Juice. Working assumption: the feeds publish lands before the release; an install that updates before its next daily list refresh still shows no listed-token fiat until that refresh (F2). The arc is the same either way.
- A2 → OA-2. § 5.2's wording is the owner's. Working assumption: the arc leaves `legal/` untouched; the owner's wording lands before that release.
- A3. The band ceiling's numbers (D3) are the panel's call: they bound a signer error, not a screen.

## Architecture & Implementation

### Wire shape (additive to `nulo-token-list/1`)

```json
"priceFeeds": { "usd-coin": { "min": 0.2, "max": 5, "ticker": "USDC" } }
```

Entries keep `priceId`. A wallet prices an entry only when `priceFeeds` has an accepted record under its `priceId`. The payload carries `priceFeeds` only when the source does, so today's source signs the same bytes as before apart from the sequence.

### Rules

| Rule | strict (signer, tree) | wallet |
|---|---|---|
| `priceFeeds` is a plain object with at most `MAX_PRICE_FEEDS` (32) keys | refuse | refuse (as `MAX_TOKENS`) |
| key matches `PRICE_ID` | refuse | drop the record |
| key is `aztec` (Fee Juice's fixed feed), or an `Object.prototype` member (within the charset only `constructor`) | refuse | drop the record |
| record keys are `min`, `max`, `ticker` | refuse others | ignore others |
| `MIN_FEED_USD` (0.0001) ≤ `min` < `max` ≤ `MAX_FEED_USD` (1,000,000), finite numbers | refuse | drop the record |
| `max` ≤ `MAX_BAND_RATIO` (1000) × `min` | refuse | drop the record |
| `ticker` matches `/^[A-Za-z0-9]{1,12}$/` | refuse | drop the record |
| when `priceFeeds` is present: every entry's `priceId` has a record, every record is named by an entry | refuse | an entry with no accepted record is unpriced |
| `priceFeeds` absent (today's source and served envelope) | accept; `priceId` checked by charset only | every entry unpriced |

A dropped record leaves its tokens unpriced and keeps the rest of the list, flags included: a feed a later revision widens must never cost an older wallet its scam flags. Absence stays valid in strict mode because this lane may not touch the source, and `check.ts` parses both the source and the served envelope strictly (`check.ts:22-28,79`). Refusal paths: a map key failing `PRICE_ID` is named by its index; a record's fields use `record()` as entries do, so strict mode's unknown-field path names the field as the source spells it (publisher output only; wallet mode reports no unknown key).

### Package (`packages/token-list`)

- `src/price-ids.ts` → `src/price-feeds.ts`: `type PriceFeed = { min: number; max: number; ticker: string }`, `type PriceFeeds = Readonly<Record<string, PriceFeed>>`, `FEE_JUICE_PRICE_ID = "aztec"`, `FEE_JUICE_PRICE_FEED = { min: 0.0001, max: 100, ticker: "AZTEC" }` (today's values), the bound constants. No dependency (sign-cli's import closure).
- `src/parse.ts`: `checkPriceFeeds(value, path, mode)`; `PAYLOAD_KEYS` and `checkSource` gain `priceFeeds`; `TokenListPayload.priceFeeds?: PriceFeeds`; strict cross-rules in `checkPayload`/`checkSource`; `selectEntries(tokens, feeds, classIds?)` keeps a `priceId` only when `Object.hasOwn(feeds, priceId)`. One exported predicate `isFeedId(id)` (charset, and not an `Object.prototype` member) guards the map keys here and the stored ids in `freshQuotes`, so no reader's plain-object lookup (`usePrices.ts:127`, `service.ts:185`) can meet a built-in. The record rules live in one `feedFault(key, value)` that returns the failing path: strict throws on it, wallet skips the record (cognitive complexity stays under 15). FORMAT.md says an entry naming `aztec` is unpriced (today an older wallet prices it as AZTEC; no entry names it).
- `src/index.ts`: `VerifiedTokenList.priceFeeds` holds the accepted records a selected entry names, and nothing else; exports swap `PRICE_IDS`/`isPriceId`/`PriceId` for the new names.
- `src/sign.ts`: `listSha256({ tokens, flagged, priceFeeds })`; with no feeds it hashes the same bytes as today (`JSON.stringify` drops an undefined key). `signList` copies `priceFeeds` into the payload when the source has it; its digest-mismatch message names feeds too. `src/import-closure.test.ts:54` names `price-feeds.ts`.

### Wallet (`apps/extension/src/wallet/services/price/`)

- `price-map.ts`: `PriceMapEntry = { coingeckoId: string } & PriceFeed`; `type PriceTable = Readonly<Record<string, PriceMapEntry>>`; `priceTableOf(feeds)`: the list's feeds, then Fee Juice set over `aztec`; in an armed e2e build the sandbox `usd-coin` entry first, so a list feed wins. `pricedTokensOf(entries, table)` maps `tokenKey` → entry. `getPriceMapEntry(priced, chainId, contract)` is an `Object.hasOwn` lookup (sandbox rule unchanged, stamp kept). `priceIdsOf(table)` sorts the keys. `FEE_JUICE_ENTRY` reads `FEE_JUICE_PRICE_FEED`. `proxyTickerFor`, `getSanityBand`, `allCoingeckoIds` go.
- `service.ts`: split `isValidQuote` into `isWellFormedQuote(id, quote, now)` (today's checks without the band) and `inBand(quote, entry)`. `freshQuotes(stored, now)` keeps the row-local checks and freshness: it is the stored-shape decoder. `doRefresh` takes the table once and uses it for the URL, `parseResponse` and `mergeMonotonic`. **One list per answer**: every reader builds its table from `tokenList.getSnapshot()` after its last await, and `snapshotOf(quotes)` builds one table from the list it reads and filters `quotes` against it in the same synchronous step that builds `pricedTokens` and `flaggedTokens`, so no answer pairs a quote with another list's band or mapping. `getUsableQuote` and `refreshIfStaleQuotes` read the same way. URL: `ids=${ids.map(encodeURIComponent).join(",")}`.
- `spec.ts`: `PricedTokens` values become `PriceMapEntry`, so the ticker travels with the mapping and the quotes (one list moment).
- `token-list/{spec,service}.ts`: `TokenListSnapshot.priceFeeds`, copied by `toSnapshot`.
- `storage/stored-shapes.ts`: `tokenPrices` reads through `freshQuotes`. A new golden holds a fresh quote under an id the old table lacked (`weth`) and one outside its old band (`usd-coin` at 10); `bun run baseline:storage -- --additive "<reason>"` appends its stamp; add the pin it prints. Reason: every row that read before reads the same; a quote under any other id now passes the decoder and stays unused unless the held list carries its feed.
- `composables/usePrices.ts`: `priceEntryFor(chainId, contract)`; `quoteFor` and `isPriced` use it, and `quoteFor` returns a quote only inside the entry's band: `list.read` adopts a newer mapping before the quotes it pairs with (`usePrices.ts:49-58`). `popup/pages/send.vue:287`: the ticker is `prices.priceEntryFor(…)?.ticker`.
- `token-list/list.fixture.ts`: `TEST_PRICE_FEEDS` (today's three stable records); `TEST_PRICED_TOKENS = pricedTokensOf(TEST_LIST_ENTRIES, priceTableOf(TEST_PRICE_FEEDS))`.
- `price/real-data.test.ts`: iterates Fee Juice and `TEST_PRICE_FEEDS`.

### Publisher (`infra/token-list`, `.github`)

- `scripts/summary.ts`: a "Price feed changes" table (added, removed, changed: id, min, max, ticker; `cell()` escaping); the digest line names tokens, flags and feeds, as does `open-publish-pr.ts:67`'s body line.
- `scripts/price-check.ts` (new, on `live-check.ts`'s model): one keyless GET `https://api.coingecko.com/api/v3/simple/price?ids=<escaped ids>&vs_currencies=usd` with `redirect: "error"`, a 10 s timeout, a 16 KiB body cap and no header; a row per feed: `inside` / `outside the band` / `unknown to CoinGecko` / `not checked: <category>`; exit 0 only when every row is `inside`; no feed means one line and exit 0. Its heading says a keyless request from a shared runner is often rate-limited (`real-data.test.ts:3-4`), so `not checked` is common and proves nothing.
- `publish-token-list.yml` `prepare`: a step after the live check, `Price feed check (advisory)`, `continue-on-error: true`, `timeout-minutes: 2`, `>> "$GITHUB_STEP_SUMMARY"`; header comment and README step 2 say so.
- `FORMAT.md`: the example, a `priceFeeds` row, a "Price feeds" section (the rules above, what a reader does, that a reader without them keeps its own table), and the reader rule "Leave an entry unpriced when the list carries no feed for its `priceId` that you accept."

### Data flow

list fetch → `readTokenList` (verify, parse wallet, select; feeds attached) → `TokenListSnapshot.priceFeeds` → `PriceService` builds the table per answer → request `priceIdsOf(table)` (list feeds a selected entry names + `aztec`; never holdings or network) → quotes validated against the table at write and merge → cache → read: `freshQuotes` then the current table's band → `PriceSnapshot { quotes, pricedTokens: tokenKey → entry }` → popup.

### Trade-offs and alternatives not taken

- **Per-entry fields** (`priceBand`, `priceTicker` on each entry): repeats a feed per chain and needs a rule for two entries that disagree on one id. Rejected for the map, where one id has one record.
- **A compiled fallback for the three stable ids** while lists without feeds circulate: keeps the allowlist the owner asked to remove, with no end date. Rejected; OA-1 orders the publish instead.
- **Refusing the whole list for a bad record in wallet mode**: one record would block flags. Rejected (D4).
- **Band check inside the decoder through a module-level "current list"**: global mutable state the registry cannot see. Rejected for the split (D8).
- **Refresh on a new list**: a new fetch trigger; the brief keeps fetching as it is. A newly listed id waits for the next alarm (3 min) or a stale-on-connect read.

## Decision ledger

| Id | Decision | Alternatives / why |
|---|---|---|
| D1 | Top-level `priceFeeds` map | per-entry fields (above) |
| D2 | Additive in `/1`; a new wallet with an old list prices only Fee Juice | compiled fallback (above); OA-1 |
| D3 | Ceiling: 0.0001 ≤ min < max ≤ 1,000,000 USD, max ≤ 1000 × min, ≤ 32 feeds, ticker `[A-Za-z0-9]{1,12}` | The floor is the precision `convert.ts` holds: it snaps a rate to whole micro-USD per token (`convert.ts:24-46`), so at $0.0001 the rate's own snap moves a value by at most 0.5% and a dollar-to-token amount by under 1% (fewer tokens, never more), the contract Fee Juice's compiled band already ships; rounding to a token's smallest unit and to cents comes on top, as today (`convert.test.ts:123`); near 1e-6 it reaches 33% (Codex R1, reproduced: $0.0000015 snaps to $0.000002). The ceiling is the intended support (from sub-cent tokens to wrapped BTC) and bounds what a wrong pairing can show per unit. 1000× is wide for any asset a list can re-band without a release; the compiled `aztec` band (1e6×) was a pre-launch guess that needed one |
| D4 | Wallet drops a bad record, refuses only a non-object or over-cap map | refuse whole list (above) |
| D5 | Strict, when `priceFeeds` is present: every `priceId` has a record and every record is named; absent stays valid | coverage always (Codex R1: today's source and served envelope would fail `check.ts`, and this lane may not touch them); unnamed records (requested for nothing) |
| D6 | `aztec` stays compiled in the package; the list cannot carry it | owner's ruling; one id never has two bands |
| D7 | Request = feeds a selected entry names + `aztec`, sorted, ids escaped | all records in the payload (requests what no entry uses) |
| D8 | Decoder keeps row-local checks; the band applies in the service against the held list | band in decoder (F3: the registry cannot pass the list) |
| D9 | `PricedTokens` carries the entry; `proxyTickerFor` goes | a separate `tickers` map (two lookups, two moments) |
| D10 | Digest covers feeds; summary diffs them | feeds outside the digest (F4: unseen change between `prepare` and `sign`) |
| D11 | Advisory check also compares today's quote with the band | id only: a band that refuses the real price would leave the token silently unpriced |
| D12 | A feed change does not raise the floor; a closed `known-limit` issue at close-out | Opus R1: raise it when a feed is removed or changed (about 10 lines, the existing mechanism). Codex R1: a known limit. Taken: Codex's, because band re-tuning is routine and would raise the floor at most publishes, the floor protects only builds after it, and `floor.ts:12-13` already treats a changed `priceId` so. Reopen when a published feed is corrected because it was wrong |
| D13 | No refresh on list change | brief: fetching unchanged |
| D14 | No new e2e scenario; the source-run list carries its two feeds | unit and composable tests prove a new id prices; the existing priced specs prove the path end to end. Artifact runs (release and nightly smoke, `nightly.yml:327,354`, `release.yml:399,416`) hold the published list and skip their fiat specs until the feeds publish (`fixtures/token-list.ts:218-222`) |
| D15 | As built: `inBand` sits in `price-map.ts`; the feed diff's tests sit in `test/publish.test.ts` beside the token and flag diffs; invariant 6 is proved in the parse, service and composable tests, with no `price-map.test.ts`; a try/catch per record in `checkPriceFeeds` in place of `feedFault` | the file placement above (`lessons/phase-1.md`, `phase-2.md`) |

## Security & Adversarial Considerations

- **Threat model.** Attacker capability: a list signed by `nulo-ci-1` (owner-approved `sign`) that is mistaken or forged, or a hostile host or network that replays an older signed list. Today such a list picks which tokens show and maps them to one of four compiled feeds (at most $5 or $100 a unit). With this arc it also picks the feed and its band: a forged "WETH" can read at up to `MAX_FEED_USD` a unit. Boundary crossed: signer → the person's fiat display and Send's fiat entry. The host is not trusted; signature and sequence are (FORMAT.md).
- **Invariants and the test that proves each**:
  1. A quote the wallet shows or uses lies inside the band of the feed its held list names, at write, merge and read, and an answer pairs each quote with the band and mapping of one list. `service.test.ts`: refused at write; refused at read after a list narrows the band; a narrowing list that lands while `getQuotes` awaits the cache leaves the quote out of the answer; a control inside the band accepted.
  2. Every list band satisfies D3 in strict, and wallet mode prices nothing outside it. `parse.test.ts`: one refusal per class (min ≤ 0, min below 0.0001, min ≥ max, max above 1,000,000, ratio above 1000, non-finite, string number) in strict, and the same record dropped in wallet with the entry unpriced and the flags kept; `convert.test.ts`: at $0.0001 the snapped rate is within 0.5% (display) and 1% (dollar-to-token) of the quote.
  3. A feed id reaches the URL escaped, behind a charset check. `parse.test.ts`: keys with `&`, `,`, `%`, `/`, `?`, upper case refused in strict, dropped in wallet; `service.test.ts`: the URL built from a crafted table escapes each id, and today's ids give today's exact URL.
  4. The list cannot reprice Fee Juice. `parse.test.ts`: an `aztec` record refused in strict, dropped in wallet; `service.test.ts`: a list `aztec` record with a wide band leaves Fee Juice on its compiled band.
  5. A ticker is ASCII alphanumeric, 1 to 12 characters (no bidi, no markup, no homoglyph). `parse.test.ts`: one refusal per class.
  6. No prototype key resolves. `parse.test.ts`: a `constructor` record refused in strict, dropped in wallet, and `priceId: "constructor"` without one unpriced; `service.test.ts`: a stored row under `constructor` or `__proto__` reads as absent; `usePrices.test.ts`: a `constructor` mapping prices nothing.
  7. The approver sees and binds every feed. `sign.test.ts`: a source with no feeds hashes to the literal digest computed at the base commit; a changed band changes it and `sign` refuses the old one. `summary.test.ts`: a changed record shows as `was`/`now`.
  8. The request is bounded and holding-blind. `parse.test.ts`: 33 records refused in both modes; `service.test.ts`: the request ids equal `priceIdsOf(table)` whatever the account holds, and a reply for 32 feeds plus Fee Juice, at 64-character ids and the provider's field layout, parses under the 16 KiB cap.
  9. An older wallet reads a list with feeds as it reads today's: the base test `parse.test.ts:100-103` (wallet mode ignores an unknown payload key) is that proof, kept unchanged; a `priceFeeds` payload is one more such key.
- **Least privilege.** `prepare` stays secret-free (`behavior-gating.test.ts` asserts no `secrets.` in it); the new step reads no key and no environment variable. `sign` is unchanged.
- **Supply chain.** No dependency is added: `price-check.ts` uses `fetch` and a copied byte cap; the package keeps a dependency-free signer closure (`import-closure.test.ts`).
- **Cryptography.** Unchanged (Ed25519 via WebCrypto).
- **Logging.** No new log line carries a feed value. The wallet logs only a refusal's fixed category (`token-list/service.ts:172-175`); a strict refusal path can name an unknown field as the source spells it, as entries' paths do today (`parse.ts:67-72`), in publisher output only.
- **Under-pricing.** A list-chosen cheap feed makes Send's "$100" convert to more tokens, and can make the dust filter (`incoming-transfer/service.ts:726-728`) hide a real arrival. The band floor and ratio bound it; the token amount stays on screen beside the dollar figure.
- **Request fingerprint.** The request now varies with the held list (every wallet at one sequence sends the same ids), never with holdings or network. `SECURITY.md:489-492` is rewritten to say so.
- **Known limit (D12).** A hostile host serves a fresh install a list older than one that corrected a feed; the install shows the old feed until the next list. Same class as a changed `priceId` today. Filed as a closed `known-limit` issue at close-out.

## UI impact

- Home, Holdings, Send, Activity, the token page: fiat appears for a token the held list newly prices, where fiat already shows. No layout or copy changes.
- Send › amount card: "Priced via <ticker>, at today's rate" takes the list's ticker. For the four tokens priced today the first feeds publish carries today's tickers, so the line reads the same.
- With a list that carries no feeds (today's), a build with this arc shows no fiat for the Testnet stables until the feeds publish: OA-1.
- `UI impact: none beyond values appearing`, under OA-1's order.

## Phase 1: the format and the wallet ✓

1. Add `packages/token-list/src/price-feeds.ts`; delete `price-ids.ts`; update `parse.ts`, `index.ts`, `sign.ts`, `README.md`.
2. Write the `parse.test.ts` and `sign.test.ts` cases of invariants 2 to 8 first; run them red; then implement.
3. Update the wallet files listed above, the fixture and `real-data.test.ts`.
4. Add the `tokenPrices` golden; run `bun run baseline:storage -- --additive "<reason>"`; add the printed pin.
5. Add the `service.test.ts`, `price-map` and `usePrices.test.ts` cases of invariants 1, 3, 4, 6, 8, and a test that a token priced by an id outside the old table (`weth`) gets its fiat and its ticker. Update `service.test.ts:160`, which reads `pricedTokens` values as ids.
6. Update `apps/extension/tests/e2e/fixtures/token-list.ts`: an `E2E_PRICE_FEEDS` table (the `usd-coin` and `tether` records); `signTestList` and `signForgedList` sign the records their tokens name, so `register-token.test.ts`'s zero-token list carries none; `heldListEntries` passes the payload's feeds to `selectEntries`.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/token-list test`; `bun run --cwd infra/token-list test`; `bun run test`.
- Pass: every command exits 0; the new cases are green and were red at the base copy; `snapshot.test.ts` green with the new stamp.
- Layers: typecheck/lint, unit, component.

## Phase 2: the publisher ✓

1. Update `summary.ts` and `summary.test.ts`.
2. Add `price-check.ts` and `test/price-check.test.ts` (injected `fetch`: inside, outside, unknown, oversize body, timeout, redirect; no feed).
3. Add the workflow step; update the header comment, `behavior-gating.test.ts`'s pinned tail, `README.md`, `FORMAT.md`.

**Validation gate**
- Commands: `bun run --cwd infra/token-list check`; `bun run --cwd infra/token-list test`; `bun run test:ci-gating`; `bun run test:release`; `bun run lint:actions`; `bun run lint`.
- Pass: every command exits 0.
- Layers: lint, unit, CI gating.

## Phase 3: docs and the end-to-end gates ✓

1. Update `SECURITY.md` (the price posture and "The signer is the asset"), `ARCHITECTURE.md` § Price feed and § Token list, `.claude/skills/e2e-testing/SKILL.md:813-816`, and the comments in `price-map.ts` and `service.ts`.
2. Run the gates below.

**Validation gate**
- Commands: `bun run test:all`; for each browser `B` in `chrome`, `firefox`, build the armed smoke build from this tree first (`global-setup-smoke.ts` loads `dist/<B>` and builds nothing): `cd apps/extension && unset EXTENSION_PATH NULO_E2E_ARTIFACT_RUN && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:$B`, then `NULO_E2E_BROWSER=$B NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/token-list.test.ts tests/e2e/rows.test.ts tests/e2e/send-keyboard.test.ts tests/e2e/send-picker-add.test.ts tests/e2e/send-outcome-rows.test.ts tests/e2e/home-links.test.ts tests/e2e/navigation.test.ts tests/e2e/type-roles.test.ts --retry=0`; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fiat-send.test.ts tests/e2e/network/register-token.test.ts`; `bun run check:plans` after staging.
- Pass: every command exits 0 at retry 0; a fiat figure renders in each priced spec (none skips in a source run).
- Layers: unit (all workspaces), smoke e2e on both browsers, network e2e.

## Panel verdicts

| Round | Verdict | Accepted | Rejected (reason) |
|---|---|---|---|
| Codex R1 (fresh) | reject: one list per answer, strict coverage vs today's tree, the 1e-6 floor | all three; OA-1's gap stated; the e2e signers name only their records; the logging claim corrected; a maximum-reply test | indexed paths for unknown record fields (`record()` as entries do; publisher output only); owner ask on the CI summary's wording (publisher tooling, as `live-check.ts`) |
| Opus R1 | conditional approve: H1 (= Codex's strict coverage), `constructor` as a feed key, the e2e signers, decide D12 | `isFeedId` at the parser and the decoder; `quoteFor` checks the entry's band; the infra test in Phase 1's gate; the floor at 0.0001; under-pricing and the request fingerprint in the threat model; the literal base digest; the base test as invariant 9; artifact smoke runs named; `feedFault`; the wider golden; the missed consumers | the floor raise on a feed change (D12: Codex's known limit taken) |
| Codex R2 (resume) | approve | — | — |
| Codex final (fresh) | conditional approve: build before each smoke run; qualify D3's accuracy claim; the `prepare` summary's wording in OWNER-ASKS | all three (the wording recorded as the token-list-live-check plan did: no wallet surface, content named by the owner's direction) | — |
| Codex final R2 (resume) | approve | — | — |
| Impl Codex R1 (fresh, over the arc diff) | approve; two Low comment findings | both: `price-map.ts`'s header no longer claims an out-of-band row cannot stay stored; two restating comments dropped | — |
| Impl Opus (diff review, beside R1) | conditional approve: pin the write and merge refusal against the stored row; the stale `PriceQuote.usd` comment | both; also the shared `FEED_ID` spelling, wallet mode's whole-map refusal stated in `parse.ts` and FORMAT.md, the `feedFault` deviation logged, the fixtures' comments | — |

## Delivery

- One arc, one PR from `worktree-price-feed-1` into `dev`: `feat(token-list): the signed list carries each token's price feed` (66 characters). Body: what and why, the validation runs, the smoke wall-clock per browser before and after (no scenario added), `Closes #1605`. Open it without labels; add `e2e:extension-network` only if the path filter skips that lane.
- No `list.source.json` change. The first publish with feeds is a later token-list PR: the three Testnet records with today's values, and cWETH's id and band, which are the owner's call. Its order against the release is OA-1.
- Parallelism: none; the phases share types.

## Post-implementation

Execute `implementations-plan/README.md` § Post-implementation standard at `c77e77f13`, with these values:
- Step 1 is absent (`code_review: off`).
- Step 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over `git diff c77e77f13...HEAD`, once, after Phase 3 is green; resume with `resume-codex.sh`; hard stop at three rounds. The prompt carries this plan, the ledger, the adversarial ask and the standard's two rules verbatim.
- Step 3: `gh pr create --base dev`, then `gh pr checks <n> --watch`.
- Step 4: the close-out as the PR's final commits, after `git merge origin/dev`: Outcome block, lessons promotion, D12's closed `known-limit` issue, a comment on #1605 for anything left out, `STATUS.md` deleted, `git mv implementations-plan/price-feed-1 implementations-plan/archive/price-feed-1` in its own commit, the index line moved to `archive/index.md`, `bun run check:plans`.
- Step 5: after the merge, `agent-worktree done price-feed-1 --merged`; this session was started inside the worktree, so it has nothing to exit.

## Seeds (not run; orchestrator-owned)

`/goal Phases 1-3 of implementations-plan/price-feed-1/plan.md marked ✓, each gate reported passing; the Codex loop converged on the arc diff; the PR into dev open with the close-out commits; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/price-feed-1 per its plan.md: reality check, next pending step, fast gates after each edit, Codex for decisions, stop at three failures on one step.`
