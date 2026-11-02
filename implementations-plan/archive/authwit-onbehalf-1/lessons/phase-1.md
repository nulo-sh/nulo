# authwit-onbehalf-1: phase 1 (the filter, its tests and the e2e)

## Reproduction (base `c4173bb8e`)

- `tx-sendTx-fields.test.ts` unchanged, proverless, retry 0: Chrome 39.8 s, Firefox 48.2 s (the test's own time).
- With the window assertions and base sources (Chrome): red, `{ calls: 1, authwitLines: 1, authwitSection: true }` against `{ calls: 1, authwitLines: 0, authwitSection: false }`. The window lists "Lets Second call Transfer Private To Private on …", and under the details "Authorizations the wallet will sign (found during estimation)" names Second (`screenshots/before-*.png`).
- Unit tests on base sources: the decoder's two new cases, the real preimage naming another account, the probe's drop case and the `default_entrypoint` case red (the last behaviourally: two records listed, not one). The summary pin green on base, as planned.
- A first details capture showed only the viewport: the window scrolls its own container, so the capture step scrolls the details block into view first. The capture step stayed uncommitted.

## Fix

- D1-D3 as planned. The probe's `extractEffects` keeps an explicit signature; the strategies read `extracted.requested`.
- One test typing fix: a `vi.fn` with no parameters types `mock.calls` as `[][]`, so the createAuthWit assertion casts to `unknown[][]` before reading the hash.

## Gates (head `a7f191f56`)

- `bun run lint`, `bun run typecheck:all`, `bun run test:all` (extension 16,664 passed): exit 0.
- Chrome network, proverless, retry 0: 5 files, 8 tests passed. `tx-sendTx-fields` 45.3 s (45.0 s in the capture run).

## Review loop

- **R1, Codex gpt-6.1-sol high (session 01a19dcf): findings (3), comment-only.** The decoder's comment claimed the dropped request's witness is the one its check reads (false for a hostile contract); the summary pin's comment claimed coverage it lacks; six redundant comments. All taken.
- **R1, Opus 5.5 (general-purpose): findings (3), comment-only.** The fold headers and two TSDocs still said "effects" where the trigger is now any decoded request; the same decoder and summary-pin comments. All taken.
- **R2, Codex resumed: clean.** "Accepted fixes verified. The diff changes comments only; no behavioral regressions, weakened assertions, or new findings."
