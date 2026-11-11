---
plan: token-icons-build-2
tier: light
status: completed
issues: "#1789 (arc 1 closes it); the rest is the owner's picks on page 134"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev 52e2099ad
trunk: dev
post_implementation_standard: implementations-plan/README.md § Post-implementation standard at 52e2099ad
---

## Outcome

- **Date:** 2026-11-11.
- **Status:** completed. Ships in two stacked PRs: #1790 (arc 1, `Closes #1789`) and arc 2's, `feat(tokens): token rows, home's other rows, a dapp's transfer and the fee line draw marks`, which carries this close-out; the merge of arc 2 closes this plan.
- **Shipped:**
  - Arc 1 (#1790): each step sentence's chevron and its no-break space sit in one `white-space: nowrap` span, so the chevron ends the last line beside the last word. A component test and the execute-steps 400/240 px loop pin it; both were red on `dev`'s template on Chrome and Firefox (`lessons/phase-1.md`).
  - Arc 2: Home's, Holdings' and Send's picker's token rows draw the 32 px mark 12 px before the symbol; a seed row draws its entry's picture (by chain and contract), an import row grey initials ("—" before its symbol is read), a ghost row a 32 px round skeleton; a dApp's transfer row draws the 16 px mark beside its app chip; the fee-raised window opens its own reader of the list in `init` and its step line draws the mark. No words change; every `data-testid` stays.
- **Gates (arc 2, on `c7cbc4ae5`, once, in order, retry 0):** `audit:vue` (202 s), `test:components` (101 files, 1,426 tests), `test:all` and `check:plans` green; the six smoke specs (execute-steps, type-roles, rows, home-links, token-list, shipped-token-list) green on Chrome, 268 s (`dev`: 329 s), and on Firefox, 415 s (`dev`: 471 s), but for type-roles' two #1763 reds, which `dev` reproduces; `tx-transfer-row` and `tx-sendTx-default` through `e2e:agent` green on Chrome (278 s) and Firefox (477 s). The commits after it change comments, captures and plan files only: `lint`, the touched unit files (21 files, 424 tests) and the e2e typecheck green on them. `dev` then moved (#1791, which fixed #1763); merged into both arcs, the merged head `adf876ec9` passed `lint`, `typecheck:all` and type-roles with execute-steps on Chrome (196 s) and Firefox (284 s, type-roles 15 of 15).
- **Deviations:** a figure's third line comes from about $100T, not the "about $10 trillion" P134-04 allowed (F2, measured). An import row's long title stays uncut and runs under its spinner or × from about 30 characters (D10, B4, a data point on #625). The large dApp chip's pin is one constant, 85.8 px, as both browsers measure it within 0.1 px. Arc 1's PR opened before the cross-arc pass; and the loops' prompts omitted the standard's two verbatim rules until a round under them trimmed the comments (Audit verdicts).
- **Left out:** none of the picks. The skeleton has no capture: no smoke fixture holds Home blank and unsettled; `TokensView.test.ts` pins its 32 px round slot.
- **Review:** arc 1's Codex loop clean at round 1; arc 2's clean at round 1, then the Opus review's import-title finding settled at round 3 (D10); the fresh cross-arc pass clean, then its comment round applied and verified.
- **Lessons:** none promoted. The chevron's wrap rule lives at its code; the Firefox `setViewport` refusal is already in `apps/extension/tests/e2e/FIREFOX.md`; the rest are this plan's own, in `lessons/`.
- **Known limits:** #625 (a data point: the import row's long title).
- **Open items:** none filed. B1 to B4 go to the orchestrator with the report; each ships its "what ships now". #1763 got a reproduction data point.
- **Seeds retired:** the `/goal` and `/loop` seeds under Seeds.

# token-icons-build-2: the token rows' mark, Home's other rows, a dApp's transfer row and the fee-raised line

Page 134 answered the four surfaces token-icons-build-1 left to the owner (its A3 to A6). This lane builds them on that lane's channel and `TokenMark`, after restoring the approval window's chevron (#1789). Two stacked PRs: the fix lands alone; the surfaces wait for the owner's decision page with their captures.

## Outcome & Quality Bar

- **Excellent**: every row titled by a token draws its mark, the same picture on Home, Holdings, Send's picker, Activity and both approval windows; Home's rows start their text at one edge; no figure loses a digit; a window opened while checking or locked reads no price; every `data-testid` stays; nothing else moves. **Good enough**: a figure from about $100 trillion takes a third line (measured; P134-04 allowed from about $10T); #625's long-symbol limit stands.

## Assumptions

### Facts (at `52e2099ad`; `recon.md` has the file map)

- F1. The step sentence's chevron is an inline `<svg>` after `&nbsp;`; CSS Text 3 keeps a soft wrap opportunity beside an atomic inline even next to U+00A0. Demonstrated on the armed base build (`lessons/phase-0.md`): at 400 px the chevron sits alone in fixtures `one` and `batch`, on Chrome and Firefox. With the `&nbsp;` and the chevron in a `nowrap` span, no fixture shows it at 400 or 240 px, nor with a sender four characters longer.
- F2. With the 32 px mark and 12 px gap the token row's text gets 166.6 px of 312 at the seeded $123T balance; `type-roles.test.ts:921-924` holds its figure at two lines or fewer, and it needs 179.4 px. The edge depends on the balance column; measured in phase 2 on both browsers, the figure keeps two lines up to $99,999,999,999,999.99 and takes a third from about $100T (`lessons/phase-2.md`).
- F3. A default holds one Home slot from seed row through its own import row to its card, and both pre-card rows carry the list's `entry` (`home-slots.ts`). `userImports` can hold a listed token: delete one (a tombstone ends its seed status), then add it again. A live import's title is unset until its symbol is fetched (`token/service.ts:399-410`).
- F4. Only the settled card titles a dApp's call by its token (`journal-state.ts`); with the mark the large dApp transfer's chip read 85.8 px where `rows.test.ts:787` holds 96 (token-icons-build-1, `lessons/phase-5.md`).
- F5. `start()` runs the fee window's `init` only once its session is checked and signed in, and `untilSessionChecked` is a component-scoped watcher, so an unmounted window never reaches `init` (Codex, demonstrated). `fee/index.test.ts` pins [reads, refreshes] = [0, 0] while checking, locked or resolving, [1, 0] signed in, [2, 0] after a reconnect.
- F6. No open issue matches the four surfaces (`gh issue list --state all --search "token mark"`, `"token icon"`, 2026-11-11): no `Part of`.

### Claims that did not hold

- C1. "the network `tx-transfer-row` spec reads the row with its mark" (A5): it reads the approval window's line and rejects every request; no network spec asserts the mark on a settled dApp transfer. The smoke `rows.test.ts` does.
- C2. "the fee-raised window's spec on the armed fixture build": no fixture opens that window; `network/tx-sendTx-default.test.ts` opens it on the sandbox (TST, which no list names).

### Asks

- Ask 1. The lane brief makes #1789 "its own PR"; the spawn prompt says "one arc, one PR". Working assumption: two stacked PRs built in this session, one arc report listing both. `OWNER-ASKS.md` B1 to B4 each ship their "what ships now" form.

## Sign-offs (verbatim; the visible budget)

- **P134-04 = a**: "A as planned: the 32 px mark with a 12 px gap, and the guard restated at the new width. A figure takes a third line from about $10 trillion (today from about $1 quadrillion); a row with a wide split wraps its figure onto two lines, as the wrap rule allows. The frames you picked, with a third line only at balances no holder has. The lane's recommendation." Its premise: "Home's three other rows (a default token being set up, an import in progress, the loading skeleton) follow the rows' mark once it ships (the lane's A3, (a): the same 32 px slot before their text)." A3 (a): "the list's picture on a seed row (it comes from the list), grey initials on an import row, a 32 px round skeleton on a loading row. Every row's text starts at one edge, and a seed row keeps its picture when it becomes a card."
- **P134-06 = a**: "The mark there too, as on every other row titled by a token: the app chip shows 22 px less of the dApp's name wherever it is cut, and the guard is restated to the chip between its floor and its cap. The lane's recommendation: a dApp's transfer is where a look-alike token most needs its picture."
- **P134-07 = a**: "The mark there too: the window reads the list from the cache once signed in, a second read beside its fee card's, so the line looks the same in both windows. The lane's recommendation: a person approving a raised fee sees the token as they first approved it."
- Binding from #1787: **P129-01 = A** ("the issuers' logos as published, round, unaltered, initials in a grey circle when there is none, the red badge when flagged"), **P129-02 = M1**, **P124-04 = AC1** ("A 16 px mark before the row title, as prototyped; the 40 px box keeps chips-3's pair and badges"), **P124-05 = AL1** ("the line takes P124-01's picture, if any, in the meantime"), **P132-04 = b**, **P132-05 = b**. P46-08 = B's cap and chips-3's chip rules (P34-08 D, D5) stay; their guards are restated, never loosened.

## Architecture & Implementation

- **#1789** (`SendTxSummary.vue`): each chevron and the `&nbsp;` before it go into one `white-space: nowrap` span, the last word outside it (D1); the comment says what holds it.
- **Token rows** (`TokenCard.vue`, arc 2's built form): an outer `Flex align="center" gap="12"` holds `TokenMark :size="32"` (`iconFor`, `isFlagged`) and the existing text column; both wrappers compose `.lead` (`min-width: 0` only, in `token-row.module.css`, D5). Cap, figure and balance column unchanged; the card owns its `usePrices`, so its three hosts pass nothing.
- **Home's other rows**: the same outer `Flex` and `.lead` in `TokenSeedRow` (mark from its `entry`, the picture `TokensView` passes from `prices.iconFor(row.entry)`) and `TokenImportRow` (grey initials from its title when the title names the token, else `TokenMark`'s "—"; never a picture, D3, D4); the ghost rows lead with a 32 px `Skeleton` given a local `border-radius: 50%`.
- **A dApp's transfer** (`TransactionCard.vue`): `titleMark` drops its `!originLabel` exception.
- **Fee-raised line** (`windows/fee/index.vue`): a window-level `PriceServiceClient`; `init` opens `useTokenFlags` on it first, synchronously, into a `shallowRef` passed as `marks` to `OperationCard`; `disconnectServices` disconnects it, then disposes the reader, as the approval window does (D2).
- Marks stay decorative (`aria-hidden`, no tab stop). No new tooltip, word, stored key or shape.

## Security & Adversarial Considerations

- **Rendering boundary unchanged**: pictures come only from the verified list through `PriceSnapshot`, looked up by chain and contract, never by symbol, and draw only as `TokenMark`'s `<img src="data:…">`; no `v-html`, inline SVG or remote fallback; CSP untouched. The signature authenticates the publisher, not the picture's truth; that trust is arc 1's of token-icons-build-1.
- **Hostile strings**: symbols, import titles and dApp names stay text; initials take letters and digits only; `.lead` lets clipped text yield so a long symbol cannot push the balance off (measured in the phase 2 probe, both browsers).
- **Privacy**: the fee window's added read is the network-free cached `getQuotes`, never a fetch, and none happens before `init`; a lock while open ends the window (`onActiveProfileChanged`). Look-alikes: a dApp's transfer and the fee-raised line now show a flagged pair's badge.

## Phases

`bun run lint` and `bun run typecheck:all` close every phase. E2e at retry 0 after the armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 VITE_NULO_E2E_EXECUTE_FIXTURE=1`; run env `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1`); smoke through `bun run test:e2e`, network through `e2e:agent` (D7). Unit gates: `bun run test` and `bun run --cwd apps/extension test:components`, exit 0.

### Phase 1: the step's chevron (arc 1, #1789) ✓

- **Change map**: `SendTxSummary.vue`, `OperationCard.summary.test.ts`, `tests/e2e/execute-steps.test.ts` (the chevron takes a testid).
- **Tests**: component: on the head and on the line (an address last, and `. Caller: none` last), the chevron and a lone U+00A0 sit in one span right after the last word; red on base. Smoke: in the existing 400/240 px loop, each step's chevron shares a line with its sentence's last non-blank text fragment (`batch` at 400 px is red on base).
- **Gate at arc 1's head**: unit gates; `execute-steps.test.ts` on the base build (red), then on arc 1's armed build, Chrome and Firefox (green).

### Phase 2: the token rows (arc 2) ✓

- **Change map**: `TokenCard.vue` (+ test), `token-row.module.css`, the mocks `2bffd89f9` emptied (`TokensView`, `TokenList`, `SelectTokenPopup`, `holdings` tests: every snapshot, refresh and broadcast carries `tokenIcons`), `tests/e2e/type-roles.test.ts`.
- **Guard (D8)**: a throwaway probe measures the edge on both browsers. The $123T row stays, for the hero, and its figure is held at three lines. A second listed, priced row at the largest figure the probe keeps on two lines is held at two. The row's mark is held at 32 px with a 12 px gap; no digit is cut (`cutFigures`).
- **Tests**: logo, initials and badge on a row; the mark precedes the symbol column; `.lead` on both wrappers (source scan, as arc 2 had).

### Phase 3: Home's other rows (arc 2) ✓

- **Change map**: `TokenSeedRow.vue`, `TokenImportRow.vue`, `TokensView.vue`, `token-row.module.css` (+ tests).
- **Tests**: seed row: the given picture, initials without; import row: initials of its title, "—" with none, empty, blank or punctuation only, never a picture; `TokensView`: a seed slot gets its entry's picture, a same-symbol entry on another contract none; a ghost row leads with a 32 px round skeleton. Smoke: `rows.test.ts`'s seed-row height check unchanged and green.

### Phase 4: a dApp's transfer row (arc 2) ✓

- **Change map**: `TransactionCard.vue` (+ test), `tests/e2e/rows.test.ts`.
- **Tests**: a dApp's transfer draws the mark (logo, initials, badge); a dApp's call does not. `rows.test.ts`: every direction row draws its mark, 16 px with a 6 px gap. The large dApp transfer's chip is cut beside an uncut symbol, at the width the probe measures (per browser, ±0.5 px), between floor and cap, ending at the title row's edge. The floor chip, the between-floor-and-cap check and the amount-clearance check stay.

### Phase 5: the fee-raised line (arc 2) ✓

- **Change map**: `windows/fee/index.vue`, `windows/fee/index.test.ts` (the `OperationCard` stub declares `marks`), `tests/e2e/network/tx-sendTx-default.test.ts`.
- **Tests**: [reads, refreshes] restated: [0, 0] checking or locked; [1, 0] signed in, operation resolving; [2, 0] resolved; [4, 0] after a reconnect. Disposal: after unmount, a reconnect reads nothing. Threading, as the approval window's test does: the card's `marks` answers the list's picture and flag on its chain, nothing on another. Network: the fee window's line draws TST's initials.

### Phase 6: gates, captures, PRs ✓

- **Gates, once, in order, at arc 2's head**: `lint`, `typecheck:all`, unit gates, `audit:vue`, `test:all`, `check:plans`; armed builds; smoke `execute-steps`, `type-roles`, `rows`, `home-links`, `token-list`, `shipped-token-list` on Chrome then Firefox, against their base durations; `e2e:agent tests/e2e/network/tx-transfer-row.test.ts tests/e2e/network/tx-sendTx-default.test.ts` on Chrome then Firefox.
- **Captures**, light and dark, from a throwaway spec into `~/.cache/nulo-backlog/token-icons-build-2/shots/` with `captions.json`: Home at an everyday balance and just below and above the edge; Holdings; Send's picker; Home with a seed row and an import row; the skeleton; History with a dApp's transfer, chip cut, beside a plain row; the fee-raised line with initials (the sandbox run, shots on), and with a logo if a local, uncommitted list edit can name the sandbox token, else the PR says so.
- **PR bodies** quote the sign-offs and embed the captures from `pr-captures/token-icons-build-2/`, committed in one commit and removed in the next.

## UI impact

- **Token rows** (Home, Holdings, Send's picker): the 32 px mark and a 12 px gap before the symbol (logo, grey initials, red badge when flagged); a figure takes a third line from about $100T (measured; the sign-off allowed from about $10T), a wide split wraps under its "≈". Sign-off: P134-04 = a, P129-01 = A, P129-02 = M1.
- **Home's seed, import and skeleton rows**: the same 32 px slot; a seed row draws the list's picture, an import row grey initials, a ghost row a 32 px round skeleton. Sign-off: P134-04's premise, A3 (a). B1 to B4 cover what A3 does not say.
- **A dApp's transfer row**: the 16 px mark and 6 px gap before the symbol; the app chip up to 22 px shorter. Sign-off: P134-06 = a, P124-04 = AC1.
- **The fee-raised window's line**: the 16 px mark before the amount, as in the approval window. Sign-off: P134-07 = a, P124-05 = AL1.
- **The approval window's step sentence** (#1789): the chevron ends the last line beside the last word, as the template intends.

## Delivery

| Arc | Branch | Phases | Stacks on | PR title | Lands |
|---|---|---|---|---|---|
| 1 | `token-icons-build-2-a1` (plan commit + fix) | 1 | `dev` | `fix(execute): a step's chevron stays on its sentence's last line, beside its last word` (86) | `Closes #1789`; by policy once green |
| 2 | `token-icons-build-2-a2` | 2 to 6, close-out | arc 1 | `feat(tokens): token rows, home's other rows, a dapp's transfer and the fee line draw marks` (90) | no `Closes`; on the owner's decision page |

`gh stack submit --auto`, then `gh pr edit` per body; ready, no labels. The PR bodies state each touched spec's duration before and after.

## Post-implementation

Cite `implementations-plan/README.md` § Post-implementation standard at `52e2099ad`. Codex loop per arc at its boundary (`run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; arc map "arc 1 of 2: the chevron; arc 2: the four surfaces"), hard stop at three rounds; one Opus review (`general-purpose`) beside arc 2's round 1; one fresh Codex pass over `52e2099ad..tip`. Anything visible beyond the UI impact lines goes to `OWNER-ASKS.md` and is left out. Teardown is the orchestrator's.

## Decision ledger

| # | Decision | Codex (plan audit) | Call and reason |
|---|---|---|---|
| D1 | #1789's box: the chevron and its `&nbsp;` (A), or the last word too (B) | A; B would make a long contact name unbreakable | A, proven on both browsers (F1). |
| D2 | Where the fee window opens its reader | `init`: the existing gate; the watch's rationale was false (F5) | `init`, synchronously, first: same counts as a watch, no new lifecycle. After the operation resolves would allocate after an await. |
| D3 | A default's import row | not inside A3 (a); an owner ask | Grey initials on every import row, as A3 says; the picture there is B2. |
| D4 | An import row with no title yet | "—" is right, but an owner ask | Ships "—" (B3). |
| D5 | Shared `.lead` | share CSS, but the inner column keeps its 2 px gap and alignment | `.lead` is `min-width: 0` only; gap and alignment stay on each `Flex`. |
| D6 | The large dApp chip's guard | pin the measured width, plus floor, cap, edge, uncut symbol, clearance, mark and gap | Taken. |
| D7 | Smoke through `test:e2e` | agree | `agent.sh` runs only the network config (token-icons-build-1 D16). |
| D8 | The type-roles guard | keep the $123T row; add a boundary row; hold the mark's geometry | Taken; its "three lines just above" is the $123T row held at three. |
| D9 | The fee window's threading test | un-stub `OperationCard` | Rejected: the file stubs it by design, and the approval window's test reads `marks` the same way; the forwarding is pinned end to end by the network assertion. |
| D10 | An import title too long beside the mark (Opus, arc 2) | round 2: an ellipsis is a visible decision, so approve it or defer the mark; round 3, on the measurement: ship | Ship A3's mark; the title stays uncut, as #625 records for long symbols; B4 asks for the ellipsis; the measurement goes on #625 at close-out. |

## Audit verdicts

- **Codex, plan audit** (session `01a1cb58`, gpt-6.1-sol, high): conditional approve. Accepted: D2 (`init`, F5 corrected), D3 and D4 as owner asks, D5's scope, D6, D8, F3's counterexample, C1's wording, the mocks, the disposal test, the network initials assertion, the import-title classes, the per-arc gate, durations before and after. Rejected: D9. Taken as `batch`, not `one`, in the loop: the probe shows `batch` red at 400 px on base. Partly taken: the 32-character claim moves to the probe; the long named recipient stays in the component test.
- **Fix loop, arc 1** (Codex session `01a1cb7f`): approve in round 1, no material findings.
- **Fix loop, arc 2** (Codex session `01a1cb95`; one Opus `general-purpose` review beside round 1): round 1 approve; Opus found an import title spilling over the spinner (D10) and a chip comment's wrong arithmetic; round 2 conditional, round 3 **approve** (comments corrected, B4, #625 data point).
- **Fresh cross-arc pass, rounds 2 and 3** (session `01a1cba7`): the earlier prompts lacked the post-implementation standard's two verbatim rules, so round 2 ran under them over `52e2099ad..c7cbc4ae5`: no bug; comment cuts and rewrites, applied but for three kept with reasons (a pre-existing mock note, a helper doc kept for its file's consistency, a fixture inventory); round 3 **approve**.
- **Codex, final fresh pass** (session `01a1cb65`, gpt-6.1-sol, high): **approve** ("No material findings"; D9's rejection holds, as `tokenMarkOf` returns null without a reader, so the network initials assertion catches broken forwarding).

## Seeds

```
/goal All phases marked ✓ in implementations-plan/token-icons-build-2/plan.md, each gate reported passing in the transcript; the Codex loop converged per arc and in the fresh pass; two stacked PRs open, ready, arc 2 carrying the close-out; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/token-icons-build-2 forward per its plan.md from the stack's top branch; decide with Codex at high on gpt-6.1-sol; never merge; stop once both PRs are open with checks read.
```
