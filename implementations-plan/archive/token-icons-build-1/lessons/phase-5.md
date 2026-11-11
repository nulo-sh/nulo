# Phase 5: Activity and the approval line

## Re-recon against the tree (arc 3 base `0c4b3b11e`)

- #1776 rewrote the approval window's details (`CallArguments.vue`, the new `ValueTree.vue`, `OperationCard.vue`'s raw rows, `execute.fixture.ts`'s facts). `SendTxSummary.vue`'s transfer line and its `execute-op-line-amount` are as recon read them, and `execute/index.vue` already holds `useTokenFlags`. Phase 5's change map holds for the line.
- The settled card owns its price composable (`TransactionCard.vue`), so it reads the picture and the flag itself. Only the received and journal rows take the reader from their list (`TransactionsList.vue`, `RecentActivityView.vue` through `ActivityRowCard.vue`).
- History's sends in progress sit outside `TransactionsList`, so `pages/activity.vue` reads the list through `useTokenFlags` on its own price client.
- `journal-state.ts` gains `journalCardTitleMark`, beside the awaiting card's other field builders, and its `TokenForCardProps` names `chainId` and `contract`. It was not in the change map.
- An unknown contract's call gets no transfer line at all (the summary reads only tokens in the list). The line in base units belongs to a known token whose symbol reads as nothing, and it draws no mark.
- The summary's line is one element for a transfer and a mint ("25 USDC to …"). The mark goes before the amount on both, as prototyped.

## The rows' geometry, measured before building on it

- A throwaway probe, kept outside the repo, seeded the rows suite's five direction rows, its 16-letter dApp transfer, a nine-digit transfer, a receipt and a failed send. It measured History in Chrome at the popup's width and at 240 px, with the mark and with it hidden.
- Rows titled by a token with no chip: with the mark, the title row ends at least 28 px before the amount column, the type-roles seeds (1.5, +2.5, 0.7) included. The mark costs each 22 px (16 + 6).
- A dApp's transfer: the app chip gives way to the mark. "Shielded Payroll Portal" beside 1,250 USDC reads 85.8 px, where `rows.test.ts` holds it at its 96 px cap, so the full Chrome rows spec went red. The 16-letter symbol keeps its chip at the 20 px floor and still ends exactly at the text column's edge.
- A 16-letter symbol beside a nine-digit transfer already runs 7 px into the amount column today; the mark makes it 29 px. That is #625's known limit (a symbol is never cut); the mark brings its threshold about two and a half letters closer.
- Under 359 px the rows wrap; the mark rides the title's line.

## The decision (D18)

- The rows' geometry recurred on one row kind, a dApp's transfer, where a pinned guard (the chip at its cap) cannot hold with the mark. That row ships without the mark (`OWNER-ASKS.md` A5); the guard is not restated. Every other row titled by a token carries it in every phase.

## Tests

- A mocked price client whose snapshot omits `tokenIcons` makes `iconFor` throw once a surface calls it. The History page's and the settled card's mocks now carry the list's two fields, as the real snapshot always does.
- The summary's words are read with the mark taken out (`OperationCard.summary.test.ts`), and the mark gets its own assertions (`SendTxSummary.test.ts`). The mark is decorative and `aria-hidden`, but its initials are text a `.text()` read returns.
- `index.test.ts`'s `OperationCard` stub declares `iconFor` and `isFlagged`; an undeclared prop lands in `$attrs`, and `props()` reads undefined.
- The History-path test was checked by mutation: with the reader not passed down, the received row's badge and the failed send's logo both go.
- `rows.test.ts`'s test body crossed the cognitive budget (17) with the expected-mark branch; the branch moved into `listedMark`.

## Review

- Codex round 1 (session `01a1c8bd`): two lows, both folded: the mint negative now reaches a recognized mint (registered token, matching `classId`) before asserting no mark; the `.line_mark` comment went.
- Opus, beside it: the fee-raised window renders the same summary with no list reader, so its line drew a listed token's initials and a flagged one with no badge. Threading `useTokenFlags` there turned four of that window's tests red: it reads no price while its session is checked or locked, and reads the cache once, from its fee card. So a summary given no reader draws no mark, and the window's line goes to the owner (D21, A6).
- Opus also: an empty cleaned symbol drew a mark in flight but none once settled, so the title would move 22 px as the row settles; `tokenMarkOf` now returns null with no symbol, on every surface. And Home's and History's in-flight cards could lose the reader with every test green; one assertion each, red under mutation.
- A mocked refresh that omits `tokenIcons` crashes the render once a row draws a mark (`Object.hasOwn` on undefined). The real snapshot always carries it; `RecentActivityView.test.ts`'s refresh mock now does too.
- Codex round 2: clean. The cross-arc pass found only docs drift: A1 and A2 were answered (b) on page 132 and shipped by #1780.

## The gates

- Arc 2's after-run could not stand in for arc 3's before-run: the `dev` merge between them brought #1776's approval-window rewrite. The before-run ran at arc 3's base `0c4b3b11e`, with the same armed build and runtime flags as the after-run.
- Every gate ran once, in order, at retry 0, on `fb0063689`, green. The full smoke suite took 1,755 s before and 1,793 s after on Chrome, and 2,594 s before and 2,595 s after on Firefox, at a host load average between about 70 and 135. The changed `rows.test.ts` case slowed in step with the file's untouched cases, so the mark read costs nothing the noise does not cover.
- Firefox's `type-roles.test.ts`, red once during the build on the Senders loading text, was green in both full runs and in the touched-spec run.
