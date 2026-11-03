---
plan: egress-guard-1
tier: light
status: approved; arc 2 in progress
issues: "#1636"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: no recon agent (the archived plan and #1636 are the recon); one Codex plan audit (gpt-6.1-sol, high), resumed until approve; the Codex fix loop and one Opus diff review
post_implementation_hardening: not scheduled
base: origin/dev at 6bef2ce57
trunk: dev
---

# egress-guard-1: the egress guard declares each release's Testnet host for the update scenarios

The live update scenario from v1.1.0 is red on both browsers at the egress guard's close (#1636): the release seeds Testnet on dRPC's keyed load-balancer host, and the guard declares only the candidate's Testnet host, derived from the candidate's constant. This arc declares, as a refusal, the Testnet host of every release the update scenarios can install, read from a reviewed per-release trait beside the digests, then runs both update scenarios from v1.1.0 on both browsers at retry 0. Test fixtures only. Recon: [the archived release-replay-1 plan](../archive/release-replay-1/plan.md) and its [lessons/phase-1.md](../archive/release-replay-1/lessons/phase-1.md), and #1636.

## Outcome & Quality Bar

- **For whom:** whoever runs the 1.2.0 promote's step 1 (`.claude/skills/release/SKILL.md` § Stable release), and the reviewer.
- **Excellent:** (1) no hostname in the guard is hardcoded, and no trait holds more than a bare hostname; (2) both live runs and both replays pass at retry 0 against candidates built at a named commit, each with its UTC window, wall-clock and outcome; (3) a red that is not the guard is reported, never patched.
- **Good enough:** the v0.31.0 and v1.0.0 scenarios are not run; their hosts are reviewed from their pinned zips (F2).

## Assumptions

**Facts** (verified 2026-11-03 at `6bef2ce57`):
- F1. `LIVE_NODE_HOST` is `new URL(TESTNET_RPC_URL).hostname`, the only Testnet entry in `DECLARED_REFUSALS`, which `undeclared` reads for every launch (`tests/e2e/fixtures/egress-guard.ts:71`, `:85-99`, `:137-142`). The candidate's Testnet host is now `aztec-testnet.drpc.org`; its Mainnet host is `aztec-mainnet.drpc.org` (printed as hostnames only, by importing the constants).
- F2. Every pinned release zip (digests match `fixtures/update/release.ts:13-26`) seeds Testnet on `lb.drpc.live`: its seeds module sets the `Testnet` seed's `rpcUrl` to a template literal starting `https://lb.drpc.live` (v0.31.0 `index.ts-*.js`, v1.0.0 and v1.1.0 `seeds-*.js`; read with the literal redacted, host only). v1.0.0 and v1.1.0 seed Mainnet on `aztec-mainnet.drpc.org`, the candidate's own Mainnet host, so Mainnet needs no trait.
- F3. The update scenarios (live, replay, arrival) install any tag with digests (`fixtures/update/in-place.ts:37-46`; README § In-place update). `RELEASE_TRAITS` keys must equal `RELEASE_DIGESTS` keys (`scripts/e2e/update-recording.test.ts:35-37`), and `releaseTraits` throws for a tag with none (`release.ts:50-54`).
- F4. A launch's stand-ins hold only the candidate's seeded node URLs (`fixtures/extension.ts:47`, `:190-195`), so a release's request to `lb.drpc.live` reaches the guard, which answers 403 to the `CONNECT` and records `host:port`, never a path (`egress-guard.ts:219-262`).
- F5. A candidate names its build commit and is refused unless HEAD equals it with no change a build reads; `apps/extension/tests` and `implementations-plan` are not build inputs (`fixtures/update/source.ts:7`, `:20-25`; `fixtures/update/in-place.ts:18-30`).

**Inferences:**
- I1. With the host declared, both live runs pass on both browsers. Basis: the guard's line was the runs' only error on 2026-11-03, but it replaced the body's (#1636), so the body's outcome is unknown. Phase 2 tests it.

**Asks:** none; the lane brief fixes the scope, the runs and the PR title.

## Architecture & Implementation (arc 2 of lane release-replay-1, branch `release-replay-1-a2`)

**Shape (D1).** `ReleaseTraits` gains a required `testnetHost: string`, the bare hostname of the Testnet node the release seeds. `egress-guard.ts` derives its release entries from `RELEASE_TRAITS`: one per distinct host, with why naming its tags, spread into `DECLARED_REFUSALS` before the candidate's entries, so a host both declare keeps the candidate's why. The guard hardcodes no release host. A tag with no traits is refused at runtime by `releaseBuild`, which every release install reaches through `updateBuilds` (live, replay, arrival, the update chaos spec), before it downloads (D3); the type makes a traits entry without a host fail `typecheck:all`.

**Touched files:** `apps/extension/tests/e2e/fixtures/update/release.ts`, `tests/e2e/fixtures/egress-guard.ts`, `scripts/e2e/update-recording.test.ts`, `scripts/e2e/egress-guard.test.ts`, `scripts/e2e/release-build.test.ts`, `tests/e2e/README.md` (§ In-place update's traits bullet, § Egress guard's host table), and this plan's directory.

### Phase 1: the trait and the declaration ✓
1. Add `testnetHost: "lb.drpc.live"` to each of the three tags and the trait's TSDoc line; `releaseBuild` calls `releaseTraits(tag)` first.
2. Derive the release entries in `egress-guard.ts` and spread them into `DECLARED_REFUSALS`.
3. Tests (one per claim, success control beside each refusal):
   - `update-recording.test.ts` "release traits": every `testnetHost` is a bare hostname: a boolean check, `new URL(\`https://${h}\`).hostname === h` with no trailing dot, a parse failure false, reporting only the failing tags, never the value. Controls: `lb.drpc.live` passes; a path, a port and a trailing dot fail.
   - `egress-guard.test.ts` "undeclared": every tag's `releaseTraits(tag).testnetHost` passes; an unlisted host still fails (exists at `:206-218`).
   - `release-build.test.ts`: `releaseBuild` refuses a tag with no traits before any download.
4. README: the traits bullet names the trait; the host table gains a row for each pinned release's Testnet node (refused; declared from `testnetHost`).
- **Gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run scripts/e2e/update-recording.test.ts scripts/e2e/egress-guard.test.ts scripts/e2e/release-build.test.ts` at retry 0; `bun run test:all`. Pass: exit 0. Layers: lint, typecheck, unit.
- Commit: `test(e2e): the egress guard declares each release's testnet host from its traits`.

### Phase 2: review loop, then builds and runs at the reviewed commit `C`
1. The review loop (§ Post-implementation) over `git diff 6bef2ce57...HEAD`, with the Opus diff review beside round 1; fixes committed, Phase 1's gate rerun.
2. Merge `origin/dev` if it moved; rerun Phase 1's gate. HEAD is now `C`. `git status --porcelain` must show only this plan's files.
3. From the repo root: `bash apps/extension/scripts/e2e/build-update-candidate.sh chrome`, then `firefox`; `cd apps/extension && bun scripts/e2e/install-firefox.ts`.
4. One at a time, foreground, log polled in a bounded loop: live Chrome, live Firefox, replay Chrome, replay Firefox, with the commands in § Delivery's handoff block. No `NULO_E2E_UPDATE_RECORD`, no `NULO_E2E_BACKUP_RECORD`: #1641's recording is fresh (expires about 2026-11-10 18:06 UTC).
5. Record each run's UTC window, per-test and vitest wall-clock and outcome in `lessons/phase-2.md`, uncommitted until the four runs end (F5). Never copy a URL from a log.
- **On red:** a guard red naming a release host means F2 is wrong: stop, report. Any other red is reported, never patched: its cause goes to `OWNER-ASKS.md` and holds the promote. One rerun only to show a flake, both logs kept.
- **Gate:** both live runs pass; on both browsers the replay's four cases pass (a skip is no pass). Layers: e2e-live-network, e2e.

### Phase 3: close-out and delivery
1. Commit `lessons/phase-2.md`. Merge `origin/dev` again if it moved; when `git diff --stat C HEAD -- . ':(exclude)implementations-plan'` is not empty (a build input, or the harness under test), rebuild and rerun all four runs at that head, which then replaces `C`. The PR head `H` differs from `C` by plan files only, which the body shows.
2. Close-out commits (§ Post-implementation), then push and open the PR (§ Delivery).

## Security & Adversarial Considerations

- **Provider key.** No artifact this arc writes (a source file, a test name or message, a lesson, the PR body, a commit) holds more than a hostname: the trait is the hostname alone, a unit test refuses anything more and reports only the tag, and the hosts were read from the zips with the literal redacted. Existing diagnostics are not sanitized (Firefox's page-error relay keeps raw text, `fixtures/browser/firefox-page-errors.ts`), so a log excerpt has its URLs replaced before it is copied anywhere. Nobody opens `apps/extension/src/wallet/constants/network-endpoints.ts`.
- **Egress.** The change widens what the guard accepts as a refusal, never what goes direct: `liveHosts` and the stand-ins are untouched, and the guard still answers 403 to a `CONNECT lb.drpc.live:443` with no byte forwarded (F4). Residual, plausible but unverified: a candidate-only launch that dials `lb.drpc.live` no longer fails the guard's close (D1). Reachable only if the candidate still bundles or writes the retired keyed URL other than through `TESTNET_RPC_URL`; the request is still refused, and nothing leaves the machine.
- **Release zips:** digests unchanged. N/A: cryptography, least privilege, supply chain (no dependency change).

## UI impact

None. Test fixtures only.

## Decision ledger

| # | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | Required `testnetHost` per tag; the guard declares the set derived from every tag's trait | (b) per-launch: the launch that installs a tag declares that tag's host alone | (b) would catch a candidate-only launch, or one release, dialing a release's host (Codex); it costs a declared-hosts parameter through `launchExtension`, `ownGuardedLaunch`, `closeAfterEgressCheck`, `egressFailure` and `undeclared`, and through every launch that installs a release, the separate release reader (`read-release.ts:95`) included. Today every release seeds one host, the request is refused either way, and the miss needs a candidate that still carries the retired URL (residual above) |
| D2 | #1636's optional item (the close's error keeps the body's as its `cause`, `in-place.ts:186-192`) rejected for this arc: a disposition line in the Outcome | include it; a closed `known-limit` issue | the lane scope names the declaration as the fix; the run is red either way, so only a diagnosis is lost (Codex agrees) |
| D3 | `releaseBuild` refuses a tag with no traits before it downloads | the type and the keys-equal unit test alone | the arrival scenario reads no trait, so a tag with digests and no traits would install there, its Testnet host undeclared (Codex P2) |

## Review verdicts

- **Codex plan audit, round 1** (gpt-6.1-sol, high, read-only): conditional approve, three P2 and three P3, all accepted. P2: a tag with no traits installs through the arrival scenario (D3); the rerun condition excluded the harness under test (Phase 3 step 1); the key guarantee overclaimed for existing diagnostics (Security). P3: D1's "catches nothing" was false, now the real trade-off; the hostname check passed a trailing dot; D2 as a rejected disposition. Confirmed: no import cycle or Bun hazard in the guard importing `release.ts`; the handoff's names and flags; the build-then-run order.
- **Round 2** (resumed): **approve**; one P3 accepted, the `/goal` seed now names `C` and the plan-only diff to `H`.
- **Arc review loop:** Codex round 1 two P3 comment cuts, the Opus review one README P3, all accepted; Codex round 2 clean, converged ([lessons/phase-2.md](lessons/phase-2.md)).

## Delivery

- **Arc 2**, one PR against `dev`, ready, never a draft. Title: `test(e2e): the egress guard declares each release's Testnet host for the update scenarios` (89 characters). `Closes #1636`. No label at creation.
- **Body:** what changed and why; `C`, `H` and the plan-only diff between them; the browser versions; every run with its UTC window, outcome and wall-clock; the handoff block below.
- **Handoff** (the orchestrator, from the repo root of a clean checkout of the frozen candidate; four commands, each read on its own, any red holds the promote):
  ```bash
  bash apps/extension/scripts/e2e/build-update-candidate.sh chrome && bash apps/extension/scripts/e2e/build-update-candidate.sh firefox
  NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/apps/extension/.e2e-state/update-candidate/chrome NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/update-in-place.test.ts
  NULO_E2E_BROWSER=firefox NULO_E2E_RETRY=0 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/apps/extension/.e2e-state/update-candidate/firefox NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/update-in-place.test.ts
  cd apps/extension
  NULO_E2E_BROWSER=chrome NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/chrome bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0
  NULO_E2E_BROWSER=firefox NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=v1.1.0 NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/firefox bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0
  ```

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `6bef2ce57`. Plan-specific values:
- **Diff review:** `code_review: off`; absent.
- **Review loop** (Phase 2 step 1): `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; hard stop at three rounds; each round in `lessons/phase-2.md` and under Review verdicts. One Opus review (`general-purpose`) beside round 1.
- **Delivery:** `gh pr create --base dev` (ready); `gh pr checks <n> --watch` once; one rerun for a known flake. Never merge.
- **Close-out** as the PR's final commits: the `## Outcome` block; lessons within 8 KiB; `STATUS.md` deleted; `git mv implementations-plan/egress-guard-1 implementations-plan/archive/egress-guard-1` in its own commit, the index line to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown:** the orchestrator's, after the merge.

## Seeds (draft)

```
/goal Arc 2 of lane release-replay-1 delivered per implementations-plan/egress-guard-1/plan.md: Phases 1-3 marked ✓ with their gates; the Codex loop (gpt-6.1-sol high) converged; the PR open and ready against dev, its body naming tested commit C and the plan-only diff to its head H.
```

```
/loop 15m Drive implementations-plan/egress-guard-1/plan.md. Next unchecked step; one e2e run at a time, polled in a bounded loop; signed commits. Report a red run, never patch it. Open the PR ready, watch checks, report and stop. Never merge.
```
