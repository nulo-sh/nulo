# Phase 3: close-out (2026-10-16)

## The branch (D42)

- `chain-endpoints-close-out` held the revision (001024fe, a dev merge, 78d22cca). Arc 2b's branch was cut from it at 78d22cca, and #609 squash-merged that branch into `dev` as 493ff497, so `dev` already carried the revision and arc 2b's plan records. `git diff origin/dev chain-endpoints-close-out -- implementations-plan/chain-endpoints` showed only lines `dev` had superseded. The branch was moved to `origin/dev` (a local, unpushed branch) and the close-out committed on top.

## P25-10 B (D43)

- The approval read OA-8 as unanswered. #116 had been reopened at 15:21Z for page 25, P25-10 **B** ("Lands with the `chain-endpoints` close-out arc, after 2b"), and the orchestrator's record of the approval (15:28Z) says the close-out carries it as its own commit. The signed answer governs; no `owner-decision` issue was filed.
- `rg '\.unavailable\b|lastRefreshFailed'`: `BalanceView.vue:214` was the signal's only reader.
- Codex consult (fresh session `01a146db-80b2-71b3-bbb0-277119741c9a`): take the cleanup, keep the failed-fetch broadcast. `useIncomingTransfers` and `useArrivals` re-read on every `onQuotesUpdated`, and the incoming-dust filter fails open when a quote is absent (`utils/incoming-dust.ts:7`); without the broadcast, a receipt hidden as dust under a quote that then expires behind failed refreshes stays hidden until another event. Verified at `useIncomingTransfers.ts:150`, `useArrivals.ts:458`. Also: the slow-provider case (no answer by the 12 s cap) now reads "—"; pin it.
- Negative control: the new component cases with the old predicate put back fail ("funded, and the answer carries no quote for the held token", "the 12 s cap ends a price wait that never answers"); restored, 112/112 pass across the three touched files.

## A5, the network suite's egress sample (D29)

- Local, uncommitted: `project.provide("egressGuard", true)` in `tests/e2e/global-setup.ts`, and a print of `guard.attempts()`, the canary count and `node?.requests()` after the listeners stop in `closeAfterEgressCheck`. Both restored after the runs (`git status -- apps` clean).
- Chrome (start load 148, both files in one `e2e:agent` call, retry 0): `networks` 4/4, `default-token-seeding` 1/1. Each launch recorded Chrome's listed hosts (`clients2.google.com`, `accounts.google.com`, `www.google.com`, `update.googleapis.com`, `android.clients.google.com`), its canary (count 0) and `api.coingecko.com:443` once. The Testnet stand-in answered 20 node requests in `networks` and 12 in `default-token-seeding`.
- Firefox (start load 148, one call, retry 0): `default-token-seeding` 1/1, `networks` 4/4. Each launch recorded Firefox's listed hosts (`firefox.settings.services.mozilla.com`, `firefox-settings-attachments.cdn.mozilla.net`, `content-signature-2.cdn.mozilla.net`), its canary (count 0) and `api.coingecko.com:443` once. The stand-in answered 12 node requests in `default-token-seeding` and 17 in `networks`.
- No wallet or spec host beyond the declared ones, but every stand-in count is nonzero: the unguarded network suite sends those requests to `lb.drpc.live` and the price fetch to CoinGecko. Deduped (`network e2e outside host`, `lb.drpc.live`, `drpc`; #317 was the artifact-smoke twin, fixed by #320), filed #620 (`ci`).

## Reviews

- Cross-arc pass (session `01a146d9-43be-7b03-b024-5209e058ae29`): r1 approve, one Low (D4/D5 superseded by #320), fixed; r2 approve. Converged.
- P25-10 (session `01a146e1-ca86-78b0-bc90-d130aabc712d`): r1 approve, two Low comment and test-name fixes; Opus beside it approve with fixes (two comments, #618 filed, two findings answered in plan § Audit verdicts); 5c9ebe9c; r2 approve. Converged.
