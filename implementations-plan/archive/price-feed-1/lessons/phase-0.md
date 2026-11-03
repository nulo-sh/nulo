# Phase 0: planning consults

## Codex R1 (gpt-6.1-sol, high, fresh session): reject

Blocking: (1) an answer could pair a quote filtered under one list with a later list's band and mapping (`price/service.ts:167-170,298-306`); (2) strict feed coverage would refuse today's source and served envelope, which `check.ts` parses strictly and this lane may not touch; (3) a 1e-6 floor admits rates `convert.ts` snaps by up to 33%. Also: OA-1 overstated continuity (installs refresh the list daily, not at update); the e2e zero-token list (`register-token.test.ts:118`) would fail strict coverage; the logging claim overstated (`record()` echoes an unknown key in strict). All verified in the tree and accepted except the ask to put the CI summary's wording to the owner (rejected: publisher tooling, not a product surface; `live-check.ts` set the precedent). D4, D7, D8, D9, D10 endorsed; the competing outline rejected.

## Opus R1 (Plan agent, opus): conditional approve

H1 restated Codex's strict-coverage finding. New: a `constructor` feed key with a record reaches the popup's plain-object lookup (`usePrices.ts:127`) as the built-in `Object` (only `constructor` passes the id charset); `list.read` adopts a newer mapping before its quotes (`usePrices.ts:49-58`), so `quoteFor` must check the band; D12 must be decided now; missed consumers (`import-closure.test.ts:54`, `open-publish-pr.ts:67`, `sign.ts:62`, `service.test.ts:160`); artifact smoke runs skip fiat until the feeds publish. All verified and accepted, except the floor raise on a feed change: Codex R1 had called it a known limit, and that view won (D12).

## Codex R2 (resume of R1): approve

Verified the R1 fixes; no new material finding; did not reopen the two rejections.

## Codex final (gpt-6.1-sol, high, fresh session): conditional approve → approve

Conditions: the smoke gate loaded `dist/<browser>` without building it (`global-setup-smoke.ts:16-63`); D3's accuracy figures bound only the rate's snap, not token-unit rounding (a zero-decimal token at $0.0001 rounds $0.000001 to zero tokens); the `prepare` summary's wording belonged in OWNER-ASKS. All accepted: the gate builds the armed build per browser, D3 qualified, and the wording recorded as a "not an ask" section on the token-list-live-check precedent. The resumed pass verified the three and approved.
