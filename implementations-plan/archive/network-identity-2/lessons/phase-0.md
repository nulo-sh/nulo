# Phase 0: planning consults

Every consult of the planning run, failed ones included. Each entry records the verdict and what changed in the plan, stated as rules.

## Consult 1: Opus Plan leg, 2026-10-20

- Verdict: **approve with changes**. Adopted:
  - Firefox counts the content script's `*://*/*` match as all-sites access, so the price request's credentials are stated per browser, and `credentials: "omit"` is argued as holding on every browser rather than as changing no bytes.
  - Phase 1 runs the base build on Firefox too, and Excellent 2 is claimed per browser.
  - `rows.test.ts`, the host's other caller, joins the Phase 3 runs; the Firefox scope is recorded as a deviation from the fixtures rule.
  - Tests first in Phase 2 (no stash); the price pin uses `toHaveBeenCalledWith`, since the harness mock's one-parameter type makes a second-argument index a type error; `bun run test` is dropped (`test:all` covers it).
  - D5's reason is corrected: a redirect can change the URL and the referrer policy.
  - OA-1 recommends keeping the header; the "older builds" reason was wrong, since the host's `ETag` is a content hash shared by every wallet.
  - The live hosts' headers go into recon.md; the e2e host sends only an `ETag`, as production does.
  - Plan wording follows the committed-text rule; the PR body takes the "after" wall-clock from CI.
- Rejected: importing the list's `FetchLike` into the price service (D2; Codex's reason won).

## Consult 2: Codex plan review (gpt-6.1-sol, high, session `01a15b22`), 2026-10-20

- Verdict: **approve with changes**. Adopted:
  - Every statement of the invariant names the HTTP cache: both services keep data in their own storage on purpose, so "keeps no copy" alone is false.
  - Fact 3 reads "a verified `ok` body".
  - If Phase 1 shows no validator on a browser, the plan does not claim browser evidence there.
  - Explicit command directories, the index line, the `resume-codex.sh` form, `lint:actions` before the push, a second checks watch after the close-out commits.
  - D5 keeps redirects with the corrected reason; OA-2's wording names the HTTP cache and the existing non-blocking notice.
- D2: Codex preferred the local widening (each service owns its fetch seam); chosen.
- D3: Codex approved it with the per-browser base control; no `Last-Modified`.

## Consult 3: Codex verification (session `01a15b22`, resumed), 2026-10-20

- Verdict: **approve with changes**: F1 and F2 confirmed. Adopted:
  - A Phase 1 run that fails anywhere but the new assertion is inconclusive and is fixed and rerun; D3 is dropped only when both runs pass with no validator sent, and Excellent 2 is then not claimed.
  - The close-out commits are pushed before the last checks watch.
