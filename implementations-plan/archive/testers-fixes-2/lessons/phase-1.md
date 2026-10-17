# Phase 1: dApp rows on one line, the App row

- 2026-10-16, merged `origin/dev` at 3dc5a06a before starting (#603, #619 and #613 landed after the plan); none of them touches a file this arc changes.
- 2026-10-16, red proof on the base (armed Chrome build of the unchanged source): the new `rows.test.ts` case fails on Home's scroller, `DIV 454>360`, with the terminal card's title over 8 lines.
- 2026-10-16, after the change: Chrome and Firefox both measure the long title cut on one line, the long app chip at 96 px, "NEMI" whole at 36.8 px, the two-chip row's symbol whole, the details' App value on two lines flush with the box's inner edge, 16 px after its label. Firefox lays it out as Chrome does (I1 holds).
- Deviation: the "NEMI" row is a settled dApp call (`seedTransaction` with `method`), not a second journal record, so the browser test covers the settled card's one-line path as well as the terminal card's; the awaiting card shares the terminal card's rule and is covered by its component test.
- Deviation: a non-`transfer*` `method` seeds a call with no transfer, as the wallet records one (a transfer decoded on a swap would draw an amount no real row has).
- Deviation: `TransactionCardLayout.test.ts` gains one case for the prop's class binding; the plan named only the three card tests.
- Gate note: the first Chrome gate run started at load1 176, above the 150 rule (it passed); every later e2e run goes through a wait-until-calm wrapper.
