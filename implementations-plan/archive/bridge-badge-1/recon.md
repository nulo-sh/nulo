# bridge-badge-1: recon

Base: `dev` at `46dc91c3f` (after #1886 listed rUSDC and the 1.3.0 sync). Two read-only explorers (list pipeline; `TokenMark` and its surfaces) plus the lead's own reads. Line numbers were rechecked after Codex found two wrong citations. `packages/token-list/src` and `apps/extension/src` are byte-identical to the `v1.3.0` tag, so every line cited below is also the 1.3.0 line.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A field on the entry naming a row of a signed table | `priceId` + `priceFeeds` (`packages/token-list/src/parse.ts:114-163`, `selectEntries` at `parse.ts:291-307`, `readTokenList` at `index.ts:64-75`): spelling check, table checker that drops a bad record in `wallet` mode, two-way coverage in `strict` mode, the verified list keeps only feeds a kept entry names | not used: the first draft's table was rejected in round 1 (plan D1) |
| Unknown-key tolerance | `record()` (`parse.ts:87-94`) enforces key sets only in `strict` mode; `checkEntry` rebuilds the entry from named fields | reuse as is |
| Picture rule | `isTokenIcon` / `iconBytes` (`icon.ts:9-80`): 3,072 characters, SVG `data:` URL, element allowlist, no `href`, `filter`, outside `url(` | reuse as is for bridge pictures |
| A per-entry picture | `icon` through `checkIcon` (`parse.ts:177-181`): dropped in `wallet` mode, refused in `strict`; `selectEntries` keeps it; the `tokens` digest covers it | reuse as is for `bridgeIcon` |
| Digest the approver signs off | `listSha256({tokens, flagged, priceFeeds})` (`sign.ts:33-35`) hashes every entry field | reuse as is |
| Publish summary | `summary.ts` token diff, `iconCell` (`summary.ts:94-99`) | adapt: a `bridgeIcon` column |
| README picture provenance check | `pictureFindings` (`infra/token-list/scripts/check.ts:27-43`): every entry's icon SHA-256 must have a row in README § Pictures | adapt: bridge pictures too |
| Worker → popup channel | entries ride `toSnapshot` (`apps/extension/src/wallet/services/token-list/service.ts:277-279`) unchanged → `snapshotOf` (`wallet/services/price/service.ts:319-329`) → `PriceSnapshot` (`price/spec.ts:53-61`) → `usePrices` / `useTokenFlags` `listState` (`composables/usePrices.ts:27-70`) | adapt: `bridgeIcons` keyed as `tokenIcons` |
| Per-token lookup by chain and contract | `tokenIconsOf` / `tokenIconFor` / `tokenMarkOf` (`utils/token-icon.ts`), `listKeyOf` (`utils/token-flag.ts:57`) | adapt: `bridgeIconsOf`, `bridgeIconFor`, `TokenMarkOf.bridgeIcon` |
| The mark | `TokenMark.vue` (`components/composite/general/TokenMark.vue`): sizes 16, 20, 32, 36; `<img>` with initials fallback; warning `Icon` at top −4 px, right −4 px on an `--app-bg` plate; whole mark `aria-hidden` | adapt: a sibling `<img>` for the bridge picture |
| Stored state | `nulo:core:token-list` keeps the envelope as an opaque string (`stored-shapes.ts:137-142,244`); entries are re-parsed on every boot | reuse: no stored-shape change, no `baseline:storage` stamp |
| Floor | `raisesFloor` (`infra/token-list/scripts/floor.ts:170-174`) reads only the pairs of `tokens` and `flagged` | untouched |
| Capture method | the token-rusdc-1 capture page (real `TokenList`, `ContractChip`, vite + puppeteer, outside the repo) | reused for this lane's frames |

`build new`: nothing. Every piece extends an existing one.

## Facts the plan rests on

- **1.3.0 reads an extended list.** `wallet` mode ignores an unknown payload key and an unknown entry key (`parse.ts:87-94,184,193-203`). It refuses a changed `format` (`parse.ts:239`; the format string is also the signature's domain prefix, `envelope.ts:12-13`) and an envelope over 65,536 bytes (`envelope.ts:15,107`; `service.ts:252-253`, which keeps the stored list).
- **A flagged pair is never listed**, in both modes (`checkFlagged`, `parse.ts:225-235`). A list that lists and flags one pair is refused whole.
- **Pictures attach by exact chain and contract**, never by symbol (`token-icon.ts:1-4`, `tokenIconFor`). A user-added token at a listed contract is that contract and takes its picture and flag; a look-alike at another contract takes neither.
- **TokenMark call sites** (7 tags; `titleMark` forwarded by 3 hosts): `TokenCard.vue:101` (32: Home, Holdings, Send picker), `SelectTokenCard.vue:112` (36: Send card), `pages/tokens/[id].vue:233` (20: token page), `TokenSeedRow.vue:40` and `TokenImportRow.vue:61` (32: Home), `TransactionCardLayout.vue:131` (16: activity title row), `ContractChip.vue:79` (16: windows, activity). No other component draws a token picture (searched `<img`, `TokenIcon`, `AssetIcon`, `token-icon`, `tokenInitials`, `logo` across `apps/extension/src/**/*.vue`).
- **The warning badge also marks a blocked token on the Send card** (`SelectTokenCard.vue:51-53`, `badge = flagged || isTokenBlocked`). A listed entry is a bundled Token class with both transfer kinds, so a listed token is never blocked.
- **The envelope today**: 13,783 bytes for 7 entries; closed known limit #1786 records the 64 KiB budget.
- **cWETH is Shield's.** Shield's contracts page lists "Clean WETH (cWETH)" on Aztec mainnet (v6) at `0x2a36cedc4f7fa6bd9fbb77ab799737f30d12cd86ffa9d9d63737d51a6e7247fe`, the list's cWETH address (`https://support.shield.human.tech/contracts`, fetched 2026-11-19, the address read from the page source).
- **The bridge pictures** (measured 2026-11-19):
  - Shield's app icon `https://shield.human.tech/icon.svg`: 9,908 bytes, 13,238 characters as a list picture. Its elements pass the rule; its size does not. Rounding every coordinate to an integer still leaves 5,434 characters. Fitting 3,072 needs a new drawing.
  - Raven House publishes no raven alone: a 256 px PNG favicon (the rule takes SVG only) and a 159 × 44 wordmark SVG (7,473 bytes). The wordmark's four raven paths, cut out with a square `viewBox`, make a 2,442-character picture that passes the rule; on a white disc, 2,578.

## Collisions and risks

- `badge` already means the warning (`TokenMark` prop, `TokenMarkOf.badge`, `.badge` class). New names say `bridge`.
- `execute-steps.test.ts` reads `[data-testid="token-mark"] svg` as "flagged": the bridge picture must be an `<img>`, never an `Icon`.
- `TokenMark.test.ts` pins the first `img` as the logo and one `Icon` when flagged: the bridge `<img>` goes after the logo.
- `rows.test.ts` measures the mark's box: the badge is absolutely positioned and leaves the box alone.
- `import-closure.test.ts` pins the signer's file set: no new file under `packages/token-list/src`.
- `parse.test.ts:154-165` pins `icon` as the entry's last key: `bridge` goes before `icon`.

## Open work and known limits

- No open issue covers a bridge badge (`gh issue list --state all --search "badge"`, `"bridge token icon"`).
- #1882 (rUSDC on the list) is open but landed in #1886; this lane does not touch it.
- Closed limits that bear on the design: #1786 (envelope budget), #386 and #1610 (a host can serve a fresh install an older list), #387 and #385 (a leaked key).
