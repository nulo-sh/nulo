---
plan: update-fpc-1
tier: light
status: completed
issues: none (lane brief; no issue filed)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: one Explore recon (sonnet); one Codex plan audit (gpt-6.1-sol, high), resumed until approve; the Codex fix loop
post_implementation_hardening: not scheduled
base: origin/dev at 040334f53
trunk: dev
---

## Outcome

- Date: 2026-11-04.
- Status: completed.
- Shipped: PR #1665 `test(e2e): the update test expects the sponsor's removal where its chain offers none` against `dev`: `unofferedSponsorIds` and the opt-in `unofferedSponsors` option of `updateProblems`, `allowedPicks` with the picks compared after the sandbox visit, the first (locked) check excusing nothing, the pure pins module, the moved row parser, three unit tests and the README. All four update runs from v1.1.0 pass at retry 0 on both browsers at `72d73236b` and again at the merged head `002cb69ac` ([lessons/phase-2.md](lessons/phase-2.md)).
- Did not hold: the lane brief's Alpha Mainnet; the lost row is the canonical sponsor on the run's custom sandbox network, under the same product rule ([lessons/phase-0.md](lessons/phase-0.md)).
- Lessons: none promoted. `lessons.md` is at its budget, and the fix is in code with its tests.
- Known limits: none.
- Open items: none. OA-1 in [OWNER-ASKS.md](OWNER-ASKS.md) is informational, recommends no change, and is the orchestrator's to relay.
- Seeds retired: the `/goal` and `/loop` seeds below. Do not run them.

# update-fpc-1: the update test expects the sponsor's removal where its chain offers none

The release runbook's live update scenario (`tests/e2e/network/update-in-place.test.ts`, from v1.1.0) reds on both browsers with one line: `nulo:core:fpcs@<id>: lost in the update`. The lost row is the canonical Sponsored fee payer on the run's sandbox, which the scenario adds as a custom network (recon § The lost row). Since #1652 the candidate deletes that row, with its fee picks, on any chain `offersSponsoredFpc` leaves out: Alpha Mainnet, and every custom network whose derived chain id is unlisted. This arc teaches the update checker that one deletion, derived from the product rule, and nothing else. Test fixtures only.

## Outcome & Quality Bar

- **For whom:** whoever runs the promote's update test (`.claude/skills/release/SKILL.md` step 1), and the reviewer of a change to a release gate.
- **Excellent:** (1) the allowance excuses exactly the rows the product deletes, computed from `offersSponsoredFpc` and the canonical address, never a row id; any other lost row, and any other changed pick, still reds, and a unit test shows both; (2) all four update runs from v1.1.0 pass at retry 0 on a candidate built at the PR's tested commit, each with its UTC window and wall-clock.
- **Good enough:** the replays and the arrival scenario keep the checker as it is (D3); runs from v0.31.0 or v1.0.0 are not made.

## Assumptions

**Facts** (verified 2026-11-04 at `040334f53`):
- F1. The live run reds with `nulo:core:fpcs@c2769f0f: lost in the update` alone; the release read that row as type 1, the canonical sponsor address, chain 1685367866, the custom "Sandbox" network ([lessons/phase-0.md](lessons/phase-0.md)).
- F2. `offersSponsoredFpc` lists Testnet and chain 0 only (`src/wallet/services/fpc/sponsored-fpc-chains.ts`); a custom network's chain id is `walletChainId(l1, rollupVersion)` (`src/wallet/services/network/service.ts:1115`), so the sandbox is unlisted.
- F3. `FpcService.getFpcs(chainId)` on an unlisted chain deletes a stored canonical sponsor (type `DefaultSponsoredFpc`, `sameFieldAddress`: `0x` plus 64 hex digits in either case, `packages/wallet-core/src/utils/field.ts:3`), then forgets its picks with `saveFeePick({ kind: "forgetFpc" })`, after the row's delete commits; the forget writes the app and Send maps in one batch and can fail whole (`service.ts:58`, `:196-238`). `getFpcs()` with no chain never removes.
- F4. `updateProblems` reports a `before` key missing from `after` as lost unless it is a fixture key, a rekeyed root, the moved selection or a drained queue (`tests/e2e/fixtures/update/verify.ts:104-127`); `fpcs` is not rekeyed, so its row is matched by key.
- F5. `expectReleasePreferences` compares the candidate's `getFeePicks` with the release's picks once (`fixtures/update/preferences.ts:36-54`). The scenario picks the sponsor for Send and for the app window on the sandbox (`update-in-place.test.ts`, `pickPreferences`, `sendFromWallet`).
- F6. A candidate is accepted only at the checkout's HEAD; `apps/extension/tests` and `implementations-plan` are not build inputs (`fixtures/update/source.ts:7-25`).

**Inferences:**
- I1. With the allowance, both live runs pass: the red named one row, and the fixture change touches no other check. Phase 2 tests it.
- I2. Today the picks comparison runs before the first fee read on the sandbox (v1.0.0, v1.1.0 end on Testnet), so no check reads the picks after the removal; a plaintext release's selection is on the sandbox, so its balance refresh can remove first (recon § Callers). The comparison moves after the sandbox visit (D2) and holds in both states.

**Asks:** none blocking. The lane brief assumed Alpha Mainnet; the row is a custom network's, under the same rule. `OWNER-ASKS.md` carries the product note.

## Architecture & Implementation

**Shape (D1).** `fixtures/update/verify.ts` gains `unofferedSponsorIds(fpcs)`: the ids of the release's fee payer rows whose type is `DefaultSponsoredFpc`, whose address passes `isHex32` (`@nulo/wallet-core/utils`) and lower-cased equals the canonical sponsor's (exactly `sameFieldAddress` against an in-range constant), and whose chain `offersSponsoredFpc` rejects. `updateProblems` gains `unofferedSponsors?: readonly string[]`, off by default: a `nulo:core:fpcs@<id>` key for a listed id may be missing; nothing else changes. `expectReleasePreferences` gains the same list and moves to the end of `verify`, after the sandbox visit (D2). A pure `allowedPicks(picks, ids, stored)` decides: the release's picks, plus, when some listed rows are absent from `stored` (read after the picks: the delete commits before the forget, F3), the release's picks with those rows' picks forgotten through the product's own `applyFeePickUpdate`.

**Data flow.** `populate` derives the list from the release's rows as the release reads them: a sealing release's from `readRelease` (`endOnSecondAccount` returns its `fpcs`), a plaintext one's parsed from `before` with `storedRows`. `Populated.unofferedSponsors` reaches both `updateProblems` calls and `expectReleasePreferences` in `verify`.

**File-level change map** (all under `apps/extension/`):
- `tests/e2e/helpers/protocol-fpc-pins.ts` (new, pure): `PROTOCOL_FPCS` and `SPONSOR_FPC_ADDRESS`, moved out of `tests/e2e/helpers/fpc-seeds.ts`, which imports them (D4).
- `tests/e2e/fixtures/update/verify.ts`: `unofferedSponsorIds`; the option.
- `tests/e2e/fixtures/update/release-reads.ts`: `allowedPicks` (pure, product code; D4). `tests/e2e/fixtures/update/preferences.ts`: the parameter.
- `tests/e2e/fixtures/update/stored-rows.ts`: `storedRows(entries, root)`, moved from `tests/e2e/update-replay.test.ts` (`rowsOf`), which imports it.
- `tests/e2e/network/update-in-place.test.ts`: `Populated.unofferedSponsors`; `endOnSecondAccount` returns `fpcs`; the three calls pass it; `expectReleasePreferences` moves after the sandbox visit; one header sentence.
- `scripts/e2e/update-rows.test.ts`: the tests below.
- `tests/e2e/README.md` § In-place update: "no key was lost" names the one excused deletion.

**Alternatives not taken.** Hardcoding the row id or the sandbox chain: the brief forbids it, and both differ per run. Adding the sandbox to the sponsor list, or populating the sponsor elsewhere: product changes, out of scope. Requiring the row's absence at the end: it would test `FpcService`, which `service-create.test.ts` covers, and tie the checker to which screen reads fees first.

### Phase 1: the allowance and its tests ✓ ([lessons/phase-1.md](lessons/phase-1.md))
1. Make the changes in the map above. Comments state the invariant (the candidate deletes this row by design), never this lane or #1652.
2. Tests in `scripts/e2e/update-rows.test.ts`, each refusal beside its success control:
   - `unofferedSponsorIds`: the canonical sponsor on a custom chain and on Alpha Mainnet (upper-case hex) are listed; on Testnet and chain 0, with a `0X` prefix, at another address, and the PrivateFPC are not.
   - `updateProblems` with `unofferedSponsors`: the listed id's missing `fpcs` key is excused; another `fpcs` key still reds; another root's key with the listed id still reds; without the option the listed key reds.
   - `allowedPicks`: unchanged picks pass with the row stored or gone; the forgotten form passes only with the row gone; forgotten with the row kept, and a lost pick naming another fee payer, fail.
- **Gate**, from the repo root: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; then `(cd apps/extension && bun --bun vitest run scripts/e2e/update-rows.test.ts scripts/e2e/update-recording.test.ts)`. Pass: every command exits 0; the new tests fail on the base copy of the fixtures. Layers: lint, typecheck, unit.
- Commit: `test(e2e): the update checker excuses the sponsor the candidate withdraws from a chain`.

### Phase 2: review loop, then builds and the four runs at the reviewed commit `C` ✓ (`C` = `72d73236b`, then `M` = `002cb69ac` after a trunk merge; all four green at both: [lessons/phase-2.md](lessons/phase-2.md))
1. The review loop (§ Post-implementation) over `git diff 040334f53...HEAD`; fixes committed; Phase 1's gate rerun.
2. Merge `origin/dev` if it moved; rerun Phase 1's gate. HEAD is now `C`; `git status --porcelain` shows only this plan's files.
3. From the repo root: `bash apps/extension/scripts/e2e/build-update-candidate.sh chrome`, then `firefox`.
4. One at a time, foreground, each bounded: live Chrome, live Firefox, replay Chrome, replay Firefox, with § Delivery's handoff commands; no `NULO_E2E_UPDATE_RECORD`. Log each run's UTC window, wall-clock and outcome in `lessons/phase-2.md`.
- **On red:** a lost or changed row other than the listed sponsor, or its picks, is a regression: write it to `OWNER-ASKS.md`, report `LEAD_BLOCKED`, no patch. One rerun only to show a flake, both logs kept.
- **Gate:** both live runs pass; each replay's four cases pass. Layers: e2e-live-network, e2e.

### Phase 3: close-out and delivery
1. Commit `lessons/phase-2.md`. If `origin/dev` moved and `git diff --stat C HEAD -- . ':(exclude)implementations-plan'` is not empty, rebuild and rerun all four at that head.
2. Close-out commits (§ Post-implementation), then the PR (§ Delivery).

## Security & Adversarial Considerations

- **Weakening a gate.** The allowance is a set of ids computed from the release's own rows by the product's chain rule and the pinned canonical address; it is empty unless a release stores the canonical sponsor on an unlisted chain. A wrong product deletion of any other row, of the PrivateFPC, of a hand-added sponsor, or on Testnet or chain 0, still reds (Phase 1 tests). If the canonical address moves with an Aztec bump, the list misses the row and the run reds: it fails closed.
- **Picks.** The forgotten form is accepted only for listed rows already gone, and compared after the sandbox visit, so a candidate that drops a sponsor's picks while keeping its row, or drops any other pick with it, still reds.
- **Logs.** The diagnostic printed chain ids, fee payer types and protocol addresses only, all public; it was never committed. No URL, key or account address is copied from a log. Nobody opens `apps/extension/src/wallet/constants/network-endpoints.ts`.
- N/A: cryptography, least privilege, supply chain (no dependency change), dApp boundary.

## UI impact

None. Test fixtures only.

## Decision ledger

| # | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | Ids from the release's rows, excused by key in `updateProblems` behind an opt-in option | a generic expected-deletions key list; a hardcoded id or chain | the option names the one product rule; a generic list invites other excuses; ids differ per run |
| D2 | Picks compared at the end of `verify`: the release's, or forgotten for the listed rows already gone (`allowedPicks`) | leave the check where it is; compare both sides with the listed picks removed; add a second check | where it is, no check reads picks after the removal, so a faulty forget passes (Codex P1); both-sides removal hides a pick dropped with its row kept; one check at the later checkpoint suffices |
| D3 | The replays and the arrival scenario keep the checker unchanged | wire the allowance into all three | they reach no fee read on an unlisted chain and pass; an unexercised allowance there is generality nobody asked for |
| D4 | Deviation found at the Phase 1 gate: the pins and `allowedPicks` live in pure modules | keep them in `fpc-seeds.ts` and `preferences.ts` | `scripts/e2e/update-rows.test.ts` is type-checked by `tsconfig.scripts.json` (`chrome-types`), which refused the page-bound code those two files pull in (`typecheck:all` exit 2) |

## Review verdicts

- **Codex plan audit, round 1** (gpt-6.1-sol, high, read-only): reject, one P1, three P2, one P3, all verified and accepted. P1: no check read the picks after the removal, so a faulty forget passed; the comparison moves after the sandbox visit and its decision is a tested pure function (D2). P2: a lower-case compare accepted a `0X` prefix the product refuses (now `isHex32`); the forgotten form now follows the listed rows actually gone, not all of them; the handoff now pastes the exact commands. P3: "every custom network" now "whose derived chain id is unlisted" (here and in `OWNER-ASKS.md`). Confirmed: D1's opt-in option, the `rowsOf` move, D3, the reuse of `offersSponsoredFpc`, the pin and `applyFeePickUpdate`; title 84 characters; no local path.
- **Round 2** (resumed): **approve**, no remaining material finding; the five fixes verified.
- **Arc review loop:** Codex r1 (gpt-6.1-sol, high) over `040334f53...91fecb329` clean; the Opus diff review beside it found one, accepted: the first `updateProblems` call runs while the wallet is locked, when the product cannot delete, so only the final call excuses the sponsor (`72d73236b`); Codex r2 (resumed) clean, converged ([lessons/phase-1.md](lessons/phase-1.md)).

## Delivery

- **One arc**, one PR against `dev`, ready. Title: `test(e2e): the update test expects the sponsor's removal where its chain offers none` (84 characters). No issue to close. No label.
- **Body:** what changed and why; why this is not a weakening (§ Security); `C`, the PR head and their plan-only diff; browser versions; each run's UTC window, outcome and wall-clock, before (red) and after; the handoff block below.
- **Handoff** (from the repo root of a clean checkout of the candidate; each run read on its own; any red holds the promote):
  ```bash
  bash apps/extension/scripts/e2e/build-update-candidate.sh chrome && bash apps/extension/scripts/e2e/build-update-candidate.sh firefox
  NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/apps/extension/.e2e-state/update-candidate/chrome NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/update-in-place.test.ts
  NULO_E2E_BROWSER=firefox NULO_E2E_RETRY=0 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/apps/extension/.e2e-state/update-candidate/firefox NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/update-in-place.test.ts
  cd apps/extension
  NULO_E2E_BROWSER=chrome NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/chrome bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0
  NULO_E2E_BROWSER=firefox NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/firefox bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0
  ```

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `040334f532a3efa702e12c20a1690a9e97b946d7`. Plan-specific values:
- **Diff review:** `code_review: off`; absent.
- **Review loop** (Phase 2 step 1): `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; hard stop at three rounds; each round in `lessons/phase-2.md` and under Review verdicts.
- **Delivery:** `gh pr create --base dev` (ready); `gh pr checks <n> --watch` once; one rerun for a known flake. Never merge.
- **Close-out** as the PR's final commits: the `## Outcome` block; lessons within 8 KiB; `STATUS.md` deleted; `git mv implementations-plan/update-fpc-1 implementations-plan/archive/update-fpc-1` in its own commit, the index line to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown:** the orchestrator's, after the merge.

## Seeds

```
/goal Lane update-fpc-1 delivered per implementations-plan/update-fpc-1/plan.md: Phases 1-3 ✓ with their gates; the Codex loop (gpt-6.1-sol high) converged; four update runs from v1.1.0 green at C; the PR open and ready against dev.
```

```
/loop 15m Drive implementations-plan/update-fpc-1/plan.md. Next unchecked step; one e2e run at a time, polled in a bounded loop; signed commits. A red other than the listed sponsor is reported, never patched. Open the PR ready, watch checks, report and stop. Never merge.
```
