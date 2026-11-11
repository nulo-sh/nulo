---
plan: token-icons-build-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev 32fd50e60
post_implementation_standard: implementations-plan/README.md § Post-implementation standard at 32fd50e60
---

# token-icons-build-1: the token pictures, as signed on pages 124 and 129

The signed token list carries each listed token's picture, and the wallet draws it, round and unaltered, on the six surfaces the render lanes drew; the token rows wait on the owner's answer to A4 (D17). A token with no picture gets a grey circle with one or two letters. A flagged token gets the red corner badge. Three PRs, stacked: the list, then the surfaces in two parts.

## Outcome & Quality Bar

- **For whom**: a person who holds a listed stablecoin and a look-alike that copies its symbol, reading Activity or approving a transfer in a 400 px window.
- **Excellent**:
  1. A listed token shows its issuer's logo as published on every surface, in both themes and both browsers; a token not on the list never does.
  2. A list without pictures, a refused picture, or a picture that fails to decode leaves the wallet as it reads today, plus the grey initials. Nothing breaks and nothing is logged at `warn`.
  3. The publish workflow cannot sign an entry without a picture, a picture that fails the declared checks, or a picture whose provenance the README does not record.
  4. Every existing `data-testid` stays; nothing outside the mark moves.
- **Good enough**: the 16 px marks are below Circle's stated minimums; the owner accepted that in M1 ("at the sizes the surfaces need").

## Assumptions

### Facts (verified at `32fd50e60`)

- F1. No entry carries a picture; strict parsing refuses an unknown key and wallet mode drops it (`packages/token-list/src/parse.ts`, `record()`, `checkEntry`).
- F2. The envelope is at most 65,536 bytes (`envelope.ts:15`); the wallet caps the fetch there; `signList` verifies its own envelope, so it refuses an oversize list. The format caps 16 entries per chain and 1,024 in all (`parse.ts:32-34`).
- F3. The tree check parses the committed envelope strictly (`infra/token-list/scripts/check.ts:79`) and the source through `checkSource` (`check.ts:22-30`); the publish workflow runs it before `sign` (`publish-token-list.yml:53`), and `quality-status` runs it on every PR.
- F4. The list has six entries: Test USDC, USDT, EURC, GBPC on Testnet, and `cUSDC`, `cWETH` on Mainnet (`2070860441`, formerly Alpha), named as bridged in the render lane's report.
- F5. The popup's one channel to the list is `PriceSnapshot` (`flaggedTokens` rides on it whatever the fiat setting); the approval window reads it network-free through `useTokenFlags`.
- F6. CSP is `img-src 'self' data: blob:` with `script-src 'self' 'wasm-unsafe-eval'` (no inline script) for both browsers (`apps/extension/manifest/manifest.config.ts:51`, pinned by `manifest.test.ts:132`); no change is needed.
- F7. Pictures reach the stored envelope bytes (`nulo:core:token-list`), never a stored token row: `seedsFromList` copies named fields only (`token/default-tokens.ts:31-39`). No storage stamp, no migration.
- F8. Issuer files, hashed locally (recon.md § Issuer marks): USDC 1,309 B, EURC 1,678 B, USDT 1,145 B; the largest data URL is 2,266 characters; none uses `&`, `\`, `<!`, `<?` or an element outside the allowlist below.
- F9. Flagged pairs and entries are disjoint in both modes (`checkFlagged`), so a flagged token never has a list picture.
- F10. `listSha256` hashes the tokens with their icons (`sign.ts:33-35`), so `sign` refuses a picture the approver's digest did not cover.
- F11. No issue matches in any state (2026-11-10): no `Closes`, no `Part of`; refreshed at delivery.
- F12. Privacy § 5.11 and the store listing describe the list's host and timing; pictures add no host and no request, so no legal text changes.

### Inferences

- I1. Capacity, by arithmetic: a picture costs about 4/3 × its data URL in the envelope (base64 inside a base64url payload). Six pictured entries come to about 15 KB. About 16 entries with 2 KB files reach 64,785 B (Codex, in memory), so with L3 the list holds roughly 14 to 20 entries, depending on the files. Today's six fit; the limit is a closed `known-limit` issue at close-out (reopening: the owner needs more entries or flags than fit).
- I2. The browsers draw a `data:image/svg+xml` image with script and external loads off; declarative animation and filters still run. The allowlist below refuses SMIL elements, `<style>` (so no `@keyframes`) and every spelling of `filter`, so the drawing is static.

### Asks (OWNER-ASKS.md; the arcs build the "what ships now" form)

- A1. The look of Nulo's letter mark for GBPC and `cWETH`. Ships in the list: a disc in Nulo's accent `#a8480c` with a white geometric letter. The owner sees the sheet in arc 1's PR body and decides at the `sign` approval.
- A2. `cWETH` has no issuer logo; ships: Nulo's "W" letter mark under L3.
- A3. Home's seed, import and skeleton rows beside the cards (arc 2); ships unchanged.
- A4. The rows' 32 px mark against P46-08's two-line dollar figure (arc 2); ships: the rows without a mark (D17).

## Sign-offs (verbatim; the whole visible budget)

- **P124-02 = S1**: "An icon field inside the signed list: a data: image per entry under a per-icon byte budget (SVG drawn only as an image, never injected as markup; or a 32 px raster). One signed artefact covers the pictures; no new host, no new request kind."
- **P124-04 = AC1**: "A 16 px mark before the row title, as prototyped; the 40 px box keeps chips-3's pair and badges. The one place the look-alike problem is visible gets the picture."
- **P124-05 = AL1**: "Defer the words to the verified-contracts page (one vocabulary for what Nulo knows, tokens included); the line takes P124-01's picture, if any, in the meantime."
- **P129-01 = A**: "Back to A, page 124's recommendation: the issuers' logos as published, round, unaltered, initials in a grey circle when there is none, the red badge when flagged. Its frames are on P124-01." Page 124's A: "Issuers' logos, round, at 16 to 36 px, for every listed token that has one; a grey circle with one or two letters for a token with none (custom, GBPC, flagged); the red corner badge on a flagged token. The picture comes with the signed list (P124-02 picks how)".
- **P129-02 = M1**: "Issuers' logos as published, unaltered, at the sizes the surfaces need, for listed tokens including the test and bridged ones; B-style recolouring is off the table."
- **P129-03 = L3**: "A publisher rule: the list build fails on an entry with no picture, so every listed token has one (Nulo draws GBPC's under M1 too, or M2 draws them all)."
- P124-01 and P124-03 = read, answered by P129-01 and P129-02.

## Architecture & Implementation

### The format (arc 1)

- Each entry gains an optional `icon`: exactly `data:image/svg+xml;base64,` + canonical standard base64 (padding, no whitespace), at most **3,072 characters** (`MAX_ICON_CHARS`): every issuer file fits with a third to spare (F8). SVG only; the wallet drops any other media type, so a raster can be added later without breaking a reader (D4).
- The decoded bytes pass the **drawing allowlist**, in both modes, on the literal text:
  - fatal UTF-8; the text starts with `<svg`;
  - no `&`, `\`, `<!` or `<?` anywhere, so no character reference, entity, CSS escape, DTD, CDATA or prolog can change what the parser sees;
  - every tag name (`/<\/?([^\s/>]*)/g`, one negated class) is unprefixed and in {`svg`, `g`, `defs`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, `clipPath`, `mask`, `linearGradient`, `radialGradient`, `stop`, `title`, `desc`}: no script, style, image, use, animation, filter or foreign content;
  - in the lower-cased text: no `href`, no `filter` (the element, the presentation attribute and the CSS property in a `style` attribute alike), no `image(`, `image-set(`, `src(` or `xml:base` (the references that never spell `url(`), no attribute named `on…`; every `url(` is `url(#`.
  - What it does not prove: well-formed XML (a malformed file fails to decode and the mark falls back to initials) or a rendering-cost bound beyond size and the refused filter and animation features.
- `packages/token-list/src/icon.ts` (new, no dependency, worker-safe): `isTokenIcon(value: unknown): value is string`, `MAX_ICON_CHARS`.
- `parse.ts`: `ENTRY_KEYS` adds `icon`; `TokenListEntry.icon?: string`. `checkEntry`: `strict` throws `PayloadError("tokens[i].icon")` on an icon that fails `isTokenIcon`; `wallet` drops it and keeps the entry. `selectEntries` keeps it. `checkSource` and the strict payload parse keep `icon` optional, as the committed envelope (F3) has none.
- `FORMAT.md`: the `icon` row (scheme, budget, allowlist, "draw it only as an image, never as markup"); a reader drops an icon it cannot accept and keeps the entry; the Nulo publisher signs no entry without one.

### The publisher (arc 1)

- `list.source.json`: USDC and `cUSDC` get Circle's `USDC Token.svg`; EURC Circle's `EURC Token.svg`; USDT Tether's `tether_USDt_token_v2@3x.svg`, each byte for byte; GBPC Nulo's "G" mark and `cWETH` Nulo's "W" mark (A1, A2): a `r=48` disc in `#a8480c` and one white stroked path, 224 and 246 B.
- **L3** in `scripts/check.ts` `sourceFindings`: an entry with no `icon` is a finding. The publish workflow's tree step fails, and so does `quality-status` (F3). The recovery-key path signs the source `dev` carries, which passed the same check (D2).
- `infra/token-list/README.md` § Pictures: one row per distinct picture: who drew it, the source page and file, its SHA-256, the brand terms (Circle's pressroom and Brand Use Policy; Tether's media page; Nulo for its own), and the owner's M1 decision that issuer marks are used as published, never recoloured. The recovery steps say to review that table.
- `pictureFindings` (same file, about 15 lines): a source icon whose SHA-256 has no row is a finding, on the `keyFindings` table-equals-code precedent. A tree-check guarantee, not issuer authentication.
- `scripts/summary.ts`: the token table's `icon` column shows `svg 1309 B fe4f9d5f` (media type, decoded bytes, SHA-256 prefix), so a picture change shows in the approver's was/now rows.

### The channel and the mark (arc 2)

- `price/spec.ts` `PriceSnapshot` gains `tokenIcons: Readonly<Record<string, string>>`, keyed like `flaggedTokens`; `snapshotOf` builds it from the held list's entries. No second channel, no stored shape.
- `utils/token-flag.ts` exports its `keyOf`; `utils/token-icon.ts` (new): `tokenIconsOf(entries)` and `tokenIconFor(icons, token)` (chain and contract, `Object.hasOwn`).
- `composables/usePrices.ts`: `listState` adopts `tokenIcons`; `usePrices` and `useTokenFlags` expose `iconFor(token)` beside `isFlagged`.
- `utils/string.ts` `tokenInitials(symbol, size)`: letters and digits by code point, upper case, one below 24 px, two from 24 px, `"—"` when none. `getInitials` stays (it feeds the stored contact `abbr`).
- `components/composite/general/TokenMark.vue` (L3, new). Props `symbol: string`, `icon?: string`, `size: 16 | 20 | 32 | 36`, `badge: boolean`. Root `<span data-testid="token-mark" :data-kind="logo|initials" aria-hidden="true">`, a `size` px square.
  - `icon` set and not failed: `<img :src="icon" alt="" draggable="false" @error>` filling the box; no background, clip or filter.
  - Otherwise a `--nulo-surface-high` circle, initials in `--txt-primary`, one class per size composing `type--row-title` (10 px at 16 and 20, 12 px at 32, 13 px at 36).
  - `badge`: `<Icon name="warning" color="red">`, 8 px below 24, 10 px from 24, on an `--app-bg` pad at −4 px top right: Send's `.type_icon` recipe, moved here.
  - A failed decode falls back to initials; a new `icon` value retries.

### The surfaces (arcs 2 and 3)

| Surface | Change | Size | Badge |
|---|---|---|---|
| Home, Holdings, Send's picker (`TokenCard.vue`): deferred, D17 and A4 | mark before the symbol column, gap 12 | 32 | `isFlagged` |
| Send's asset row (`SelectTokenCard.vue`; `send.vue` passes `flagged`, `icon`) | mark replaces the accent square and draws the no-transfers badge | 36 | `flagged \|\| isTokenBlocked` |
| Token page (`tokens/[id].vue`; `SubPageHeaderBase.vue` gains a `leading` slot, fallback today's icon; `SubPageHeader.vue` forwards it) | mark replaces the holdings glyph; `subpage-title` and `focusTitle` stay | 20 | `isFlagged` |
| Activity (`TransactionCardLayout.vue` prop `titleMark: { symbol, icon?, badge }`; set by `TransactionCard`, `TransactionIncomingCard`, `TransactionAwaitingCard`, `TransactionTerminalCard` when the title names a token) | mark before the title; the 40 px box untouched | 16 | flag of chain and contract |
| Approval line (`SendTxSummary.vue`; `OperationCard.vue` and `execute/index.vue` thread `iconFor`, `isFlagged`) | mark before the amount; token by `tokenAt` (chain and contract) | 16 | flag |

- Activity's chain is `appStore.network.chainId`, which the rows' fiat already uses. `TransactionsList.vue` (History) and `RecentActivityView.vue` (Home) own the price composable and pass `iconFor` and `isFlagged` down through `ActivityRowCard.vue` and `received-display.ts`; journal rows resolve the token through `tokenById`, as their amount symbol does.
- An outgoing mint keeps its kind as the title and gets no mark; an incoming mint receipt is titled by the token and gets one.
- No new words (AL1); no tooltip or glossary term; Send's amount card and review sheet unchanged.

### Trade-offs and alternatives not taken

See the decision ledger: L3's home (D2), the channel (D3), SVG only (D4), the layout prop (D5), the allowlist (D6), the Activity lifecycle (D7).

## Security & Adversarial Considerations

- **Who controls a picture**: whoever gets `list.source.json` merged and signed: the owner, a merged PR, or a leaked signing key (#385). A leaked key can already list a copy under USDC's name; the picture adds familiarity, not a capability. `listSha256` binds the pictures to the approver's digest (F10); the summary column and the README table make a change visible.
- **Rendering boundary**: a picture is only ever an `<img src>` of a `data:` URL: never `v-html`, `<object>`, `<iframe>`, `<embed>`, inline `<svg>` or CSS `url()`. Image mode runs no script and loads nothing; CSP `script-src 'self'` and `img-src 'self' data: blob:` back it (F6). The allowlist adds a static drawing with no reference outside the file (I2).
- **Hostile input at the wallet**: the envelope verifies first; then a picture failing the scheme, base64, budget or allowlist is dropped and the token draws initials. One test per refused class.
- **Cost**: 3,072 characters per picture, the 65,536-byte envelope, and no filter or animation limit what the browser draws; decoder exhaustion beyond that is unverified and not engineered for.
- **Privacy**: no new request, host or timing (F12). **Logging**: no picture, key or URL reaches a log line; a dropped picture is silent.
- **Trademark**: issuer marks as published, on the owner's M1 decision; the README records each source and its terms; nothing recoloured; nothing bundled, so the notices policy is untouched.
- **Accessibility**: the mark is decorative (`aria-hidden`, `alt=""`, no tab stop); the symbol beside it stays the accessible name. The flag on Activity and the approval line is visual only, as AL1 defers the words.
- **Supply chain**: no new dependency.

## Phases

Each phase lands its tests with its code. Every gate also runs `bun run lint` and `bun run typecheck:all`.

### Phase 1 — format and reader (arc 1) ✓

- **Change map**: `packages/token-list/src/icon.ts` (new), `icon.test.ts` (new), `parse.ts`, `parse.test.ts`, `import-closure.test.ts` (the signer's closure gains `icon.ts`), `README.md`; `infra/token-list/FORMAT.md`.
- **Tests**: `icon.test.ts`: success controls (each issuer file, each Nulo mark); one refusal per class: another scheme or media type (`data:text/html`, `data:image/png`, `https:`), non-canonical base64, one character over budget, invalid UTF-8, text not starting with `<svg`, `&#…;` in a value, a `\` escape, `<!DOCTYPE`, a prefixed tag (`<s:script>`), an unlisted tag (`<script>`, `<animate>`, `<filter>`), a `filter="blur(4px)"` attribute, a `style="filter:blur(4px)"` attribute, an `on…` attribute, an `href`, a `url(` to a URL. `parse.test.ts`: wallet keeps the entry and drops a refused icon; strict throws at `tokens[i].icon`; a list with no icons reads in both modes.
- **Validation gate**: `bun run --cwd packages/token-list test`, `bun run test:all`, `bun run test`. Pass: exit 0.

### Phase 2 — publisher (arc 1) ✓

- **Change map**: `infra/token-list/list.source.json`, `README.md` (§ Pictures, recovery note), `scripts/check.ts` (L3, `pictureFindings`), `scripts/summary.ts` (icon column), `test/tree.test.ts`, `test/summary.test.ts`.
- **Tests**: the tree has no finding; an entry without an icon is a finding (L3); an over-budget or non-drawing icon is refused; an icon with no README row is a finding; the summary shows the column and a changed picture as was/now rows; the six-entry envelope's size is recorded in the PR.
- **Validation gate**: `bun run --cwd infra/token-list check`, `bun run --cwd infra/token-list test`, `bun run test:all`, `bun run check:plans`; smoke `cd apps/extension && bun run test:e2e -- tests/e2e/token-list.test.ts --retry=0`, then with `NULO_E2E_BROWSER=firefox` (the worker reads lists through the changed parser). Pass: exit 0 at retry 0.

### Phase 3 — channel and mark (arc 2) ✓

- **Change map**: `price/spec.ts`, `price/service.ts` (+ test), `utils/token-flag.ts`, `utils/token-icon.ts` (+ test), `composables/usePrices.ts` (+ test), `tests/helpers/price-client-fake.ts` and every test building a `PriceSnapshot`, `utils/string.ts` (+ test), `components/composite/general/TokenMark.vue` (+ test), `types/components.d.ts`.
- **Tests**: the snapshot carries entries' icons only, keyed by chain and contract, with fiat off too, and drops them when a list without pictures replaces the list; `iconFor` misses another chain; `tokenInitials` cases; `TokenMark` (at least 10): logo, initials and class at each size, badge sizes, decode failure falls back, a new icon retries, no background on a logo, `aria-hidden`, testid and `data-kind`.
- **Validation gate**: `bun run test`, `bun run --cwd apps/extension test:components`. Pass: exit 0.

### Phase 4 — list rows, Send's asset row, token page (arc 2) ✓ (the rows' mark left out, D17)

- **Change map**: `SelectTokenCard.vue` (+ test), `send.vue`, `tokens/[id].vue` (+ test), `packages/design/src/ui/SubPageHeaderBase.vue` (+ test), `components/ui/SubPageHeader.vue` (+ test); `tests/e2e/fixtures/token-list.ts` (fixture tokens take the source's Testnet USDC and USDT pictures); one held-list smoke spec gains the decode assertion and opt-in `shotSend` calls. `TokenCard.vue` (+ test) is left out (D17).
- **Tests**: each surface: logo for a listed token, initials for a custom one, the badge for a flagged one; Send: the flag, no transfers, and both, one badge each time; the header slot falls back to the glyph. E2E: a token the held list gives an icon has an `<img>` mark with `complete` and `naturalWidth > 0`; an added token has initials; a token the held list gives no icon (an artifact run's published list before the owner publishes) expects initials. Failure mode: the issuer SVG decodes under the real CSP through the worker-to-popup channel in both engines, which jsdom cannot show. Estimate +1 s per browser, measured in the PR.
- **Validation gate**: `bun run audit:vue`, `bun run test:all`; the touched smoke spec at `--retry=0` on Chrome and Firefox; the full smoke suite once per browser before and after for the wall-clock. Pass: exit 0 at retry 0.

### Phase 5 — Activity and the approval line (arc 3)

- **Change map**: `TransactionCardLayout.vue` (+ test), `TransactionCard.vue` (+ test), `TransactionIncomingCard.vue` (+ test), `TransactionAwaitingCard.vue`, `TransactionTerminalCard.vue` (+ tests), `TransactionsList.vue`, `ActivityRowCard.vue`, `utils/received-display.ts`, `pages/activity.vue`, `RecentActivityView.vue`, `SendTxSummary.vue`, `OperationCard.vue`, `execute/index.vue`, `SendTxSummary.test.ts` (new) with `execute.fixture.ts`.
- **Tests**: wire-shaped fixtures (`aztec_sendTx` arguments as `0x` + 64 hex fields): the line shows the logo for a listed contract, initials for a known custom one, nothing for an unknown contract, the badge for a flagged one, and no logo for the same contract on another chain; each Activity card titled by a token gets the 16 px mark, an outgoing mint does not, the 40 px box keeps its children; one History-path test through `TransactionsList`.
- **Validation gate**: `bun run audit:vue`, `bun run test:all`; touched smoke specs, both browsers, `--retry=0`; captures of the approval line from `network/store-captures.test.ts` with `STORE_CAPTURES=1` (opt-in, not a gate). Pass: exit 0 at retry 0.

## UI impact

- **Home, Holdings, Send's picker**: before, symbol and second line; after, a 32 px logo (listed) or grey initials, the red badge when flagged. Sign-off: A ("the issuers' logos as published, round, unaltered, initials in a grey circle when there is none, the red badge when flagged"), M1. Not shipped in arc 2: the mark meets P46-08's two-line figure (`OWNER-ASKS.md` A4, D17); the rows ship unchanged.
- **Send's asset row**: before, the first letter in a 36 px accent square; after, the 36 px mark, the no-transfers badge in its corner. Sign-off: A, M1.
- **Token page**: before, the 18 px holdings glyph; after, the 20 px mark. Sign-off: A.
- **Activity rows** (History and Home's recent activity, every phase of a row titled by a token): before, the title alone; after, a 16 px mark before it; the 40 px box unchanged. Sign-off: AC1 ("A 16 px mark before the row title, as prototyped; the 40 px box keeps chips-3's pair and badges").
- **Approval window transfer line**: before, "25 USDC"; after, the 16 px mark before it, no new words. Sign-off: AL1 ("the line takes P124-01's picture, if any, in the meantime").
- **The list** (arc 1): no surface; no build reads the field before arc 2, and only the owner's publish serves it.

## Delivery

| Arc | Branch | Phases | Stacks on | `/code-review` | PR title |
|---|---|---|---|---|---|
| 1 | `token-icons-build-1-a1` | 1, 2 | `dev` | off | `feat(token-list): each listed token carries its picture, signed with the list` |
| 2 | `token-icons-build-1-a2` | 3, 4 | arc 1 | off | `feat(tokens): send's asset row and the token page draw each token's picture` (the rows left out, D17) |
| 3 | `token-icons-build-1-a3` | 5 + close-out | arc 2 | off | `feat(activity): activity rows and the approval line draw each token's picture` |

- One `gh stack`; `gh stack submit --auto`, then `gh pr edit` per body. The close-out is arc 3's final commits, not a docs-only fourth PR: the lane caps the stack at three (deviation from the standard's top layer).
- Each body quotes the sign-offs its surfaces use, lists the validation runs and outcomes, and attaches light and dark captures (logo, initials, flagged) from `~/.cache/nulo-backlog/token-icons-build-1/shots/`; arc 1's attaches the five pictures at 16 to 36 px in both themes, the input to A1 and A2.
- After arc 1 merges, `publish-token-list.yml` runs; the owner approves `sign` and merges the publish PR. Arc 2 reads lists with and without pictures, so neither order breaks.
- Parallelism: none; each arc needs the one below.

## Post-implementation

Cite `implementations-plan/README.md` § Post-implementation standard at `32fd50e60`. Specific to this plan:

- Review loop per arc at its boundary, while it is the stack's tip: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the arc map ("arc N of 3: the list; the mark on rows, Send and the token page; the mark on Activity and the approval line"), the adversarial ask and the standard's two verbatim rules; one Opus review of the arc's diff beside round 1. Hard stop at three rounds. Then one fresh Codex session over the net diff from `32fd50e60` for cross-arc issues.
- Approval boundaries: a change to what a surface shows beyond the UI impact lines goes to `OWNER-ASKS.md` and is left out; persistence, a new channel or a new request is a plan change.
- Close-out on arc 3: the Outcome block (with `Known limits:` naming the capacity issue, I1), lessons promotion, `STATUS.md` deleted, the `git mv` into `archive/` in its own commit, `bun run check:plans` after staging.
- Teardown after the merge: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/token-icons-build-1/plan.md`, then `agent-worktree done token-icons-build-1 --merged`; never forced.

## Decision ledger

Outline A (this plan) against outline B (`outline-b.md`, local): SVG only, L3 in the tree check, no README check, no wallet SVG rule, a new RPC channel, per-card slots, prototype Activity scope, two PRs.

| # | Decision | Codex | Opus | Call and reason |
|---|---|---|---|---|
| D1 | Three arcs, close-out folded into arc 3 | A | A, narrowly | A: the dApp-facing approval line gets its own loop, inside the three-PR cap. |
| D2 | Where L3 lives | A (`checkSource`: covers the recovery-key path) | B (tree check) | **B**. The recovery path signs `dev`'s source, which `quality-status` already ran the tree check on; the gap A closes needs an owner-run, unmerged source, and its consequence is grey initials. A also turns the phase 1 gate red (T-1) and touches every signing fixture and the e2e suite in arc 1. |
| D3 | Channel | A (`PriceSnapshot` field) | A | A: the flags already ride there, reconnect and network-free reads included; an RPC adds a public contract to save about 15 KB per broadcast. |
| D4 | SVG only or SVG and PNG; budget | B; 3,072 | B; 3,072 | B: every picture is SVG; S1 offers a raster as an option; a wallet drops an unknown media type, so PNG is additive later. 3,072 leaves room for flags. |
| D5 | Layout prop or per-card slots | A | A, narrowly | A: the 16 px size and gap are layout policy, in one place. |
| D6 | Wallet SVG rule | B (none: image mode is the boundary; a blocklist claims what it does not enforce, R1) | the allowlist, on literal text | **Allowlist**. The blocklist was bypassable (character references, CSS escapes, prefixes: both legs, demonstrated). Refusing `&`, `\`, `<!`, `<?` makes the literal text what the parser sees; an element allowlist then refuses script, animation and filters, which image mode would still run. The lane requires the "SVG with script" reader test, and the rule is a validator, not a rewriter. Image mode stays the boundary. |
| D7 | Awaiting and terminal Activity rows | B, pending the owner (R5) | A (the layout's invariant) | **A**. `TransactionCardLayout.vue:8-10` and `TransactionIncomingCard.vue:5-7` keep field positions identical across a row's lifecycle; a mark only on settled rows moves the title 22 px when a row settles. AC1 says "a 16 px mark before the row title", with no phase. Shown in arc 3's captures. |
| D8 | README provenance check | A, qualified (R3) | even; keep if small | Keep (about 15 lines), stated as a tree-check guarantee; the recovery steps say to review the table. |
| D9 | Artwork defaults (A1, A2) | no default; ask first (R5) | ship, show the sheet, publish waits on the answer | Ship the letter marks: L3 needs a picture for every entry, and the lane names GBPC's as "a plain letter mark". The owner sees the sheet in arc 1's body and decides at the `sign` approval, the only path to a served list. |
| D10 | Capacity (R4, I1) | correct I1 | correct I1, known limit | Corrected I1; a closed `known-limit` issue at close-out. No aggregate budget machinery. |
| D11 | Release lane (Opus T-2) | — | expect a logo only where the held list has one | Accepted: the artifact run holds the published list, which has no pictures until the owner publishes. |
| D12 | Badge accessibility | — | known limit | Not filed: the words are AL1's deferral to page 125, and no surface loses a signal it has today. |
| D13 | The shared key's export (arc 2) | — | — | Tree wins: `token-flag.ts` exports it as `listKeyOf`, not `keyOf`; `src/utils/` is auto-imported, so its exports are global names, and four ban tests define a local `keyOf`. |
| D14 | Where the e2e reads the marks (arc 2) | — | — | Tree wins: Send's picker lists balances, and a seeded row has none without a worker restart, so `send-picker-add.test.ts` reads the listed mark on Send's asset row and the added token's on its token page header, not on picker rows. |
| D15 | Mocks given `tokenIcons` (arc 2) | — | — | Only the tests that mount a surface drawing the mark; the other mocks already omit `flaggedTokens` and never call `iconFor`. |
| D16 | The smoke runner (arc 2) | — | — | `agent.sh` runs the network config only; the touched smoke spec and the full smoke suite run through `bun run test:e2e` after the armed build, the list host claiming its port in the host registry. |
| D17 | The rows' mark (arc 2) | leave it out (consult `01a1c81b`) | — | Left out, to the owner (`OWNER-ASKS.md` A4). `type-roles.test.ts` holds P46-08's guarantee that a $123,456,789,012,345.68 figure stays on two lines. A 32 px mark with a 12 px gap leaves it 166.6 px of the 312 px row, where it needs 179.4 px (measured in Chrome), so the figure takes a third line. Mark and gap fit only within 31.2 px. Restating the guard would decide between two owner picks, and every other fix changes what a person sees. `TokenCard.vue` and its tests stay as on `dev`, and so do the mocks that only fed it. |

## Audit verdicts

- **Codex, round 1** (session `01a1c68c`, gpt-6.1-sol, high): conditional approve. Accepted: R1 (blocklist bypassable → D6 allowlist), R2 (cost bound overstated; PNG unused → D4, the cost line restated), R3 (provenance qualified, D8), R4 (I1 corrected; F2 cap restated), R6 (phase order, import closure, `test:components` path), R7 (`TransactionsList` threading), F7/F11 wording. Partly accepted: R5 (asks kept, decision placed at the `sign` approval, D9; Activity lifecycle kept, D7). Rejected: L3 in `checkSource` (D2).
- **Opus, round 1** (Plan agent): conditional approve. Accepted: S1 allowlist (D6), T-1 (phase order and change maps), T-2 (release lane, D11), I1 arithmetic (D10), the sheet in arc 1's body (D9), D2 (L3 in the tree check), D7. Rejected: an envelope-size line in the summary (the signer already refuses an oversize list; the known limit records the headroom); filing the badge accessibility limit (D12).
- **Codex, final fresh pass** (session `01a1c6a3`, gpt-6.1-sol, high): conditional approve. Upheld D2, D7, D9 (the owner's `sign` approval must cover the pictured choices explicitly). M1 accepted: the allowlist let `filter` through as a presentation attribute and in a `style` attribute (demonstrated); `filter` is now refused in every spelling, with both counterexamples as tests, and the claims are worded to what the checks prove. Lows accepted: F6's `script-src` restated; "non-drawing" replaced by "fails the declared checks" (malformed XML decodes to the initials fallback). Resumed to verify: **approve** ("The condition is met … No material regressions found").
- **Arc 1 review, Codex round 1** (session `01a1c6cf`, gpt-6.1-sol, high): findings (1 material). Accepted: a digest anywhere in § Pictures, prose or a comment, satisfied the provenance rule (demonstrated); `pictureFindings` now reads only table rows of six non-empty cells, the digest last, with prose and empty-cell refusals as tests. Lows accepted: the `href` and prefix tests were masked by the element allowlist (now `<g href>` and `<s:path>`); three comments trimmed. Not taken: stripping HTML comments and fenced blocks before the match (a row hidden there is a deliberate, reviewed README edit).
- **Arc 1 review, Opus** (general-purpose, beside Codex round 1): findings (2 material, both low). Accepted: `image-set(` and `src(` reference outside the file without `url(`, and `xml:base` could rebase `url(#…)`, so `image(`, `image-set(`, `src(` and `xml:base` are refused (four tests; no picture uses them); the masked tests (as Codex's); the summary's digest prefix widened to 16 hex characters; plan ids dropped from the host README; a reflow and an escaped BOM.
- **Arc 1 review, Codex rounds 2 and 3** (same session): **clean**. Round 2 verified every fold and accepted the reviewed-edit residual; its one optional low (bare `image` refused `id="image"` and `mask-image:url(#m)`) was taken as `image(` and `image-set(` with an accepted control; round 3 verified it: clean.

- **Arc 2 review, Codex round 1** (session `01a1c73e`, gpt-6.1-sol, high): findings (1 material). Accepted: the 44 px mark could push a long symbol's row past its balance (plausible; both left wrappers now take `min-width: 0`, measured in Chrome with a 32-character symbol and 10-character figures: no overflow); the e2e helper accepted the initials a mark shows before the list's snapshot arrives (it now waits for the expected kind) and selected by structure (`:has`, `img`: now `token-hero` and `token-mark-logo`); the stale `keyOf` in the generated declarations; a narrating header comment.
- **Arc 2 review, Opus** (general-purpose, beside Codex round 1): findings (1 material: the same stale declaration, which the build's generated-sources check would red). Accepted: the overflow (as Codex's); a very wide letter in a hostile symbol spilling out of the disc (initials now clip horizontally); the structural selector (as Codex's); three comment nits and an invariant on `.logo`. To the owner: Home's seed, import and skeleton rows carry no mark, so they sit 44 px left of the cards (`OWNER-ASKS.md` A3; ships unchanged). Not taken: rewording a local commit subject (the squash takes the PR title).
- **Arc 2 review, Codex round 2** (same session, over `f18f7f96c`): **clean** ("No new findings. Accepted fixes verified by inspection; identity and missing-picture probes passed").
- **Arc 2, the full smoke suite red, Codex consult** (session `01a1c81b`, gpt-6.1-sol, high): asked whether a fix keeps both P46-08's two-line figure and A's 32 px row mark with its 12 px gap. Its answer: "I found no cause-level fix that preserves both picks" (high confidence), so "defer only the shared row-mark integration in `TokenCard.vue`". Taken as D17. The rows' `min-width: 0` from round 1 leaves with it.
- **Arc 2 review, Codex round 3** (session `01a1c73e`, over the D17 commits): findings (2 low, docs). Accepted: the surfaces table, Phase 4's change map, the summary and the index line still promised the rows' mark; A3's "what ships now" described an offset only the rows' mark makes. Code: "No remaining code/test/capture-helper assumption found". The hard stop at three rounds ends the loop; the fold is docs only.

## Seeds

Recommended: `/goal`. Use exactly one per session.

```
/goal All phases marked ✓ in implementations-plan/token-icons-build-1/plan.md, each backed by its validation gate reported passing in the transcript; for each phase LESSONS_FILE=implementations-plan/token-icons-build-1/lessons/phase-N.md printed; the Codex fix loop converged per arc and in the final cross-arc pass, each shown by a resumed pass with no new material finding; the three stacked PRs exist (gh stack view), opened only after their loops converged, arc 3 carrying the close-out (git show --stat of the archive move); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/token-icons-build-1 forward per its plan.md (read from the stack's top branch); never idle; decide with Codex at high on gpt-6.1-sol; never merge, publish the list or widen the CSP; after the close-out merges, run the teardown in plan.md's Post-implementation and stop.
```
