---
plan: bridge-badge-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 93877b8b1 (rebased from 46dc91c3f before arc 1)
trunk: dev
---

# bridge-badge-1: each bridge's mark as a badge on its token's picture

The owner picked P194-03 = b on page 194 (2026-11-19 22:13Z): "Shield's app icon on cUSDC and Raven House's raven on rUSDC, over the mark's top right at half size, 16 px in a row and 8 px on a chip", with "Also, do the same for cWETH". P194-04 = a keeps Circle's marks on the list as they are. This plan gives a list entry an optional bridge picture (arc 1), makes the wallet draw it over the token's unaltered picture (arc 2), and, only after the written permissions, puts the three badges on the list (arc 3). Recon: [`recon.md`](recon.md). Owner asks and the permission letters: [`OWNER-ASKS.md`](OWNER-ASKS.md).

Codex model: `gpt-6.1-sol` ran every consult (the lane brief names it; the previous Sol generation).

## Outcome & Quality Bar

**For whom.** A person holding cUSDC and rUSDC on Alpha Mainnet who sees two identical USDC circles and cannot tell which bridge each came from. Also the owner, who approves each signed list and must see exactly which picture goes on which token.

**Excellent looks like:**
1. The badge appears on every surface that draws the mark, at one geometry (half the mark, 12 % beyond its top right corner), and the token's own picture is drawn byte for byte as before.
2. No badge ever shows on a token the list does not name at that chain and contract, and never on a flagged token.
3. A 1.3.0 wallet reading the new list behaves exactly as today: same entries, flags and prices, no badge.
4. The publish summary shows each badge change in the token diff the approver already reads, and the approval digest covers it.

**Good enough.** No per-bridge styling in the wallet: the bridge's file carries its own shape. No bridge row on the token page, no tooltip, no glossary entry.

## Assumptions

**Facts** (sources in `recon.md` § Facts unless cited):
- F1. `wallet` mode ignores unknown payload and entry keys; `strict` refuses them (`packages/token-list/src/parse.ts:87-94`). `packages/token-list/src` at HEAD is byte-identical to `v1.3.0`.
- F2. 1.3.0 refuses a new format string: a new signing domain fails its compiled `DOMAIN_PREFIX` (`envelope.ts:12-13`), and a new payload `format` under the old domain fails `parse.ts:239`.
- F3. The envelope cap is 65,536 bytes (`envelope.ts:15`), checked before parsing; the served envelope is 16,491 bytes (sequence 1795127181, after rUSDC).
- F4. A per-entry picture already exists: `icon`, checked by `checkIcon` (`parse.ts:177-181`), dropped in `wallet` mode and refused in `strict`; `selectEntries` keeps every entry field but `priceId` (`parse.ts:291-307`); the digest hashes the whole `tokens` array (`sign.ts:33-35`). Circle's USDC file already repeats byte for byte on three entries.
- F5. A flagged pair is never listed, in both modes (`parse.ts:225-235`). Pictures attach by exact chain and contract (`apps/extension/src/utils/token-icon.ts`).
- F6. The stored list is the envelope string (`stored-shapes.ts:137-142`); no stored shape changes.
- F7. Seven `<TokenMark>` tags, sizes 16, 20, 32, 36; the warning badge sits top −4 px, right −4 px on an `--app-bg` plate (`TokenMark.vue:94-102`). `ContractChip.vue:79` and `TransactionCardLayout.vue:131` pass each mark field by name.
- F8. cWETH is Shield's: Shield's contracts page lists "Clean WETH (cWETH)" at the list's cWETH address (fetched 2026-11-19). cUSDC is Shield's (same page). rUSDC is Raven House's on the owner's word only.
- F9. Shield's app icon takes 13,238 characters as a list picture (cap 3,072). In the sources inspected (both sites, Raven House's docs, Shield's support site), no standalone raven SVG and no public licence for either mark turned up: only a PNG favicon and a wordmark SVG for Raven House.
- F10. `raisesFloor` reads only delists and new flags (`infra/token-list/scripts/floor.ts:15-19`): dropping a badge never raises the floor.

**Inferences** (audits: attack these):
- I1. Circle's "Do not superimpose graphics … on any of Circle's Brand Assets" covers a badge the wallet draws over the unaltered file (moderate to high confidence; token-rusdc-1 research).
- I2. The Send card's warning also marks a blocked token, read from the person's own row (`SelectTokenCard.vue:51-53`, `wallet/services/token/utils.ts:14-17`), not from the list. A listed Token class is probably never blocked; D7 makes the question harmless (worst case: a missing badge).
- I3. Four zero-blur CSS `drop-shadow`s draw a similar outline in Chrome and Firefox. Only a look at both browsers checks it (Phase 2).

**Asks**, answered on page 196 (2026-11-19 23:13:36Z) and in the owner's message after it (`OWNER-ASKS.md` § Answers, verbatim): A1 = a, a badge at every size. A2 = a, the warning keeps the top right. A3: Shield's published `icon.svg`, unaltered, under a raised `bridgeIcon` cap ("Raise the cap. Or try to compress via a library. But it doesn't sound plausible. So raise the cap."); Raven House = b, the raven on a white disc. A4: all three permissions recorded by the owner on 2026-11-19 ("We got Circle's approval. Move on."), so arc 3 is not gated. A5 = b, CC BY 4.0. A6 = a, the page-colour outline.

## Architecture & Implementation

### Format (`nulo-token-list/1`, an additive revision)

- **The field.** An entry gains optional `bridgeIcon`: the picture of the bridge that carries the token, under § Pictures (every rule of `icon` but the size cap, below). Readers draw it only as an image, only as a badge over that entry's own picture. It names no bridge and proves no affiliation: it is the publisher's statement, like `name`.
- **The cap (amended after A3).** `bridgeIcon` takes at most `MAX_BRIDGE_ICON_CHARS` = 16,384 characters, the whole data URL; `icon` keeps 3,072. Shield's published file is 13,238 characters, so 16,384 leaves 3,146 (24 %) for a re-issue; it is the smallest power of two above the file (D13). `isBridgeIcon` and `bridgeIconBytes` apply the picture rule under that cap, beside `isTokenIcon` and `iconBytes`; `checkIcon`, `pictureFindings` and the summary use them for `bridgeIcon` (D14). Every other check of the picture rule is unchanged.
- **The cost, measured with the arc 3 source.** The envelope carries the payload as base64url, so a picture costs 4/3 of its characters there. Two copies of Shield's file plus the raven add 29,102 payload bytes (Shield's two strings 26,476, the raven 2,578, field syntax 48) and 38,803 envelope bytes: the served 16,491-byte envelope becomes 55,294, leaving 10,242 of the 65,536 every shipped wallet enforces (F3). Another Shield-sized badge would not fit. A wallet downloads the whole envelope every six hours with no conditional request (`token-list/service.ts`), so about 39 KB more per fetch, 155 KB a day uncompressed; it stores the envelope string, 39 KB more. It verifies and parses every download before the unchanged-sequence check, and the stored list at each boot (`service.ts:181,236-242`): `readTokenList` on the arc 3 envelope takes 2.3 ms median against 0.7 ms today (Bun, this host, 200 runs). A Shield re-issue at the largest accepted URL (16,382 characters) would leave 1,858 bytes. The signer self-verifies every envelope (`sign.ts:75`), so a list over 64 KiB is refused at signing and never published; the binding constraint on later entries is that envelope, not this cap. A lossless svgo pass (4.1.0, path data, numbers, transforms and group attributes untouched) takes Shield's file from 9,908 to 9,887 bytes (−0.2 %); the default preset reaches 2,531 bytes only by baking the transform and rounding to integers, which alters the mark. Recorded only: the file ships as published. The worker also sends the whole bridge map with every price snapshot to every open price client, one per Home or Holdings row (`TokenCard`), as it already sends every `icon` (10,130 characters today): about 29.3 KB more per snapshot per client, at most one scheduled refresh every three minutes (`PRICE_REFRESH_PERIOD_MINUTES`); no latency was measured, and none was claimed.
- **Key order.** `chainId, address, classId, symbol, decimals, name, priceId, bridgeIcon, icon` (`icon` stays last, `parse.test.ts:154-165`).
- **Rules.** `checkEntry` runs `bridgeIcon` through `checkIcon`: `wallet` mode drops one it cannot accept and keeps the entry; `strict` refuses it. `ENTRY_KEYS` gains the key. `selectEntries`, `readTokenList`, `VerifiedTokenList`, `listSha256` and `signList` need no change (F4).
- **Publisher rule.** `pictureFindings` (`infra/token-list/scripts/check.ts`) requires a README § Pictures row for every `bridgeIcon` as for every `icon`.
- **Version.** The string stays `nulo-token-list/1` (D2). FORMAT.md gains a short "Revisions" list: price feeds (#1612), pictures (#1778), bridge pictures (this arc), each additive and ignored by readers that predate it.

### Wallet (dormant until a served list carries a `bridgeIcon`)

```
readTokenList entries (bridgeIcon rides on each entry) → toSnapshot → TokenListSnapshot.entries
  → snapshotOf (price/service.ts): bridgeIcons = bridgeIconsOf(entries)    // listKey → picture, as tokenIconsOf
  → PriceSnapshot.bridgeIcons (required) → usePrices / useTokenFlags listState: bridgeIconFor(token)
  → TokenMarkLookup.bridgeIconFor (required), TokenMarkOf.bridgeIcon: string | undefined (required)
  → every <TokenMark :bridge-icon>
```

- `bridgeIconFor(token)` is `tokenIconFor(bridgeIcons, token)`: the same key and own-property lookup, no second normaliser. Each adopted snapshot replaces the map whole, as `tokenIcons` is replaced, so a later list without a badge drops it.
- The required fields make `tsc` list every builder of a lookup or a mark (`useTokenFlags`, the `{ iconFor, isFlagged }` literal in `ActivityRowCard.vue:43`, test fakes). No production `?? {}` default.
- **`TokenMark`**: new prop `bridgeIcon?: string`. A sibling `<img data-testid="token-mark-bridge" alt="">` after the logo or initials, drawn when `bridgeIcon` is set and `badge` is false (D7). Width and height `size / 2`; `top` and `right` `−round(size × 0.12)` (−2, −2, −4, −4 px). The outline (A6 a): 1 px under 24 px, 1.5 px from 24 px, four zero-blur `drop-shadow`s in `var(--app-bg)`, so it follows the picture's own shape; A6 b removes it. `@error` hides the badge; a new `bridgeIcon` retries, as the logo does. Sizes go through `:style` (`css-v-bind-ban.test.ts`). The mark stays `aria-hidden` (D8). No size threshold until the owner picks A1 b or c, which is then one condition here.
- **Threading**, the hops `icon` takes: `TokenCard`, `SelectTokenCard` (+ `pages/send.vue`), `pages/tokens/[id].vue`, `TokenSeedRow` (+ `TokensView`), `TokenImportRow` (+ `importIcon`); `tokenMarkOf` + `TransactionCardLayout.vue:131` (activity title rows); `contract-level.ts` `ContractReading` + `contract-chip.ts` `verifiedToken` + `ContractChip.vue:79` (chips); a third function prop `bridgeIconFor` beside `iconFor` and `isFlagged` through `RecentActivityView` → `TransactionsList` → `TransactionCard` / `ActivityRowCard` (and its lookup literal for `buildIncomingCardProps`) and `activity.vue` (D10).

### File-level change map

| Arc | Files |
|---|---|
| 1 | `packages/token-list/src/icon.ts` + `icon.test.ts` (the bridge cap and its checkers); `packages/token-list/src/parse.ts` + `parse.test.ts`; `infra/token-list/scripts/{check,summary}.ts` + `test/{tree,publish}.test.ts` (the summary's token diff is tested in `publish.test.ts`); `infra/token-list/FORMAT.md` (entry row, § Pictures covers `bridgeIcon`, "What a reader does", Revisions); `infra/token-list/README.md` (§ Files, § Invariants, § Pictures prose: a bridge picture needs a row, and the D15 rule; no row yet); `ARCHITECTURE.md` / `SECURITY.md` only where they enumerate entry fields (grep first) |
| 2 | `apps/extension/src/wallet/services/price/{service,spec}.ts` + `service.test.ts`; `utils/token-icon.ts` + test; `composables/usePrices.ts` + `usePrices.test.ts`; `utils/contract-level.ts`, `components/composite/contract-chip.ts`; `TokenMark.vue` + test; `ContractChip.vue` + test; `activity/TransactionCardLayout.vue` + test; `ActivityRowCard.vue`, `TransactionsList.vue`, `RecentActivityView.vue`, `pages/activity.vue`; the other hosts above; `tests/helpers/price-client-fake.ts`; `popup/windows/execute/execute.fixture.ts`; test mocks that build a `PriceSnapshot` or a `ListReader` (at least `TokenList.test.ts`, `TokensView.test.ts`, `SelectTokenPopup.test.ts`, `RecentActivityView.test.ts`, `activity.test.ts`, `contract-level.test.ts`, `fee/index.test.ts`, `journal-state.test.ts`, `received-display.test.ts`, `OperationCard.fee.test.ts`; `tsc` and the run name the rest); `tests/e2e/token-list.test.ts` (a list override with one `bridgeIcon`, through `signTestList`'s options) |
| 3 | `infra/token-list/list.source.json` (`bridgeIcon` on cUSDC, cWETH and rUSDC); `infra/token-list/README.md` § Pictures rows (provenance, terms, the written permission and its date) |

No new file under `packages/token-list/src` (`import-closure.test.ts`). No new dependency.

### Trade-offs and alternatives not taken

- **A `bridge` field plus a signed `bridges` table of `{name, icon}`** (the first draft, modelled on `priceId` + `priceFeeds`): one picture per bridge and a name for other readers. It adds a payload key, fields on four types, digest and signer changes, a cap, two-way coverage, four tolerance rules and table parsing in the summary, to save about 4 KB per repeated picture (the format already repeats Circle's file) and to carry a `name` nothing reads. Rejected in round 1 (D1).
- **A composite picture baked into the list** (USDC with the badge drawn in): no wallet change, no release. It alters Circle's file, cannot fit 3,072 characters without redrawing both marks, and the owner's pick names the format, extension and release route. Rejected.
- **A larger picture budget for bridge pictures** (fit Shield's 13,238-character file as published): rejected in planning as a second budget for one caller (D6), then taken on the owner's A3 answer (D13).
- **One copy of Shield's file through a table** (D1's rejected form): saves about 17.7 KB of envelope now that the repeated picture is 13 KB. Not reopened: the table's cost (a payload key, coverage, tolerance rules) still stands, the envelope keeps 10 KB of headroom, and a later list that needs the room can move to it as an additive revision.

## Security & Adversarial Considerations

- **Who can put which badge on which token.** Only the owner-approved `sign` run: `bridgeIcon` is in the signed payload and in the `tokens` digest the approver approves. A host, DNS or CDN attacker cannot add or move one (signature). It can serve a fresh install an older signed list (known limits #386, #1610); a withdrawn badge never raises the floor (F10), so such a host can show it until an unrelated list raises the floor. On a revoked permission, raising the floor by hand in that publish PR is the owner's call; no new mechanism. A leaked key (#385) could badge any token it lists, a power it already has over the token's picture and name.
- **A look-alike never borrows a badge.** A deployer or dApp can create or register a contract with the symbol `cUSDC`; the badge, like the picture, attaches only by exact chain and contract (F5), so the look-alike draws initials and no badge. Arc 2 proves it with a never-happens test beside its success control.
- **A flagged token never shows a badge.** The parser refuses a list that lists and flags one pair (F5), and `TokenMark` draws the warning instead of the badge if both ever arrive (D7). A badge never replaces or hides the warning.
- **Pictures.** `bridgeIcon` passes `isTokenIcon` under its own cap (no `image`, `href`, `filter`, outside `url(`, `on*`; 16,384 characters), is covered by the signature and needs a README § Pictures row by SHA-256 (`check.ts`). The wallet draws it only as `<img>`: no script, no outside load. A larger file is more of the same drawing elements under the same checks; it changes nothing the `<img>` boundary relies on. The outline is the wallet's CSS, not picture content.
- **Availability.** A bad `bridgeIcon` drops alone (`wallet` mode); it never costs the entry or the list's flags. Arc 3 takes the envelope from 16,491 to 55,294 bytes of the 64 KiB cap (§ Format, the cost; closed limit #1786); the signer refuses an envelope over the cap, so no wallet is ever served one from this host. A 1.3.0 wallet drops an over-3,072 `bridgeIcon` field with the rest of the unknown key, so the larger cap changes nothing for it.
- **What a badge claims.** That the publisher believes the token comes through that bridge. The chain is not asked; arc 3's review checks each address against the bridge's public contracts page or its written confirmation, and the PR cites the source.
- **Brand and legal.** The owner recorded all three permissions on 2026-11-19 (A4); README § Pictures records each in the picture's row. A bridge picture is issued as published or, where it differs from the issuer's published mark (the raven on its disc), used only as the issuer approved.
- **Supply chain, crypto, least privilege.** No new dependency, key or workflow permission; Ed25519 signing is unchanged.

## Phases

All gates add `bun run lint` and `bun run typecheck:all`, exit 0. Plan files: `bun run check:plans` after staging.

### Phase 1 (arc 1): the format, parser, checker and summary

1. Add `MAX_BRIDGE_ICON_CHARS`, `isBridgeIcon` and `bridgeIconBytes` to `icon.ts`; add `bridgeIcon` to `TokenListEntry`, `ENTRY_KEYS` and `checkEntry` in `parse.ts`, through `checkIcon` with the bridge cap, before `icon`.
2. Extend `pictureFindings` to `bridgeIcon`, and give `summary.ts`'s token diff a `bridgeIcon` column through `iconCell`.
3. Update FORMAT.md and `infra/token-list/README.md`.
4. Prove forward compatibility: copy `packages/token-list/src` at `v1.3.0` into a scratch directory outside the repo. Sign two envelopes with the test keys and identical signing inputs (`nowMs` included) from one source with non-empty `flagged` and `priceFeeds`: one with `bridgeIcon` fields, one without. Read both through that copy's `readTokenList`. Record in `lessons/phase-1.md` that the two results are equal.

Tests: the cap bounds the whole data URL at each budget (largest accepted, four more refused); `icon` still refuses a picture `bridgeIcon` accepts; `wallet` mode drops a `bridgeIcon` that fails the picture rule and keeps the entry; `strict` refuses it; key order; `readTokenList` keeps a valid `bridgeIcon` on the selected entry. Tree test: a `bridgeIcon` with no README row is refused; with one, accepted. Summary: the column renders a changed `bridgeIcon`.

**Validation gate:** `bun run --cwd packages/token-list test`, `bun run --cwd infra/token-list test`, `bun run --cwd infra/token-list check`, `bun run test:all`, all exit 0; the step-4 proof logged. Layers: typecheck, lint, unit.

### Phase 2 (arc 2): the wallet draws the badge

1. Add `bridgeIconsOf` to `token-icon.ts` and `PriceSnapshot.bridgeIcons` to `snapshotOf`.
2. Add `bridgeIconFor` to `listState`, `usePrices`, `useTokenFlags` and `TokenMarkLookup`; add `bridgeIcon` to `TokenMarkOf`, `tokenMarkOf`, `ContractReading` and `verifiedToken`.
3. Add the `bridgeIcon` prop and the badge to `TokenMark`.
4. Thread `bridgeIcon` to every host in the change map.
5. In `token-list.test.ts`'s existing scenario, sign the source-run list with a `bridgeIcon` on one entry (the source's GBPC letter mark, a Nulo-drawn file) through `signTestList`'s options; assert that row's `token-mark-bridge` decodes and the other listed row has none; take a `shotSend` frame there.

Tests: price service: the snapshot maps an entry's `bridgeIcon` by list key. `token-icon.test.ts`: a look-alike at another contract or chain gets no bridge picture, beside the listed contract that does. `usePrices.test.ts`: a later snapshot with `bridgeIcons: {}` removes the badge, through `usePrices` and through `useTokenFlags` with fiat off. `ContractChip.test.ts`: a chip model built by `verifiedToken` from a `readContract` reading carries the bridge picture to `TokenMark`. `TransactionCardLayout.test.ts`: a `titleMark`'s `bridgeIcon` reaches `TokenMark`. `TokenMark.test.ts`: the badge draws after the logo at half size and the computed offset; it draws over initials too; none without `bridgeIcon`; none when `badge` is true, with the unflagged control; hidden after `@error`; the mark stays `aria-hidden` with no tab stop. Update the existing first-`img` and single-`Icon` pins only where the new sibling forces it.

E2E budget: no new scenario; the override stays inside `token-list.test.ts`, so no other spec's list changes. Estimated under 1 s per browser, measured in the PR. The failure mode only a browser shows: the picture crossing the real worker → popup channel and decoding under the extension's CSP.

**Validation gate:** `bun run audit:vue` (typecheck, test and lint, then the production build) and `bun run test:all`, exit 0. Smoke, Chrome then Firefox, from `apps/extension`: `bun run test:e2e -- tests/e2e/token-list.test.ts tests/e2e/execute-steps.test.ts tests/e2e/rows.test.ts tests/e2e/send-picker-add.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`, all green. Look at a 16 px chip and a 32 px row, resting and hovered, with a bridge picture, light and dark, in Chrome and Firefox (I3); attach the frames to the PR and record any visible difference from the owner's P194 frame. Layers: typecheck, lint, unit, component, smoke e2e.

### Phase 3 (arc 3): the entries and pictures, after the permission gate

The owner answered A3, A5 and A6 and recorded every permission A4 names on 2026-11-19; the phase is not gated.

1. Add `bridgeIcon` to cUSDC and cWETH (Shield's file) and rUSDC (Raven House's file), the files A3 settles.
2. Add one README § Pictures row per bridge picture: picture, "badge on …", drawn by, source, terms (the permission and its date), SHA-256.
3. Re-check cUSDC's and cWETH's addresses against Shield's contracts page and rUSDC's against the source #1886 used; cite them in the PR body.
4. Point `token-list.test.ts`'s override at cUSDC's `bridgeIcon` from `list.source.json` (Shield's 13,238-character file) and assert it decodes (`naturalWidth > 0`), Chrome and Firefox: the real file through the worker → popup channel.
5. Repeat Phase 2's look at the chip and the row with the final files (16 px chip and 32 px row, resting and hovered, both themes, both browsers), plus one Home frame with the three tokens in each theme; attach the frames.

**Validation gate:** `bun run --cwd infra/token-list check` and `bun run --cwd infra/token-list test`, exit 0; `bun run test:all`, exit 0; from `apps/extension`, `bun run test:e2e -- tests/e2e/token-list.test.ts --retry=0`, Chrome then Firefox, green. Layers: typecheck, lint, unit, smoke e2e.

## UI impact

- **Token mark, every surface** (Home, Holdings and Send picker rows, the Send card, the token page header, activity title rows, contract chips in the dApp, fee and activity windows). Before: the token's picture, with the warning top right when flagged. After arc 2: unchanged on today's served list. After arc 3: Shield's or Raven House's picture over the top right of cUSDC, cWETH and rUSDC, as frames `bb-size-a-*`. Sign-off: P194-03 = b for the badge; A1, A2 and A6 for sizes, the warning and the outline; A4 before arc 3.
- No copy, layout, row or format change anywhere else.

## Delivery

One `gh stack` on trunk `dev`. Every arc: the Post-implementation loop at its boundary, then `gh stack add` for the next. `code_review: off` on every arc. No issue tracks this lane: PR bodies cite page 194 (P194-03 = b, P194-04 = a) instead of `Closes`.

| Arc | Branch | Phases | PR title (≤ 92) |
|---|---|---|---|
| 1 | `worktree-bridge-badge-1` (holds the plan commit) | 1 | ``feat(token-list): an entry's optional `bridgeIcon`, signed with the list`` |
| 2 | `bridge-badge-1-wallet` | 2 | `feat(extension): draw a listed token's bridge picture as a badge on its mark` |
| 3 | `bridge-badge-1-entries` | 3 | ``feat(token-list): shield and raven house badges on `cUSDC`, `cWETH` and `rUSDC` `` |
| close-out | `bridge-badge-1-close-out` | close-out | `docs(plans): close bridge-badge-1` |

Arc 3's PR opens as a normal PR (A4 answered). Merging it starts `publish-token-list.yml`, whose sign job waits for the owner. Parallelism: arc 2 needs arc 1's type, arc 3 both; no lanes.

## Decision ledger

| # | Decision | Alternatives and why not | Panel |
|---|---|---|---|
| D1 | Per-entry optional `bridgeIcon` (revised in round 1) | `bridge` + `bridges` table: Opus showed its reasons fail (repetition already accepted, withdrawal edits every entry either way, `name` unread); Codex changed its view and agreed | Opus, Codex, lead agree |
| D2 | Keep `nulo-token-list/1`; add a Revisions list to FORMAT.md | `/2` + `/v2/`: every 1.3.0 wallet would refuse the list (F2) for an additive change | all agree |
| D3 | `wallet` mode drops a bad `bridgeIcon` and keeps the entry, as `checkIcon` does for `icon` | Refuse the entry or list: a cosmetic field would cost a wallet entries or flags | all agree |
| D4, D5 | Withdrawn with the table (a record `name`; `MAX_BRIDGES`) | — | round 1 |
| D6 | `bridgeIcon` under the token picture rule; its cap superseded by D13 | — | all agree; owner A3 |
| D7 | Ships: the warning keeps its corner and wins over the badge (A2 a) | Move the warning (A2 b, c): changes every flagged token for a clash the parser forbids | all agree; owner A2 |
| D8 | Accessibility call (owner's 2026-10-19 delegation): the badge is decorative inside the `aria-hidden` mark; the symbol stays the name a screen reader reads | An accessible name per badge: spoken copy is an owner question, and no name is carried | all agree |
| D9 | No new e2e scenario; a list override and assertions inside `token-list.test.ts` | A shared fixture change: alters the list for about 15 specs (Opus) | all agree |
| D10 | A third function prop beside `iconFor` and `isFlagged`; required lookup and mark fields so `tsc` finds every builder | One `marks` lookup prop: edits the same files and renames two existing props; either is acceptable | all agree |
| D11 | Arc 3 waits on A4; if still closed, the close-out files it as a `blocked:external` issue. Does not apply: A4 answered | Hold the plan open for weeks on outside replies | lead; owner A4 |
| D12 | Geometry from the P194 frame (half size, 12 % overhang); the page-colour outline is owner ask A6 | Per-bridge plates and radii as the mock-up drew: bridge-specific code; a surface-colour variable per host: wiring and hover states for one look (Codex) | Opus, Codex: ask the owner; owner A6 = a |
| D13 | `bridgeIcon` cap 16,384 characters (owner A3: "Raise the cap"; on the list-size cost, 2026-11-19 about 23:50Z: "I accept the cost.") | 14,336 (8 % headroom: a re-issue a few hundred bytes larger fails); 32,768 or none (only the envelope bounds it, so one field could take half the list) | Codex: 16,384 reasonable, the power of two has no technical merit; lead keeps it |
| D14 | One private checker with the cap as a parameter; one-argument exports `iconBytes`/`isTokenIcon` and `bridgeIconBytes`/`isBridgeIcon`; `MAX_BRIDGE_ICON_CHARS` beside `MAX_ICON_CHARS` in `icon.ts` | A defaulted cap parameter on the existing exports (the first build): `every(isTokenIcon)` in `token-icon.test.ts` bound the array index as the cap and failed (demonstrated by `test:all`) | Codex: either acceptable; the run decided |
| D15 | README § Pictures: a bridge picture is issued as published or, where it differs from the issuer's published mark, used only as the issuer approved, with the approval in its row | No rule: the raven on its disc would read as a breach of "used as published, unaltered" | lead (the brief's wording) |

## Audit verdicts

**Round 1, Codex** (`gpt-6.1-sol`, high): `conditional approve (with conditions: complete the forwarding map, strengthen approval/removal tests, and verify the final badge rendering)`. Accepted, all verified against the tree:
1. `ContractChip.vue:79`, `TransactionCardLayout.vue:131` and `ActivityRowCard.vue:43` were missing from the threading (demonstrated): named, with component tests.
2. A digest test for a table-only change (plausible): moot after D1; `bridgeIcon` sits in `tokens`, which the digest already hashes whole.
3. A later list must remove the badge (plausible): the replacement test through `usePrices` and `useTokenFlags`.
4. The outline is unverified across browsers (plausible): the two-browser look at a chip and a row, resting and hovered.
5. The letters promised removal without the replay limit (demonstrated): reworded.
Also accepted: reuse `tokenIconFor`; the forward-compatibility proof compares against the same list without the field, with flags and feeds. Recon's `index.ts` and `icon.ts` line numbers were wrong (demonstrated): fixed.

**Round 1, Opus** (Plan): `conditional approve (with conditions: decide D1 again …, name the two template files … make the new fields required …, put the D12 ring in front of the owner and describe it in the letters)`. Accepted: D1 reversed after the Codex follow-up; the two templates named and the fields made required; the outline made A6, with a halo frame (the chip's `--nulo-surface-low` and the row's hover differ from `--app-bg`), and the letters describe it; the test-mock churn listed; the e2e bridge kept out of the shared fixture; the replay "bound" reworded (F10); the A1 threshold dropped until picked; I2 restated. Moot after D1: the wallet-mode cap cliff, the unread `name`.

**Round 1 follow-up, Codex** (same session) on D1, the outline and the accepted list: "per-entry `bridgeIcon`; I change my recommendation"; the outline is an owner ask about the visible result, with no generic CSS that can match every surface; the rest accepted, with a positive chip test through `readContract` → chip model → `TokenMark` (added).

**Final fresh Codex pass** (new session, `gpt-6.1-sol`, high): ``conditional approve (with conditions: add `bun run audit:vue` to the Phase 2 gate)``. Accepted: `audit:vue` in the Phase 2 gate (demonstrated: CLAUDE.md § Quality gates requires it before a UI PR); F2 restated (the signing domain and the payload field are separate checks); F9 restated as what the inspected sources showed, not an exhaustive absence; F10's citation fixed; the compatibility proof signs both envelopes with identical inputs. It found the threading complete and the per-entry design the smallest right one, and kept A3, A5 and A6 as answers Phase 3 needs. Resumed to verify the fixes: `approve` ("All accepted fixes are present … No regression or new material finding identified").

**Amendment, Codex** (`gpt-6.1-sol`, high, on the `bridgeIcon` cap after A3): `conditional approve` ("retain 16,384; correct the cost claims and strengthen the large-image validation gates"). Accepted: the cost figures corrected (Shield's strings 26,476 plus 48 bytes of syntax; the largest accepted URL 16,382, leaving 1,858; verification runs per download and per boot, now benchmarked); the tree and summary tests use a bridge picture above 3,072 beside an `icon` that still fails; Phase 3 decodes Shield's real file in both browsers. Found no CSP, transport or regex obstacle (`img-src 'self' data: blob:` in both manifests).

**Arc 1, Codex** (`gpt-6.1-sol`, high): round 1, one P3 (FORMAT.md and the cap's comment stated a publishing policy that omits D15's approved alteration): fixed in a docs commit. It loaded the `v1.3.0` reader on its own and found the same equal results. Round 2 (resumed): "Clean … No regressions or new comment findings."

**Arc 2, Codex** (`gpt-6.1-sol`, high): round 1, two P3s: the e2e's plain-row check could pass with the row gone (now asserts the row's mark first), and two `TokenMark` comments (an arithmetic restatement; "as published" against D15). Fixed. It found every surface threaded, the JS SFCs included, and the warning path and snapshot replacement correct. Round 2 (resumed): "Clean … No regressions or new findings in the fix diff."

**Arc 3, Codex** (`gpt-6.1-sol`, high): round 1, "Clean — no findings (high confidence)." It decoded all three pictures to their rows' SHA-256, matched both Shield copies to the published file and the raven's paths to the published wordmark, found only the three keys added and the source canonical, reproduced 55,294 envelope bytes, found no active or external content in either SVG, and showed the e2e fixture throws if cUSDC loses its picture.

**Cross-arc, Codex** (fresh session, `gpt-6.1-sol`, high, `git diff 93877b8b1..HEAD`): round 1, one P3: the e2e fixture read cUSDC's bridge picture at import, so withdrawing it would fail every smoke file importing the fixtures, not only the spec that draws it; now read on call (`e2eBridgeIcon()`). Its cost caveat (the bridge map rides every price snapshot to every open row's client) is recorded under The cost, not changed: the snapshot already carries every `icon` the same way.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard at revision `46dc91c3f`. Plan-specific values:

- **Reviewer**: Codex, `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; resume with `resume-codex.sh`. Prompt: the arc diff, this plan with its ledger, the arc map ("arc N of 3; later arcs build …"), the adversarial ask and the two verbatim rules of step 2.
- **Placement**: per arc at its boundary while it is the stack tip; then one fresh Codex session over the net diff from `93877b8b1` for cross-arc issues. Until clean; **hard stop after three rounds**, then report.
- **Delivery**: `gh stack submit --auto`, then `gh pr edit` per body; open each PR without labels and add `e2e:extension-smoke` only if the path filter skips a needed suite. Then `gh pr checks <n> --watch`.
- **Close-out** (`bridge-badge-1-close-out`): merge `origin/dev` first and read `index.md` and `lessons.md`; the Outcome block; lessons promotion; arc 3 as a `blocked:external` issue if D11 applies; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans`.
- **Approval boundaries**: nothing merges before the orchestrator's word; no sign run, list publish or release from this plan; a fix that grows the design stops for approval.
- **Teardown** after the close-out merges: `agent-worktree done bridge-badge-1 --merged` (trunk `dev` is origin's default).

## Seeds (draft until the approval gate)

```
/goal Phases 1 and 2 of implementations-plan/bridge-badge-1/plan.md marked ✓, each backed by its validation gate passing in the transcript; LESSONS_FILE printed per phase; the Codex loop converged on each arc and on the cross-arc pass, each convergence quoted; phase 3 run only if OWNER-ASKS.md A4 is recorded as granted, else filed per D11; the stack's PRs exist on GitHub (gh stack view in the transcript), opened only after the loops, with the close-out archiving the plan; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/bridge-badge-1 forward per its plan.md (read it and lessons/ first, from the stack's top layer). Pick the next pending step, run the fast gates after each edit, commit signed, gh stack push. At a phase end run its full gate and mark ✓; at an arc end run the Codex loop before gh stack add. Decide open questions with Codex (gpt-6.1-sol, high) and log them; never start phase 3 before A4 is granted; never merge, publish, sign or release. When the close-out is merged (git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/bridge-badge-1/plan.md), run agent-worktree done bridge-badge-1 --merged and stop.
```

Recommended: `/goal` (completion is visible in the transcript). Use exactly one per session.
