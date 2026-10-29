---
name: release
description: The Nulo release runbook. Promote dev → main, merge the Release PR, the auto-unstick and its manual fallback, the publish chain and its draft release, rc prereleases from dev, the main → dev sync, store submissions, tag rulesets, troubleshooting and the staged-rollout switches. Use when the user asks to cut, unstick, publish, republish or debug a stable or rc release, submit to the Chrome or Firefox store, or runs /release.
---

# Release runbook

Two flows: **stable** (from `main`, tagged `vX.Y.Z`) and **prerelease** (from `dev`, tagged `vX.Y.Z-rc.N`). Both share the same v4 abort bug + manual unstick pattern.

Human `chore: bump extension to X.Y.Z` commits remain **deprecated**. Config files: `.github/release-please-config.json` + `.release-please-manifest.json` (stable), `.github/release-please-prerelease-config.json` + `.release-please-prerelease-manifest.json` (prerelease), `CHANGELOG.md`. Workflows: `.github/workflows/release.yml` (stable + publish chain), `.github/workflows/release-prerelease.yml` (rc PR opener).

> **This runbook is the source of truth for the release process. Update it when the process changes** — a new failure mode, a changed step, a flipped switch. CLAUDE.md's § Release runbook and its skill-routing table point here. Worked examples: `implementations-plan/archive/{release-prerelease-fix,required-check-mismatch,stable-release,release-pipeline-hardening}/`.

## Start here — what a release is, and what you actually do

A **stable release** turns the current `main` into a published `vX.Y.Z`: a GitHub Release with the built Chrome + Firefox zips + `SHASUMS256.txt`, and a `main → dev` back-sync PR opened. Most of it is automated by [`release.yml`](../../../.github/workflows/release.yml); this table is the **current** division of labor (it shifts as the [staged rollout](#staged-rollout-switches) proceeds):

| What | Who | Current state |
|---|---|---|
| Open the Release PR (version bump + `CHANGELOG`) | release-please | ✅ automatic |
| Write the Release PR's version into `bun.lock`, which release-please cannot edit | `release-pr-lockfile` (advisory; the prerelease PR too) | ✅ automatic |
| **Tag the merge commit after you merge the Release PR** (the "unstick") | `auto-unstick` job **unless `AUTO_UNSTICK_ENABLED=off`**, else **you** | ✅ automatic (on by default, and the var is `on`); with the var `off` (the kill switch) you do the 45s manual unstick |
| Gates → build chrome+firefox → smoke → publish the GitHub Release (a draft, filled, checked and attested before it is published) | publish chain | ✅ automatic |
| Update the landing (`nulo.sh`) | nobody | ✅ nothing to do: it links the store listings, never a release |
| Open the `main → dev` back-sync PR (+ prerelease-manifest re-baseline) | `sync-main-to-dev` | ✅ automatic (it gates on `push` + `attach-assets` success; if you fall back to the manual `workflow_dispatch` unstick, that path is neither → open the sync manually, see § After a stable cut). You review + **merge-commit** it, NOT squash — see step 5. |

**The happy path (stable), end to end:**

1. **Promote `dev → main`** — open a `release: promote dev → main (…)` PR, merge it (merge-commit, per `main`'s ruleset).
2. **Merge the Release PR** — release-please opens `chore(main): release X.Y.Z` within ~1 min; review the `CHANGELOG.md` diff, merge it via the UI (merge-commit).
3. **Unstick** — that merge re-triggers `release.yml`, which **aborts** on the [v4 bug](#why-the-manual-unstick-is-required-the-v4-bug):
   - **auto-unstick on (the default and the current state)** → the `auto-unstick` job tags + publishes automatically; nothing to do, skip to 4.
   - **`AUTO_UNSTICK_ENABLED=off` (the kill-switch fallback, not the current state)** → run the **[manual unstick](#stable-release-from-main)** below (§ Stable steps 5–6: a ~45s paste + a `workflow_dispatch` republish).
4. **Wait for the publish chain** (~15–25 min, plus the Firefox smoke of the release build, which `attach-assets` waits on: allow up to its 45-minute limit): gates → build → smoke → `attach-assets`.
5. **Merge-commit the back-sync PR (NOT squash)** — `sync-main-to-dev` opens `chore: sync main → dev`. **Merge it with a merge commit** (`gh pr merge <n> --merge`) so `main`'s release commit stays in `dev`'s ancestry — a squash drops it and breaks the next rc cut (the [prerelease-fix record](../../../implementations-plan/archive/release-prerelease-fix/plan.md) has the detail). `dev`'s ruleset allows `merge` alongside `squash`. The merge carries the bot's manifest-rebaseline commit onto `dev`, but that commit is written via the Contents API under the App token → GitHub-**signed** (verified), so classic `required_signatures` is satisfied with **no `--admin`**. Labeled `needs-manual-resolution`? Resolve the conflict on the sync branch first, then merge-commit.
6. **Verify** — `gh release view v$VERSION --json assets -q '[.assets[].name]'` lists the two zips + `SHASUMS256.txt`.
7. **Publish any fixed advisory** — publish any draft security advisory whose fix shipped in this release, setting its patched version to this release.

> **Near-one-click:** with auto-unstick on, a stable release is **steps 1, 2, 5 and 7 only** (promote → merge Release PR → merge-commit the sync PR → publish any fixed advisory); the unstick + publish are hands-off. The detailed sections below are the reference + the fallback for when automation is off or red — see [§ Troubleshooting](#troubleshooting--when-x-fails).

> **Auto-unstick.** `release.yml` has an `auto-unstick` job that does the 45-second manual unstick (§ steps 5–6 below) automatically: on the post-merge `push:main` where release-please aborted, it detects the merged `autorelease: pending` Release PR whose merge commit is `github.sha`, creates the tag through the API as the release App, relabels the PR, and lets `resolve` continue the publish chain in the SAME run. **It is on unless the repo variable `vars.AUTO_UNSTICK_ENABLED` turns it off**: unset, empty, `on`, `true` or `1` = on; `off`, `false` or `0` = off; any other value = off with a warning in the job log, so a typo meant to disable never enables. **The variable is `on`**, so releases self-unstick. (When it is off the job no-ops, `unstuck=false`, and the manual unstick below is required.) The logic + every guard (idempotent re-tag, fail-closed on a wrong-SHA tag, no-op on a non-Release-PR push) live in unit-tested `scripts/release/auto-unstick*.ts`. **The manual procedure below remains the documented fallback and the source of truth** for what the automation does. To turn it off: `gh variable set AUTO_UNSTICK_ENABLED -b off`; deleting the variable turns it on.

**Prerequisites** (one-time, already done):
- GitHub App `nulo-sh-release` installed on the repo. Its `RELEASE_PLEASE_APP_ID` + `RELEASE_PLEASE_APP_PRIVATE_KEY` are secrets of the `release-app` environment (deployment branches `main` and `dev`; no reviewer, which would hold `auto-unstick` and the sync PR). Only the jobs that mint the App token declare it, and `scripts/ci-cd/release-integrity.test.ts` keeps it so. To rotate the key: generate a new one in the App's settings, paste it over the environment secret, then delete the old key there.
- The `nulo-landing` Worker serves `nulo.sh` (custom domain) and has no deploy hook: Workers Builds' Git connection (set up in the Cloudflare dashboard) builds `main` for production and other branches as previews. No Cloudflare credential exists in GitHub Actions.
  - `apps/landing/wrangler.jsonc` names no `routes` on purpose: wrangler leaves an attached domain alone while `routes` names none, and listing `nulo.sh` there would make every production deploy reconcile it, which needs a zone permission the Workers Builds token does not hold. Attaching or moving the domain is the owner's step in the Cloudflare dashboard; an agent session does not make domain or DNS changes.

## Stable release (from `main`)

Per-release procedure for shipping a stable release. Total time: ~20 min, of which ~45 seconds is manual.

1. **Get the work onto `main`.** Promote `dev → main` via the usual `release: promote dev → main (...)` PR. Merge-commit (per `main`'s ruleset). Before opening it, update the last release in place to a candidate of `dev` on both browsers ([e2e README § In-place update](../../../apps/extension/tests/e2e/README.md#in-place-update-opt-in)): the live scenario and the replay while `dev`'s Aztec line is the release's, the replay alone once it is not, and the arrival scenario when the candidate adds a default the release lacks (the promote that first ships Mainnet). No PR runs them, and a red one holds the promote. Check, too, that the stored-shape baseline is frozen (`apps/extension/src/wallet/storage/stored-shapes/pins.ts` pins every stamp of `snapshot.json`; stamp 0 was re-cut on 2026-10-22 and again on 2026-10-26, and a pin is removed only on the owner's recorded decision, as these were: CLAUDE.md § Persisted-storage shape changes) and that `bun run test` passes on the `dev` tip you promote. After each stable release, pin its zips' digests and its traits beside them (`RELEASE_TRAITS`: plaintext or sealed rows, how its connect prompt opens, whether its passkey profiles are retired or still unlock) and record its storage from Chrome, so the next promote updates from it.
2. **Wait for the Release PR.** The push to `main` triggers `release.yml`. release-please opens a Release PR titled `chore(main): release X.Y.Z` (version chosen automatically from Conventional Commits since the last tag — `feat:` → minor, `fix:` → patch). **While in `0.x`, `bump-minor-pre-major: true` caps a `BREAKING CHANGE:` to a *minor* bump (`0.Y.Z` → `0.(Y+1).0`, never auto-`1.0.0`)** — a `1.0.0` cut is a deliberate manual `Release-As: 1.0.0` footer. Review the auto-generated `CHANGELOG.md` diff in the PR.
3. **Merge the Release PR via the UI** (merge commit).
4. **Wait for the post-merge `release.yml` run.** It will run release-please-action again. **Expected (with `AUTO_UNSTICK_ENABLED` off): it aborts with `⚠ There are untagged, merged release PRs outstanding - aborting` and the downstream gates + publish jobs all skip.** This is the v4 bug.
5. **Manual unstick** (~45 seconds — paste into terminal, from a clone whose checkout carries `scripts/release/tag-by-hand-run.ts`). The tag-creation ruleset refuses a tag from anyone but the release App, so the tag goes through that helper, which opens the ruleset to you for that one push and always closes it (§ Tag rulesets and immutable releases). From 1.0.0 on, a blank left in the Terms or the Privacy Policy refuses the tag, as `auto-unstick` does: it tags only when both files exist and `git grep` finds no blank (exit 1), and `git grep` also exits 1 on a missing path.
   ```bash
   PR_NUM=<the Release PR number>
   VERSION=<the Release PR's X.Y.Z>
   MERGE_COMMIT=$(gh pr view "$PR_NUM" --json mergeCommit -q '.mergeCommit.oid')
   git fetch origin main
   CHECK=1; TERMS="${MERGE_COMMIT}:legal/terms.md" PRIVACY="${MERGE_COMMIT}:legal/privacy.md"
   case "$VERSION" in (0.*) ;; (*) CHECK=0; git cat-file -e "$TERMS" && git cat-file -e "$PRIVACY" && git grep -n "«FILL" "$MERGE_COMMIT" -- legal/terms.md legal/privacy.md || CHECK=$? ;; esac
   if [ "$CHECK" -eq 1 ]; then
     bun scripts/release/tag-by-hand-run.ts "$VERSION" "$MERGE_COMMIT" &&
     gh pr edit "$PR_NUM" --add-label "autorelease: tagged" --remove-label "autorelease: pending"
   else echo "refused: blanks remain (listed above) or the check failed (exit $CHECK)"; fi
   ```
   A refusal is the troubleshooting row "`auto-unstick` red: would launch with blanks". A tag pushed any other way skips this check and `auto-unstick`'s; the tag-creation ruleset leaves that to whoever opens it.
   **Never create the GitHub Release by hand.** `attach-assets` creates it as a draft and publishes it only once its assets check out; a release published by hand without them can never gain them once immutable releases is on.
6. **Trigger the publish chain via `workflow_dispatch`, from the tag:**
   ```bash
   gh workflow run release.yml --ref "v$VERSION" \
     -f tag="v$VERSION" -f dry_run=false \
     -f run_network_e2e=true
   ```
   `--ref "v$VERSION"` makes the run's commit the tagged one, which the attestation records as its source; a dispatch from any other ref refuses to publish an unpublished release. Never dispatch with a tag from before this flow as `--ref`: its old workflow replaces assets. After a tag exists, finish or re-run its publish before merging anything else to `main`, because release-please builds the next Release PR from that tag.
   **The store submission** is its own dispatch from `main` once the release is published: `gh workflow run release.yml --ref main -f tag="v$VERSION" -f dry_run=false -f publish_chrome=true` (and/or `-f publish_firefox=true`). That run re-runs the gates but never uploads to the release and never rebuilds it: `select-assets` downloads the published assets and checks each against its digest, its attestation and `SHASUMS256.txt`, both builds skip, both smokes run the unpacked trees of those zips, and `attach-assets` checks the same bytes against the release once more before the store jobs get them. A `dry_run=true` dispatch does the same short of the uploads, so it rehearses the submission. A release published before this flow carries no attestation, so the run refuses it: submit such a version by hand in the store dashboard, or cut a new release. Each publish job runs in its protected environment (`chrome-web-store` keyless via OIDC; `firefox-add-ons` with the `AMO_JWT_ISSUER`/`AMO_JWT_SECRET` secrets), only for a stable tag on `main`, and needs the reviewer's approval; `gh workflow run store-check.yml --ref main -f store=chrome|firefox|both` proves a credential without uploading. The Firefox job packages `git archive` of the release commit as the reviewers' source and attaches it to the version it creates — **if it fails after "version ok" do NOT re-run** (the upload is consumed and AMO never frees a version number): attach the same archive by hand in the Developer Hub, or re-send only the source `PATCH`; the failure message carries the procedure. The tag dispatch above runs `lint+typecheck → unit-tests → build chrome+firefox → smoke-against-artifact + smoke-firefox-against-artifact → release-notes → attach-assets` (zips + SHASUMS, then a draft filled, read back, attested, given the git-cliff notes, published and read back again). ~15-25 min. **network-e2e is OPT-IN** (`run_network_e2e=true`) and does not run on the auto push:main publish either — the promote dev→main PR already gates the exact code with the full required network suite before it reaches main, so re-running it on the publish would be pure duplication AND a strand risk (a network-e2e cancel/timeout on push:main takes the whole run down before the publish, leaving a tag with no release). The publish still gates on `smoke-against-artifact` and `smoke-firefox-against-artifact` (on the tag dispatch, the built trees the zips are made from; on a store submission, the published zips' own trees). This does NOT touch the required `extension-network-e2e-status` PR gate — that's produced by the standalone `Extension network e2e` workflow on PRs.
7. **Verify**: `gh release view v$VERSION --json assets -q '[.assets[] | .name]'` should list `nulo-chrome-X.Y.Z.zip`, `nulo-firefox-X.Y.Z.zip`, `SHASUMS256.txt`.
   Once a store publish goes live: `gh workflow run verify-store-copies.yml -f store=chrome|firefox|both` compares the store's public copy with the release zip it names (it also runs weekly).
8. **Publish any fixed advisory**: publish any draft security advisory whose fix shipped in this release, setting its patched version to this release.

## Prerelease (rc) from `dev`

Per-rc procedure. Same v4 bug as stable; same ~45 second unstick. Network-e2e is OFF by default for prereleases — opt in if you want to gate this rc on it.

1. **Land features on dev as usual** via the standard feat:/fix: PR flow.
2. **Cut the rc manually:**
   ```bash
   gh workflow run release-prerelease.yml --ref dev
   ```
   No auto-fire on push:dev — rc cuts are explicit decisions. Within ~30 sec, release-please opens a Prerelease PR titled `chore(dev): release X.Y.Z-rc.N`.
   - First rc of a new minor: `vX.Y.0-rc.0`.
   - Second cut, same minor: `vX.Y.0-rc.1`. Third: `vX.Y.0-rc.2`. Counter auto-increments per release-please's prerelease versioning strategy.
3. **Review + merge the Prerelease PR via the UI** (squash, per `dev`'s ruleset).
4. **Nothing runs on the merge.** `release-prerelease.yml` is dispatch-only and has no publish chain, and until the rc is tagged its next dispatch aborts on the same v4 bug — so the unstick + publish steps below are manual.
5. **Manual unstick** (~45 seconds — paste into terminal, from a clone whose checkout carries `scripts/release/tag-by-hand-run.ts`). Nothing tags an rc for you, and the tag-creation ruleset refuses a tag from anyone but the release App, so the tag goes through that helper (§ Tag rulesets and immutable releases); the relabel runs only once it pushed the tag.
   ```bash
   PR_NUM=<the Prerelease PR number>
   VERSION=<the Prerelease PR's version, e.g. X.Y.0-rc.0 or X.Y.0-rc.1>
   MERGE_COMMIT=$(gh pr view "$PR_NUM" --json mergeCommit -q '.mergeCommit.oid')
   git fetch origin dev
   bun scripts/release/tag-by-hand-run.ts "$VERSION" "$MERGE_COMMIT" &&
   gh pr edit "$PR_NUM" --add-label "autorelease: tagged" --remove-label "autorelease: pending"
   ```
   No `gh release create`: `attach-assets` creates the release, as a prerelease (the `-` in the version), so it never shows as Latest.
6. **Trigger the publish chain via the STABLE workflow's escape hatch, from the tag:**
   ```bash
   gh workflow run release.yml --ref "v$VERSION" \
     -f tag="v$VERSION" -f dry_run=false
   # Never -f publish_chrome/publish_firefox here: the store jobs refuse prereleases.
   # Add -f run_network_e2e=true if you want to gate this rc on the
   # network e2e suite, sharded as on a PR. Off by default for prereleases.
   ```
   - **Use `--ref "v$VERSION"`, the tag itself.** `--ref` picks BOTH the `release.yml` definition AND the reusable workflows it calls (`_build-extension.yml` etc., resolved at the caller's ref). Those must match the **layout of the tag's code** (a directory move on `dev` but not yet on `main` once made a dev-cut tag built via `--ref main` fail with `ENOENT: Could not change directory to …`), and the run's commit must be the tagged one, which the attestation names. The tag's own ref satisfies both.
   - Pass the prerelease tag explicitly; the workflow's `resolve` job verifies the tag exists and detects `is_prerelease=true` from the `-` in the version string.
7. **Verify:**
   ```bash
   gh release view "v$VERSION" --json isPrerelease,assets \
     -q '{prerelease:.isPrerelease, assets:[.assets[].name]}'
   ```
   Expected: `prerelease=true`, three assets.

## After a stable cut promotes to `main`

The prerelease manifest (`.release-please-prerelease-manifest.json`) tracks the rc series independently and must be re-baselined to the new stable version. Otherwise the next rc series starts from a stale base + release-please can reopen old Release PRs on the drift ([release-please#2172](https://github.com/googleapis/release-please/issues/2172)).

> **Automated (`sync-main-to-dev` job).** `release.yml` opens this PR for you. On the `push:main` that published a stable release, the `sync-main-to-dev` job branches from `origin/main`, writes the prerelease-manifest re-baseline, and opens ONE `chore: sync main → dev` PR (App-token-opened so dev's CI fires) that **combines both steps below**. It never local-merges: it lets GitHub compute mergeability — a clean PR is left for you to **merge-commit** (NOT squash — the merge keeps `main`'s release commit in `dev`'s ancestry, which the prerelease anchor needs); a CONFLICTING/UNKNOWN one is labeled `needs-manual-resolution` + commented (surfaced, never silent). It's **push-only** (a `workflow_dispatch` republish of an old tag never re-syncs) and **advisory** (post-publish — a sync hiccup reds only its own job, never the shipped release). The logic lives in unit-tested `scripts/release/open-sync-pr*.ts`. **You still review + merge-commit the PR** (`--merge`, NOT squash — the bot's manifest commit is written via the Contents API under the App token, so it's GitHub-signed and satisfies `required_signatures` with no `--admin`); the steps below are the manual fallback (and what the job automates) if it's ever red or disabled.

**Manual two-step procedure (order matters) — the fallback the job automates:**

1. **First, merge `main` back into `dev`** via the usual flow so `dev`'s `package.json` + `CHANGELOG.md` reflect the new stable version. (Without this, release-please sees a manifest/source drift on dev and can reopen merged PRs.)
2. **Then, open a small PR to `dev`** updating `.release-please-prerelease-manifest.json` to match (e.g. `{ ".": "X.Y.Z" }`). Merge it.
3. Next `gh workflow run release-prerelease.yml` will cut the next rc series from the correct base.

## Why the manual unstick is required (the v4 bug)

`release-please-action@v4` runs both "open Release PR" and "tag + publish merged Release PR" phases. The publish phase looks for a previously-created GitHub Release that matches the merged PR's manifest entry — when no such release exists yet (because the publish phase is supposed to be the one creating it), it logs `⚠ Expected 1 releases, only found 0` and bails with the "outstanding" error instead of creating the release itself. Both the original action issue ([googleapis/release-please-action#1205](https://github.com/googleapis/release-please-action/issues/1205)) and the upstream tool issue ([release-please#2712](https://github.com/googleapis/release-please/issues/2712)) are open with no fix.

**All versions are affected** (verified by source-level inspection):
- `release-please-action@v3.7.13` (bundles release-please 15.13.0): same abort logic in `base.ts` + `manifest.ts`. Also 18 months unmaintained.
- `release-please-action@v4` (bundles release-please 17.3.0): hits the bug.
- `release-please-action@v5.0.0` (bundles release-please 17.6.0): current. Node 24 runtime bump + minor unrelated fixes. Same abort path. Active issues confirm the deadlock on v5.

Downgrading to v3 also requires renaming our `target-branch:` input back to `default-branch:` — not worth the churn for no actual fix.

Both workflows now run release-please with `skip-github-release: true`, so it never reaches that publish phase: it only maintains Release PRs, and it will not open the next one while a merged Release PR is still labelled `autorelease: pending`. The unstick (tag + `autorelease: tagged` label) clears that, and the publish chain creates the GitHub Release itself. The follow-up `workflow_dispatch` then exercises the publish chain end-to-end via our `always() && needs.X.result == 'success'` guards (which require the explicit tag input to bypass `release-please` entirely).

**Things that DO work without manual intervention:**
- release-please opens correctly-titled Release PRs (the `group-pull-request-title-pattern` in [`release-please-config.json`](../../../.github/release-please-config.json) sets the title).
- The Release PR's CI runs normally (App-token triggers the PR-quick workflow → `quality-status`).
- The Release PR's commits are bot-verified (App-authenticated → satisfies `main`'s signed-commits rule).
- The `workflow_dispatch` publish chain runs all gates + builds + smoke + attach-assets end-to-end.

## Tag rulesets and immutable releases

- **Applied: `release tags: no deletion or update`** — a tag ruleset on `refs/tags/v*` with the rules `deletion`, `non_fast_forward` and `update` and no bypass actor, id `24737631`. Nothing in the workflows moves a `v*` tag, and only `nightly.yml`'s `prune-nightlies` deletes one: a nightly tag, which the exclusion below leaves out of the ruleset. To repair one bad tag: `gh api -X PUT repos/nulo-sh/nulo/rulesets/24737631 -f enforcement=disabled`, fix that one tag, run the same call with `enforcement=active`, then read it back with `gh api repos/nulo-sh/nulo/rulesets/24737631 --jq '{enforcement, rules: [.rules[].type]}'`. While it is disabled every `v*` tag is unprotected, so keep the repair to that one sequence. Undo: `gh api -X DELETE repos/nulo-sh/nulo/rulesets/24737631`.
- **Applied by the owner on 2026-10-13: nightly tags out of `24737631`.** `prune-nightlies` keeps the newest fourteen nightly tags and releases and deletes the older ones, each release before its tag, so `refs/tags/v*-nightly.*` is excluded: `gh api -X PUT repos/nulo-sh/nulo/rulesets/24737631 --input - <<<'{"conditions":{"ref_name":{"include":["refs/tags/v*"],"exclude":["refs/tags/v*-nightly.*"]}}}'`, read back with `gh api repos/nulo-sh/nulo/rulesets/24737631 --jq '.conditions.ref_name'`. Stable and rc tags never match the exclusion. A nightly tag is now movable as well as deletable by any `contents: write` token. Removing the exclusion makes the next prune past fourteen delete the oldest release, be refused its tag, and red each published night until it is restored.
- **Applied on 2026-10-19, the owner's call: `release tags: creation by the release app only`** — a tag ruleset on `refs/tags/v*`, nightly tags excluded (`refs/tags/v*-nightly.*`), with the rule `creation` and one bypass actor, the release App (`5179103`, `Integration`, `always`), id `25437716`. Only `auto-unstick`'s App token creates a stable tag; nothing creates an rc tag, and the owner holds no standing bypass. Read back with `gh api repos/nulo-sh/nulo/rulesets/25437716 --jq '{enforcement, include: .conditions.ref_name.include, exclude: .conditions.ref_name.exclude, rules: [.rules[].type], bypass_actors}'`. Undo: `gh api -X DELETE repos/nulo-sh/nulo/rulesets/25437716`.
  **A tag by hand** (either manual unstick, or a repaired commit) goes through `bun scripts/release/tag-by-hand-run.ts <X.Y.Z or X.Y.Z-rc.N> <40-hex commit>`. It refuses before changing anything (exit 1) unless the version is stable or rc, the commit is in your clone, origin lacks the tag and the ruleset reads back exactly as applied. It then adds you as a second bypass actor, runs `git tag -a` and `git push`, puts the App back alone and reads it back. That close runs after a refused push, a failed or timed-out step, Ctrl-C and SIGTERM; a SIGKILL, a lost machine or an unreachable GitHub can leave you admitted, so read the ruleset back after any run that did not exit 0, 1 or 2. Origin decides the outcome, not the push's own status: 0, origin's tag names the commit; 2, origin has no such tag; 4, it could not tell, and the local tag stays for the check the log prints (relabel only once that check shows the commit). Exit 3: the ruleset did not read back closed, and the log prints `gh api -X PUT repos/nulo-sh/nulo/rulesets/25437716 --input - <<<'{"bypass_actors":[{"actor_id":5179103,"actor_type":"Integration","bypass_mode":"always"}]}'`, which closes it: run that, then the readback above.
  The next stable release is the first `auto-unstick` run under the rule. If it reds on a refused tag, tag by hand and file the run.
- **Applied on 2026-10-29, the owner's call: immutable releases** (`gh api -X PUT repos/nulo-sh/nulo/immutable-releases`; read back with `gh api repos/nulo-sh/nulo/immutable-releases`, which returns `{"enabled":true,"enforced_by_owner":false}`). From here a published release's assets and tag never change, and every release published from now on carries a GitHub release attestation; releases up to v1.1.0 carry none. The prune keeps working: a deleted nightly's tag is never reissued, and `nightly.yml` already takes each new nightly code above every one that exists. Live proof at the next stable release: `gh release view vX.Y.Z --json isImmutable,assets` shows `true` and three assets, `gh release verify vX.Y.Z --repo nulo-sh/nulo` passes, and the notes' `gh attestation verify` passes for both zips. Undo, partial: `gh api -X DELETE repos/nulo-sh/nulo/immutable-releases`; every release published while it was on stays immutable and its tag name can never be reused.

## Troubleshooting — when X fails

| Symptom | Likely cause | Fix |
|---|---|---|
| Post-merge `release.yml` skipped everything; no tag, no assets | v4 abort while `AUTO_UNSTICK_ENABLED` is `off`, or a value the job does not recognise (its log warns) — someone turned it off | Run the [manual unstick](#stable-release-from-main) (§ Stable 5–6), then re-enable: `gh variable set AUTO_UNSTICK_ENABLED -b on`. |
| `auto-unstick` job **red** with "refusing to re-point" | a `vX.Y.Z` tag already exists at a DIFFERENT commit | Fail-closed by design — it won't move a tag. Investigate the tag/commit mismatch. The `release tags: no deletion or update` ruleset refuses deleting or moving a `v*` tag, so fixing it follows the ruleset's repair (§ Tag rulesets and immutable releases); then dispatch with `--ref vX.Y.Z`. |
| `auto-unstick` ran, `unstuck=false`, chain still skipped | flag off (no-op by design), OR HEAD isn't a merged `autorelease: pending` Release PR | If you expected it on: confirm `vars.AUTO_UNSTICK_ENABLED` is unset or `on` (the job log warns on an unrecognised value) AND the Release PR actually merged at `github.sha`. |
| `auto-unstick` **red**: "would launch with blanks in its legal documents" | a stable 1.0.0 or later merged while `legal/terms.md` or `legal/privacy.md` held a `«FILL` (the Release PR merged with `--admin`, past a red or skipped `launch-legal`) | No tag exists and the Release PR stays `autorelease: pending`. Land the filled documents on `main` (a promote, or a PR into `main` from a branch cut from `main`: the owner's call). Before tagging, check that the repair's merge commit still carries the refused version in the root and `apps/extension` `package.json`, `bun.lock` and `.release-please-manifest.json`, holds no `«FILL` (`git grep -n "«FILL" <sha> -- legal/terms.md legal/privacy.md` prints nothing) and that `git ls-remote --tags origin "v$VERSION"` prints nothing. Then run the [manual unstick](#stable-release-from-main) with that commit as `MERGE_COMMIT` and the original Release PR as `PR_NUM`, and dispatch the publish from the tag (§ Stable 6). |
| `auto-unstick` **red** after it created the tag (the relabel failed, say) | a step after the tag write failed | Re-run the failed jobs: the re-run finds the tag at the merge commit, fixes the label and continues the publish. |
| `publish-firefox-amo` red after `version ok:` | the source `PATCH` failed or timed out after AMO created the version | **Never re-run** (AMO refuses a duplicate version number and deleting a version never frees it). Open the version in the Developer Hub → attach `git archive --format=zip --prefix=nulo-X.Y.Z/ vX.Y.Z` as its source, or re-send only the source `PATCH`. A red `check` in `store-check.yml` (`wallet@nulo.sh` not listed) means the key pair belongs to another Mozilla account: regenerate it in the Developer Hub under the owning account and replace both secrets. |
| `publish-firefox-amo` red with `create version: HTTP 400` | AMO validated the version request and created nothing, e.g. reviewer notes over its 3,000-character cap, which `reviewerNotes` refuses before the upload | Nothing to recover: no version exists. The job checks out the tag's commit, so a cause in that commit's files, like `listing.md`'s notes, fails the same way on a re-run: submit the release's zip by hand in the Developer Hub with the same `git archive` source and fixed notes, or ship the fix in the next release. Re-run only once a cause outside the tag is fixed. |
| Every Chrome dashboard field is locked | an approved, staged submission holds the draft | Publishing it unlocks the draft; it goes live, so it is the owner's call. The store run's preflight then reads `published PUBLISHED, submitted none`. |
| `publish-chrome-store` red: "a staged revision holds the item" | an earlier version was approved and staged (`STAGED_PUBLISH`) but never published, and the store refuses any upload while it waits | Publish or cancel the staged revision in the dashboard (publishing makes it live: the owner's call), then re-run only the Chrome job. The preflight refuses before uploading, so nothing was sent. |
| `release-pr-lockfile` red | its `bun.lock` edit failed (the branch kept moving through three attempts, or a lockfile layout `lock-version.ts` refuses) | Nothing is held: the job is advisory and CI's frozen install accepts the stale workspace version. The next release-please update re-runs it; or run `bun install` on the Release PR's branch and push the one-line `bun.lock` change. |
| A tag with no published release (a draft, or none) | `attach-assets` failed or was cancelled after the tag existed | Re-run the failed jobs, or `gh workflow run release.yml --ref vX.Y.Z -f tag=vX.Y.Z -f dry_run=false`: the publish path finishes the draft. Do it before merging anything else to `main`. |
| `attach-assets` red: "dispatch with --ref vX.Y.Z" | a dispatch from `main` (or any ref but the tag) for a release not yet published | Dispatch again with `--ref vX.Y.Z`: the attestation must name the tagged commit. |
| `attach-assets` red: "not attested by this workflow" | a store submission or republish of a release published before this flow | No workflow path ships it: upload that version by hand in the store dashboard, or cut a new release. |
| `select-assets` red (builds, smokes and `attach-assets` skipped) | a dispatch found the release ambiguous (two releases name the tag), published without an asset, unattested, or holding bytes off their digest, attestation or `SHASUMS256.txt` | Read its `::error::` line. Ambiguous: delete the extra drafts and dispatch again. Missing an asset: an immutable release is burned (cut a new release); a mutable one is deleted (keep the tag) and dispatched again with `--ref vX.Y.Z`, as the error says, which publishes and attests it anew. Unattested: no workflow path ships it (upload by hand in the store dashboard, or cut a new release). Bytes off their digest or attestation: treat as a compromise of the release until explained; never re-run it into a pass. |
| `attach-assets` red: "no longer published" or a held asset that "does not match" on a dispatch | the release was deleted, turned back into a draft or had an asset replaced after `select-assets` checked it, or a release was published by hand while this run built | Find who changed the release first. Then dispatch again: the new run selects from the release as it now stands. |
| `verify-store-copies` red | a store serves a copy that differs from its release zip beyond that store's own additions, serves none, serves a version with no release, or the release side failed its digest, `SHASUMS256.txt` or attestation check | Read the job's `::error::` lines. A difference in what a store serves is a possible compromise of the store account or its pipeline: compare the copy by hand and treat it as one until explained. A transient store or GitHub outage: re-run. |
| `attach-assets` red: "published and immutable without …" | an immutable release lacks an asset | The version is burned: cut a new release. |
| `attach-assets` red: "changed while it was published" | another holder of `contents: write` changed the release or its tag between the check and the publish | Find who wrote it before anything else; the release records what it holds. Treat it as a compromise until explained. |
| `attach-assets` skipped, `smoke-firefox-against-artifact` red | the Firefox smoke of the release build failed, and it gates the assets | A genuine flake: re-run the failed jobs, or dispatch with `--ref vX.Y.Z`. Real breakage: fix forward and release again; never take the smoke out of `needs` to ship this one. |
| `sync-main-to-dev` PR labeled `needs-manual-resolution` | `dev` diverged from `main` since the release | Resolve the conflict on the sync branch (usually `CHANGELOG.md` / `bun.lock`), then **merge-commit** it (`--merge`, NOT squash — preserves release-commit ancestry on `dev`; the bot's manifest commit is App-signed so no `--admin`). |
| No `sync-main-to-dev` PR appeared | push-only + stable-only; a `workflow_dispatch` republish never syncs | Expected on a republish. For a genuine cut, check the job ran on the `push:main` and read its log. |
| A job that mints the App token fails before its first step: "… is not allowed to deploy to release-app due to environment protection rules" | the run is not on `main` or `dev`: an rc cut dispatched from a tag or another branch, say | Dispatch from `dev`: `gh workflow run release-prerelease.yml --ref dev`. |
| A job's App-token mint step fails on a missing app id or private key | the key is not in the `release-app` environment, or a caller of `_release-pr-lockfile.yml` stopped passing `secrets: inherit` (a secret the caller does not pass resolves empty, with no error) | The owner adds the key to the environment; `release-integrity.test.ts` refuses the second. |
| A rerun fails at its App-token mint step though `release-app` holds the key | the run's workflow revision predates `release-app`: its jobs do not declare it, and a rerun keeps that revision | Do not rerun it: dispatch afresh, or use the manual unstick (§ Stable release 5–6). |
| release-please reopened an OLD Release PR | prerelease-manifest drift after a stable cut | Re-baseline `.release-please-prerelease-manifest.json` to the new stable version — the `sync-main-to-dev` PR does this; just merge it. |

## Staged-rollout switches

Several pieces ship **guarded** and get promoted only after they're proven on real runs. Flip them deliberately, one at a time — the rule is *ship inert/advisory, observe one real release, then promote*:

| Switch | What it gates | Default | Flip when | How |
|---|---|---|---|---|
| `vars.AUTO_UNSTICK_ENABLED` | the `auto-unstick` job acting vs no-op | **on** in code (unset = on); var **on** | flipped | kill switch: `gh variable set AUTO_UNSTICK_ENABLED -b off` (back: `-b on`, or delete the var) |
| `smoke-firefox-against-artifact` ∈ `attach-assets.needs` | whether a red Firefox smoke blocks the release's assets | **gating** (in `attach-assets.needs` and `status`) | flipped | back: remove it from `attach-assets`' `needs` and `if:`, and from `status`'s `needs`, `env:` and checks; update the pins in `behavior-gating.test.ts` and `aggregators.test.ts` in the same commit |
| `nightly.yml`'s Firefox and chaos jobs ∈ `publish-nightly.needs` | whether a red Firefox suite, Firefox smoke or chaos run withholds the nightly | **gating** (in `publish-nightly`'s `needs` and `if:` and `status`) | flipped | back: remove them from `publish-nightly`'s `needs` and `if:` and from `status`'s `needs` and loop, and name them advisory in `aggregators.test.ts`, in the same commit |
| `network-e2e-canary-wasm` ∈ `publish-nightly.needs` | whether a red run of the canary files on the in-browser prover withholds the nightly | **advisory** (no job needs it) | after 30 consecutive green nights of that job — owner's call | add it to `publish-nightly`'s `needs` and `if:` and to `status`'s `needs` and loop, and drop it from `NIGHTLY_ADVISORY` in `aggregators.test.ts`, in the same commit |
| `extension-smoke-e2e-firefox-status` required | whether a red Firefox smoke blocks a merge | **required on `dev` and `main`** | flipped on both | the protection runbook (`scripts/ci-cd/required-checks.sh`), per branch — owner's call |
| `extension-network-e2e-firefox-status` required | whether a red Firefox network suite blocks a merge | **required on `dev` and `main`** | flipped on both (`main` by the owner's call, 2026-10-23) | same runbook — owner's call |

The manual procedures above remain the permanent fallback regardless of switch state.
