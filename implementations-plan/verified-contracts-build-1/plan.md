---
plan: verified-contracts-build-1
tier: mid
status: planned
issues: "none: the charter is pages 135 and 139 and the owner's scope answer"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev 1593cf027
trunk: dev
post_implementation_standard: implementations-plan/README.md § Post-implementation standard at 1593cf027
---

# verified-contracts-build-1: the seal (s1) on the sources the wallet already has

Page 135 picked model A (the chip in the sentence) and approved the build-time defaults; page 139 picked s1, the seal. The owner then scoped the first build to the sources the wallet already holds: "oh -- then yeah, sure, let's start with that." So: a contract the signed token list names on the request's chain, unflagged, is **Nulo verified**, and so is the PrivateFPC the wallet pins. **Aztecscan verified** is built as a type, a drawn seal and a press, but nothing returns it until the Aztecscan reader's own plan. The app's own chip is always **unverified** until the apps list's own plan. One level source in, the rest ready for theirs; nothing claims what Nulo did not check.

## Sign-offs (verbatim; the whole visible budget)

Page 135, signed 2026-11-12 14:33 UTC (head `8a97ab094`):
- **P135-01** = read. Note: "I'd go "A" but I just don't like the design of the chips. We need to keep iterating. A checkbox without the tick looks really really awful. Let's try 4/5 creative ways of communicating this."
- **P135-02** = a: "As drawn: the app's name is a chip with its level in both windows, the press explains it; "on Nulo's list for this site" never appears. One Tab stop added per window." Note: "I'd go "A" but I just don't like the design of the chips. We need to keep iterating. I don't like the third phrase "It calls itself playground", "its on the list of playground... yada tada" what's that supposed to mean for a user?"
- **P135-03** = D2: ""Its code is verified on Aztecscan. Nulo hasn't checked who runs it." (67 characters). The glossary line reads the same way: "Its code is verified on Aztecscan, but Nulo hasn't checked who runs it." The lane's recommendation." Note: "… Also, instead of putting the address, maybe just link directly to the contract in Aztecscan?"
- **P135-04** = read. Note: "I feel that if we nail the "unverified" mark visually, we are no longer needed to put that phrase / warning on each unverified smart contract. That's the idea of nailing this visually with the checks."
- **P135-05** = read. Note: "Sorry - I'm not understanding this question, because I'm not seeing the set fee by? Maybe I need more screenshots? Or a squarte to highlight what I should look at?"
- **P135-06** = approve (the build-time defaults). Note: "approved"
- **P135-07, -08, -09** = read (the Aztecscan side; not this lane). **P135-10** = A: "Show the level, with whose it is ("belongs to <origin>" in the press). The lane's recommendation." (needs the apps list: not built here.) **P135-11** = A: "The wallet fetches Aztecscan's export directly: …" (its own plan.) **P135-12** = C: "A sibling signed list at /v1/apps.json: …" (its own plan.) **P135-13** = read: "It's actually A and B. we won't land this lane until Aztecscan lands it's work."

Page 139, signed 2026-11-12 15:45 UTC (head `1593cf027`):
- **P139-01** = s1: "Seal: a solid seal (Tabler's filled rosette with a tick) after the name for Nulo verified, the same seal in outline for Aztecscan verified, no mark for unverified. The shape products commonly use for "verified", the smallest change from round two, and no square left to echo the fee row."
- **P139-03** = b: "The short address beside the link; the address alone where there is no link. The lane's recommendation."
- **P139-04** = W1: "Rewritten: one line saying who chose the name and what Nulo checked. The lane's recommendation."
- **P139-06** = a: "As drawn: solid against drawn, the press and the glossary's legend naming the level. The lane's frames."
- **P139-02, P139-05, P139-07** = read; their notes are quoted in `OWNER-ASKS.md` A1 to A3. They are the decision slots below.
- The scope answer (chat, 16:00 UTC): ""One scope question for you. Page 139 said..." oh -- then yeah, sure, let's start with that."

**Drafts.** Words a person reads that § Sign-offs does not hold are drafts in `OWNER-ASKS.md`, each with what the PR carries. The lane brief sets this mechanism: the arc's captures go on the owner's decision page, and no PR lands before the owner approves them.

## Decision slots (fallbacks ship until an answer lands)

An answer is read from `~/.cache/nulo-backlog/_orch/briefs/verified-contracts-build-1-answers.md`. **Name options by content, never by letter**: the round-4 page letters P139-05 differently from the answers file (round 4: a = no glyph, b = the seal for the payer, c = today; the answers file: a = unchanged). The arc quotes the entry and maps it through the page it was signed on. An entry whose pick cannot be mapped to one option's content leaves the fallback in place, and the arc reports it.

| Slot | Fallback (ships now) | Other options, and what each changes |
|---|---|---|
| **S1** P139-02, an unreadable call | **Answered, P140-01 = c with the owner's wording, P140-02 = c1** (page 140, signed 16:56 UTC): one tertiary count line after the steps, `unparsedCallsLine` replacing `uncheckedCallsLine`, naming undecodable and decoded-but-unread calls together by step ("Nulo can't parse calls from steps 3, 5, 7, 8 and 10." / "…the call from step 3." / "…this call."), waiting for every decode; no `ArgsNotice` under a call; no advice on a send; an unreadable authorization gets one line of its own (A13) | One line or two for the two kinds: open with the owner |
| **S2** P139-05, the fee row's green tick | **Answered, P140-03 = b, scoped to arc 2** behind the fee-row matrix page: arc 1 leaves the row unchanged (`OperationCard.vue:398`) | Arc 2 renders the seal from `readContract(reader, chainId, payer)` |
| **S3** P139-07, a level not yet known | **Answered as the base, P140-04 = read**: no mark until known, a real `pending` reading; the chip shows its short address, no seal, no level words; its press drops the level header and says "Nulo is still checking this contract." (draft, A14) | A skeleton, held chips or a name kept in the press: rendering changes on `pending` |

## Outcome & Quality Bar

**For whom.** A person approving a dApp's request in the approval window, or a connection in the connect window, deciding in seconds whether the contracts and the app are the ones they think.

**Excellent:**
1. The seal appears only where Nulo's own evidence holds: a listed, unflagged token on the request's chain, or the pinned PrivateFPC that the list does not flag. A flagged token and a listed address on another chain never show it; an absent list shows it only on the PrivateFPC, whose pin needs no list (unit tests, E1).
2. Every chip is a keyboard stop whose name carries its level ("TST, Nulo verified"). Enter opens the press with focus on its link; Tab past the link goes on to the next control with the press closed; Shift+Tab from the link and Escape return to the chip. A press with no link (the app's, or no explorer) keeps focus on the chip, which is described by the open press's text; Tab moves on and closes it; Escape closes it. Neither a press nor Enter on a chip opens its step. The same on Chrome and Firefox (E2).
3. No step sentence prints a contract's address outside its chip; nothing a person reads goes beyond § Sign-offs and the drafts in `OWNER-ASKS.md`.
4. The press stays inside the window at 400 and 240 px, near the bottom included.

**Good enough:** the Aztecscan level is proven on component fixtures only; the app chip has one honest level; surfaces K1 leaves alone keep today's look.

## Assumptions

**Facts** (recon.md has the file:line trail): the popup reaches the signed list only through `PriceSnapshot` (`price/spec.ts:52`); list keys are `listKeyOf` (`utils/token-flag.ts:8`); the PrivateFPC is one address on every chain (`private-fpc-address.ts:3`); `Popover` cannot sit inline and can open off screen; `StepRow` keeps a press on an inner control (`StepRow.vue:28-36`); the step head is `<title> on <AddressDisplay>` (`SendTxSummary.vue:158`); `DappIdentityBlock` renders in six windows (execute, discover, capabilities, fee, network-unavailable, verify); `LogsToolbar.test.ts` stubs `Popover`, so only `Popover`'s own tests prove its placement; `useTokenFlags().mapped` is a readonly ref (`usePrices.ts:209`); `execute-steps.test.ts` counts Tab stops exactly and is skipped unless `NULO_E2E_EXECUTE_FIXTURE=1` on the armed build; `listedExtension` holds the source list and switches the profile to Testnet (`fixtures/extension.ts:411,743`); `e2e:agent` runs only the network config; e2e retries default to 2 unless `NULO_E2E_RETRY=0` (`vite.shared.ts:117`).

**Inferences** (the arc verifies each first):
- I1. E1 runs as a new armed execute fixture, `listed`, whose calls target the source list's `0x…a1` (listed), `0x…f1` (flagged, with a held `TokenInfo` so its badge has a symbol) and `UNKNOWN`, under `listedExtension`. An artifact run is unarmed, so it skips the spec: E1 is source-run coverage only, stated in the PR.
- I2. Each step names one target and each authorization line one consumer, so no row holds two chips: every chip is a stop, with no dedupe code. The authorization lines sit outside the step rows, so their chips add stops at rest.
- I3. The list parser bars control and format characters (`parse.ts:41,104`); a listed symbol is still capped with `safeWire(…, 16)` like today's symbols. Confusable letters survive, which matters only with a hostile signed list (out of scope).

**Asks** (working assumption in bold):
- K1. **Reconciled before phase 4** against the full signed text the arc prompt carried: the working list matches it except default (2), which P139-04 = W1 rewrote; the build adds its line, "The name Crowdfunding came from an app. Nulo hasn't checked it.", to an unverified press when the decode names the contract (`contractChipOf`'s `selfName`), the chip keeping its short address. Default (3)'s per-step dedupe holds with no code (I2); default (4) for the fee row only is arc 2's (P140-03 = b); default (7)'s N2 sentence is not in this build (A8). Original note: P135-06's text is held here only as a fragment ("the token's picture inside the chip, a short address on an unverified chip, one chi…"). **The orchestrator pastes its full text into the arc prompt; before phase 4 the arc checks this working list against it, and a contradiction on a visible rule follows the signed text or stops the arc.** Working list: the picture inside the chip; a short address on an unverified chip; one chip per contract per step; the legend in Settings → Glossary only, no new dotted term in a window; a flagged token never Nulo verified; no chip on the fee payer; the register_token card, the standalone authorization card, the utility, simulate and metadata cards and public grants keep today's surfaces; a transfer's recipient stays `AddressDisplay`. Each visible rule that rests on this list alone also has its own entry (A7, A9, A11).
- K2. **No storage change** (a hard rule of the lane): the channel is a message field; persisted `PriceState` is untouched.

## Architecture & Implementation

**Shape.** Data flows worker → popup on the existing list channel; a pure resolver turns (chain, address) into a reading; a pure chip model turns a reading into words; one L3 component draws chip and press; two windows place it.

```
held list ─► price service snapshotOf ─► PriceSnapshot.listedTokens ─► useTokenFlags().listedAt
SendTxSummary ── readContract(reader, chainId, call.to) ─► contractChipOf(reading, address) ─► <ContractChip>
execute / discover ── appChipOf(name, host) ─► <ContractChip> in DappIdentityBlock's #name slot
```

**Interfaces.**
- `utils/token-icon.ts`: `listedTokensOf(entries): Record<string, ListedToken>`, `ListedToken = { symbol: string; name: string }`, keyed by `listKeyOf`, beside `tokenIconsOf`. `PriceSnapshot.listedTokens` (required); `listState` adopts it as it adopts icons; `useTokenFlags` adds `listedAt(token)`.
- `utils/contract-level.ts`: `type ContractLevel = "nulo" | "scan" | "none"`; `type ContractReading = { level: "pending" } | { level: "none"; flagged: boolean } | { level: "nulo"; source: "token"; symbol: string; name: string; icon?: string } | { level: "nulo"; source: "fpc" } | { level: "scan"; name: string }`; `type ListReader = TokenMarkLookup & { mapped: Readonly<Ref<boolean>>; listedAt(t): ListedToken | undefined }`; `readContract(reader, chainId, address)`, keyed by `listKeyOf(chainId, String(address))` (no `wire()` cleaning). Order: mapped and flagged → `none` (flagged); the pinned PrivateFPC → `nulo/fpc` (needs no list, so before `mapped`); not mapped → `pending`; `chainId === undefined` → `none`; listed → `nulo/token` with its icon; else `none`. Nothing produces `scan` yet.
- `components/composite/contract-chip.ts`: `LEVEL_LABEL` ("Nulo verified", "Aztecscan verified", "Unverified"), `LEVEL_GLYPH` (`seal-solid`, `seal`, none), `contractChipOf(reading, address, held?: TokenMarkOf)` and `appChipOf(name, host)`, each returning `ChipModel = { label; mono; level; mark: TokenMarkOf | null; accessibleName; title?; lines; address? }`.
- `components/composite/ContractChip.vue` (L3: no store, no client): props `model`, `explorer?: { url: string; name: string } | null`, `testid`. A native `<button>` (testid `contract-chip`, `data-level`) inside `<Popover inline>`; its label span carries the caller's testid; the press is `#content`.
- `DappIdentityBlock.vue`: an optional `#name` slot; execute and discover fill it with the app chip; the other four windows keep today's caption.
- `@nulo/design` `Popover`: an `inline` prop (span root and trigger) and a pure `placeCard(trigger, card, view)` helper: the card stays inside the view on both axes at every width (left edge ≥ 8 px, width ≤ the view's minus 16), opens on the side with more room when below does not fit, and caps its height at that room with internal scrolling. A trigger at the view's right edge (the logs toolbar's case) places as today.

**Label and press rules** (A4 to A6 and A12 hold the drafted words):

| Reading | Chip | Press: header · title · lines · last row |
|---|---|---|
| Nulo verified token | list picture (`TokenMark` 16) · list symbol · solid seal | solid seal "Nulo verified" · "SYMBOL · Name" (one when equal) · A5's two lines · P139-03 b |
| Nulo verified PrivateFPC | "Private Fee Juice" (A6) · solid seal | solid seal "Nulo verified" · "Private Fee Juice" · A5's first line · P139-03 b |
| Aztecscan verified (fixtures) | name · outline seal | outline seal "Aztecscan verified" · name · D2 · P139-03 b |
| Unverified | short address, mono | "Unverified" · "Unknown contract" · no line (A5) · P139-03 b |
| Unverified, flagged | a held token adds `TokenMark` with its red badge; short address | "Unverified" · "Nulo flagged this token as a scam" (A12) · no line · P139-03 b |
| Pending (S3) | short address, mono, no mark | the last row only |
| The app (execute, discover) | sanitized self-declared name; no chip when none survives | "Unverified" · the hostname · "Nulo doesn't know this site. Each contract shows its own level." (A5) and W1 "The name <name> comes from the site. Nulo hasn't checked it." · none |

P139-03 b's row: `trimAddress` in mono, then "View on {explorer}" with the `open` glyph when `getContractExplorerUrl(chainId, defaultExplorer, address)` is not null, else the address alone. Accessible name "<label>, <level label>"; pending: the label alone; the seal `aria-hidden`. The label clips with an ellipsis inside the chip (a 64-character app name at 240 px).

**Sentences** (model A; `SendTxSummary.vue`): a movement reads `<title> <amount> [chip]`, the amount from `amountLabel` (`call-surface.ts:183`) without its symbol, "base units" kept; its second line keeps `from … to …` and "Caller: none". Any other call reads `<title> on [chip]`. An authorization reads `Lets <caller> move <amount> [consumer chip] from <from> to <to>` or `Lets <caller> call <fn> on [consumer chip]`; caller, from and to stay `AddressDisplay` (A11). Testids: `execute-op-call-to` wraps the chip; `execute-op-summary-call-to` and `execute-discovered-line-consumer` move to the chip's label span; `execute-op-line-amount` moves into the head; new: `contract-chip`, `contract-chip-seal`, `contract-chip-panel`, `contract-chip-short-address`, `contract-chip-explorer-link`, `execute-dapp-name`.

**Mechanics that are not obvious.**
- `StepRow` keeps a chip's press the chip's (the step does not toggle); Tab reaches the row, then its chip.
- Popover's `focusIn` moves focus to the link within the keydown that opened it, so a held Enter would repeat on the link: chip and link both refuse a repeat Enter (CLAUDE.md § Keyboard).
- Popover hands a forward Tab past its last control back to the trigger and lets the browser go on, so focus lands after the chip; E2 asserts that contract, unchanged.
- A press with no control (`Popover.vue:69-71` focuses none) leaves focus on the chip; while open, the chip's `aria-describedby` names the press's text, and `Popover`'s `focusin` close ends it when Tab moves on.
- `adviceSite` loses its raw-call branch (`OperationCard.vue:297`) under S1's fallback; the standalone authorization card's branch stays.

**Alternatives not taken** (ledger): a worker-side level method (D1); a press built inside the chip, outline B's (D2); outline B's foundations-first split (D3).

## Phases (arc 1 = phases 1 to 5; arc 2 = phase 6)

### Phase 1: the channel and the resolver ✓
- Change: `utils/token-icon.ts`, `wallet/services/price/spec.ts`, `price/service.ts` (`snapshotOf`), `composables/usePrices.ts` (`listState`, `useTokenFlags().listedAt`), new `utils/contract-level.ts`.
- Tests: `utils/contract-level.test.ts`: listed on this chain → Nulo verified with its icon; the same address on another chain → unverified; flagged and also listed (a hostile reader) → unverified; the PrivateFPC → Nulo verified before `mapped`, unverified once the list flags it; unknown → unverified; not mapped → pending; mapped with an empty list → unverified; chain 0 listed → Nulo verified. The `snapshotOf` test gains `listedTokens`; `usePrices.test.ts` gains `listedAt` before and after an answer.
- **Validation gate:** `bun run lint`, `bun run typecheck:all`, `bun run test`, `cd apps/extension && bun --bun vitest run src/wallet/services/price`. Pass: exit 0, the new cases green. Layers: lint, typecheck, unit.

### Phase 2: the design package ✓
- Change: `packages/design/src/core/glyph-sources.ts` (`seal`, `seal-solid`), regenerated with `bun run --cwd packages/design gen:glyphs`; `Popover.vue` (`inline`), new `packages/design/src/ui/popover-place.ts` (`placeCard`); `Popover.test.ts`; the `Core / Icon` and `Popover` stories.
- Tests: `placeCard`: a left trigger in a 400 px view keeps the card inside; a 240 px view narrows it to 224 px; a trigger near the bottom opens above; neither side fits → the larger side with a capped height; a right-edge trigger places as today. `Popover`: `inline` renders spans; the existing focus, Escape and Tab cases unchanged. `glyphs.drift.test.ts` green.
- **Validation gate:** `bun run --cwd packages/design test`, `bun run lint`, `bun run typecheck:all`, `bun run --cwd apps/extension build-storybook`. Pass: exit 0. Layers: lint, typecheck, unit, story build.

### Phase 3: the chip, its press and the legend ✓
- Change: new `components/composite/contract-chip.ts` and `ContractChip.vue`; `utils/glossary.ts` (a "Contracts" section, three entries, A4); `popup/pages/settings/glossary.vue` (the seal beside the two marked terms, `aria-hidden`).
- Tests: `ContractChip.test.ts`, ten distinct behaviours (the L3 floor), wire-shaped `0x` + 64-hex addresses: the accessible name per level and pending; solid, outline and no seal; click and Enter open the press with `aria-expanded`; a repeat Enter refused on chip and link; the link's `href`, `target`, `rel` and text beside the short address; no explorer → the address alone; D2 on the Aztecscan press; the flagged press; the app model's two lines; a press with no link keeps focus on the chip, which is described by it, and Escape closes it; the type-role classes (label `type--value`, address mono). `glossary.test.ts` (`SPEC` rows) and `settings/glossary.test.ts` (six sections).
- **Validation gate:** `bun run lint`, `bun run typecheck:all`, `bun run --cwd apps/extension test:components`, `bun run test`. Pass: exit 0, `copy-dash-ban`, `red-text-ban` and `type-role-ban` green. Layers: lint, typecheck, component.

### Phase 4: the two windows and the slots ✓
- First: check K1 against the full P135-06 text the arc prompt carries.
- Change: `SendTxSummary.vue` (model A, the consumer chip, S1's fallback, the explorer from `appStore.defaultExplorer` and the operation's chain), `OperationCard.vue` (the reader type, `adviceSite`), `DappIdentityBlock.vue` (`#name` slot), `execute/index.vue` and `discover/index.vue` (fill the slot; `nameTestId="execute-dapp-name"`), `scripts/type-roles/identifier-sites.expected.json` if its scan lists the new sites. S2 and S3 at their fallbacks need no code beyond pending's rendering.
- Tests: `SendTxSummary.test.ts` and the `OperationCard.*` files change only the sentence shape, testids kept; new cases: a listed token's chip through a real reader; a flagged held token's chip (badge, no seal); an unreadable call's plain line with no advice; an unreadable call and an unreadable authorization together keep the advice on the authorization. `DappIdentityBlock.test.ts`: the slot renders; without it, today's caption. `discover/index.test.ts`: `discover-dapp-name` holds the chip.
- **Validation gate:** `bun run audit:vue`, `bun run test:all`. Pass: exit 0. Layers: lint, typecheck, unit, component, build.

### Phase 5: e2e, captures, the full gate ✓
- **Existing tests whose invariant changes** (each rewritten to its new invariant, never loosened): `execute-steps.test.ts` Tab walk (recount: one stop per chip and one for the app; the batch fixture's authorization chips count at rest); `:343-345` (after a row, the next stop is its chip); `:361-368` (the drag selects the recipient's address, not the chip); `:395-416` (the step rows lose the interface term and warning under S1: the press-and-Enter cases move to an unreadable authorization's term where a fixture has one, else the PR says why they go); `network/tx-sendTx-default.test.ts:221-223` (the sandbox token is unlisted: its chip shows the short address and no mark; E1 pins the listed path); `tx-transfer-row` and `type-roles-windows` (the head carries the amount and the chip; a long label clips inside the chip).
- **New scenarios**: **E1** (I1): the listed chip shows the list's picture, symbol and solid seal, the unknown contract its short address and no seal, the flagged token its badge and no seal: proves the worker → popup channel in the real build, which component tests stub; estimate 25 s, reusing a `listedExtension` launch. **E2**: Enter on a chip opens the press with focus on its link; Tab goes on past the chip with the press closed; Shift+Tab and Escape return to the chip; the app chip's press (no link) keeps focus on the chip and Tab closes it; a press and an Enter on a chip leave the step closed; at 240 px the press stays inside the window: real focus differs by browser; estimate 20 s. Run both on Chrome and Firefox.
- **Captures** from an uncommitted spec, light and dark, into `~/.cache/nulo-backlog/verified-contracts-build-1/shots/` with `captions.json`: the mixed approval (a listed token with its picture and solid seal, an unverified contract, an unreadable call at S1's fallback), the connect window's app chip, each press the fixtures reach, the legend, all at 400 px, and the approval at 240 px; for A1, ten calls with five unreadable at S1's fallback (the owner's ask), from a capture-only fixture shape kept out of every commit. The Aztecscan press exists only in component tests: say so.
- **Validation gate**, once, in order, retry 0:
  1. `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run --cwd apps/extension test:components`, `bun run audit:vue`, `bun run test:all`, `bun run check:plans`.
  2. Per browser (`chrome`, then `firefox`), from the worktree root: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_EXECUTE_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`, then `cd apps/extension && NULO_E2E_BROWSER=<browser> NULO_E2E_RETRY=0 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e`: the whole smoke suite, since E1 and E2 are new, before (at `1593cf027`) and after, wall-clock recorded.
  3. Per browser: `NULO_E2E_BROWSER=<browser> NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-default.test.ts tests/e2e/network/tx-transfer-row.test.ts tests/e2e/network/type-roles-windows.test.ts tests/e2e/network/connect-dapp.test.ts`.
  Pass: every command exits 0 at retry 0. Layers: all, with live-network e2e on the sandbox.

### Phase 6 (arc 2): answers and close-out
- Apply any answers entry that arrived after arc 1's final review, with its tests and captures; then the close-out (Post-implementation 4).
- **Validation gate:** phase 5's gate for any code change; otherwise `bun run lint` and `bun run check:plans`. Pass: exit 0.

## UI impact

Each PR body quotes the sign-offs a line names, verbatim, from § Sign-offs.
- **Approval window, step sentences**: no address outside a chip; each step's contract is a chip; a listed token's picture moves from before the amount into its chip; Nulo verified chips carry the solid seal. An unlisted token loses today's initials and its symbol in the sentence; a flagged held one keeps its badge (A7). Sign-off: P135-01's note, P139-01 = s1, P135-06.
- **Approval window, authorization lines**: the consumer contract is a chip; caller, from and to stay as today (A11). Sign-off: P135-01, P135-06.
- **Approval window, an unreadable call**: the count line replaces the orange notice per call, today's unchecked-calls sentence and the advice on a send; an unreadable authorization reads "Nulo can't parse this authorization." (draft, A13). Sign-off: P140-01 = c with the owner's wording and P140-02 = c1, quoted in `OWNER-ASKS.md` A1.
- **The press**: P139-03 b's last row, D2, the header naming the level, the drafts of A5, A6 and A12. Sign-off: P135-03 = D2, P139-03 = b, P139-06 = a.
- **The app chip, approval and connect windows only**: the self-declared name as a chip, no seal, one stop per window, the press as `vc3-s1-app-01`. The other four windows keep today's caption. Sign-off: P135-02 = a, P139-04 = W1.
- **Raised-fee window**: it renders the same operation card, so its steps and authorizations carry the same chips, count line and presses as the approval window, linking the explorer the person picked (A15). Sign-off: as the approval window's lines; the window itself is A15.
- **Settings → Glossary**: a Contracts section, the seals beside two terms (A4). Sign-off: P135-06, P139-06 = a.
- **Fee row**: unchanged (P140-03 = b is arc 2's). **Loading**: the pending state (P140-04 = read; A14's draft line). **Unverified press**: "Nulo hasn't checked this contract." alone (P140-05 = a). **Logs viewer**: no change (its block popover keeps today's placement, D13).

**Accessibility calls** (made under the owner's 2026-10-19 delegation; each goes in the PR body): the chip is a native button with the 2 px accent ring on `:focus-visible`; every chip is a stop (one per contract per step; a contract named again in another step is a stop again, so each step's press is reachable where it is read) and the app chip one stop; the name carries the level; the seal is `aria-hidden`; the press keeps `Popover`'s Tab hand-off and Escape; chip and link refuse a repeat Enter.

## Security & Adversarial Considerations

- **Threat model.** A dApp controls every call address, the authorization data, its call names and its self-declared name, and wants a seal, or an unverified thing to read as verified. It cannot place a seal: the seal comes only from the signed list (pinned keys, verified in the worker) or the compiled-in PrivateFPC; the bridge refuses non-canonical addresses, so a disguised address cannot hit a listed key; a different address resolves unverified and shows its short address. Replacing the PrivateFPC's code needs the derivation pinned by `protocol-fpcs.test.ts` broken: not supported.
- **Flag outranks everything**, the pin included, once the list answers; a listed address on another chain is unverified; an absent list upgrades nothing. All unit-tested.
- **Look-alike text** (plausible, exploitability unknown): a name or call name may carry level words or a seal-like emoji ("Nulo verified 🏵", "Swap ✅"), as today's caption and titles can. The app chip never draws a seal. Stripping characters from a shown name is the owner's call (A10).
- **A sealed chip on an unreadable call** (plausible): a listed token's call whose arguments fail to decode reads with the seal and S1's tertiary line, without today's orange notice. Named in A1 for the owner's slot decision.
- **Input handling.** List strings pass the parser's checks and `safeWire`; the dApp name `sanitizeWireString(…, 64)`; all rendered as text (no `v-html`). The link comes from `getContractExplorerUrl` (fixed hosts, 32-byte hex only) with `noopener noreferrer`; pressing it shows the explorer the address, chain, IP and time, as today's links do.
- **Clickjacking.** While a press is open, Popover's canvas takes the next outside press, so a press meant for Confirm closes the press first.
- **Privacy**: no new host, request or stored key. **Supply chain**: no dependency; glyphs from the pinned Tabler 3.49.0 through the generator. **Crypto, CI tokens, publishing**: untouched.

## Delivery

| Arc | Branch | Phases | Stacks on | PR title (chars) | Lands |
|---|---|---|---|---|---|
| 1 | `verified-contracts-build-1-a1` (plan commit + build) | 1 to 5 | `dev` | `feat(execute): contracts and the app become chips, with a seal for nulo verified` (80) | on the owner's decision page with its captures; no `Closes` |
| 2 | `verified-contracts-build-1-a2` | 6, close-out | arc 1 | `docs(plans): close verified-contracts-build-1` (45), or with code `feat(execute): round-4 answers on the contract chips, and the plan closes` (73) | after arc 1, on the owner's approve |

`gh stack init` on arc 1's branch, `gh stack add` for arc 2; `gh stack submit --auto`, then `gh pr edit` per body; ready, no labels at creation (add `e2e:extension-network` / `e2e:extension-smoke` afterwards only if a path filter would skip a suite the change needs). PR bodies: what and why; the sign-offs quoted; the accessibility calls; the validation runs with outcomes; each browser's smoke wall-clock before and after, with E1 and E2's measured times; the captures from `pr-captures/verified-contracts-build-1/` (committed in one commit, removed in the next). **Parallelism**: phases 1 and 2 are disjoint, but phase 3 needs both and lanes would cut the critical path by under 30 %: none.

## Post-implementation

Cite `implementations-plan/README.md` § Post-implementation standard at `1593cf027`. Specific to this plan:
1. **Answers first.** Right before arc 1's Codex loop opens, and again right before its last round, re-read `~/.cache/nulo-backlog/_orch/briefs/verified-contracts-build-1-answers.md`. Apply every entry present (§ Decision slots); quote it verbatim in `OWNER-ASKS.md` (marked answered), the decision ledger, the `UI impact` line and the PR body; recapture what it changes; rerun phase 5's gate for it. A later entry is arc 2's.
2. **Codex loop per arc** at its boundary: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; arc map "arc 1 of 2: the levels, the chip, the two windows, the legend; arc 2: late answers and the close-out"; hard stop at three rounds, then report. Then one fresh Codex pass over `1593cf027..tip`.
3. **Boundaries.** Anything a person would see beyond § UI impact goes to `OWNER-ASKS.md` with what the PR carries. A fix that adds stored state, a lifecycle, a protocol, a recovery policy or a public contract stops the arc.
4. **Never** merge, land or tear down (the orchestrator does); never open `network-endpoints.ts`; no Testnet node, no funded account; no `biome-ignore lint/complexity`; no raised timeout, retry or loosened assertion.

## Decision ledger

| # | Decision | Views | Call and reason |
|---|---|---|---|
| D1 | Where the level is computed | a worker method (one more RPC and spec) vs the popup over the existing channel | Popup: the channel already carries the list's flags and pictures here; the resolver is pure. Both audits agree. |
| D2 | The press | outline B's press inside the chip vs `Popover` | `Popover` plus `inline` and `placeCard`: its focus hand-off and outside press are tested once; a copy would drift. Both audits agree. |
| D3 | Arcs | outline B: invisible foundations by policy, then the chip | One visible arc: B lands a channel and a resolver with no consumer, and its second arc still carries every visible risk. Both audits pick the plan. |
| D4 | The pin against the list | the pin first (draft) vs the flag first | Flag first once mapped, the pin before `mapped`: the pin needs no list, but a signed flag is newer evidence (Codex and Opus). |
| D5 | Which addresses become chips | every named address (the drawn A chipped a known caller) vs contract positions only | Contract positions: a caller or recipient may be an account the resolver cannot tell from a contract; A11 asks the owner. |
| D6 | The app chip's reach | inside `DappIdentityBlock` everywhere vs a `#name` slot in two windows | The slot: four other windows render the block and nobody signed them; `cap-window`'s first stop would move (both audits). |
| D7 | Tab stops for a repeated contract | round two's one per distinct contract vs one per step | One per step, under the 2026-10-19 delegation: no dedupe code (I2), each step's press reachable where it is read; the lane brief restates P135-06 so. Opus asked for an owner ask: rejected, Tab stops are delegated. |
| D8 | Drafted words in the PR | ship nothing unsigned (Codex) vs ship drafts for the captures page | Drafts: the lane brief sets "what ships now = the draft, so the captures page shows them", and no PR lands before the owner's approve. |
| D9 | `ContractChip.test.ts` size | distinct behaviours only (Codex) vs ten cases | Ten distinct behaviours: CLAUDE.md sets ten as the L3 floor. |
| D10 | E2's forward Tab | the chip vs the next control | The next control: that is `Popover`'s contract (`Popover.vue:77-85`); the plan does not change it. |
| D11 | The press near the bottom | flip only vs flip plus a height cap | Both, in `placeCard`: a short window fits neither side; a pure helper keeps `Popover`'s watch inside the complexity budget. |
| D12 | E1's list | sign a custom list (I1 draft) vs the `listedExtension` source list | `listedExtension`: `launchExtension` takes no custom tokens; a new armed fixture targets its entries. |
| D13 | `placeCard`'s reach (arc 1) | every left-side popover vs inline ones only | Inline only: `Popover.test.ts` pins the logs toolbar's off-screen start at 400 px as today's behaviour, and the plan promises the logs viewer no change; the block path is untouched. |
| D14 | The identity block's `#name` slot | an untyped slot in a JS component vs the block in TS with `defineSlots` | TS: vue-tsc read the JS block's slots as `{}` and refused `#name`; typed props are the same contract. |
| D15 | Chips in the rail's computeds | inside `callRows` vs computeds of their own | Their own (`callChips`, `authwitChips`, bound with `v-bind`): the type-role inventory treats anything derived from a computed that reaches `trimAddress` as an identifier site, so rows carrying chips flagged the count line and the authorization node. |
| D16 | A rail with no list reader | treat as an empty list vs pending | Pending: without a reader no level is known, and an empty list would claim "unverified". |
| D17 | Smoke cases whose subject went | keep the glossary-term press cases vs fold into E2 | Fold: the `interface` term no longer renders on a send's rail; "a press or an Enter on a chip opens nothing of the step" is their replacement, in the batch mouse case and in E2. |
| D18 | Network gate's list | the plan's four files vs adding `tx-sendTx-multicall.test.ts` | Add it: it pins the old unchecked-calls sentence and is in the network lane. |
| D19 | Page 143's five picks (P143-01 b2, 02 b3, 03 d, 04 n1, 05 s1), in the answers file at 20:01 UTC | apply in arc 1 vs record for arc 2 | Record: the entry says "All five are arc 2's; arc 1 keeps the fee row as today and the pending chip as (a), as its plan says." Quoted in `OWNER-ASKS.md`. |
| D20 | The raised-fee window (Opus review) | keep its old rail vs the same card as the approval window | The same card: the window renders `OperationCard`, and a second rail for one window would drift; it gets the explorer id, a test, a capture and A15. |
| D21 | "The name X came from an app." for a name the wallet's own artifact gives (Opus review: a bundled Token artifact, a protocol contract) | gate the line on provenance vs reword vs ship the signed frame's words | Ship the signed words and ask (A16): the decode carries no provenance, and rewording signed copy is the owner's; the line never raises trust. |
| D22 | Long app strings (Codex review) | none vs the inline popover's root shrinking and the press wrapping anywhere | Both, with a smoke case over a new armed `long-names` fixture: a 64-character name clips inside the chip at 400 and 240 px and each press holds a 63-character host and a 64-character contract name. |

## Audit verdicts

- **Codex, plan audit** (session `01a1d09c`, gpt-6.1-sol, high): **reject** (blocking: unsigned copy and the four extra windows; K1's evidence; I1 infeasible; the reader's ref type; E2's Tab expectation; the smoke gate without the armed build, `NULO_E2E_RETRY=0` and Storybook). Accepted: all blocking points (D4, D6, D10, D12, K1's procedure, the gate, `mapped` as a ref), the logs-toolbar fact, the height cap (D11), `adviceSite`'s simpler change, `amountLabel` reuse, dropping `tabbable`, narrowing I3, the slot-letter rule for an unmappable entry. Rejected: shipping no drafts (D8), dropping the ten-case floor (D9).
- **Opus, plan audit** (Plan agent): **conditional approve**. Accepted: the slot (D6), the flag first (D4), I1 through `listedExtension` (D12), the existing tests to rewrite with their invariants, `tx-sendTx-default` in the gate, the armed build and Storybook, dropping `tabbable`, the label-span testid, the icon in the reading, `placeCard`, the flagged press (A12), the app press's first line (A5), A11 for D5, the sealed-unreadable case (A1), the six-window and `:8` facts, Outcome 3's wording. Rejected: an owner ask for the Tab-stop count (D7).
- **Codex, final fresh pass** (session `01a1d0b1`, gpt-6.1-sol, high): **conditional approve** (conditions: K1's full text reconciled before phase 4, already the plan's procedure; a press with no link specified and tested; the ten-call, five-unreadable capture A1 asks for). All three folded (Outcome 2, § Mechanics, phases 3 and 5, the arc prompt's K1 slot), with Outcome 1's PrivateFPC wording. It found I1 executable and D4, D8, D9, D12 sound. Resumed for verification (same session): **approve**, no regression.

- **Codex, arc 1 round 1** (session `01a1d168`, gpt-6.1-sol, high): **conditional approve**. No finding on seal forgery, the count line, keyboard, copy, layering. Accepted: the app chip's label did not clip inside a flex row (the inline popover's root now shrinks), long words overflowed the press (`overflow-wrap: anywhere`), both pinned by a smoke case (D22); the pending press tested; Space pinned in E2; a comment that claimed each press names the unreadable kind.
- **Opus, arc 1 review** (general-purpose agent, opus): **conditional approve**. No finding on seal forgery, the count line, keyboard, copy, test loosening. Accepted: the raised-fee window listed and given its explorer link with a test (D20, A15); the PrivateFPC press, the pending press and the decoded name's path through the card tested; `sendTxCalls`'s return type carries `selfName`; the import nits; a vacuous `lines` measure dropped. Answered by an owner ask, not a rewrite: "came from an app" for a wallet-bundled artifact's name (D21, A16).
- **Codex, arc 1 round 2** (same session, resumed): **approve**, no new finding. Confirmed each fix (reverting either CSS rule fails the new smoke case in its reduced check) and D21: keep the signed words and ask, recommending the neutral wording to the owner. The loop converged at round 2.
- **Codex, fresh pass over `1593cf027..4e729cfe7`** (session `01a1d1e7`, gpt-6.1-sol, high): **approve**, no finding on any dimension (moderate confidence, static inspection).

## Seeds

```
/goal All phases marked ✓ in implementations-plan/verified-contracts-build-1/plan.md, each gate reported passing in the transcript; the answers file re-read and applied before arc 1's loop; the Codex loop converged per arc and in the fresh pass; two stacked PRs open and ready, arc 2 carrying the close-out; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/verified-contracts-build-1 forward per its plan.md from the stack's top branch; decide with Codex at high on gpt-6.1-sol; never merge; stop once both PRs are open with checks read.
```
