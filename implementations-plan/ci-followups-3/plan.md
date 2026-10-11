---
plan: ci-followups-3
tier: light
status: approved by the orchestrator (D-orch-1 to D-orch-7); arc 1 implemented, phases 1-4 green; Codex fix loop next
issues: "#309, #305, #306 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol high) with resumes until a verdict, one Opus Plan lens beside it (the panel's same-family leg)
base: origin/dev at 2a41b1d
trunk: dev
post_implementation_hardening: not scheduled
---

# ci-followups-3: keep a draft release's tag through its edits; refuse a malformed chaos seed; release's chaos legs

Three CI issues in the release and nightly pipelines, one arc, one PR against `dev`.

- **#309 (the blocker).** The 2026-10-09 nightly published a release detached from its tag. The cause is ours: `runApply` checks the draft's tag, then writes the notes with a `PATCH` that omits `tag_name`, which GitHub treats as "clear the tag" on a draft. Every release edit will restate the tag; the flow's order stays as it is.
- **#305.** `send-chaos` refuses a `NULO_E2E_CHAOS_SEED` that is not a nonnegative decimal safe integer, instead of running seed 0 while it logs `NaN`.
- **#306.** `release.yml`'s opt-in network run gets the PR lanes' two chaos legs and their pool exclusion, held equal by the existing pin.

Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, the stray release and its stray tag; OA-2, no re-run of a publish from before the fix). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In (arc 1):** #309, #305, #306, each closed by the arc's PR. The CI.md sentence that says release replays no seed. The release flow's order does not change, so no runbook sentence about it does.

**Out:**
- The stray release 407837006 and the stray tag `untagged-29f161d8864377d68cb4`: the owner's (OA-1). Nothing in the arc reads or touches them.
- #178 (nightly retention, `ci-release-supply` arc 5), #251, #195, the `main` Firefox-network flip: other lanes or owner runbooks.
- #308 (the 2026-10-11 nightly's smoke failure): another cause; it decides when a scheduled nightly next reaches publish, which is when #309's fix is confirmed.
- Validating `chaos_seed` again in `nightly.yml`'s `resolve`: one refusal site serves every caller (D4).

**UI impact: none.** No extension screen, popup, copy or format changes. The pipelines change only as the three issues state: a release's notes, assets and publish order are unchanged; its tag binding now survives the edits.

## Outcome & Quality Bar

**For whom.** The owner cutting a stable release or reading a nightly, and a maintainer replaying a red chaos night.

**What excellent looks like.**
- The next scheduled nightly that reaches publish ends green, and its release reads back with `tag_name` equal to its tag. The first stable release through the draft flow does the same, with no hand repair.
- A `chaos_seed` the test cannot run exactly turns the job red before any send and names the value; every seed that runs today (the two PR seeds, an 11-digit run id) replays the same actions as before.
- `release.yml`'s opt-in network run is the PR lane leg for job, chaos included, and one pin fails if they drift.

**Good enough.** No compare-and-publish exists on GitHub. Another holder of `contents: write` acting between the read-back and the publish is not prevented; the post-publish read-back reports a final mismatch in the assets, the draft state, the tag or the tag's commit, and nothing else (a retarget that the publish's restated tag overwrites, or a changed title, leaves no trace). No agent dispatches a workflow; the fix is proven by unit tests and confirmed by the next scheduled nightly.

## The cause of #309

Evidence, all from GET calls and the run log (details in [recon.md](recon.md#facts-the-plan-rests-on)):

1. The run created the tag at `61060c0`, created the draft (GitHub stamped it with `61060c0`'s commit date, so it bound the existing tag), uploaded and read back the three assets, and passed the pre-publish check `draft.tag === input.tag` (`attach-assets-run.ts:133`).
2. It then sent `PATCH {body}` (`:137`) and `PATCH {draft: false}` (`:138`), neither with `tag_name`. The read-back after the publish showed `untagged-29f161d8864377d68cb4`, and a git tag of that name, `refs/tags/untagged-29f161d8864377d68cb4`, exists at `61060c0` (GET). Inference: one of the two tagless PATCHes detached the release, and the publish then created the placeholder's tag from `target_commitish` (`dev`, then `61060c0`); a ref carries no creation time, so the order inside the publish is not observable.
3. The ruleset is not the cause: rule insights record the creation of `refs/tags/v0.30.2-nightly.26282` and no other evaluation of it, and no failed evaluation on any ref in the month, so nothing tried to move or delete the `v*` tag. (Insights see only refs a ruleset covers; the `untagged-…` tag is outside `refs/tags/v*`, which is why its creation left no record.) `target_commitish` only decided where the placeholder's tag landed; GitHub ignores it for an existing tag.
4. GitHub's own CLI restates the tag on every edit: `gh release edit` sets `tag_name` to the release's current tag when the caller gives none, under the comment "If we don't provide any tag name, the API will remove the current tag from the release" ([cli/cli `pkg/cmd/release/edit/edit.go`, `editRun`](https://github.com/cli/cli/blob/trunk/pkg/cmd/release/edit/edit.go)). Third-party reports from 2026-08 to 2026-10 describe the same, one with an A/B on a single draft (recon).

Confidence: high that the omitted `tag_name` detaches a draft; which of the two PATCHes did it here is not observable (both omitted it). The fix covers both. The ruleset's `update` rule and `target_commitish: dev` stay theoretically possible undocumented interactions, but no evidence points at either.

Of the brief's three candidates: `target_commitish: <sha>` on the draft does not address the cause (it is unused for an existing tag, and the original design rejected it for that reason, `archive/supply-chain-release` "Nightly tag"); restating `tag_name` is the cause fix; a stricter pre-publish read-back adds nothing once no write of ours can change the tag or the assets it checks (D2).

## Architecture & Implementation

**Reuse.** No new module for #309 or #306: the change sits in the one release-editing interface and the one release network job. #305 adds one small pure module in the e2e tree, tested from `apps/extension/scripts/e2e/` like `egress-guard` and `csp-violations` (recon).

### #309: every release edit names its tag

- `AttachIO.editRelease(id, patch: { tag: string; body?: string; draft?: boolean })`. The tag is required by the type, so no caller can omit it; `realIO` sends it as `tag_name`. TSDoc states the invariant in one sentence: restate the tag on every edit, since an edit without one detaches a draft.
- `runApply`: both writes name the tag, in today's order: `editRelease(id, { tag: input.tag, body: notes })`, then `editRelease(id, { tag: input.tag, draft: false })` (D2).
- `runVerifyPublished`: `editRelease(state.id, { tag: input.tag, body: notes })`. GitHub's CLI restates the tag on published releases too, and the API's behaviour for a published release edited without one is undocumented, so this edit, which runs on every store submission, gets the same rule.
- `confirmPublished`, the attestation check, the ruleset and every refusal stay as they are.

### #305: one seed parse that refuses what it cannot run exactly

- New `apps/extension/tests/e2e/fixtures/chaos-seed.ts` exporting `chaosSeed(raw: string | undefined): number`:
  - unset or empty → `Math.floor(Math.random() * 2 ** 31)` (today's draw);
  - `/^\d+$/` and `Number.isSafeInteger(Number(raw))` → that integer;
  - anything else → `throw new Error(\`NULO_E2E_CHAOS_SEED=${JSON.stringify(raw)} is not a decimal integer seed\`)` (the `resolveBrowserKind` style; quoting keeps a dispatched value from starting a new log line the runner would read as a workflow command).
- The domain is the nonnegative decimal safe integers (`0` to `2^53 - 1`), not `≤ 0xffffffff` as #305 proposes: the nightly seeds from `github.run_id` (11 digits today), which `prng`'s `seed >>> 0` reduces modulo 2^32, as ci-followups-2's D3 relied on (its panel record). The issue's bound would red every scheduled night (D3).
- `send-chaos.test.ts`: the seed is computed once at module scope when `enabled` (`const seed = enabled ? chaosSeed(process.env.NULO_E2E_CHAOS_SEED) : 0`), so a refused value fails the file before the `burst` fixture spends minutes funding accounts; the test body uses `seed`. `prng`, `plan()` and the log line stay; the log prints the seed that runs, which is now always the value given (D5).

### #306: release's legs are the PR lane's, chaos included

- `release.yml` `network-e2e`: every leg gains `chaos` and `chaos_seed` keys (`false`, `""` on the existing eight; the pin's `bind` fails a leg that lacks a key the call reads). The five pool legs' `exclude_files` gain `tests/e2e/network/send-chaos.test.ts`, byte-identical to the PR pool list. Two legs join: `chaos / seed 1095865833` and `chaos / seed 1960252198`, each `shard: ""`, `shard_label: chaos-<seed>`, `test_files: tests/e2e/network/send-chaos.test.ts`, `exclude_files: ""`, `proverless: true`, `chaos: true`, `chaos_seed: "<seed>"`. The call's `with` gains `chaos: ${{ matrix.leg.chaos }}` and `chaos_seed: ${{ matrix.leg.chaos_seed }}`. The job's name (`Run / ${{ matrix.leg.name }}`), `if:`, `needs`, `retry: "0"` and `disable_presto` stay. The matrix comment (`:269-272`) says the chaos job runs one leg per seed, as the pool runs one leg per shard.
- Chaos stays inside the one matrix job, so `attach-assets` and `status` still read one `needs.network-e2e.result` and `aggregators.test.ts` is unchanged (its "exactly one caller of the suite" pin holds).
- The suite's "Assert canary results" step already runs for `inputs.chaos`, so each release chaos leg is read back against `canary-expectations.json` exactly as on a PR.

### File-level change map

| File | Change |
|---|---|
| `scripts/release/attach-assets-run.ts` | `editRelease`'s patch requires `tag`; `realIO` sends `tag_name`; the three callers pass `input.tag` |
| `scripts/release/attach-assets-run.test.ts` | The fake models the demonstrated rule (a draft takes the tag an edit names, or `untagged-<id>` when it names none) and records each edit; the `apply` happy path asserts the final tag, the `verify-published` happy path its edit's exact patch; a `realIO` PATCH-body test |
| `apps/extension/tests/e2e/fixtures/chaos-seed.ts` | New, `chaosSeed` |
| `apps/extension/scripts/e2e/chaos-seed.test.ts` | New, vitest |
| `apps/extension/tests/e2e/network/send-chaos.test.ts` | Uses `chaosSeed` at module scope |
| `.github/workflows/release.yml` | The two chaos legs, the two inputs, the pool exclusion, the matrix comment |
| `scripts/ci-cd/behavior-gating.test.ts` | `:810-871`: the chaos normalization goes; a PR matrix job expands by `seed` as it does by `shard` |
| `CI.md` | `:53`: release's opt-in run replays the two seeds, and `release.yml` joins the copies the pins hold equal |

### Trade-offs and alternatives

- **Restate the tag only in `realIO`** (the adapter reads the tag from the release first). Rejected: an extra GET per edit, and the tag the run means is `input.tag`, not whatever the record says.
- **One publishing write carrying the notes (`{ tag, body, draft: false }`).** Rejected (D2): it removes a write that, once it names the tag, can no longer change anything the read-back checks, so it adds no protection, and it would rewrite the flow and four doc sentences.
- **Move the read-back after the notes write.** Rejected for the same reason: a second read sequence for no checked property.
- **A workflow-level check of `chaos_seed` in `nightly.yml`.** Rejected (D4).
- **A separate `network-e2e-chaos` job in `release.yml`.** Rejected: `attach-assets` and `status` would need a second result and `aggregators.test.ts` pins exactly one caller of the suite.

## Decisions (ledger)

| # | Decision | Why | Panel |
|---|---|---|---|
| D1 | Every release edit restates the tag, enforced by `editRelease`'s type | The omitted `tag_name` is the cause; a type makes the next edit unable to omit it | Both legs: the cause is established (high); the type is the smallest guard; the `realIO` fetch-spy test is worth having (it catches `tag` sent instead of `tag_name`). Opus: the CLI's rule is not draft-only, so `verify-published`'s edit gets the tag too (accepted). Final design after round 2: the fake models only the demonstrated draft detachment, and `verify-published`'s test asserts the exact patch it sends |
| D2 | Keep today's two writes (notes, then publish), each naming the tag | With the tag named, the notes write cannot change what the read-back checks, so merging it into the publish adds no protection; the owner's rule keeps the design that carries the fix | Draft proposed one publishing write. Codex: one write is "the smallest appropriate change", two would work. Opus: under the keep-the-design rule two writes carry the fix, and one write rewrites four doc sentences for no protection. Opus's argument decides |
| D3 | Seed domain: nonnegative decimal safe integers (`/^\d+$/` and `Number.isSafeInteger`); no 2^32 bound | Run-id seeds exceed 2^32 and are reduced by `>>> 0`; #305's bound would refuse every scheduled night | Both legs agree. Codex: name the domain exactly and test both safe-integer boundaries (accepted). Opus: quote the raw value in the error (accepted); drop the test-only `random` parameter (accepted) |
| D4 | Refuse in the test's parse only | Every caller passes through it (nightly dispatch, PR seeds, local runs); a second check in `nightly.yml` duplicates it for one caller | Both legs agree |
| D5 | Parse at module scope when enabled | A refused seed fails before the burst fixture runs; unarmed runs never read the variable | Both legs: the failure shape holds (the boot sentinel passes vitest's exit 1 through once the sandbox is ready, so no exit-86 retry; the results assertion reds on "reported no tests") |
| D6 | Release chaos as two legs of the one matrix job, seeds copied and held equal by the leg-for-job pin | The release gates read one result; the codebase keeps twin data as literal copies held equal by pins (ci-followups-2 D9) | Both legs: sound; `chaos: ${{ matrix.leg.chaos }}` binds a boolean as `proverless` already does (`release.yml:330`); removing the chaos normalization keeps every guarantee. Opus: the matrix comment names the seed legs (accepted) |
| D7 | The fix is confirmed by the next scheduled nightly that reaches publish, watched by the orchestrator | Agents never dispatch a publishing workflow | given by the brief |
| D-orch-1 | One arc, one PR against `dev`, no stack | A single decision-free arc | the orchestrator |
| D-orch-2 | OA-1 (release 407837006 and the stray `untagged-…` tag) stays the owner's past this arc; the arc touches neither. Unanswered at close-out → one `owner-decision` issue, named on `Open items:` | Only the owner may edit or delete a release or a tag; the decision must outlive #309. The orchestrator recommends A to the owner | the orchestrator |
| D-orch-3 | OA-2 is a warning, not an ask: the PR body carries it under "Do not re-run a draft-flow publish from before this merge"; CLAUDE.md § Release runbook gains at most one sentence where the fix changes what it describes, with no run number or finding id | The release flow's order is unchanged, so the runbook describes nothing the fix changes | the orchestrator |
| D-orch-4 | Never dispatch or re-run `nightly.yml`, `release*.yml` or `publish-*.yml`; never write a tag, a release or an asset; `gh api` GETs only. #309 is proven by the unit tests (red on the base copy), `lint:actions` and `test:ci-gating`, and confirmed by the next scheduled nightly | The hard rules; D7 | the orchestrator |
| D-orch-5 | #308 (the nightly smoke failure on `send-keyboard.test.ts`) is not this lane's: its file and fixtures stay untouched, and a gate that hits it is reported, never worked around | The e2e pool owns it | the orchestrator |
| D-orch-6 | Phase 2's three local runs go through `agent.sh` with `NULO_E2E_PROVERLESS=1`, retry 0 and the stall watchdog untouched, beside another lead's network e2e on the host | Parallel-safe by registry; the PR leg's environment | the orchestrator |
| D-orch-7 | `lessons.md` stays at or under 8 KiB: the close-out's one promotion merges with or retires an entry, never a wholesale reformat, reconciled against `origin/dev` before the final gates | The curated layer's budget | the orchestrator |

**Deviations recorded during implementation.**
- Commits carry `Co-Authored-By: Claude Opus 5.5`, the model that implemented the arc, where § Delivery says Fable 5.1.
- Phase 1's base proof ran the test file against a copy of the `2a41b1d` file and restored the fix by copy, rather than commit-then-`git checkout HEAD --`; the same bytes run either way ([lessons/phase-1.md](lessons/phase-1.md)).

## Assumptions

**Facts** (verified 2026-10-11):
- F1. `runApply` checks the draft's tag at `attach-assets-run.ts:133`, then calls `editRelease(id, { body: notes })` (`:137`) and `editRelease(id, { draft: false })` (`:138`); `realIO.editRelease` sends the patch verbatim (`:325`), with no `tag_name`.
- F2. Release 407837006 reads `tag_name` `untagged-29f161d8864377d68cb4`, `target_commitish` `dev`, published 11:12:46Z with three uploaded assets; tag `v0.30.2-nightly.26282` names `61060c0` (GET calls).
- F3. Rule insights hold one evaluation for that tag, its creation at 11:12:39Z (pass), and no failed evaluation on any ref in the month.
- F4. `dev`'s first-parent history puts `61060c0` at its head at 11:12:46Z (the next commit landed 13:27Z); commit timestamps show the order, not every movement of the ref.
- F5. `release-integrity.test.ts:410-417` refuses `gh release edit` in any workflow step, so the fix stays in the runner.
- F6. `send-chaos.test.ts:135` takes `Number(NULO_E2E_CHAOS_SEED)` when set; `prng` does `seed >>> 0` (`:37`); `Number("abc")` is `NaN` and `NaN >>> 0` is 0.
- F7. `nightly.yml`'s chaos jobs seed with `github.event.inputs.chaos_seed || github.run_id` (pinned at `behavior-gating.test.ts:898-902`); run ids are 11 digits (37919470569).
- F8. `release.yml`'s pool legs exclude nine files without `send-chaos.test.ts`; the PR pool excludes ten (`pr-extension-network-e2e.yml`); the suite's `chaos` input defaults to `false` and `chaos_seed` to `""` (`_extension-network-e2e.yml:90-99`).
- F11. `refs/tags/untagged-29f161d8864377d68cb4` exists at `61060c0` (GET; that the publish created it is the inference in § The cause); the repository's immutable releases are off (`GET /immutable-releases`: `enabled: false`), and release 407837006 is `immutable: false`.
- F12. GitHub's CLI sends the release's current `tag_name` on every `gh release edit` that names none, because "the API will remove the current tag from the release" (`cli/cli` `pkg/cmd/release/edit/edit.go`, `editRun`).
- F9. `behavior-gating.test.ts:810-871` removes the PR chaos job and the chaos file before comparing, and `bind` fails a leg that lacks a key the call reads.
- F10. `apps/extension/vitest.config.ts` includes `scripts/**/*.test.ts` and excludes `tests/e2e/**`; `scripts/e2e/egress-guard.test.ts` imports `tests/e2e/fixtures/egress-guard.ts`.

**Inferences:**
- I1. A `PATCH` that names the draft's existing tag keeps it (F12, and a third-party A/B; not reproducible here without a write). Confirmed only by the next scheduled publish.
- I2. (Withdrawn with D2's one-write proposal.)
- I3. Restating a published release's own `tag_name` changes nothing about it (F12: the CLI does it on every edit; the tag exists, so `target_commitish` is unused).
- I4. A module-scope throw in a vitest spec fails the file and the run, and the chaos job's results assertion reds too.
- I5. #306's "the pool legs split the files differently" (vitest excludes before its hash sharding): plausible, not measured, and moot once the lists match.

**Asks:** none open for the build. For the orchestrator: OA-1 (the stray release and tag) and OA-2 (no re-run of a publish job from a run before the fix; the first stable through the draft flow must carry it) are owner actions the arc does not wait on. #305's 2^32 bound is replaced by D3 on evidence. #306 offered two options; the lane brief chose parity, which puts a retry-0 chaos gate on an owner-dispatched `run_network_e2e=true` publish, as on every network PR.

## Security & Adversarial Considerations

- **Threat model.** The publish path holds `contents: write` and `attestations: write`; an edit without the tag can publish a release detached from its tag and create an `untagged-…` git tag outside the `refs/tags/v*` ruleset. `verify-published` and the store jobs then fail to find the release, and with immutable releases on it would be permanent. The fix removes our own detaching edits; it widens nothing. A draft-flow run from before the fix still detaches if it reaches publication (OA-2).
- **Fail-closed stays.** The pre-publish read-back (digests and tag), the post-publish read-back, the tag-commit check, the attestation identity and the `release tags` ruleset are untouched. A publish that still detaches fails the run as today.
- **Least privilege.** No permission, token, environment, secret, ruleset or variable changes. No `gh release edit` enters a workflow (F5).
- **Input validation.** `chaos_seed` is maintainer-only (dispatch), but a typo can publish a nightly that never ran the asked seed; refusing at the parse closes it. The value reaches a log line and an error message only, never a shell.
- **Supply chain.** No dependency change.

## Phases

All in arc 1. Each phase commits its tests with its code.

### Phase 1: #309, the tag rides every release edit ✓

Steps:
1. Change `editRelease`'s patch type to require `tag`, send it as `tag_name` in `realIO`, and pass `input.tag` at the three callers (`runApply`'s notes and publish, `runVerifyPublished`'s notes).
2. In the test fake, model only what is demonstrated: an edit of a draft gives it the tag the edit names, or `untagged-<id>` when it names none; an edit of a published release changes its tag only when it names one. Type the fake's parameter `{ tag?: string; body?: string; draft?: boolean }`, so the model says what it covers. Record every edit's patch in a `World.edits` list (beside today's `bodies`); keep the `calls` strings `notes` and `publish` unchanged, since several tests assert `not.toContain("publish")` and a renamed string would make them pass vacuously.
3. In the `apply` happy-path test, keep the call order (`create`, the uploads, `notes`, `publish`), assert the release ends `{ tag: "v1.2.3", draft: false }`, and give the exit assertion the run's logs as its message, so a red names the refusal.
4. In the `verify-published` happy-path test, assert its one edit is exactly `{ tag: "v1.2.3", body: <the notes> }` (the request contract, since GitHub's answer to a tagless edit of a published release is undocumented) and that the release still names `v1.2.3`.
5. Add one `realIO` test: spy on `fetch`, call `editRelease(7, { tag: "v1.2.3", draft: false })`, and assert one `PATCH` to `releases/7` whose JSON body is exactly `{ tag_name: "v1.2.3", draft: false }` (pattern: `store-copy-run.test.ts:342`).

**Validation gate:**
- Commands: `bun test scripts/release/attach-assets-run.test.ts`; then the base proof: commit, `git show 2a41b1d:scripts/release/attach-assets-run.ts > scripts/release/attach-assets-run.ts`, run the same file, `git checkout HEAD -- scripts/release/attach-assets-run.ts`; then `bun run test:release`, `bun run test:ci-gating`, `bun run lint`, `bun run typecheck:all`.
- Pass criteria: green with the fix. On the base copy, the `apply` happy-path test fails at its exit assertion with a message containing `belongs to untagged-`, the `verify-published` happy-path test fails on its edit's missing `tag`, and the `realIO` test fails on the missing `tag_name`; the other tests' outcomes are recorded. This proves the tests catch an omitted tag; GitHub's behaviour itself is F12 and D7. Every suite exits 0 after the restore.
- Layers: unit, lint, typecheck.

### Phase 2: #305, a seed the test cannot run exactly is refused ✓

Steps:
1. Add `chaos-seed.ts` with `chaosSeed` as specified.
2. Use it in `send-chaos.test.ts` at module scope when `enabled`.
3. Add `scripts/e2e/chaos-seed.test.ts`, table-driven: one test per refused class, a success control, and the unset case:
   - refused, not a number: `abc`, `NaN`;
   - refused, a number in another spelling: `0x1f`, `1e3`, `-5`, `1.5`, ` 12`;
   - refused, beyond the safe-integer range: `9007199254740992` (the boundary);
   - accepted unchanged: `1095865833`, `1960252198`, `37919470569` (a run id above 2^32), `0`, `9007199254740991` (the boundary);
   - unset and empty draw `Math.floor(Math.random() * 2 ** 31)` (`vi.spyOn(Math, "random")`, restored in `afterEach` so a failed assertion cannot leak it).
4. Replay one PR seed through the real suite and compare its actions with a recent PR run's log.

**Validation gate:**
- Commands: `cd apps/extension && bun --bun vitest run scripts/e2e/chaos-seed.test.ts`; the same file against the base parse is not applicable (new module), so the red proof is a refused value through the real suite. Each run reproduces the PR chaos leg's environment (`proverless: true` → `NULO_E2E_PROVERLESS=1`, retry 0), one `e2e:agent` run at a time, from the worktree root:
  - `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=abc NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-chaos.test.ts`
  - `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1095865833 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-chaos.test.ts`
  - the same with `NULO_E2E_BROWSER=firefox` (the change touches `tests/e2e/fixtures/**`). Then `bun run lint`, `bun run typecheck:all`, `bun run test`.
- Pass criteria: the unit file green. The `abc` run is red with `NULO_E2E_CHAOS_SEED="abc" is not a decimal integer seed`, logs no `[send-chaos] seed=` line, and exits non-zero without the exit-86 infra retry. The `1095865833` runs are green on both browsers, and their `[send-chaos] seed=1095865833 … actions=` line equals the one in the latest green PR chaos leg's log for that seed (`gh run view --log`, read-only) once each distinct `"destination"` is relabelled by the order of its first appearance (`d1`, `d2`): one recipient, `burst.other`, is a `randomAztecAddress()` drawn per run (`fixtures/burst-account.ts:103`), so its address differs while the choice of recipient per send must not. Two PR runs of this seed (38162383273, 38154473420) differ only in that address.
- Layers: unit, lint, typecheck, network e2e (Chrome and Firefox).

### Phase 3: #306, release's opt-in run is the PR lane leg for job ✓

Steps:
1. Edit `release.yml` `network-e2e` as specified, the matrix comment included.
2. In `behavior-gating.test.ts:810-871`, delete the `chaos` constant, `withoutChaos` and the `chaos !== true` filter, expand a PR matrix job by `seed` (substituting `${{ matrix.seed }}` in its name and inputs) as it does by `shard`, and delete the comment that says release replays no seed.
3. Update CI.md `:53`: release's opt-in run replays the same two seeds, and `release.yml` joins the copies the pins hold equal.

**Validation gate:**
- Commands: `bun run lint:actions`; `bun test scripts/ci-cd/behavior-gating.test.ts scripts/ci-cd/aggregators.test.ts`; base proofs (the new test with `git show 2a41b1d:.github/workflows/release.yml`; the base test with the new `release.yml`); three mutations of `release.yml`, each restored after: drop one chaos leg, change one release seed, remove the chaos file from one pool leg; then `bun run test:ci-gating`.
- Pass criteria: green as changed. Red in both base proofs and in each mutation, each failure naming the leg-for-job comparison. `aggregators.test.ts` green and unchanged.
- Layers: workflow lint, CI pins.

### Phase 4: arc gate ✓

- Commands: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:ci-gating`, `bun run test:release`, `bun run lint:actions`, and `git diff origin/dev --stat` read against the change map.
- Pass criteria: every command exits 0; no file changed outside the change map, this plan directory and `implementations-plan/index.md` (this plan's line). The close-out later adds `implementations-plan/lessons.md`, `implementations-plan/archive/index.md` and the archive move.

## Delivery

One arc, one branch (`worktree-ci-followups-3`), one PR against `dev`, no stack (D-orch-1). The close-out lands as the PR's final commits.

| Arc | Phases | Base | code_review | PR title (≤ 93 chars) |
|---|---|---|---|---|
| arc 1 | 1-4 + close-out | `dev` | off | `fix(release): keep a draft's tag through its edits; refuse a malformed chaos seed` |

- Open the PR only after Phase 4 is green and the Codex fix loop has converged. Open it without labels. The diff touches `.github/workflows/release.yml` and `apps/extension/tests/e2e/**`; if the network lane's path filter skips, add `e2e:extension-network` after creation, since send-chaos changed.
- PR body: what changed and why (the cause of #309 in three lines), the validation run with outcomes, `Closes #309`, `Closes #305`, `Closes #306`, the line "Confirmed by the next scheduled nightly that reaches publish" (D7), and OA-2's warning: a re-run of a nightly or rc publish from a draft-flow commit before this merge still detaches if it reaches publication, so never re-run one; the first stable release through the draft flow needs a promote that carries this fix. It ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional, lower-case subject, signed, ending `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Post-implementation

Single arc: steps 1-2 run once over the whole diff after Phase 4 is green; then step 3 opens the PR and step 4 adds the close-out as its final commits, both before the merge; only step 5 follows the merge.

1. **Codex audit** (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`): the diff (`git diff origin/dev...HEAD`), this plan with its ledger, the adversarial ask ("What could go wrong? What would an attacker, a stale re-run or a GitHub quirk target? What are we trusting that we shouldn't?"), and these two rules verbatim:
   - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop.** Verify each finding against the repo, apply the accepted ones, commit, log the round in `lessons/phase-4.md`, then resume the same session (`resume-codex.sh <session-id> <followup-file> <codex-dir> high`) with the fix diff and the same two rules. Stop when a round yields no new material finding. After three rounds with material findings, stop and surface it in the report.
3. **Delivery** per § Delivery: `gh pr create --base dev`, then `gh pr checks --watch`.
4. **Close-out**, as the PR's final commits, after `git merge origin/dev` and a read of what changed in `implementations-plan/index.md` and `lessons.md` (never a union merge):
   - An `## Outcome` block directly after the front matter: date, status, what shipped with the PR number, dispositions (#305's 2^32 bound replaced by D3; `target_commitish` not used), `Open items:`, and a line retiring the seeds below.
   - OA-1: if the owner has answered, record the answer as a disposition line (the owner runs the command, never an agent). If not, open one `owner-decision` issue for the detached release (dedupe first with `gh issue list --state all --search "407837006"`; the five sections, the three options and their commands from OWNER-ASKS.md) and name it on `Open items:`, so the decision outlives #309's closing.
   - Promote one line to `lessons.md` § Git & GitHub: a REST edit of a draft release without `tag_name` detaches it to `untagged-…`; restate the tag in every draft edit (dated 2026-10). The file is at 8191 bytes: merge or retire an entry so it stays within 8 KiB.
   - Open work lives in issues (CLAUDE.md § Where open work lives):

     | Situation | Home |
     |---|---|
     | Work inside the implementation you are on | the active `plan.md` and the PR |
     | Actionable work that outlives the plan | a GitHub issue, with a domain label and a `Record` link to the archived plan |
     | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
     | A suspected exploitable weakness | a private draft security advisory |
     | Rejected, superseded or already done | a disposition line in the Outcome block |
     | Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
     | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
     | Accepted code work that blocks launch | the `v1.0.0` milestone |

   - Delete `STATUS.md`. `git mv implementations-plan/ci-followups-3 implementations-plan/archive/ci-followups-3` in its own commit; repair relative links the extra level breaks (`git grep -n ci-followups-3`); move the index line into `archive/index.md`. `bun run check:plans` green.
   - An issue left open or not holding gets a comment with the reason (none expected).
5. **Teardown after the merge.** Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-followups-3/plan.md` succeeds, run `agent-worktree done ci-followups-3 --merged` (this session was not entered through `EnterWorktree`, so there is nothing to exit). It never forces: relay a refusal and stop. A `/goal` session arms one background wait for that check right after its report; a `/loop` session checks on each firing. Merging is the orchestrator's call.

## Audit record

### Round 1 (2026-10-11): Codex gpt-6.1-sol high, and the Opus Plan lens, in parallel

**Codex: conditional approve** (conditions: Phase 2's runs reproduce the PR leg's proverless environment; OA-1 outlives #309's closing; the PR and close-out come before the merge). **Opus: conditional approve** (conditions: fix Phase 2's actions comparison and cut duplicate runs; record the stray `untagged-…` tag; add OA-2; cite the CLI and model every edit; settle D2 under the keep-the-design rule). Every finding was checked against the tree or the web before acting.

| # | Leg | Severity | Finding | Disposition |
|---|---|---|---|---|
| C1 | Codex | Medium | Phase 2's runs lacked `NULO_E2E_PROVERLESS=1` (`agent.sh:101`; the PR leg sets it, `_extension-network-e2e.yml:139`) | Accepted: full commands with the flag and `NULO_E2E_RETRY=0` |
| C2 | Codex | Medium | OA-1 loses its tracking when #309 closes | Accepted: the close-out records the answer or opens one `owner-decision` issue |
| C3 | Codex | Medium | Post-implementation put the PR and close-out after the merge | Accepted: only teardown follows the merge |
| C4 | Codex | Low | GitHub's CLI restates `tag_name` on every edit ("the API will remove the current tag"); one recon citation over-attributed `target_commitish` | Accepted: F12, cause point 4, recon split |
| C5 | Codex | Low | "Converts exactly" is wider than `Number.isSafeInteger` | Accepted: "nonnegative decimal safe integers", both boundaries tested |
| C6 | Codex | Low | The race guarantee was overstated | Accepted: the quality bar names what the post-publish read-back reports |
| C7 | Codex | Low | The destination mask's explanation was wrong and hid a changed recipient choice | Accepted: destinations relabelled by first appearance |
| C8 | Codex | Low | A cancelled run's draft now lacks notes: an owner ask | Rejected: a draft is visible only to people with push access, and every publish writes the notes; moot once D2 kept two writes |
| O1 | Opus | High | The publish created `refs/tags/untagged-29f161d8864377d68cb4` at `61060c0`; "nothing wrote a ref" was wrong (insights see only `v*`) | Verified (GET); accepted: cause point 2-3, F11, recon, OA-1 gains the tag's delete and read-back, threat model |
| O2 | Opus | Medium | A re-run of a pre-fix publish, or a stable or rc before the fix reaches its ref, detaches again | Verified (`origin/main` has no `attach-assets-run.ts`); accepted: OA-2 and the PR body's warning |
| O3 | Opus | Medium | The CLI's rule is not draft-only: `verify-published`'s edit is a second instance; the fake should model every edit | Accepted: all three callers pass the tag; one fake rule; a tag assertion in the `verify-published` happy path |
| O4 | Opus | Low | The error message echoed a raw dispatch value into a log the runner reads for `::` commands | Accepted: `JSON.stringify(raw)` |
| O5 | Opus | High | The actions-line equality cannot pass: `burst.other` is random per run | Accepted in Codex's form (C7): relabel destinations, keep the comparison as the replay check |
| O6 | Opus | Medium | D2 adds no protection once the notes write names the tag, and rewrites four doc sentences; the owner's rule keeps the design | Accepted: D2 reversed to two writes, each naming the tag; the doc rows dropped from the change map |
| O7 | Opus | Medium | Too many local e2e runs: keep the `abc` run and one Chrome success; take Firefox from the PR's required lane | Partly accepted: the comparison stays cheap on runs already made. Rejected for Firefox: the common brief requires the Firefox twin when `tests/e2e/fixtures/**` changes, and moving the module to dodge the rule would be gaming it |
| O8 | Opus | Low | Drop `chaosSeed`'s test-only `random` parameter | Accepted: `vi.spyOn(Math, "random")` |
| O9 | Opus | Low | On the base copy the happy path fails at `exit`, not on the refusal text; the matrix comment should name the seed legs; F8's lines are `:90-99`; D3's citation | Accepted: the exit assertion carries the logs as its message; comment in the change map; F8 and D3 reworded |

### Round 2 (2026-10-11): Codex, resumed

**Codex: conditional approve** (conditions: the fake must not claim an undocumented published-release detachment; OA-2 must tell the defective draft-flow runs from `main`'s older flow). All three round-1 conditions met; the D2 reversal accepted ("no concrete protection requiring the one-write form"); the Firefox run and the fixture placement accepted; `JSON.stringify` and the `Math.random` spy accepted.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| R2-1 | Medium | The fake asserted that a tagless edit of a published release detaches, which nothing documents | Accepted: the fake models drafts only; `verify-published`'s happy path asserts its edit's exact patch (`World.edits`), keeping the `calls` strings so no `not.toContain("publish")` turns vacuous |
| R2-2 | Medium | OA-2 overstated: `origin/main`'s `release.yml` still runs `gh release upload --clobber` and `gh release edit` (verified), which restate the tag | Accepted: OA-2 names three cases (draft-flow runs before the fix; tags whose code predates the draft flow; new cuts) |
| R2-3 | Low | "The draft already named the placeholder before the publish" is stronger than a ref GET shows | Accepted: stated as an inference; "the notes PATCH at the latest" removed |
| R2-4 | Low | OA-1 option A: read the restored binding back before deleting the stray ref | Accepted |

### Round 3 (2026-10-11): Codex, resumed

**Codex: conditional approve** (condition: Phase 4's file gate must allow this plan's index line). Round-2 conditions met; no new implementation or security finding. All four findings accepted: Phase 4 allows `implementations-plan/index.md` and names the close-out's files (Medium); the TSDoc sentence and F11 claim only the demonstrated draft detachment and the stray ref's existence (Low); D1's ledger states the final fake design (Low); the summary says "nonnegative decimal safe integer" and recon says "drop only the chaos-specific normalization" (Low).

### Round 4 (2026-10-11): Codex, resumed — final verdict

**Codex: approve.** "The round-3 condition is met. No material remaining findings." The Opus lens's five conditions were each applied in round 1 (O1-O9 above, with O7's Firefox part rejected by the common brief's rule) and re-checked by Codex in rounds 2-4.

Unresolved disagreements: none. The one contested call, D2, was settled for two writes by both legs after round 1.

Facts confirmed by both legs: F1-F3, F5-F10; F4 softened (C-Facts).

## Seeds (draft; finalized after the orchestrator's approval)

Recommended: `/goal`.

```
/goal Phases 1-4 of implementations-plan/ci-followups-3/plan.md marked ✓, each backed by its validation gate reported passing in the transcript (including the base-copy red proofs and the three release.yml mutations); LESSONS_FILE=implementations-plan/ci-followups-3/lessons/phase-N.md printed per phase; code_review is off, so /code-review was NOT run; the Codex fix loop converged on the whole diff (a resumed gpt-6.1-sol pass reporting no new material findings, quoted); one PR against dev exists, opened only after the loop (gh pr view output), carrying Closes #309, #305, #306, with the close-out's archive-move commit (git show --stat) as its final commits; bun run test:all, test:ci-gating, test:release, lint, lint:actions and typecheck:all report exit 0.
```

Alternative: `/loop 15m Drive implementations-plan/ci-followups-3 forward per its Post-implementation section; never dispatch a workflow, never touch a tag, release or ruleset; consult Codex (gpt-6.1-sol, high) on any open question and log it; stop and report when the PR is green or after three failures on one step.`
