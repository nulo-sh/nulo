# Phase 4

- Seeding the Fee Juice quote alone does not hold in the network suite: the worker fetches the live rate at launch, and a fetch in flight reads the cache before it writes it back. The pin (`tests/e2e/fixtures/fee-quote.ts`) refuses `https://api.coingecko.com` at the scenario's start, then seeds once `PRICE_FETCH_TIMEOUT_MS` (now named in `price/spec.ts`) and a second have passed since the refusal armed. A write delayed past that window is not covered; it fails the assertion, never passes it. Known limit #711; a refusal armed at launch would close it.
- A fee card renders its figure before its quote's read answers, then adds the dollars. A priced figure is read once it settles (`settledText`, or a poll over the line), never once.
- The re-ask sheet keeps the quote it opens with, and Home's gas card owns a different price client than the activity feed. Waiting on the gas card's dollars proved nothing about the feed; the feed now states its own quote (`data-fee-quote` on `activity-feed-root`) and the loop waits on it.
- The Fee Juice shortfall line on Send has no e2e path: it needs a self-paid account holding less Fee Juice than the fee. Its text is pinned by `FeeSettingsCard.test.ts`; the PR carries no picture of it.
- `same-token-concurrent-sends` is `@requires-proverless`: run it with `NULO_E2E_PROVERLESS=1`, or the guard exits 2 before the build.
- Codex's `resume-codex.sh` takes the Codex output directory as its third argument; passing the worktree wrote the session's files into it.
