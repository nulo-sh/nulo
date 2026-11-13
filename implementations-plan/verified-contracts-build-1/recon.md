# verified-contracts-build-1: recon

Base `dev` at `1593cf027`. Two read-only sweeps (one reuse sweep over ten capabilities, one mapper of the approval window, the connect window and their e2e) plus the planner's own reads. The prototype `proto/verified-contracts-3-marks` (head `16abc6b5f`) was read with `git show` / `git diff` only: a reference for the look and the measurements, never a source.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| The popup's channel to the signed list | `PriceSnapshot` (`wallet/services/price/spec.ts:52`) already carries `flaggedTokens` and `tokenIcons` as "the popup's one channel to the signed list"; worker side `snapshotOf` (`price/service.ts:~313`), popup side `listState` / `useTokenFlags` (`composables/usePrices.ts:202`), which the approval window opens at `execute/index.vue:153` and passes down as `marks` | **adapt**: add a `listedTokens` map (key → list symbol and name) beside the icons, built like `tokenIconsOf`; expose `listedAt` from `useTokenFlags` |
| List keys | `listKeyOf(chainId, address)` (`utils/token-flag.ts:9`): case and `0x` normalised, exact chain match | **reuse** |
| Flag outranks listing | `isFlagged` on the same key; the parser never puts a flagged pair in `tokens` (`packages/token-list/src/parse.ts:68-70`) | **reuse**; the resolver still tests the flag first |
| The pinned PrivateFPC | `PRIVATE_FPC_ADDRESS`, `isPrivateFpc` (`wallet/services/fpc/private-fpc-address.ts:3,6`), the same on every chain, pinned by `protocol-fpcs.test.ts` | **reuse** |
| A contract level resolver | none (`git grep -i 'verif\|level'` in `src/utils`, `src/wallet`: only unrelated "verification" and fee wording) | **build new**: a pure `utils/contract-level.ts` |
| The seal glyphs | `packages/design/src/core/glyph-sources.ts` (filled rows already exist: `square-check:20`, `private:29`, `filter-solid:64`), generator `bun run gen:glyphs` (`packages/design/package.json:18`), `glyphs.drift.test.ts` pins sources, output and Tabler 3.49.0 | **reuse**: two rows, `seal` (outline `rosette-discount-check`) and `seal-solid` (`filled/rosette-discount-check`), named as `filter` / `filter-solid` |
| The press | `@nulo/design` `Popover.vue`: controlled `open`, trigger slot, `#content`, Tab stitched back to the trigger, Escape returns focus from inside, closes on scroll, outside press and focus elsewhere; one consumer (`LogsToolbar.vue:39`) | **adapt**: its root and trigger are block `div`s, so a chip cannot sit in a sentence; it ends the panel at the trigger's right edge and clamps the left edge only below 359 px, so a chip near the left edge of a 400 px window puts a 280 px panel off screen; it never opens above, so a chip near the bottom cuts it |
| A chip | none (`Chip`, `ContractChip`, `VerifiedContract`: no hit; `Badge.vue` is a non-interactive label) | **build new**: `components/composite/ContractChip.vue` |
| Token picture | `TokenMark.vue` (`components/composite/general/`), `tokenMarkOf` (`utils/token-icon.ts`), red `warning` badge on a flagged token | **reuse** inside the chip |
| Explorer link | `getContractExplorerUrl` (`wallet/constants/explorers.ts:84`, null at `:63`/`:89`), `explorerDisplayName` (`:30`), the anchor of `IncomingTrustPopup.vue:195-204` (`target="_blank" rel="noopener noreferrer"`, `open` glyph) | **reuse** |
| Short address | `trimAddress` (`utils/string.ts:14`) | **reuse** |
| Wire-text caps | `safeWire` (`execute/humanize.ts:45`), `sanitizeWireString` (dApp name, 64, `DappIdentityBlock.vue:~20`) | **reuse** |
| Legend | `utils/glossary.ts` (`GLOSSARY`, `GLOSSARY_SECTIONS`), Settings → Glossary renders sections generically; `glossary.test.ts` pins every string (`SPEC`) and the section order; `settings/glossary.test.ts:21` pins five sections | **adapt**: a sixth section, as the legend frame drew it |
| Step rows with controls inside | `StepRow.vue` raises its content over a stretched `RowTarget`; a press on a control inside the row stays that control's | **reuse**: a chip button needs no change to the row |
| Skeleton (P139-07 option b only) | `packages/design/src/ui/Skeleton.vue`, already used by `AppFeeLine.vue:45` | **reuse** if picked |

## Facts the plan rests on

- **Where contracts render** (`SendTxSummary.vue`): a step head `<title> on <AddressDisplay call.to>` (`:158`), with `:` and a second line `<TokenMark><amount> from … to …` for a movement (`:160-175`); an authorization line `Lets <caller> move <amount> from <from> to <to>` or `… call <fn> on <consumer>` (`:251-257`). `OperationCard.vue` draws the other surfaces (register_token `:531`, utility `:554`, contract metadata `:570`, private events `:576`, simulate `:600`, the standalone `aztec_createAuthWit` card `:622-665`) and grants through `OperationActionRow`.
- **Symbols today come from the person's own tokens** (`knownTokens`, `execute/index.vue:187`, `tokenAt` / `amountLabel`, `call-surface.ts:72,183`), the picture from the list (`marks.iconFor`).
- **The unreadable call**: `ArgsNotice` (orange title `RAW_TITLE`, a reason per cause with `interface` dotted), `RAW_ADVICE` once per window at `adviceSite` (`OperationCard.vue:~292`: `calls`, `authwits` or none).
- **The fee row's green `square-check`**: `OperationCard.vue:398`, app-paid, not the PrivateFPC, estimate not failed.
- **Load order** (`execute/index.vue:~393-414`): profile and operations awaited; decodes, grants and known tokens started unawaited; `useTokenFlags` reads the snapshot at setup and answers once the worker replies (`mapped`). An absent list and a list that names nothing read alike once mapped.
- **The connect window** names the dApp only through `DappIdentityBlock` (`discover/index.vue:182-188`, testid `discover-dapp-name`); the approval window passes no name testid. `DappIdentityBlock` is a JS `<script setup>` composite whose test parses its style and scans type roles.
- **Teleport roots** `#popover` and `#tooltip` are declared in `popup/app.vue:667-669`; both windows are routes of that app.
- **No Escape handler** in either window (`git grep Escape` over `execute/`, `discover/`, `popup/app.vue`).
- **Complexity**: no accepted baseline entry in `execute/`, `discover/` or `DappIdentityBlock`; `biome lint --only=complexity/noExcessiveCognitiveComplexity` is clean on those directories. `SendTxSummary`'s and `OperationCard`'s scripts are dense: new logic goes in its own module.
- **E2E**: `tests/e2e/execute-steps.test.ts` is the only smoke spec over the approval window (fixture route, armed smoke build); its Tab walk asserts exact counts (7 at rest, 17 open, +2 footer). The smoke profile's network is the seeded default; the held list (`launchExtension({ tokenList: "held" })`, `tests/e2e/fixtures/token-list.ts`) holds Testnet entries `0x…a1` / `0x…a2` and flagged `…f1` / `…f3`, and an artifact run holds the published envelope instead. The fixture's tokens are in-memory `TokenInfo`, not listed. No smoke spec opens the connect window; `connect-*` network specs do. `tx-transfer-row` and `type-roles-windows` (network) read the step head's testids.
- **Runners**: `bun run e2e:agent` (`apps/extension/scripts/e2e/agent.sh`) runs the network config only; smoke runs through `bun run --cwd apps/extension test:e2e`, whose egress guard claims its ports in the same host registry (`tests/e2e/fixtures/egress-guard.ts:207`).

## Open work and collisions

- `gh issue list --state all --search` for `verified`, `chip`, `contract name`, `verification`, `rosette`, `seal`, `Aztecscan`, `unreadable`, `square-check`, `apps list`: no open issue asks for this work. `#1372` (closed) is the header's network chip, unrelated. No issue is closed by this plan.
- Closed known limits nearby: `#674` (a whitespace-only dApp name shows a blank app chip; the build keeps it: no name, no chip), `#625` (a 32-character symbol is never cut in a row), `#1353` (the release smoke cannot prove the flag).
- The prototype is not a source: its levels come from a fixture route, its `levelSummary` is over the complexity budget, its press keeps focus on the chip so the link is unreachable, and a movement in base units loses its amount.
