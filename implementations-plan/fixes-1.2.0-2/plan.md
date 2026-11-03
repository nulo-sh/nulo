---
plan: fixes-1.2.0-2
tier: light
status: arc 1 ✓ (#1643 merged); arc 2 in progress on OA-1's answer (B)
issues: "refs #1609 (arc 1); #1618 (arc 2)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit, resumed until approve; no Opus plan leg (light)
base: origin/dev at ea282b7bc
trunk: dev
post_implementation_hardening: not scheduled
---

# fixes-1.2.0-2: the dRPC batch cap at 25, and the Sponsored fee payer offered only on Testnet and the local network

Two bounded wallet changes for the 1.2.0 freeze, as two independent PRs off `dev`. Arc 1 raises the free dRPC endpoints' batch cap from 3 to 25, the provider's stated limit (#1609 follow-up). Arc 2 hides the Sponsored fee payer on Alpha Mainnet with a compiled per-chain list (#1618, option B). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The issues and the brief, checked

- **#1609 follow-up, held:** my probe at 18:51 UTC (lessons/phase-0.md) posted 25, 26 and 100 `aztec_getNodeInfo` and `aztec_getBlockNumber` entries to both origins: every request HTTP 200, every entry answered. 25 is dRPC's stated contract, not an edge limit seen today.
- **Held:** `check:seeds` already sends exactly `maxBatchSizeFor(seed.rpcUrl)` calls in one tick (`apps/extension/scripts/seed-identity.ts:20-22`), so it sends 25 with no script change.
- **Did not hold as written: "the adapter's unit tests move from 3 to 25".** The package test (`aztec-node-factory-adapter.test.ts:160-180`) injects its own cap of 3 and proves the threading, not dRPC's value; it stays. The wallet's adapter construction is pinned by `node-factory.test.ts`, which moves to 25 (D7).
- **#1618, demonstrated by code trace.** `getFpcs(chainId)` derives both canonical addresses and discovers any missing row on every chain (`apps/extension/src/wallet/services/fpc/service.ts:163-169`); the picker lists every stored Sponsored row (`fee-helpers.ts:213-221`). The unpublished Mainnet instance is the issue's live read (`node_getContract` null, 2026-11-03), not re-run here.
- **Wider than the brief says:** the fee card draws a loading "Sponsored" row on every chain while the FPC list is unread (`withLoadingRows`, `fee-helpers.ts:235-244`), and a saved Sponsored pick previews its label on the trigger (Fact 9). Arc 2 gates the first (D4); the second is OA-1, answered B (D8, D9).
- **Held:** two smoke specs store both protocol rows on the new profile's chain, Mainnet (`security-reset.test.ts:44-46`, `type-roles.test.ts:1094-1099`). Recon's third, `send-keyboard`, did not hold: its sponsor test switches to Testnet first (`registerOnListChain`, `fixtures/extension.ts:408-414`).
- **Deviation from the brief's shape** ("one arc, two PRs"): the same two independent PRs, numbered as two arcs so the one OA-1 does not touch runs first (D6).

## Outcome & Quality Bar

- **For whom:** a person proving a send through a free dRPC endpoint; a person on Alpha Mainnet choosing how to pay a fee.
- **Excellent:** a 100-call tick leaves the wallet as 4 requests, never one dRPC says it refuses. On Mainnet no fee list names a method that cannot pay: no Sponsored row, loading or loaded, in the picker or in Settings → Fee payers, including on installs that stored one before; Testnet and the local network are unchanged.
- **Good enough:** no new setting and no node probe; a chain added later needs a release to gain the sponsor; on every network a sponsor label reaches the fee trigger a beat later, once the read fee payer list holds it (OA-1, B).

## Assumptions

**Facts** (verified at `ea282b7bc`)
1. `CHAIN_IDS` is `{ TESTNET: 685146337, MAINNET: 2070860441, SANDBOX: 0 }` (`apps/extension/src/utils/chain-ids.ts:34-38`); the local network's id is 0, so no check may test it for truthiness.
2. `getFpcs(chainId)` is the only path that discovers; it returns early when both protocol rows exist (`service.ts:163-166`). `deleteFpc` refuses a protocol row (`service.ts:410-424`).
3. A saved pick naming a missing row falls back (app windows: Nulo's sponsor, else nothing; Send: its privacy walk) and is never pruned on read (`useFeeSelection.ts:183-191`, `fee-privacy.ts:108-117`).
4. `FeeSettingsCard.vue` has `props.network` with `chainId` (line 48) and builds the loading menu at lines 150-159.
5. `private-fpc-address.ts` is a light FPC module that the popup and the worker both import; `protocol-fpcs.ts` imports the contract artifacts.
6. `maxBatchSizeFor` reads `BATCH_CAPS` by literal origin (`seeds.ts:101-115`); every client the wallet builds takes it (`node-factory.ts`, `seed-preflight-node.ts`).
7. The wallet gives a loopback node of kind `local`, or one at the Local Network seed's URL, chain id 0 (`network/service.ts:119-120`), so a developer's own sandbox keeps the sponsor.
8. Backups carry no FPC rows: an `fpc` slice is refused as unknown (`services/backup/README.md`, Retired slices).
9. Send previews a saved sponsor pick by its saved label until the first snapshot commits (`fee-privacy.ts:100-105`), and the app windows pre-fill the saved record (`useFeeSelection.ts:214-220`); a mounted Send card keeps the picks it read. Settings' delete prunes picks with `saveFeePick({ kind: "forgetFpc" })` (`pages/settings/fpcs/index.vue:91-93`).

**Inferences**
- I1. The owner's install holds a Mainnet Sponsored row and may hold a saved pick naming it (the owner saw the row on Alpha).

**Asks:** OA-1 (a saved Sponsored pick's preview), answered B by the owner on 2026-11-03, verbatim: "Also hold the preview: on every network the fee button shows no saved label until the fee list has confirmed that method is available. No label a person cannot pick is ever shown, at the cost of the label arriving a beat later on every open."

## Architecture & Implementation

**Arc 1: the cap.** `BATCH_CAPS` holds 25 for both dRPC origins; its comment states dRPC's free-plan limit of 25. Nothing else moves.

**Arc 2: the list.** A new light module `apps/extension/src/wallet/services/fpc/sponsored-fpc-chains.ts` exports `offersSponsoredFpc(chainId: number): boolean` over a `ReadonlySet` of `CHAIN_IDS.TESTNET` and `CHAIN_IDS.SANDBOX` (D1, D2). Three readers:
- `FpcService.getFpcs(chainId)`: on a chain the list leaves out, the Sponsored half counts as present, so discovery never registers it and a Mainnet read with the Private row returns early. A stored row of type `DefaultSponsoredFpc` at the derived canonical address is removed by one private helper (D3): under the service lock it re-reads the row by id and goes on only if profile, chain, type and canonical address all still match; it takes `storage.prepareDelete`, checks `profileService.isFenceLive(fence)` right before `commit()`, and emits `onFpcDeleted`. After the lock is released it asks `UiPreferenceService.saveFeePick(profileId, { kind: "forgetFpc", fpcId })`, as Settings' delete does; that is best effort (a refused or failed forget is logged at debug, and nothing retries it). `getFpcs` returns the rows read after it. A hand-added Sponsored row at any other address stays.
- `fee-helpers.ts`: `FeeMethodsOptions` gains `offersSponsor?: boolean`; `withLoadingRows` adds the placeholder only when it is true. `FeeSettingsCard.vue` passes it for a defined chain id (`chainId !== undefined`, so 0 counts) in the pending menu (D4).
- `tests/e2e/helpers/fpc-seeds.ts`: `seedProtocolFpcs` stores the rows discovery writes on the scope's chain and returns their ids; `SEEDED_FPC_IDS` goes, and `security-reset` and `send-keyboard` assert the returned ids; `SEEDED_SPONSOR_FPC_ID` stays for the Testnet keyboard test (D5).
- The hold (OA-1, B; D8, D9): `previewForPick(pick, methods, readFpcs)` (`fee-privacy.ts`) draws a sponsor pick only as the row the live identity's read FPC list holds for its id, never from its saved label; `readFpcs` is null while that list is unread or its read failed, so then nothing shows. `FeeSelectionInput` gains `readFpcs`, which the card fills with its `earlyFpcs` (the same list its menu draws from). Send's pending preview calls it. The app windows keep their pre-fill, but while the live identity's snapshot is pending their rule book exposes a sponsor selection (a saved pick's pre-fill, or one carried over an identity switch) only through the same function: before `readFpcs` holds it, nothing is shown, emitted as the payer or toasted on its deletion; the internal selection and the reconcile baseline stay as they are. A committed selection is untouched, so a list retained after a failed refresh still pays. Fee Juice and Private Fee Juice picks are unchanged: their rows stand in every menu. The saved sponsor labels become compatibility metadata (no stored-shape change).

**Rejected:** a display filter on the card's trigger for the hold (the app windows' pre-filled sponsor stays the method in effect, emitted as the payer and toasted as "Selected FPC was deleted" when discovery removes it); moving the app pre-fill into a preview map (new state, and a sponsor carried over an identity switch still shows); a deny-list naming Mainnet (a new or custom chain would get a sponsor nobody checked); a read filter that keeps the row (a dead row in storage, still served by id to `getFpc` and `getFpcImpl`); a node probe (option A, not picked); a sweep at unlock (a second mechanism beside the reader that must remove it anyway); a durable retry of the forget (a recovery policy for a transient label).

## Security & Adversarial Considerations

- **Threat model.** No new input crosses a trust boundary: the list is compiled, and the chain id comes from the stored network row the wallet already trusts for every fee path. No backup carries a fee-payer row (Fact 8).
- **Least privilege, crypto, supply chain:** no change; no dependency is added.
- **Deletion scope.** The rule matches type and the address the wallet derives, never a stored flag, so a crafted row cannot widen it to a hand-added sponsor. It re-checks the row under the lock every FPC writer holds, so a concurrent purge or address edit is never undone, and commits only while the session that read it is live, so a lock or a switch stops it. A queued operation naming the removed id fails at `getFpcImpl` ("Invalid id"); it never switches payer. The forget writes through `saveFeePick`'s own session fence and lock.
- **Batch size.** 25 only lowers what reaches dRPC from the client's default of 100; a provider that lowers its limit again reds `check:seeds` and the nightly `seed-identity-live` (advisory: it reports, it does not block).

## Phase 1 (arc 1): the batch cap at 25 ✓

1. Re-run the probe at 25 against both origins; record it in `lessons/phase-1.md`.
2. Move the tests: `seeds.test.ts` expects 25; `node-factory.test.ts` and `scripts/seed-identity.test.ts` send 60 calls and expect `[25, 25, 10]`; the refused-batch case expects one request of 25. Require them red on the base code.
3. Set both `BATCH_CAPS` entries to 25 and reword its comment.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/network/seeds.test.ts src/wallet/services/network/node-factory.test.ts scripts/seed-identity.test.ts --retry=0`; `bun run test:all`; `bun run --cwd apps/extension check:seeds` (live). **Pass:** all exit 0; `check:seeds` prints `OK` for Mainnet and Testnet. **Layers:** lint, typecheck, unit, live endpoint check.

## Phase 2 (arc 2): the Sponsored list (on OA-1's answer)

Before you change code, capture the "before": a temporary smoke spec (`tests/e2e/zz-shots-1618.test.ts`, never committed) registers a profile (Mainnet), stores both protocol rows with `seedFpcs`, opens Send's fee picker and Settings → Fee payers, and calls `shotSend` with `NULO_E2E_SHOT_DIR` set; keep the light PNGs.

1. Write the tests first; require each to fail on the base code. `fee-privacy.test.ts`: a sponsor pick previews as the read list's row (its current name) and as nothing with the list unread or without it; Fee Juice picks unchanged. `useFeeSelection.test.ts`: Send's pending preview follows `readFpcs`; the app windows expose a pre-filled sponsor only once `readFpcs` holds it (as its row), nothing with the list unread or without it, and still reconcile to it; a saved Fee Juice pick shows as before. `FeeSettingsCard.test.ts`: a saved sponsor pick names nothing on the trigger while `getFpcs` is parked and its row once the list lands; a rejected read names none, in both modes; the identity-switch case asserts the trigger and the payer while the new list is parked; the retained-list control stays green. `sponsored-fpc-chains.test.ts`: Testnet and 0 offer, Mainnet and a custom id do not. `service-create.test.ts`: move its discovery tests from `chainId: 1` to `CHAIN_IDS.TESTNET`, and give its harness the `UiPreferenceService` dependency; add (a) a Mainnet read registers only the Private instance on the PXE, with Testnet registering both as the control; (b) a Mainnet read with a stored canonical Sponsored row deletes it, emits `onFpcDeleted`, asks to forget its picks, and `getFpcImpl` of its id then rejects, while a hand-added Sponsored row at another address stays; (c) a refused forget leaves the deletion and the read's answer intact; (d) a Mainnet read holding the Private row starts no discovery (no `captureLiveness`); (e) parked by a deferred the test releases: an `updateFpcAddress` that re-points the row before the helper's lock, and a session that ends before its commit, each leave the row stored. `fee-helpers.test.ts`: the pending menu draws no placeholder with `offersSponsor` false and keeps it with true. `FeeSettingsCard.test.ts`: the pending menu on Mainnet's id has no sponsor row; on Testnet's it has the placeholder.
2. Add the module and make the service, helper and card changes. Align any card case that asserts the placeholder on an unlisted chain id to Testnet's id.
3. Change `fpc-seeds.ts`, `security-reset.test.ts` and `send-keyboard.test.ts` as D5 says; reword the comments that say the sponsor is registered on every chain (`fee-helpers.ts`, `fpc-seeds.ts`, `security-reset.test.ts`).
4. Capture the "after" with the same spec on the changed build; copy the four light PNGs to `implementations-plan/fixes-1.2.0-2/screenshots/`; delete the spec.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/fpc src/popup/components/modules/send --retry=0`; `bun run test:all`. Build the armed smoke dist per browser (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<b>`), then run with `NULO_E2E_BROWSER=<b> NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1` from `apps/extension`: `bun run test:e2e -- tests/e2e/send-keyboard.test.ts tests/e2e/send-fee-privacy.test.ts tests/e2e/security-reset.test.ts --retry=0` and `bun run test:e2e -- tests/e2e/type-roles.test.ts -t "an unnamed FPC" --retry=0`, for `<b>` in `chrome`, `firefox`. Then `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-methods.test.ts` (Chrome; the local chain keeps the sponsor through real discovery). `bun run check:plans` after staging. **Pass:** every command exits 0; the new tests failed on base; no scenario is added, and each e2e file's wall-clock is recorded per browser. **Layers:** lint, typecheck, unit, service, smoke e2e (both browsers), network e2e.

## UI impact

- Arc 1: none.
- Arc 2, Send's fee method picker and the app windows' fee card on Alpha Mainnet: before, a "Sponsored" row (loading, then loaded); after, no Sponsored row. With no sponsor, a card picks as it does today when none exists (Fact 3).
- Arc 2, the fee trigger on Send and in the app windows, every network (OA-1, B): before, a saved sponsor pick showed its saved label from the first frame; after, the trigger names a sponsor only once the account's fee payer list has been read and holds it, with that row's current name, and names no method before that.
- Arc 2, Settings → Fee payers on Alpha Mainnet: the "Sponsored" row no longer shows.
- Testnet and the local network: unchanged.
- Sign-off, the owner on 2026-11-03: "sponsored FPC being hidden via a fixed per-network list please." OA-1's answer, B, is quoted under Assumptions. Arc 2's PR body quotes both and links the light before/after captures.

## Decision ledger

| Id | Decision | Rejected | Reason |
|---|---|---|---|
| D1 | The list in a new light module under `services/fpc/` | `utils/chain-ids.ts`; `protocol-fpcs.ts` | three readers on both shells; chain-ids owns identity, protocol-fpcs pulls the artifacts into the popup |
| D2 | An allow-list: Testnet and 0 | a Mainnet deny-list | the owner named the chains that keep it; an unlisted chain gets no unchecked sponsor |
| D3 | `getFpcs` deletes a stored canonical Sponsored row on an unlisted chain, re-checked under the lock, fenced to the live session, then asks to forget its picks, best effort | a read filter; an unlock sweep; a durable retry | no dead row; the one reader converges it; Settings' delete forgets picks the same way |
| D4 | The placeholder follows the list via `offersSponsor` | dropping the placeholder | a placeholder for a row that never comes is a flash of the hidden method; Testnet keeps its place-holding |
| D5 | The seed helper stores what discovery writes on the scope's chain and returns the ids | switching the Mainnet specs to Testnet | the specs test a purge and type roles, not the sponsor |
| D6 | Two independent arcs off `origin/dev`, the cap first; the plan and its close-out ride arc 2 | one arc with two PRs; the plan on arc 1 | arc 1 needs no answer and lands while OA-1 waits; arc 2 carries the decisions and captures |
| D7 | The package adapter test keeps its injected 3 | moving it to 25 | it proves threading for any value; `node-factory.test.ts` pins the wallet's |
| D8 | The hold lives in the rule books: while pending, Send's preview and the app windows' exposed selection show a sponsor only as the row the read FPC list holds | a filter on the card's trigger; an app preview map | one rule for both cards; the exposed selection also feeds the payer, the deletion toast and the verdict watchers; gating it covers a sponsor carried over an identity switch, with no new state |
| D9 | Unread or failed list: no sponsor label while pending; a committed selection still resolves against the retained list | OA-1's B wording, "a list that is still unread, or failed to read, removes nothing" | the page the owner signed says "shows no saved label until the fee list has confirmed that method is available"; the signed words win |
| D10 | Arc 2 on `fixes-1.2.0-2-sponsored` off `origin/dev`, the plan folder brought over | merging `origin/dev` into `worktree-fixes-1.2.0-2` | the orchestrator's instruction once arc 1 landed |

## Audit verdicts

| Round | Reviewer | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan r1 | Codex gpt-6.1-sol high (session 01a1a2c7) | changes required | the deletion re-checks the row under the lock and commits only on a live session, with parked tests; the saved-pick preview (demonstrated: `fee-privacy.ts:100-105`); backup claims dropped (Fact 8); a final fresh Codex pass over both diffs; I2 restated as Fact 7; a card-level placeholder test; `getFpcImpl` rejects after the delete | none |
| plan r2 | Codex, resumed | changes required | the forget is best effort and promises nothing (a refused-forget test); a mounted card keeps its picks (Fact 9); the remaining preview is an owner ask (OA-1), so the arcs were reordered; the `UiPreferenceService` dependency judged proportionate, called after the lock is released | none |
| plan r3 | Codex, resumed | changes required | arc 2 waits for OA-1's answer (no default); OA-1's A and C restated without guarantees; B bounded to the live identity's read list, in both preview paths; the `/goal` seed takes arc 1 merged | none |
| plan r4 | Codex, resumed | approve | none needed | none |
| arc 1 r1 | Codex gpt-6.1-sol high (session 01a1a2d5) + Opus 5.5 | clean; Opus: no material findings | Opus: the comment said "accepts" where the probe shows 100 accepted: now "allows", dated; Opus's heavy-response gap checked by probe (25 contract-class reads, 161 KB, all answered), no code change | none |
| arc 1 r2 | Codex, resumed | clean | none needed | none |
| plan r5 (B) | Codex gpt-6.1-sol high (session 01a1a306) | changes required | a sponsor selection carried over an identity switch bypassed the hold: the app windows now gate what they expose while pending (D8 revised); the hold covers pending selections only, with a rejected-read test and the retained-list control (D9); two comments made false by the hold | none |
| plan r6 (B) | Codex, resumed | approve | none needed | none |

## Delivery

- **Arc 1:** branch `fixes-1.2.0-2-batch-cap` off `origin/dev`; PR #1643, `fix(network): raise the free node endpoints' batch cap from 3 to 25` (66; lower case for commitlint); body "Refs #1609", the probe and `check:seeds` output; no plan files.
- **Arc 2**: branch `fixes-1.2.0-2-sponsored` off `origin/dev` with the plan folder (D10); title `fix(fees): offer the Sponsored fee payer only on Testnet and the local network` (79); `Closes #1618`; the captures by blob permalink; the e2e wall-clock per browser; its close-out as its final commits, after arc 1 is on `dev`.
- Both ready, no label at creation; `gh pr checks <n> --watch` on each. Not stacked; no parallel lanes.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `ea282b7bc`, with: no diff review (`code_review: off`); the Codex loop per arc over that arc's diff against `origin/dev` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, the README's two rules verbatim, hard stop at three rounds); one Opus review (`Agent`, `model: "opus"`) of each arc's diff beside its first Codex round; after arc 2's loop converges, one fresh Codex session over both final diffs asks for cross-arc issues, in the same loop. Rounds go in Audit verdicts and `lessons/phase-N.md`. Teardown `agent-worktree done fixes-1.2.0-2 --merged` once `implementations-plan/archive/fixes-1.2.0-2/plan.md` is on `dev`.

## Seeds

- `/goal` Phases 1 and 2 of implementations-plan/fixes-1.2.0-2/plan.md ✓ with their gates passing in the transcript; each arc's Codex loop converged; arc 1's PR merged on `dev` or open and green; arc 2's PR open and green, holding the close-out.
- `/loop 15m` Drive implementations-plan/fixes-1.2.0-2 per plan.md: next unticked phase (arc 2 only on OA-1's recorded answer), its gate, the arc's Codex loop, delivery, then babysit checks; never merge.
