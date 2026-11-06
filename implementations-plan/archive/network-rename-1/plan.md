---
plan: network-rename-1
tier: light
status: completed; #1697 carries the change and this close-out
issues: "#1364 (arc 1 closes it)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit + Opus Plan leg in parallel; final fresh Codex pass
base: origin/dev at 4291a8c98
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-06. Planned and delivered the same day; one arc.
- **Status:** completed. #1697 into `dev` carries the change and this close-out; its merge closes #1364 and archives this plan.
- **Shipped:** `retireDefaultName` and the retired names in `seeds.ts`; the unlock pass (`retireDefaults`) renames a mainnet-kind row still named "Alpha V6" or "Mainnet" to "Alpha" unless the profile already holds it; the update replay expects the recorded Mainnet row under the seed's name. Captures before and after with the orchestrator.
- **Review loop:** plan: Codex and Opus conditional approve, the final fresh Codex conditional approve (the local network suite), resumed `approve`; diff: Codex and Opus 0 material, then Codex 0 material and `approve`.
- **Gates:** lint, `typecheck:all`, `test`, `test:all` exit 0; the update replay from v1.1.0 on Chrome and Firefox and from v1.2.0 on Chrome, and the Chrome smoke suite, retry 0 ([lessons/phase-2.md](lessons/phase-2.md)).
- **Dropped:** the journal-held name test (D7, unsupported state); the combined retired endpoint and name test (unreachable until a Mainnet endpoint is retired); the local network suite (the rule is a no-op on its profiles; the required lanes run it).
- **Known limits:** #1698 (a popup that read its rows before the unlock pass keeps the earlier name until it reopens; a failed write waits for the next worker).
- **Open items:** none.
- **Lessons:** none promoted; `lessons.md` is at its budget.
- **Seeds retired:** the `/goal` and `/loop` below; they are no live instructions.

# network-rename-1: a seeded default row still named "Alpha V6" or "Mainnet" takes "Alpha" at unlock

One arc, one PR against `dev`. At the unlock hook that already moves retired default endpoints, a `kind: "mainnet"` row whose name is exactly a name an earlier build seeded ("Alpha V6", "Mainnet") takes this build's seed name, "Alpha", unless another row of the profile already holds it. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/`.

## Outcome & Quality Bar

- **For whom:** a person whose profile was seeded by v1.0.0 or v1.1.0 (store or GitHub install) and who updates to this build; and the maintainer of `network/`.
- **Excellent:** (1) once the first unlock or session restore on this build has written the row, every surface that shows its name reads "Alpha", as `getChainName` already names the chain, and the row's id, endpoints, chain and accounts are unchanged; (2) the change is one rule beside the retired endpoints, in the same locked pass, one write and one `onNetworkUpdated` per changed row, no new stored state.
- **Good enough:** a popup that read its rows before the write keeps the old name until it reopens; a failed write waits for the next worker start, as the endpoint move does. No live refresh, no retry.

## Assumptions

**Facts** (verified at 4291a8c98):
1. A seed's `name` is written only when its row is created (`_buildNetwork` via `seedOneNetworkLocked`); for an existing row the offer pass writes the offer record, never a name (`network/seed-offers.ts:56-78`, `network/service.ts:389`). The other writers are `addNetwork` (custom rows, `:621`) and `renameNetwork` (`:630-644`).
2. The mainnet seed's name: v1.0.0 "Mainnet", "Alpha V6" from v1.0.0-nightly.26301 and in v1.1.0, "Alpha" from v1.1.0-nightly.26304, in v1.2.0 and on `dev`; v0.31.0 seeded none (`git log -p` over `network/seeds.ts`).
3. `onRowKeysReady` runs `sealLegacyRows`, then `retireDefaultEndpoints` through one `runSealing` (`network/service.ts:266-281`, `:291-312`): under the network lock, skipping the network a reset journal holds, one `storage.set` and one `onNetworkUpdated` per moved row; a throw skips the pass's remaining rows and is retried by the next worker. Keys are announced after the unlock's locked op, at each new worker's silent restore (`profile/service.ts:309-336`) and again by `replayRowKeysReady` (`wallet/runtime.ts:708`).
4. Names are unique per profile by exact match in `addNetwork` and `renameNetwork` (`network/service.ts:618`, `:637-638`); the seed pass skips the check (#1119, a closed known limit).
5. `networks` is a sealed root (`wallet/storage/stores.ts:193`) and `name` stays `z.string()` (`network/spec.ts:75`): a value change, no migration, stamp or golden (CLAUDE.md § Persisted-storage; #1622's precedent). Backups carry no network rows.
6. No production code listens to `onNetworkUpdated`. The header chip, Settings → Networks and its detail, the network popups, Receive, the token picker, the contacts import, the switch toast, the arrival and the dApp windows read `appStore.network(s)`, set at bootstrap (`composables/useProfileBootstrap.ts:149-160`, recon).
7. Mainnet is never reset (`network-reset/service.ts:83`, `:455`), so no reset journal holds a mainnet row.
8. `tests/e2e/update-replay.test.ts` checks network ids in `expectIdentity` (`:357-394`) and, in `throughTheReset`, whole rows of every network but Testnet against a snapshot of the release's reads taken before the unlock (`:578`, `:610`). Testnet's chain is the same at v1.1.0 and on `dev`, so from v1.1.0 case 1 runs `opensWithoutTakeover` and case 2 `throughTheReset`.
9. The committed v1.1.0 recording's mainnet row reads "Alpha V6" through the release and the base candidate (the base capture, `lessons/phase-0.md`). Its dApp session passes the replay's check until about 2026-11-10 17:56 UTC (#1641). The v1.0.0 recording's has expired, so "Mainnet" is proven at the unit layer only.
10. The replay is a smoke-config file (`vitest.e2e.config.ts`); `agent.sh` runs only the network config. Its stand-in ports are claimed in `~/.agents/ports.md` by `listenClaimed` (`tests/e2e/fixtures/egress-guard.ts:182`). An uncommitted edit under `apps/extension/tests` passes the candidate's commit check (`tests/e2e/fixtures/update/source.ts:7`).
11. `openUpdated` makes Testnet the active network (`update-replay.test.ts:483`), so the replay's header shows Testnet unless the capture switches.

**Inferences:**
- I1. Plausible, unverified: the popup can read the old name. `sealLegacy` awaits its candidate read before it takes the lock (`wallet/storage/sealed-entity-storage.ts:383`), so the bootstrap's `getOrInitNetworks` can take the lock first; nothing refreshes that popup. Known limit, filed at close-out.
- I2. A profile holds at most one `kind: "mainnet"` row (seeding adds one per kind, `addNetwork` writes `custom`, a reset keeps the kind); two need conditions the wallet does not support, so the uniqueness snapshot taken before the loop stays exact.

**Asks:** none open. The rename carries the owner's sign-off (UI impact). The first-open staleness is stated in the PR body and filed as a known limit, not presented as owner-accepted.

## Claims that did not hold

- The lane brief's reason against the seed pass ("misses every profile already unlocked on 1.2.0") does not hold: `getOrInitNetworks` runs at every popup bootstrap. It belongs to the research's one-shot variant. The seed pass stays rejected (D2).
- The lane brief's wiring test asks for "a reset-journal-held row untouched". That state needs conditions the wallet does not support (Fact 7), and the kind-blind skip is pinned by the existing journal test. D7.
- #1364's citation `service.ts:388-412` is now `:430-448`; the rest of its trace holds.

## Decisions

| id | Decision | Rejected alternative and why |
|---|---|---|
| D1 | Rename on exact match against a per-kind list of retired names, "Alpha V6" and "Mainnet" (the owner's acceptance) | A provenance mark: new stored state, a stamp and goldens for a cosmetic gain. No code: two names for one network |
| D2 | Apply it in the unlock hook's loop, beside the endpoint move | The seed pass: its row writes are fenced creates (`prepare`, `commitFencedCreate`) and a throw there fails the popup's own bootstrap, where the hook warns and retries; CLAUDE.md converts sealed rows at unlock; a second home for retired defaults. Cost taken: I1 |
| D3 | Module-private `RETIRED_DEFAULT_NAMES` and exported pure `retireDefaultName(network, profileRows)` in `seeds.ts`, table in `seeds.test.ts` | A `retired-names.ts`: a file for a five-line rule over seed data, beside `seedForKind` and `isSeedChain` |
| D4 | Rename the private method to `retireDefaults`; its warn says "networks" | Keeping `retireDefaultEndpoints` hides the rename |
| D5 | The replay expects the recorded mainnet-kind row, by id, to read `seedForKind("mainnet").name` after the update, every other row its release name: in `expectIdentity` (id and name) and in `throughTheReset`'s snapshot (that row's name only) | Expectations derived through `retireDefaultName`: a rule that returns `undefined` passes them (Codex). An independent expectation also reds a later seed rename that leaves the old name off the list. It assumes no recording renames its mainnet row; none does |
| D6 | The captures are a local, never-committed edit, run apart from the gate runs | A committed capture hook: generality nobody asked for |
| D7 | No journal-name test | A mainnet journal needs unsupported conditions; its mutation could not red (both legs) |
| D8 | Keep the snapshot as read (I2) | Writing the renamed row back into it: guards an unsupported state |

## Architecture & Implementation

- **Rule** (`seeds.ts`): `RETIRED_DEFAULT_NAMES: Readonly<Partial<Record<ChainKind, readonly string[]>>> = { mainnet: ["Alpha V6", "Mainnet"] }`, entries kept for good. `retireDefaultName(network: Network, profileRows: readonly Network[]): Network | undefined` returns `{ ...network, name: seed.name }` when `seedForKind(network.kind)` exists, the kind's list holds `network.name` exactly, and no other row of the same `profileId` in `profileRows` is named `seed.name`; else `undefined`. A renamed row no longer matches.
- **Wiring** (`service.ts`, `retireDefaults`): read the profile's rows once; per row the journal does not hold, `moved = await retireEndpoints(row, retired)`, `next = retireDefaultName(moved ?? row, rows) ?? moved`; skip `undefined`; else one `storage.set`, the existing evictions (comparing `row` with `next`), one `onNetworkUpdated(next)`.
- **Flow:** unlock or worker restore → keys announced → plaintext rows sealed → `retireDefaults` under the lock; a popup bootstrap reads rows under the same lock, before or after it (I1).
- **Files:** `src/wallet/services/network/seeds.ts`, `seeds.test.ts`, `service.ts`, `service.test.ts`; `tests/e2e/update-replay.test.ts`.

## UI impact

- **Every surface that shows the default row's name** (Fact 6; the lane brief names the header chip and Settings → Networks): a seeded default row that read "Alpha V6" or "Mainnet" reads "Alpha" once the unlock has written it. Nothing else changes on screen. Sign-off, the owner on 2026-11-06, asked whether a row named exactly "Alpha V6" or "Mainnet" may be renamed whoever named it: "On the network rename => yes. I accept it."
- **For the PR body:** the owner-accepted trade (a person who chose one of those names loses it at every worker start); the known staleness (I1, a failed write).

## Security & Adversarial Considerations

- **Threat model:** the rule reads an unlocked profile's sealed rows and writes one display string that never leaves the service (`networkInfoFrom`, `network/spec.ts:103-107`). No dApp RPC, backup or node answer reaches it. `kind` sits inside the sealed envelope; a storage writer can already write any name. No boundary is crossed.
- **Integrity:** exact match, kind-gated, profile-filtered, refused on a name collision: no duplicate name, no custom row, chain, endpoint or account touched. The journal skip and Mainnet's quarantine stay.
- **Logging:** no new line; the warn carries only `{ error }`. **Crypto, privileges, supply chain:** unchanged; no dependency.

## Phase 1: the rule, its wiring and their tests ✓

1. In `seeds.ts`, add the list and the rule (D3).
2. In `seeds.test.ts`, add one table. Renamed, id, endpoints and primary kept: a mainnet row named "Alpha V6"; one named "Mainnet"; one beside another profile's "Alpha". `undefined`: "My Alpha", "alpha v6", a `custom` and a `testnet` row named "Alpha V6", a row with no `kind` named "Mainnet", a mainnet row beside a row of its profile named "Alpha", and the renamed row.
3. In `service.ts`, rename the method (D4) and apply the rule. Stay inside the complexity budgets; add no suppression.
4. In `service.test.ts`, extend "the unlock seals the profile's row and moves it…" with a plaintext mainnet row "Alpha V6" for `p1` and one for `p2`. Expect `onNetworkUpdated` once each for `tn` and the `p1` mainnet row (ids compared sorted), that row sealed and read back as "Alpha", the `p2` row unchanged.
5. Remove the `retireDefaultName` call; confirm step 4's case reds; restore it. Log it in `lessons/phase-1.md`.
6. In `update-replay.test.ts`, apply D5.

**Validation gate:** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, then `cd apps/extension && bun --bun vitest run src/wallet/services/network`. Pass: each exits 0; step 5 reds.

## Phase 2: the update replay, the captures and smoke ✓

Warning: never rerun a red. Read the first one; if it is the recording's session check, stop and report (a refresh, as #1641 did, is a separate ask); else diagnose at the cause.

1. The base runs are done (4291a8c98, `lessons/phase-0.md`): v1.1.0 Chrome 63.4 s, Firefox 86.8 s, green; the base capture reads "Alpha V6".
2. Commit, then build each candidate: `bash apps/extension/scripts/e2e/build-update-candidate.sh <chrome|firefox>`. From `apps/extension`, run `NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=<tag> NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/<browser> bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0`: v1.1.0 on Chrome and on Firefox (`NULO_E2E_BROWSER=firefox`), v1.2.0 on Chrome. Record each wall-clock.
3. Capture on Chrome: apply the local edit (after `opensWithoutTakeover`'s checks, make the mainnet row active, open a fresh popup, `shotSend` the header and Settings → Networks under `NULO_E2E_SHOT_DIR=~/.cache/nulo-backlog/network-rename-1/shots/after`), run case 1 from v1.1.0 alone, then revert it.
4. Smoke, Chrome: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome` (per-command prefixes, never exported), then from `apps/extension`, `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`. CI runs both browsers' smoke and network lanes.

**Validation gate:** every replay run and the smoke suite green at retry 0; the after capture reads "Alpha" in the header and the list; `git status` clean of the edit. Not run locally, with reason: the network suite (`bun run e2e:agent`), since every profile there is seeded "Alpha", so the rule runs only as a no-op, and the PR's required network lanes run it on both browsers; `lint:actions` (no workflow change); `test:ci-gating` and `test:release` (no `scripts/` or `.github/` change).

## Delivery

| Arc | Phases | Branch | Base | PR title (≤ 92) | code_review |
|---|---|---|---|---|---|
| 1 | 1-2, then the close-out | `network-rename-1-a1` | `origin/dev` + the plan commit | `fix(network): a seeded default row still named "Alpha V6" or "Mainnet" takes "Alpha"` | off |

The PR says `Closes #1364`. Its body: the change and why, the owner's sign-off (quoted), the trade and the staleness, that "Mainnet" is proven at the unit layer only (Fact 9), the validation runs with outcomes, each browser's v1.1.0 replay wall-clock before and after, and the captures (with the orchestrator, from the shots folder). Open it ready, without labels. Parallelism: none.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at 4291a8c98, with these values:
- **Review loop:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, over the diff from the plan commit once Phase 2 is green; one Opus `general-purpose` review beside the first round; hard stop at three rounds, then report.
- **Delivery:** `gh pr create --base dev`; `gh pr checks <n> --watch` to the end.
- **Close-out:** the PR's final commits. Merge `origin/dev` in first; read `index.md` and `lessons.md`. File one closed `known-limit` issue for I1 and the failed-write wait (reopen on a report of the old name after a reopened popup). Outcome: `Known limits: #<that>`, `Open items: none` unless a review adds one.
- **Teardown:** after the merge, `agent-worktree done network-rename-1 --merged`.
- **Approval boundaries:** a finding that adds stored state, a lifecycle, a protocol, a recovery policy or a public contract stops for approval; a screen change beyond UI impact is a new owner ask.

## Audit verdicts

**Round 1** (2026-11-06; consult log in [lessons/phase-0.md](lessons/phase-0.md)).
- **Codex (gpt-6.1-sol, high): conditional approve.** D5 shares its oracle with the subject; I1's ordering claim is unsupported; the mutation gate could not red the journal case; the capture would show Testnet; the smoke step lacked the armed build; the base-red fallback contradicted the gate; the UI impact line missed surfaces; three Fact wordings. D2, D3, I2 and "no stamp" held.
- **Opus 5.5 (Plan): conditional approve.** Same capture, journal-mutation, fallback and smoke findings; the v1.1.0 window; a failed rename skips the pass's other rows (accepted as is: the next worker retries); the hook runs twice per worker start (idempotent). Kept D5 as drafted; added a no-`kind` case and a v1.2.0 control run; called the Firefox base run unnecessary.
- **Accepted:** every finding above except as below; D2's reasons rewritten; Facts 1-3, 6, 7, 9, 11 corrected or added.
- **Disagreement settled:** D5 goes independent (Codex): its reproducer stands, and the independent form also catches a seed rename. Kept against Opus: the Firefox runs and wall-clocks (the lane brief asks for them). Rejected: the in-loop snapshot update (D8).

**Final fresh Codex pass** (new session, 2026-11-06): **conditional approve**, one condition: run the local network suite (CLAUDE.md's row for network behaviour). Answered: the change alters a display string and touches no node, dApp or PXE path; every network-suite profile is seeded "Alpha", so the rule runs only as a no-op there; the PR's required network lanes run the suite on both browsers. **Resumed: approve**; the condition withdrawn ("I cannot identify a failure path that the local network suite would uniquely establish"), the deviation recorded in Phase 2's gate.

**Arc 1 review loop** (2026-11-06; the diff 9610cd9aa..13698a765, then 13698a765..3f679ea03; log in [lessons/phase-2.md](lessons/phase-2.md)).
- **Round 1, Codex (gpt-6.1-sol, high): 0 material**, one nit (the method doc restated its helpers), accepted. **Opus 5.5 (general-purpose): 0 material**, five nits: three accepted (a node-kept assertion, a snapshot comment, a comment's wording), two rejected (an unreachable combined-row case; a re-assertion after `waitFor`).
- **Round 2, Codex (resumed): 0 material, approve.** The loop converged.

## Seeds (not run; orchestrator-owned)

```
/goal implementations-plan/network-rename-1/plan.md: Phases 1-2 ✓ with their gates pasted, the Codex loop converged and quoted, the PR open against dev with `Closes #1364`; `bun run test` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/network-rename-1 forward per its plan.md: next unchecked phase, its gate, then the Post-implementation section; never merge.
```
