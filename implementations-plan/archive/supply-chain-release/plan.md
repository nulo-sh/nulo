---
plan: supply-chain-release
tier: mid
status: completed (#50, #54, #57, #62); S2 and S3 pending for the owner
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 sonnet explorers; dual audit (codex gpt-6.1-sol high + opus Plan); final fresh codex pass
issues: "#21, #12, #22, #20, plus six release and tooling follow-ups"
base: origin/dev 90f4fb3 (arc 1 rebased onto e49e4ce)
---

## Outcome

- **Date**: 2026-10-08
- **Status**: completed. S2 and S3 are pending by design: they need arc 1 on `main` and a release on the new flow, which come after this lane.
- **Shipped**: four PRs into `dev`.
  - [#50](https://github.com/nulo-sh/nulo/pull/50), release integrity: build-provenance attestations on every release and nightly asset; `attach-assets` creates the release as a draft, fills it, reads every digest back and only then publishes; `auto-unstick` is the only workflow tag creator (App token, over REST) and release-please never publishes; each App token is minted with a pinned permission set; the jobs that publish, attest or tag run no dependency install.
  - [#54](https://github.com/nulo-sh/nulo/pull/54): the Aztec toolchain install takes Foundry from a SHA-256-pinned tarball and the CLI's npm tree from a committed lockfile with scripts off (#12); the content script is built as one import-free file, so neither manifest lists a web-accessible resource (#22).
  - [#57](https://github.com/nulo-sh/nulo/pull/57): `scripts/` is linted and typechecked, the Chrome preflight refuses a `STAGED` revision, auto-unstick is on by default, the home-path guard runs in CI, commit subjects must be lower-case.
  - [#62](https://github.com/nulo-sh/nulo/pull/62): the audit backlog went from 72 advisories to 41, none in either zip; a pull request whose dependency diff is more than version lines fails on any advisory `scripts/ci-cd/audit-acks.json` does not acknowledge (#20).
- **Repository settings**: S1 applied, ruleset id `24737631`. S2 and S3 not applied; their calls, readbacks and undo stay in § Repository settings.
- **Dropped**: nothing in the approved scope. #22's `use_dynamic_url` route did not hold on Chrome 152 (I6); the import-free content script closed it instead. The store-match check, a signed `SHASUMS256.txt` and the Docker runner's Node and Bun bootstrap were outside the plan's bar.
- **Open items**: moved to [follow-ups](../../follow-ups.md): S2 and S3 with the runbook's transition note, the live proofs on the next releases, nightly retention, the store-match check, the Docker runner's bootstrap, and CodeQL alert 23 (alert 1, which the owner dismissed as a false positive, re-raised when #50 moved its line); the existing vitest entry now names the two advisories its bump clears. #21 stays open until S3 is read back.
- **Lessons**: the caret-floor gotcha (a raised range locks the newest version the age gate allows) went to SECURITY.md's pm review workflow, the doc that owns bumps. `lessons.md` gained no line: it sits at 8178 of 8192 bytes and nothing in it is superseded. The rest stay in `lessons/phase-*.md`.
- **Seeds retired**: the `/goal` and `/loop` in § Seeds are retired. Do not run them.

# Supply chain and release integrity

CI, workflow and release integrity for the Nulo wallet, in four stacked arcs: what a published release proves and who may change it (#21 and the attestation follow-up), what the CI toolchain downloads and what the content script exposes (#12, #22), the release and tooling guards from the follow-ups, and the audit backlog (#20). Read [recon.md](recon.md) first: it holds the release graph, the live repository settings, and the probes this plan rests on, including the facts added after the audits.

**UI impact: none.** No extension screen, popup or copy changes. The release-notes template (`cliff.toml`) gains a verify command on GitHub Release pages; its exact text is under Arc 1 and is approved with this plan (Ask A7).

## Issues and claims that did not hold

| Issue | Arc | What the tree says |
|---|---|---|
| #21 tag ruleset, immutable releases, unscoped App tokens | 1 | Holds. Line refs drifted: the mints are `release.yml:75-80` and `:475-480`, and a third unscoped mint sits in `release-prerelease.yml:39-44`. |
| follow-up "Attest the release zips" | 1 | Holds. Nightly zips are unattested too and share the notes template, so Arc 1 attests them as well. |
| lane brief: "the release workflow and the manual unstick both create tags" | 1 | **Does not hold.** The workflow's tag creator is `auto-unstick`, which pushes with `GITHUB_TOKEN` as `github-actions[bot]`, not the App. release-please would create one with the App but aborts on its bug, and it could still publish a release if a bump fixed the bug. Arc 1 makes `auto-unstick` (on an App token) the only workflow tag creator and turns release-please's publishing off. Nightly creates `v*-nightly.*` tags with `GITHUB_TOKEN`. |
| lane brief: apply the ruleset and immutable releases "after the workflow PR is ready" | 1 | **Unsafe for two of the three settings.** A push to `main` runs `main`'s `release.yml`. Until Arc 1 is on `main`, the creation rule refuses the old `GITHUB_TOKEN` tag push, and immutable releases lock the empty release that the old flow publishes before its assets exist, which burns the version for good. Only the no-delete/no-move ruleset is safe once the PR is ready. See § Repository settings. |
| lane brief: three arcs | 1-4 | Arc 3 as briefed mixes a 38-file reformat, a production `vue` bump and a new blocking gate. Both audits asked for a split, so #20 is its own arc (Ask A8). |
| #12 Foundry and npm chains unpinned | 2 | Holds. `docker-ci-like.sh` also uses a different, unpinned host (`install.aztec.network`). |
| #22 web-accessible content-script chunks | 2 | Holds (`@crxjs/vite-plugin@2.7.1` hard-codes `use_dynamic_url: false`). The brief's "prove with the smoke suite" cannot work alone: **no smoke spec loads the content script**, so the proof is one network discovery spec on both browsers plus a new smoke assertion on the built manifest. crxjs's own `standaloneFiles` option fails the third-party-notices policy, so it is not the fix (recon). Closed in Phase 5 by step 1, reached by building the content script as one file. |
| #20 audit backlog | 4 | Holds: 72 advisories, 35 high, 30 moderate, 7 low, 21 packages on 2026-10-08. `bun audit fix` can clear 31; 41 cannot move (Aztec-pinned chains, miniflare, vue, vitest, and two with no fix). |
| follow-ups: Chrome `STAGED`, auto-unstick default, home-path guard in CI, lint + typecheck of `scripts/`, commitlint `subject-case` | 3 | All hold as written in `implementations-plan/follow-ups.md`. |

## Outcome & Quality Bar

**For whom.**
- A user who downloads a zip from a GitHub Release and wants to know that this repository's release workflow built it, from which commit.
- The owner, who cuts releases through the runbook in CLAUDE.md and must never find a release path blocked or a version burned by a setting.
- A maintainer who bumps the Aztec line and must re-pin every download in one pass.
- A Chrome user browsing any site, who must not be identifiable as a Nulo user from a web page.

**What excellent looks like.**
1. Every release asset published once Arc 1 is on `main` carries a build-provenance attestation that names this repository, the workflow file and the exact commit the tag names. The workflow reads each uploaded asset's digest back and refuses to publish on any difference. The jobs that publish, attest or create tags run no dependency install and no third-party action except `oven-sh/setup-bun`, from the workflow's own revision.
2. No path in the runbook breaks: auto-unstick, the manual unstick, the `workflow_dispatch` publish and the store submission, rc cuts and nightlies all work with the tag rulesets and immutable releases on. A store submission ships the published, attested bytes, never a rebuild. A test pins every App token's permission set, so a widened App cannot silently widen a token.
3. The Aztec toolchain install runs no network-fetched code it did not hash first: Foundry comes from a SHA-256-pinned tarball, the CLI's npm tree from a committed lockfile with `--ignore-scripts`, and the local Docker runner uses the same script. (Node, Bun and the browsers that CI downloads stay outside this claim.)
4. A pull request that changes dependencies cannot merge with an unacknowledged advisory, and every acknowledged one carries its package, affected range, severity, reason and the event that reopens it. A home path or a commit subject in the wrong case fails the PR that introduces it.

**Good enough.** No store-match check (a follow-up tracks it). No signed `SHASUMS256.txt` beyond the attestation. No change to the Node or Bun bootstrap in `docker-ci-like.sh` (a follow-up). No integrity re-check of a restored toolchain cache beyond today's `--version` probes (an accepted residual, § Security).

## Architecture & Implementation

### Arc 1: release integrity

**Proposed architecture.**
- **One tag creator, one release owner.** `auto-unstick` creates the stable tag (through the REST API, with an App token) and relabels the Release PR. release-please runs with `skip-github-release: true`, so it maintains Release PRs and never tags or releases. The `attach-assets` job owns the GitHub Release: it creates a draft when none exists, uploads, reads the digests back, writes the notes, publishes, and checks once more. Nightly runs the same code.
- **Exact provenance.** The publishing path runs only when the workflow run's commit (`GITHUB_SHA`) is the commit the tag names, so the attestation's source digest is the tagged commit. On `push: main` it holds once `auto-unstick` tags only a Release PR whose merge commit is the run's commit, a check this arc adds. A dispatch that publishes runs with `--ref <tag>`.
- **Store submissions ship the published bytes.** A dispatch on an already-published release never uploads. It downloads the published assets, checks them against the published `SHASUMS256.txt` and against their attestation, and hands those bytes to the store jobs. The rebuild still runs every gate, and a rebuild that differs is reported, not fatal. Only an attested release (one this flow published) can reach a store through the workflow (A11).
- **Clean signing jobs.** Every job that holds an App token, `id-token: write` or `attestations: write` runs Bun without a dependency install, checks out with `persist-credentials: false`, sets tokens per step, and runs no third-party action except `oven-sh/setup-bun`. Each checks out the workflow's own revision, so the composite action and scripts it runs never come from an older tag. git-cliff moves to read-only notes jobs.
- **Tags pinned before upload.** `apply` dereferences the tag and requires the expected commit; nightly creates its own tag ref at the built commit before uploading. Both re-check after publishing.
- **Narrow App tokens.** Each mint names its permissions; a test pins them.

**Key interfaces** (`scripts/release/attach-assets.ts`, pure):

```ts
/** GitHub reports an asset digest as "sha256:<hex>", or null for assets uploaded before digests existed. */
export interface RemoteAsset { id: number; name: string; digest: string | null }
export interface LocalAsset { name: string; sha256: string }
export type ReleaseState =
	| { kind: "absent" }
	| { kind: "ambiguous"; count: number } // more than one release for the tag
	| { kind: "draft"; id: number; assets: RemoteAsset[] }
	| { kind: "published"; id: number; immutable: boolean; assets: RemoteAsset[] }
export interface PlanInput {
	state: ReleaseState
	local: LocalAsset[]
	workflowSha: string // GITHUB_SHA
	tagSha: string // the commit the tag names (an annotated tag dereferenced), or the nightly's target
}
export type AttachPlan =
	| { action: "publish"; createDraft: boolean }
	| { action: "use-published" }
	| { action: "refuse"; reason: string }
export function planAttach(input: PlanInput): AttachPlan
/** Exact set equality on names and digests; an extra, missing, digest-less or different asset refuses. */
export function compareAssets(remote: RemoteAsset[], local: LocalAsset[]): { ok: true } | { ok: false; reason: string }
```

Rules:
- `ambiguous` → refuse.
- `absent` or `draft` → `publish` (with `createDraft` for `absent`) only when `workflowSha === tagSha`. Otherwise refuse: "dispatch with `--ref <tag>` so the attestation names the tagged commit".
- `published` → `use-published`. A published release is never uploaded to. The reasons the published path refuses name the state: an immutable release with missing assets says the version is burned; a mutable one says how to recover.

`scripts/release/attach-assets-run.ts` (injected I/O like `auto-unstick-run.ts`; real I/O through `gh api`, REST only, so no field depends on the runner's `gh` version):
- `plan`: lists the releases whose `tag_name` is the tag (drafts included), hashes the local files, writes `action`, `create_draft` and `release_id` to `$GITHUB_OUTPUT`, and exits 1 on `refuse`.
- `apply --expect <action> [--target <sha>]`: re-reads the state and refuses when it no longer yields the expected action. For `publish`:
  1. Pin the tag. Stable and rc: read `refs/tags/<tag>`, dereference it, and refuse unless it names `GITHUB_SHA`. Nightly (`--target <sha>`): create the ref with `POST /git/refs` at the target; if it already exists, continue only when it names the target. Then create the draft (`POST /releases`, `draft: true`, `prerelease` from the version). The tag exists by now, so `target_commitish` is never sent; GitHub ignores it for an existing tag anyway (CLAUDE.md, rc step 5).
  2. Delete any same-name asset on the draft, then upload each file to `uploads.github.com/.../releases/<id>/assets`.
  3. Read back by id and run `compareAssets`; refuse on any difference.
  4. `PATCH` the notes, then `PATCH draft: false`.
  5. Read back by id, run `compareAssets` again, require `draft == false`, and re-read the tag ref. A difference here means another writer acted between steps 3 and 4: the job fails loudly, and the immutable release records what it holds.
- `verify-published`: refuses a release with no attestation (every release published before this flow) with "not attested by this workflow; cut a new release to submit it to a store" (A11). Otherwise it downloads the three published assets by id into `dist/release/published/`, checks them with `sha256sum -c SHASUMS256.txt`, runs `gh attestation verify` on each with the same identity the release notes print, compares them with the rebuild (a warning on difference), and `PATCH`es the notes.

**Data and control flow** (`release.yml`):

1. `release-please` runs with `skip-github-release: true`. `resolve` keeps its `release_created` branch; that branch is now unreachable, which the test pins.
2. `auto-unstick` mints an App token (`permission-contents: write`, `permission-pull-requests: write`), checks out with the default token (`persist-credentials: false`, `fetch-tags: true`), and runs `auto-unstick-run.ts` with `GH_TOKEN` set on that step only.
   - The tag is created through the REST API, as release-please does: `POST /git/tags` (annotated, no tagger lookup), then `POST /git/refs`.
   - `ensureRelease` goes.
   - `decideUnstick` requires `pr.mergeSha === headSha` before any side effect. The I/O picks the associated PR whose `merge_commit_sha` is `headSha`, not the first one returned (`auto-unstick-run.ts:132`, `.[0]`).
   - The job's own `GITHUB_TOKEN` drops to `contents: read`.
3. A new read-only `release-notes` job (needs `resolve`; `if: always() && !cancelled() && needs.resolve.result == 'success'`, because `release-please` is skipped on a dispatch and a skipped ancestor skips every descendant without a status function, `release.yml:219-220`) holds the existing range-picking and git-cliff steps and uploads `/tmp/release-notes.md` as an artifact.
4. `attach-assets` (needs today's list plus `release-notes`; its `if:` gains `needs.release-notes.result == 'success'` and keeps every other line):
   - checkout of the workflow's own revision (no `ref:`), `persist-credentials: false`, `fetch-depth: 0`. The local `setup-bun` composite and `scripts/release/` then come from the workflow revision. Today's checkout at `resolve.sha` would, on a store dispatch for an older tag, run that tag's composite, which has no `install` input and runs `bun install` under the signing permissions. On the publish path the two revisions are the same commit.
   - `setup-bun` with `install: "false"`
   - download the builds and the notes
   - zip and `SHASUMS256.txt`, with `SOURCE_DATE_EPOCH` read from the built commit (`git log -1 --format=%ct "$SHA"`), not from the checkout
   - `plan`
   - `actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8 # v4.2.2` on both zips and `SHASUMS256.txt`, only when `action == publish` and not a dry run
   - `apply --expect publish`, or `verify-published`, skipped on a dry run
   - upload the Actions artifact `release-<version>` from whichever bytes the run chose (the rebuild that was just published, or the downloaded published assets); the store jobs read that artifact as today
   - permissions: `contents: write`, `id-token: write`, `attestations: write`; `GH_TOKEN` per step.

`nightly.yml`:
- `resolve` takes `github.sha` instead of re-reading `origin/dev`, and fails unless `github.ref` is `refs/heads/dev`. The workflow commit and the built commit are then the same by construction.
- A read-only `nightly-notes` job runs git-cliff and composes the body.
- `nightly-notes` and `publish-nightly` keep the quiet-day guard the nightly jobs already carry.
- `publish-nightly` runs the same three scripts: `plan`, attest, then `apply --expect publish --target <sha>`. `apply` creates the nightly tag ref itself, before the draft exists. A tag created meanwhile at another commit by any other `contents: write` holder then refuses the publish instead of being attested, and S1 keeps the created ref from moving. Creating a ref at an existing commit with `GITHUB_TOKEN` is what `auto-unstick` does in production today (F5).

**App tokens.** Each mint names its permissions; none sets `owner` or `repositories`, so each stays scoped to this repository:

| Mint | Permissions |
|---|---|
| `release.yml` `release-please` | `permission-contents: write`, `permission-pull-requests: write`, `permission-issues: write` (release-please-action documents all three; it creates and applies labels) |
| `release.yml` `auto-unstick` (new) | `permission-contents: write` (tag object and ref), `permission-pull-requests: write` (PR lookup, relabel; the `autorelease: tagged` label already exists in the repo) |
| `release.yml` `sync-main-to-dev` | `permission-contents: write`, `permission-pull-requests: write` (drops issues) |
| `release-prerelease.yml` `release-please` | same as the `main` one |
| `_release-pr-lockfile.yml` `lock-version` | unchanged: `permission-contents: write` |

The App holds exactly contents, issues and pull_requests write today, so the release-please mints narrow nothing now. The pin still matters: a permission later granted to the App (`workflows`, `administration`) no longer flows into every token. `sync-main-to-dev` keeps its App token for the API only; its checkout uses the default token with `persist-credentials: false`.

**Composite `setup-bun`** gains an `install` input (default `"true"`). The jobs that need only Bun built-ins pass `"false"`: `auto-unstick`, `attach-assets`, `sync-main-to-dev`, `publish-nightly`. This keeps the Bun version in one place, rather than adding more `bun-version:` literals that a Bun bump must sync.

**Release notes** (`cliff.toml`). The prerelease branch's `Verify:` line becomes:

```
Verify the zips:

- `shasum -a 256 -c SHASUMS256.txt` checks them against the checksums.
- `gh attestation verify nulo-chrome-{{ v }}.zip --repo nulo-sh/nulo --signer-workflow nulo-sh/nulo/.github/workflows/{% if v is containing("-nightly") %}nightly{% else %}release{% endif %}.yml --source-digest {{ commit_id }} --deny-self-hosted-runners` checks that this repository's workflow built the Chrome zip from this commit. Run it for the Firefox zip too.
```

The stable branch's "Verify or load by hand" paragraph becomes: "The zips below are the same builds. Verify them with `shasum -a 256 -c SHASUMS256.txt`. To check that this repository's release workflow built them from this commit, run `gh attestation verify nulo-chrome-{{ v }}.zip --repo nulo-sh/nulo --signer-workflow nulo-sh/nulo/.github/workflows/release.yml --source-digest {{ commit_id }} --deny-self-hosted-runners`, and the same for the Firefox zip. To load the Chrome zip by hand, …" (rest unchanged).

- `--signer-workflow` matches the workflow path on any ref. `--source-digest` is what pins the commit, and the publish-path gate makes the attested commit the tagged one.
- `{{ commit_id }}` must render the tag's commit; Phase 3 proves it with a render. If it does not, `apply` replaces a fixed placeholder with `resolve.sha` instead, and the template prints the placeholder.
- There is no `gh release verify` line: releases published before immutable releases is on carry no release attestation. SECURITY.md documents that command with its start date.

**File-level change map (Arc 1).**
- add `scripts/release/attach-assets.ts`, `attach-assets.test.ts`, `attach-assets-run.ts`, `attach-assets-run.test.ts`; add `scripts/ci-cd/release-integrity.test.ts`
- modify `.github/workflows/release.yml` (`release-please`, `auto-unstick`, new `release-notes`, `attach-assets`, `sync-main-to-dev`, `status`, the mints, header comments), `release-prerelease.yml` (mint, `skip-github-release`), `nightly.yml` (`resolve`, new `nightly-notes`, `publish-nightly`, `status`, the stale partial-assets comment), `.github/actions/setup-bun/action.yml` (`install` input)
- modify `scripts/release/auto-unstick-run.ts` + test (REST tag, no `ensureRelease`, PR picked by merge commit), `scripts/release/auto-unstick.ts` + test (the `mergeSha === headSha` check), `.github/workflows/store-check.yml` (checkout without persisted credentials), `scripts/ci-cd/behavior-gating.test.ts` (`holdsWrite` counts an App mint, OIDC or attestations as write), `scripts/ci-cd/aggregators.test.ts` (the new notes jobs in each `status`)
- modify `cliff.toml`; `SECURITY.md` (new "Release integrity" section next to "GitHub Actions"); `CLAUDE.md` (the release runbook: tag and relabel only, never create the release by hand, publish dispatches use `--ref <tag>`, the transition note, the troubleshooting rows, the three settings with their undo); `CI.md` (§ release.yml, § nightly.yml, interrupted-publish recovery)

**Trade-offs and alternatives not taken.**
- *release-please `draft` + `force-tag-creation` instead of `skip-github-release`.* Rejected: it keeps two tag creators (release-please on a success, auto-unstick on the abort). `skip-github-release` makes the abort the normal path and auto-unstick the only creator, which is what the runbook already assumes.
- *Keep `auto-unstick` creating the release, as a draft.* Rejected: two creators of one object, and the manual runbook would keep a `gh release create` line that, typed without `--draft` once immutable releases is on, burns the version.
- *Require rebuild equality on a store submission.* Rejected after the audit: zip bytes depend on the runner's `zip`, and Chrome builds have no reproducibility proof. The published, attested bytes are the right input to a store.
- *Let the GitHub Actions app bypass the creation rule.* Rejected: every job holding `contents: write` could then create a stable tag.
- *Attest after publishing.* Rejected: a failed attestation would leave an unattested, already-immutable release.
- *Keep git-cliff in the signing job.* Rejected: the action downloads a binary at run time, and every step of a job with `id-token: write` can mint a signing certificate.

### Arc 2: pinned toolchain and install privacy

**#12, proposed architecture.** One script, `.github/actions/setup-aztec/install.sh`, owns the Aztec toolchain install. Both the composite action and `docker-ci-like.sh` run it, and it lives under the network lanes' path filter. It refuses any machine but x86_64 Linux. It keeps today's verified downloads (installer, `versions`, noir), adds a verified Foundry tarball, and runs the **pinned upstream installer with two of its functions replaced**:

1. Download and hash `<version>/install`, `<version>/versions` and the noir tarball, as today.
2. Read `foundry: <x.y.z>` from the verified `versions`. Fetch `foundry_v<x.y.z>_linux_amd64.tar.gz` from the `foundry-rs/foundry` release, and hash it against a new `foundry/<x.y.z>/foundry_v<x.y.z>_linux_amd64.tar.gz` line in `installer-pins.sha256`. Extract only `forge`, `cast`, `anvil` and `chisel`, with the single-member checks of `setup-geckodriver`.
3. Load the verified installer's functions without running it:
   - Strip its final `main "$@"` and `exit` lines; each must match exactly once, or the install fails.
   - `source` the rest in a subshell.
   - Require that `install_foundry`, `install_aztec_packages` and `main` are defined (`declare -F`), or fail.
   - Redefine `install_foundry`: copy the four verified binaries into `internal-bin`, as upstream does after `foundryup`.
   - Redefine `install_aztec_packages`: copy the committed `cli/package.json` and `cli/package-lock.json` into the version dir, run `npm ci --prefix "$version_path" --ignore-scripts --no-audit --no-fund`, then run `npm rebuild <pkg> --nodedir=<node prefix>` for the packages on an explicit allowlist only.
4. Call upstream's `main`. Upstream keeps the layout, its Node-minimum check, `install_noir` (fed by `NARGO`), the `aztec-*` symlinks and the `aztec` wrapper.

**The install-scripts decision.**
- Every install script is off.
- The rebuild allowlist starts empty, and a package joins it only when a measured failure proves it needs its script.
- `--nodedir` removes the Node-headers download that `node-gyp` would make. It does not stop a script from fetching on its own; any allowlisted package's script is read before it is admitted.
- Of the seven packages with install scripts (recon), `lmdb`, `msgpackr-extract`, `@parcel/watcher` and `unrs-resolver` load prebuilt binaries, and `protobufjs`'s script is a version check. `bcrypto` and `leveldown` are the candidates to measure.

**Committed lockfile.**
- `.github/actions/setup-aztec/cli/package.json`: private, the two `@aztec-labs/*` packages at the exact Aztec version.
- Its `package-lock.json`, generated by a committed helper, `.github/actions/setup-aztec/lock.sh <version>`: `npm install --package-lock-only --ignore-scripts` with the 7-day `min-release-age` and the two Aztec scope excludes the action already uses.
- The lockfile is `linguist-generated` in `.gitattributes`.
- The `aztec-update` skill's pin surface gains two steps: re-pin Foundry when `versions` names a new one, and regenerate the lockfile.

**Cache.** The `actions/cache` key becomes `hashFiles('.github/actions/setup-aztec/**')` with the suffix `-v4`, so any change to the install certifies itself with one cold run.

**`docker-ci-like.sh`.** Drops its `foundry.paradigm.xyz` pipe, its unpinned `install.aztec.network` pipe and its "symlink foundry's anvil" fallback, and runs `install.sh`. The Foundry volume note goes. Its Node and Bun bootstrap stays (a follow-up).

**#22, proposed architecture.** The fix is decided by measuring the built extension, in this order. Each step has its own acceptance:
1. **No imports, no entry.** If the built content-script chunk has no imports, crxjs references it directly and its web-accessible entry is unneeded. A small Vite plugin with crxjs's `renderCrxManifest` hook removes the entry. Accept when the built Chrome manifest has no `web_accessible_resources`.
2. **Dynamic URL.** Otherwise the same hook sets `use_dynamic_url: true` on every generated entry (Chrome only; crxjs strips the key for Firefox, whose extension origin is already random per install). Chrome honours it from 130, and `chrome.runtime.getURL` returns the dynamic URL that the crxjs loader imports. Accept when every built Chrome entry has `use_dynamic_url: true` and the discovery spec passes on Chrome.
3. **Neither works.** Stop. #22 stays open with the measurement. The standalone build would need a third-party-notices policy change, which is an owner decision, so write it to `OWNER-ASKS.md`.

**As built.** Step 1, after making the chunk import-free. As first built, the content chunk imported three enums from a chunk the background shares. An `enforce: "pre"` resolve hook (`apps/extension/scripts/content-script-isolation.ts`) gives every module the content script reaches an id of its own (`?content-script`), so no group or shared chunk takes it, and crxjs then injects the chunk directly as an IIFE with no loader. A post `renderCrxManifest` hook drops the content script's file from `web_accessible_resources`, and the key with it. It stays one build, so the notices plugin sees every module (its collector strips the query). The policy's `VENDORED` claim for crxjs's loader is removed: with no loader it matched nothing, and with it gone a content script that imports a chunk again fails the build.

**#22 pins** (as built).
- `content-script-isolation.test.ts`: the manifest hook drops crxjs's entry and the key, and keeps any other resource; the resolver marks every module the entry reaches, strips the mark before resolving, and leaves other importers and virtual modules alone.
- `manifest.test.ts`'s comment points at the hook and the smoke check.
- A smoke check in `tests/e2e/security.test.ts`, on both browsers: the built manifest lists no `web_accessible_resources`, and a page served from `127.0.0.1` gets a refusal for every injected file that the extension's own page fetches with `200`. Shown to fail on a build without the hook (a page fetch answered `200`).
- `NEVER_GROUPED` in `vendor-chunks.ts` keeps wallet-sdk out of the package groups; with wallet-sdk grouped, the build fails on the loader asset (measured).

**File-level change map (Arc 2).**
- add `.github/actions/setup-aztec/install.sh`, `lock.sh`, `cli/package.json`, `cli/package-lock.json`, `scripts/ci-cd/setup-aztec-pins.test.ts`
- modify `.github/actions/setup-aztec/action.yml` (runs `install.sh`, description, cache key), `installer-pins.sha256` (Foundry line, header), `.gitattributes`, `apps/extension/scripts/e2e/docker-ci-like.sh`, `.claude/skills/aztec-update/SKILL.md`, `SECURITY.md` ("Binary dependencies")
- add the hooks (`apps/extension/scripts/content-script-isolation.ts`) and their test; modify both `apps/extension/vite.*.config.mts`, `packages/third-party-notices/src/policy.ts` (the loader claim), `apps/extension/src/manifest.test.ts`, `apps/extension/scripts/vendor-chunks.ts` (comment), `tests/e2e/security.test.ts`, SECURITY.md § Content script injection

**Trade-offs and alternatives not taken.**
- *Replace the upstream installer with our own steps.* Rejected: it moves the layout logic (symlinks, wrapper, the npm-bin filter) into this repo, where it drifts silently. Overriding two functions keeps the delta at the two download chains, and a changed installer fails loudly at the line match and the `declare -F` check.
- *A unified diff applied to the installer.* Equivalent, and both auditors accept it. Not chosen: two whole function bodies read more plainly than a hunk against a downloaded script.
- *Verify Foundry's GitHub attestation at run time.* Rejected for CI: it needs `gh` and a token in the toolchain job. The attestation is checked once, at pin time, and recorded in the pin file's header.
- *crxjs `standaloneFiles`.* Rejected: its IIFE is an emitted asset from a sub-build without plugins, which the notices policy refuses (recon).

### Arc 3: release and tooling guards

**Lint and typecheck of `scripts/`.**
- **Biome.** `files.includes` gains `scripts/**`, keeping the `test-soak/baselines` exclusion. One override turns `noTemplateCurlyInString` off for `scripts/ci-cd/**/*.test.ts`, whose strings are GitHub `${{ }}` expressions on purpose. The 38-file reformat lands as its own commit. The seven lint errors are fixed by refactoring: six functions at cognitive complexity 16-18 go under 15, and the `valueOf` shadow is renamed. The warnings and infos are fixed too, so `bun run lint` stays quiet (it prints only 20 diagnostics).
- **TypeScript.** A `scripts/tsconfig.json` (strict, `types: ["bun"]`, `noEmit`). Root devDependencies `typescript` (the locked 6.0.3) and `@types/bun` `1.4.2`, matching `packageManager`; CLAUDE.md's Bun-bump list gains `@types/bun`. A `typecheck:scripts` script, and `typecheck:all` = `bun run --filter '@nulo/*' typecheck && bun run typecheck:scripts`. `scripts/ci-cd/test-soak/**` is excluded (it runs under the extension's vitest and imports `vitest`, which the root does not declare), and the tsconfig says so; any other exclusion is listed there with its reason.

**Release guards.**
- `interpretPreflight` refuses a submitted `STAGED` revision: "a staged revision holds the item; publish or cancel it in the dashboard first". CLAUDE.md's troubleshooting table gains the row.
- `auto-unstick` default on, through an exported `parseAutoUnstickFlag(raw)`:
  - unset or empty → on
  - `on`, `true`, `1` → on
  - `off`, `false`, `0` → off
  - any other value → off, with a warning (a typo meant to disable must not enable)

  The repo variable stays the kill switch. CLAUDE.md (blockquote, switches table) and the code comments that say "default off" are updated.
- Home-path guard in CI: `scripts/ci-cd/no-local-paths.test.ts` runs `scripts/check-no-local-paths.sh` three ways. On the repo it expects exit 0. On a temporary git repo seeded with a home path assembled at run time, it expects exit 1 (the never-happens case). On the same repo without the path, it expects exit 0.
- commitlint: `"subject-case": [2, "always", "lower-case"]` in `.commitlintrc.json`. `scripts/ci-cd/commitlint.test.ts` feeds the local `commitlint` binary `fix: handle PXE errors` (expects exit 1) and `fix: handle pxe errors` (expects exit 0).

**File-level change map (Arc 3).** Modify `bun.lock`, root `package.json`, `biome.json`, `.commitlintrc.json`, `CLAUDE.md`, `CI.md`, `scripts/release/publish-chrome-store.ts` and its test, `auto-unstick-run.ts` and its test, `auto-unstick.ts`, `release.yml` (comment), the six over-budget functions, and about 38 reformatted files. Add `scripts/tsconfig.json`, `scripts/ci-cd/no-local-paths.test.ts` and `commitlint.test.ts`.

**Trade-off not taken.** *Make `scripts/` a workspace (`@nulo/scripts`).* Rejected: it changes how every script resolves imports under the isolated linker, a larger change than the follow-up asks.

### Arc 4: audit backlog and the gate (#20)

1. Run `bun audit fix` and keep each bump only after `bun pm diff` review and green gates. Hold vitest (4.1.10 → 4.1.11) out. CLAUDE.md makes any test-runtime change pass the soak matrix, which is out of proportion for this bump. Its two advisories are acknowledged instead, with their exploit condition: a path traversal through the mocker's redirect needs an attacker who controls test files or config, which this repo's CI does not run. Bump `vue` 3.5.41 → 3.5.42 (published 2026-08-27, past the gate) to clear `@vue/server-renderer`. It is a production dependency, so the smoke suite runs on both browsers for it.
2. Classify every advisory left. "Bundled" is decided by the build's own `THIRD-PARTY-NOTICES.txt`, which lists what the extension zips contain, not by reading dependency trees.
3. Add the acknowledgement file and the gate:
   - `scripts/ci-cd/audit-acks.json`: one entry per advisory id, holding `package`, `vulnerable_versions`, `severity`, `bundled` (boolean), `reason`, `revisit` (the event that reopens it, e.g. "the next Aztec bump").
   - `scripts/ci-cd/audit-gate.ts`: a pure `judgeAudit(report, acks)` returns three lists. `unacknowledged` holds an advisory with no ack, or one whose ack's package, affected range or severity no longer matches the report. `stale` holds an ack whose id no longer appears. `malformed` holds a report the script cannot read. The CLI takes the JSON file and `bun audit`'s exit code; any code other than 0 or 1 is a tool failure. In `enforce` mode it exits 1 on any list or a tool failure; in `report` mode it never fails. Both modes write the step summary.
   - Mode selection: `pr-quick.yml`'s `changes` job gains a `deps` filter (`bun.lock`, `**/package.json`, `bunfig.toml`, `scripts/ci-cd/audit-acks.json`). When it matches, the job (which already has full history, `pr-quick.yml:65`) runs `bun scripts/ci-cd/audit-gate.ts mode --base <PR base sha>` after `setup-bun` with `install: "false"`. A pure `auditMode(diff)` reads `git diff -U0 <merge-base>..HEAD` over those files and returns `report` when every changed line is a `"version": "…"` line in a `package.json` or `bun.lock` (a Release PR and the `main → dev` sync PR change only those), and `enforce` otherwise. The result reaches `_lint-and-typecheck.yml` as an `audit_mode` input. Every other run reports: other PRs, push, nightly, release.
4. SECURITY.md's `bun audit` paragraph becomes the policy, with a table by package that points at the ack file. CLAUDE.md's Dependency policy line follows.

**Why this scope** (Ask A4).
- Enforcing on every PR would turn every PR red the day an advisory is published, including the Release PRs to `main`, whose ack file only changes through a promote. The version-only rule keeps Release and sync PRs in report mode by what they change, never by author or label.
- Enforcing on releases would block a tagged commit whose ack file cannot be amended.
- The cost: a new advisory reaches the nightly and PR summaries but blocks only the next dependency change. A promote PR carries real dependency changes, so a fresh advisory blocks the promote until its ack lands on `dev`. A release can ship from a tag while a fresh advisory is open. The gate covers every severity, because a severity threshold would bring back a silent class, which is the cause of #20.

**File-level change map (Arc 4).** Modify `bun.lock`, the `package.json` files `bun audit fix` and the `vue` bump touch, `.github/workflows/_lint-and-typecheck.yml`, `.github/workflows/pr-quick.yml`, `SECURITY.md` and `CLAUDE.md`. Add `scripts/ci-cd/audit-acks.json`, `audit-gate.ts` and `audit-gate.test.ts`.

**Trade-offs and alternatives not taken.**
- *Block only at `high` with inline `--ignore` flags.* Rejected: it brings back a silent class, and a reason in prose cannot be checked.
- *Match acks by id alone.* Rejected after the audit: an ack would survive a change in affected range, severity or reachability.

## Repository settings

Three settings, applied with `gh api`. Each has an exact call, a readback with its expected output, and an undo. All three were read live on 2026-10-08 (recon § Live repository state).

**Who applies them.** The implementing session applies **S1 only**. S2 and S3 come after the promote that carries Arc 1 and after a real release has run the new flow, which is after this lane ends. S3 is partly irreversible. The owner applies S2 and S3, or the orchestrator applies them on the owner's explicit go (Ask A1). The calls go into `follow-ups.md` at the close-out.

### S1: tag ruleset "release tags: no deletion or update"

**When:** once Arc 1's PR has green checks. Nothing in code deletes or moves a `v*` tag (recon), so S1 blocks no automated path, before or after Arc 1. It changes one manual path: the troubleshooting row that tells the owner to "delete/fix the bad tag" after an auto-unstick abort becomes the repair below.

```
gh api -X POST repos/nulo-sh/nulo/rulesets --input - <<'JSON'
{
  "name": "release tags: no deletion or update",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [ { "type": "deletion" }, { "type": "non_fast_forward" }, { "type": "update" } ],
  "bypass_actors": []
}
JSON
```

- **Readback:**
  1. `gh api repos/nulo-sh/nulo/rulesets --jq '.[] | select(.target == "tag") | {id, name, enforcement}'`
  2. `gh api repos/nulo-sh/nulo/rulesets/<id> --jq '{target, enforcement, conditions, rules: [.rules[].type], bypass_actors}'`

  Expect `target: "tag"`, `enforcement: "active"`, include `["refs/tags/v*"]`, rules `["deletion", "non_fast_forward", "update"]` and `bypass_actors: []`. Record the id in `plan.md` and in CLAUDE.md.
- **Why `update` too:** `non_fast_forward` alone lets a tag move forward to a descendant commit. Nothing updates a `v*` tag today, so the stricter rule costs nothing.
- **Why no bypass:** the owner is the only admin and can still edit the ruleset. A repair becomes two deliberate, logged steps. The cost: while the ruleset is disabled, every `v*` tag is unprotected, so the repair is one short sequence.
- **Repair:**
  1. `gh api -X PUT repos/nulo-sh/nulo/rulesets/<id> -f enforcement=disabled`
  2. Fix the one tag.
  3. Run the same call with `enforcement=active`.
  4. Read back.
- **Undo:** `gh api -X DELETE repos/nulo-sh/nulo/rulesets/<id>`. Readback: the first readback command prints nothing.

- **Applied 2026-10-08, id `24737631`**, after Arc 1's PR (#50) opened with every local gate green. Readback 1: `{"enforcement":"active","id":24737631,"name":"release tags: no deletion or update"}` (the only tag ruleset). Readback 2: `{"bypass_actors":[],"conditions":{"ref_name":{"exclude":[],"include":["refs/tags/v*"]}},"enforcement":"active","rules":["deletion","non_fast_forward","update"],"target":"tag"}`, as expected. CLAUDE.md § Tag rulesets carries the id.

### S2: tag ruleset "release tags: creation by the release app and the owner"

**When:** all four hold:
1. Arc 1 is on `main`: `git fetch -q origin main && git merge-base --is-ancestor <Arc 1 squash sha on dev> FETCH_HEAD`.
2. One stable release has run green on `main` with the new flow. `auto-unstick` created the tag with the App token (this proves Inference I3), the draft was published, and `gh attestation verify` passes on both zips with the release notes' command.
3. No release or nightly run is in flight: `gh run list --workflow release.yml --status in_progress` and `--status queued` print nothing; the same holds for `nightly.yml`.
4. S3 is applied in the same sitting, and the runbook's transition note is removed in the same change.

```
gh api -X POST repos/nulo-sh/nulo/rulesets --input - <<'JSON'
{
  "name": "release tags: creation by the release app and the owner",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": ["refs/tags/v*-nightly.*"] } },
  "rules": [ { "type": "creation" } ],
  "bypass_actors": [
    { "actor_id": 5179103, "actor_type": "Integration", "bypass_mode": "always" },
    { "actor_id": 2982991, "actor_type": "User", "bypass_mode": "always" }
  ]
}
JSON
```

- **Actors:**
  - `5179103` is the `nulo-sh-release` App (`gh api apps/nulo-sh-release --jq .id`).
  - `2982991` is the owner, `alejoamiras` (`gh api users/alejoamiras --jq .id`). `User` is the actor type the two live branch rulesets already use.
  - If the API refuses `User`, use `{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }`, the admin role, which only the owner holds.
- **Why nightlies are excluded:** `nightly.yml` creates its tag when it publishes, with `GITHUB_TOKEN`. Admitting that actor would admit every job holding `contents: write`. Nightly tags stay under S1 and S3.
- **Readback:** as for S1. Expect `rules: ["creation"]`, the exclude list above and the two bypass actors.
- **Undo:** `gh api -X DELETE repos/nulo-sh/nulo/rulesets/<id>`.

### S3: immutable releases

**When:** with S2, under the same four conditions. Before Arc 1 is on `main`, `main`'s flow publishes an empty release and uploads later; with S3 on, that upload is refused and the version can never be reused.

```
gh api -X PUT repos/nulo-sh/nulo/immutable-releases
```

- **Readback:** `gh api repos/nulo-sh/nulo/immutable-releases` returns `{"enabled":true,"enforced_by_owner":false}`.
- **Undo:** `gh api -X DELETE repos/nulo-sh/nulo/immutable-releases`; the readback then shows `"enabled":false`. **The undo is partial:** every release published while S3 was on stays immutable, and its tag name can never be reused.
- **Live proof** (the first stable release after S3):
  - `gh release view vX.Y.Z --json isImmutable,assets` shows `true` and three assets.
  - `gh release verify vX.Y.Z --repo nulo-sh/nulo` passes.
  - The notes' `gh attestation verify` passes for both zips.
- No dashboard step is needed: the immutable-releases endpoint exists (the live `GET` returned `{"enabled":false,"enforced_by_owner":false}`).

## Phases

Every phase gate includes the fast layers below; a phase adds its own lines. Run commands from the worktree root unless a line says otherwise.

**Fast layers (every phase):**

```
bun run lint
bun run typecheck:all
bun run test
bun run test:all
bun run test:ci-gating
bun run test:release
bun run lint:actions
```

Pass: each exits 0.

### Arc 1: release integrity

#### Phase 1: clean signing jobs and narrow tokens ✓

1. Add the `install` input to `setup-bun`. Pass `"false"` in `auto-unstick`, `attach-assets`, `sync-main-to-dev` and `publish-nightly`.
2. Set `persist-credentials: false` on those jobs' checkouts. Move every `GH_TOKEN` to step level.
3. Move git-cliff into `release-notes` and `nightly-notes`. Pass the notes as an artifact. Add both jobs to their workflow's `status`.
4. Add the `permission-*` inputs to the four mints. Give `auto-unstick` its own mint. Move its tag creation to the REST API. Add the `mergeSha === headSha` check and the PR selection by `merge_commit_sha`, with one mismatch test.
5. Set `skip-github-release: true` on both release-please steps.
6. Make `holdsWrite` in `behavior-gating.test.ts` count an App mint, `id-token: write` and `attestations: write`.
7. Write `release-integrity.test.ts`, part 1. It checks every workflow and composite action with small finding functions. Each function expects no finding on the real files and a finding on a mutated copy. The checks: each mint's exact permission set; no `owner`/`repositories` input; `skip-github-release: true` on every release-please step; in every job that holds an App token, OIDC or attestations, `persist-credentials: false` on every checkout (the store jobs' and `store-check.yml`'s checkouts gain it) and no job-level `GH_TOKEN`, and its third-party `uses:` are exactly a per-job list pinned in the test (`googleapis/release-please-action` in the two release-please jobs, `google-github-actions/auth` in the Chrome store jobs, `oven-sh/setup-bun` where used); in the four clean jobs (`auto-unstick`, `attach-assets`, `sync-main-to-dev`, `publish-nightly`), additionally no `bun install` (the composite with `install: "false"`), no checkout `ref:` other than the workflow's own revision, and no third-party action but `oven-sh/setup-bun`; the notes jobs carry the `always()` guard.

**Validation gate (Phase 1).**
- Commands: the fast layers; `bun test scripts/ci-cd/release-integrity.test.ts scripts/ci-cd/behavior-gating.test.ts scripts/ci-cd/aggregators.test.ts scripts/ci-cd/action-pins.test.ts scripts/release/auto-unstick-run.test.ts`.
- Pass: all exit 0. Each finding function's mutated-copy test fails without the function's check (shown once in the transcript by reverting the check).
- Layers: lint, typecheck, unit.

#### Phase 2: one release owner ✓

1. Write `attach-assets.ts` and its tests:
   - one test per refused class: ambiguous; a workflow commit that differs from the tag commit; published and immutable with missing assets; published and mutable with missing assets; a digest-less, extra, missing or different asset in `compareAssets`
   - a success control per action
2. Write `attach-assets-run.ts` and its tests with injected I/O. Prove each of these:
   - `apply` order: create, replace, upload, compare, notes, publish, compare.
   - A mismatch at the first compare never reaches the publish call.
   - A state that changed since `plan` refuses.
   - A stable tag that names another commit refuses before any upload; an existing nightly tag at another commit refuses; one at the target continues.
   - `verify-published` refuses a release with no attestation.
   - `verify-published` refuses on a checksum or attestation failure, and still passes on a rebuild difference, with the warning.
3. Wire `attach-assets` as § Arc 1 describes. Keep its existing `needs` and `if:` lines and add the `release-notes` ones.
4. Wire `publish-nightly`, and the nightly `resolve` change with its ref guard.
5. Update CLAUDE.md's runbook:
   - The manual unstick only tags and relabels.
   - The publish dispatch uses `--ref "v$VERSION"`.
   - The store dispatch stays `--ref main`.
   - "Never create the GitHub Release by hand."
   - A **transition note**: "until `main` carries the draft flow (`git grep -q attach-assets-run origin/main -- .github/workflows/release.yml` fails), a release cut from `main` still needs the old `gh release create` line". It is removed when S2 and S3 are applied.
   - "After `auto-unstick` tags, finish or re-run a failed publish (`--ref <tag>`) before merging anything else to `main`" (I2).
   - "Never dispatch with a tag from before this flow as `--ref`; a store submission of such a version is a manual upload or a new release" (A11).
   - The troubleshooting rows.
6. Update CI.md and the workflows' header comments.

**Validation gate (Phase 2).**
- Commands: the fast layers; `bun test scripts/release/`; `actionlint .github/workflows/release.yml .github/workflows/nightly.yml .github/workflows/release-prerelease.yml`.
- Pass:
  - all exit 0
  - `git diff origin/dev -- .github/workflows/release.yml` shows every pre-existing line of `attach-assets`' `needs` and `if:` unchanged, with only the `release-notes` additions
- Layers: lint, typecheck, unit.

#### Phase 3: attestations and the verify text ✓

1. Add the attestation steps (release and nightly) and their two permissions.
2. Change `cliff.toml` to the text under § Arc 1.
3. Render the notes with git-cliff 2.x, the version the pinned action installs (`git-cliff --version` recorded in the lesson):
   - stable: `git cliff --config cliff.toml --tag v0.30.2 --strip header --offline <prev>..v0.30.2`
   - rc: the same with a scratch rc tag on a scratch clone
   - nightly: `git cliff --config cliff.toml --tag v0.30.2-nightly.26281 --unreleased --strip header --offline`

   Check that `--source-digest` prints `git rev-list -n1 <tag>` for each. If it does not, switch to the placeholder that `apply` replaces.
4. Write `release-integrity.test.ts`, part 2. Pin each attest step: its SHA, the three subject paths, its place after `plan` and before `apply`, its `action == publish` and dry-run guards. Pin the permissions of `attach-assets` and `publish-nightly`. Pin that no `gh release upload` or `gh release create` remains in either workflow.
5. Write SECURITY.md "Release integrity": what S1, S2, S3, the attestations and the token map each stop and do not stop; the verify commands; `gh release verify` with its start date.

**Validation gate (Phase 3).**
- Commands: the fast layers; `bun test scripts/ci-cd/release-integrity.test.ts`; `actionlint .github/workflows/release.yml .github/workflows/nightly.yml`; the three renders.
- Pass: all exit 0. The stable and rc renders name `release.yml`, the nightly render names `nightly.yml`, and each digest equals its tag's commit.
- Layers: lint, unit. The live proof is the first release on `main` with this flow (§ S2, condition 2).

**Arc 1 settings step.** When Arc 1's PR has green checks, apply S1, read it back, and record the id in this plan and in CLAUDE.md.

### Arc 2: pinned toolchain and install privacy

#### Phase 4: pinned Aztec toolchain install ✓

1. Hash the Foundry tarball yourself and compare it with the GitHub asset digest. Check it once with `gh attestation verify --repo foundry-rs/foundry`. Write the pin line, and record both sources in the pin file's header.
2. Write `lock.sh`. Generate `cli/package.json` and `cli/package-lock.json` for 6.0.0-rc.1.
3. Write `install.sh` as § Arc 2 describes. Move the action's install step into it.
4. Install into a scratch home: `CI=1 HOME=<scratch> AZTEC_HOME=<scratch>/.aztec bash .github/actions/setup-aztec/install.sh`, with `<scratch>` under `~/.cache/nulo-backlog/supply-chain-release/`. Start with an empty rebuild allowlist. Add a package only if a later step fails without its script, and log the failure.
5. Point `docker-ci-like.sh` at `install.sh`.
6. Update the `aztec-update` skill and SECURITY.md.
7. Write `setup-aztec-pins.test.ts`:
   - `cli/package.json` pins both packages at `apps/extension`'s Aztec version, and the lockfile's root dependencies match.
   - Every non-root lockfile package that is not `inBundle` and not a `link` has an `integrity` and a `resolved` URL under `https://registry.npmjs.org/`.
   - `installer-pins.sha256` holds one 64-hex pin each for the installer, `versions`, noir and Foundry.
   - Control: a lockfile copy with a `git+` or `file:` source fails.

**Validation gate (Phase 4).**
- Commands:
  - the fast layers
  - `shellcheck .github/actions/setup-aztec/install.sh .github/actions/setup-aztec/lock.sh apps/extension/scripts/e2e/docker-ci-like.sh`
  - the scratch install (step 4), then `<scratch>/.aztec/versions/6.0.0-rc.1/bin/aztec --version`, `.../internal-bin/forge --version`, `.../internal-bin/anvil --version`
  - `AZTEC_HOME=<scratch>/.aztec NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/cold-wake-discovery.test.ts` (from the worktree root)
- Pass:
  - every command exits 0, and the network spec is green
  - the install log shows "Verified" for all four pinned downloads
  - the install log shows no request to `foundry.paradigm.xyz`
  - `npm ci` ran with `--ignore-scripts`
  - nothing outside `<scratch>` changed (`git status` clean apart from the arc's files)
- Layers: lint, unit, e2e against the local sandbox. The CI network lanes on the PR are the authoritative proof of the composite action, because `setup-aztec/**` is in their path filter.

#### Phase 5: no fingerprintable content script ✓

**Outcome (2026-10-08).** Step 1 did not apply as first built (the content chunk imported two sibling chunks). Step 2 was built and measured: it refuses a page's fetch at the fixed URL, but the chunk's relative imports resolve against the fixed origin, which `use_dynamic_url` refuses, so the content script stops loading (`cold-wake-discovery` red three times on Chrome 152). Reverted, and the stop was written up for the owner. The Opus review then found that the content chunk needed only three enums from the shared chunk, so isolating its module graph makes it import-free and step 1 applies: both built manifests list no web-accessible file, and the content script is a 3.6 KB IIFE (§ Arc 2, "As built"). #22 closes with this arc; the owner ask was withdrawn (lessons/phase-5.md has both measurements).


1. Build both targets. Read the built content-script chunk's imports and the built manifests. Pick step 1 or step 2 of § Arc 2's #22 order.
2. Write the hook and its unit test. Wire it into `vite.chrome.config.mts`.
3. Update `manifest.test.ts`. Add the smoke assertion.
4. If neither step meets its acceptance, stop #22: record the measurement, write `OWNER-ASKS.md`, and leave the issue open with a comment.

**Validation gate (Phase 5).**
- Commands:
  - the fast layers
  - `bun run --cwd apps/extension build:chrome && bun run --cwd apps/extension build:firefox`
  - `cd apps/extension && bun run test:e2e -- <the smoke spec> --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`
  - from the worktree root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/cold-wake-discovery.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`
  - from the worktree root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/pxe-host-state.test.ts`
- Pass:
  - both builds exit 0, and the notices check refuses nothing
  - the Chrome manifest meets the chosen step's acceptance
  - the smoke spec is green on both browsers (as built it runs on both; nothing is skipped)
  - the discovery spec is green on both browsers, which proves the content script still injects and answers
  - `pxe-host-state` is green
- Layers: lint, unit, build, smoke e2e on both browsers, network e2e on both browsers.

### Arc 3: release and tooling guards

#### Phase 6: lint and typecheck of `scripts/` ✓

1. Widen Biome's scope and add the override.
2. Run `bunx biome format --write scripts/`, and commit the result alone.
3. Fix the seven errors and the warnings by refactoring, never by suppression.
4. Add `typescript` and `@types/bun` to the root. Review `bun pm diff`.
5. Write `scripts/tsconfig.json` and the `typecheck:scripts` script. Fix every type error.

**Validation gate (Phase 6).**
- Commands: the fast layers; `bunx biome check scripts/`; `bun run typecheck:scripts`; `bun install --frozen-lockfile`; `git diff --exit-code origin/dev -- scripts/complexity-baseline/manifest.json`.
- Pass:
  - all exit 0
  - `bunx biome check scripts/` prints no diagnostic
  - the reformat commit touches only files under `scripts/`
  - the complexity manifest is unchanged (no new acceptance)
- Layers: lint, typecheck, unit.

#### Phase 7: release guards ✓

1. Make `interpretPreflight` refuse `STAGED`. Test that it refuses, with a success control for `PUBLISHED` at a lower version. Add the troubleshooting row.
2. Add `parseAutoUnstickFlag`. Write one test per input class. Update every "default off" sentence.
3. Write `no-local-paths.test.ts`.
4. Tighten commitlint, and write `commitlint.test.ts`.

**Validation gate (Phase 7).**
- Commands: the fast layers; `shellcheck scripts/check-no-local-paths.sh`; `bunx commitlint --from origin/dev --to HEAD`.
- Pass: all exit 0. The commitlint run checks every branch commit, not only one subject.
- Layers: lint, unit.

### Arc 4: audit backlog and the gate

#### Phase 8: bumps, classification, gate ✓

1. Run `bun audit fix`, holding vitest out. Review `bun pm diff` for each bump. Drop any bump the age gate refuses.
2. Bump `vue` to 3.5.42.
3. Build the extension. Classify each remaining advisory against `THIRD-PARTY-NOTICES.txt`.
4. Write `audit-acks.json`. Write `audit-gate.ts` and its tests:
   - one test per refused class: no ack; an ack whose range or severity changed; a stale ack; a malformed report; a tool exit code other than 0 or 1
   - a success control: a fully acknowledged report
5. Change the CI step and `pr-quick.yml`'s `changes` job. Test `auditMode`: a Release PR's real diff (root and extension `package.json` versions, the `bun.lock` workspace version) gives `report`; one added dependency, a changed range, a `bunfig.toml` change and an ack-file change each give `enforce`. Pin in `audit-gate.test.ts` that only the `changes` job's output selects `enforce`.
6. Rewrite SECURITY.md's paragraph and add the table. Update CLAUDE.md's Dependency policy line.

**Stop rule.** If a remaining advisory is bundled and its reason cannot say why the extension cannot reach it, stop. Record it in `OWNER-ASKS.md` instead of acknowledging it.

**Validation gate (Phase 8).**
- Commands:
  - the fast layers
  - `bun install --frozen-lockfile --force`
  - `bun audit --audit-level=low --json > <scratch>/audit.json; bun scripts/ci-cd/audit-gate.ts <scratch>/audit.json --exit-code $? --mode=enforce`
  - `bun run --cwd apps/extension build:chrome && bun run --cwd apps/extension build:firefox`
  - `cd apps/extension && bun run test:e2e -- --retry=0`, then the same with `NULO_E2E_BROWSER=firefox` (for the `vue` bump)
- Pass:
  - the gate script exits 0 and prints zero unacknowledged, zero stale and zero malformed entries (`bun audit` itself exits 1 while acknowledged findings remain; that is expected)
  - every other command exits 0
  - every ack carries a non-empty `reason` and `revisit`
- Layers: lint, typecheck, unit, build, smoke e2e on both browsers.

## Security & Adversarial Considerations

**Threat model.**
- Who:
  - a compromised GitHub Actions step, third-party action or npm dependency running in a release job
  - a leaked App installation token
  - a write-access account (today the owner only)
  - a compromised npm publisher, Foundry release host or Aztec install host
  - any web page a Nulo user visits
- Assets: what a release zip contains and proves; which commit a tag names; CI runners that hold the App key, OIDC and store credentials; the user's anonymity toward web pages.

**What each control stops, and what it does not.**
- *Tag rulesets (S1, S2).*
  - They stop moving or deleting a release tag, and creating a stable or rc tag from any actor but the App and the owner.
  - They do not stop the owner, or a stolen owner credential (an admin can edit rulesets).
  - They do not stop the App: a stolen App key can create a tag at any commit. Such a tag cannot reach the stores, because `resolve`'s `on_main` must hold and the store environments allow `main` only with the owner's review. It can produce a GitHub Release whose attestation names that commit, which the notes' `--source-digest` exposes to anyone who checks.
- *Immutable releases (S3).*
  - It stops anyone from replacing an asset of a published release or moving its tag.
  - It does not stop deleting the release (the tag name is then retired for good), or editing its notes. That is why the verify text tells users to check the attestation, which is not part of the notes.
- *Attestation.*
  - It binds each zip's digest to this repository, the workflow file and the exact commit.
  - It does not prove the workflow was benign: a malicious commit merged to `main` gets a valid attestation.
  - `--signer-workflow` alone matches the workflow on any ref; `--source-digest` is what pins the commit.
- *Digest read-back before and after publishing.*
  - The first read-back stops a draft that changed after upload from being published.
  - The second detects a change made between that check and the publish call by another holder of `contents: write`. That window cannot be closed, because GitHub has no compare-and-publish call. The job fails loudly, and the immutable release then shows what it holds.
- *Clean signing jobs.* A job with `id-token: write` lets every step mint a signing certificate. Removing the dependency install, git-cliff and the persisted checkout token from those jobs leaves our own scripts, GitHub's first-party actions and `oven-sh/setup-bun` (pinned by SHA, already trusted to install Bun in every job). A compromised `oven-sh/setup-bun` remains an accepted residual.
- *Narrow App tokens.*
  - They limit what a token leaked from a release job can do, and pin the set against future App permission grants.
  - They do not narrow `GITHUB_TOKEN`, which `attach-assets` and `publish-nightly` still hold with `contents: write`.

**Least privilege.**
- `auto-unstick`'s `GITHUB_TOKEN` drops to `contents: read`.
- `attach-assets` and `publish-nightly` add `id-token: write` and `attestations: write`, and hold no install step and no third-party action except Bun's setup.
- `sync-main-to-dev` stops persisting an App token in `.git/config`.
- No secret is created, printed or stored.

**Supply chain.**
- `actions/attest-build-provenance` v4.2.2 is pinned by SHA (`4d101475…`). It is a composite wrapper over `actions/attest@508db95d… # v4.2.1`. Both are GitHub's first-party actions, older than 7 days (published 2026-08-06 and 2026-07-29).
- The npm tree for the Aztec CLI moves from "resolved at install time, scripts on" to "a committed lockfile with integrity, scripts off, an explicit rebuild allowlist". The trust root becomes the registry at lock time (trust on first use), plus review of the lockfile diff at each Aztec bump. The two `@aztec-labs` packages stay exempt from the age gate, as today; their bytes are now locked by integrity.
- Foundry moves from a moving `HEAD` script plus an unverified binary to one SHA-256-pinned tarball, checked once against Foundry's own GitHub attestation.
- Accepted residual: a restored toolchain cache is trusted after `--version` probes only. A run restores caches written on its own ref or on `dev` (the default branch), and a pull request writes only its own, so a poisoned entry that `dev` or `main` restores needs code merged to one of them.
- Accepted residual: git-cliff-action still downloads an unpinned git-cliff binary, now in a read-only job whose only output is the notes text.
- Accepted residual: releases published before S3 stay mutable for good. A dispatch with `--ref <pre-Arc-1 tag>` runs that tag's old workflow, which still uploads with `--clobber`, and nothing in new code can stop it. Only write-access accounts can dispatch, and the runbook forbids it (A11).
- `bun audit` becomes blocking for dependency changes. An acknowledgement is added only through a reviewed PR, and a stale one fails.

**Crypto.** None implemented. Sigstore signing and verification come from `actions/attest` and `gh attestation verify`.

**Input validation at trust boundaries.**
- The tag name reaching shell is already constrained by `resolve` and the notes-range regex. The runners pass it as an argument array, never through a shell string.
- REST JSON is parsed with type guards that fail closed on missing fields.
- `audit-gate.ts` treats the audit JSON as untrusted: a malformed report is a failure in `enforce` mode, never "clean".

**Domain risks.**
- *Frontend (#22).* Closed: the content script ships as one file the browser injects directly, so the built manifest lists no web-accessible file and a page cannot fetch one at the extension's fixed URL. A regression fails twice: the build refuses the loader crxjs emits for a script that imports a chunk, and the smoke check fetches every injected file from a page on both browsers. `use_dynamic_url` was measured and reverted (Phase 5). Residual: the content script still runs on every page, as the protocol requires; a page learns of the wallet through discovery only after the user approves it in a popup (SECURITY.md § Content script injection).
- *Workflow injection.* No new `${{ }}` interpolation into `run:` scripts. Values reach scripts through `env:`.

## Assumptions

### Facts (verified)

- F1. Only two rulesets exist, both branch rulesets (`24609904`, `24609903`), and no tag ruleset (`gh api repos/nulo-sh/nulo/rulesets`, 2026-10-08).
- F2. Immutable releases is off, and the endpoint exists: `GET repos/nulo-sh/nulo/immutable-releases` → `{"enabled":false,"enforced_by_owner":false}`.
- F3. App `nulo-sh-release` has id 5179103, with contents, issues and pull_requests write and metadata read (`gh api apps/nulo-sh-release`).
- F4. The owner is user id 2982991 and the only admin collaborator. The org plan is `team`, and the repository is public (which attestations on Team need).
- F5. `auto-unstick` pushes the tag with `GITHUB_TOKEN` and creates a published, empty release (`release.yml:132-147`, `auto-unstick-run.ts:161-180`).
- F6. `attach-assets` uploads with `--clobber` and edits the notes after the release is public (`release.yml:425-433`).
- F7. No code in `.github`, `scripts` or `package.json` deletes or moves a `v*` tag, or deletes a release (recon search trail). The one exception is manual: CLAUDE.md:679 tells the owner to "delete/fix the bad tag" after an auto-unstick abort, and S1 turns that into the repair procedure.
- F8. No workflow triggers on a tag push or a release event.
- F9. release-please-action calls `createReleases()` unless `skip-github-release` is set. Neither release config sets `draft` (recon, after the audits).
- F10. On an immutable release, title, notes and prerelease/latest status stay editable. Drafts are not locked. Enabling affects future releases only. A deleted immutable release's tag name cannot be reused (docs.github.com, "Immutable releases").
- F11. `actions/attest-build-provenance` v4.2.2 is commit `4d101475d8b20a2381f78447822ac1eab6504dd8`. It records the workflow run's commit as the source digest, not the checkout's.
- F12. The pinned Aztec installer is one `{ … main "$@"; exit }` block with `install_foundry` and `install_aztec_packages` as named functions. It honours `AZTEC_HOME`, `INSTALL_URI` and `NARGO`. `versions` names Foundry 1.4.1.
- F13. `global-setup.ts:73` honours `AZTEC_HOME`.
- F14. The CLI's npm tree has 1,118 packages; 7 of them have install scripts (lock-only resolve, 2026-10-08).
- F15. crxjs 2.7.1 hard-codes `use_dynamic_url: false` for content-script entries. Its `standaloneFiles` output is an emitted asset that the notices policy refuses.
- F16. `bun audit` exposes `--ignore=<id>` and no config file. `bun audit fix --dry-run` fixes 31 of 72 advisories.
- F17. Biome over `scripts/` reports 7 errors, 20 warnings and 6 infos, and reformats 38 files (scratch-copy probe). At arc 3 the reformat touched 39 files and `interpretPreflight` scored 29; the seven errors held.
- F18. Root `package.json` declares no `typescript` and no `@types/bun`.
- F19. All 17 commit subjects on `dev` are lower-case. **No longer held at arc 3:** #48's subject names `grantPublicAuthwit`; CLAUDE.md now says identifiers go in backticks or quotes, which commitlint does not case-check (measured).
- F20. The network e2e lanes' path filters include `.github/actions/setup-aztec/**`.
- F21. The `production` environment has no protection rule. The two store environments allow `main` only and need the owner's review.
- F22. `zip-reproducible.ts` shells out to the system `zip`.
- F23. `orhun/git-cliff-action` downloads git-cliff at run time.
- F24. `vue` 3.5.42 was published 2026-08-27, `@types/bun` 1.4.2 on 2026-09-08 and vitest 4.1.11 on 2026-08-18; all are past the 7-day gate.

### Inferences (unverified; attack these)

- I1. release-please picks the merged Release PRs to publish by the `autorelease: pending` label, and finds the previous release through its tag (release-please 17.6.0 source, recon). With `skip-github-release: true` it never publishes, and the abort becomes the normal path that auto-unstick resolves. Check: the first release after Arc 1 reaches `main`.
- I2. Between `auto-unstick`'s tag and `attach-assets`' publish (or after a failed publish), the version has a tag and at most a draft. A push to `main` in that window runs release-please, which finds the version's tag and builds the next Release PR from it. Source supports this; a green release does not prove it, because nothing lands on `main` in the window. If wrong, release-please reopens or mis-versions the next Release PR, which is visible and reversible before merge. Mitigation: the runbook says to finish or re-run a failed publish (`--ref <tag>`) before merging anything else to `main`, and the owner's optional rehearsal (A1) includes the interrupted case.
- I3. An App installation token can create a tag ref through the REST API, without the `workflows` permission, when the tag points at a commit already on `main` whose tree contains workflow files. release-please does the same with the same kind of token. If wrong: `auto-unstick` fails red, and the manual unstick is the fallback. S2 condition 2 makes the first release prove it before S2 is on. The nightly's `GITHUB_TOKEN` ref creation is the same server-side check that `auto-unstick`'s `GITHUB_TOKEN` tag push passes today (F5).
- I4. `gh attestation verify` inside `attach-assets` can read the repository's attestations with the job's `GITHUB_TOKEN` (`attestations: write` covers read).
- I5. The rulesets API accepts `actor_type: "User"` on a tag ruleset (the live branch rulesets carry it). The fallback is `RepositoryRole` 5.
- I6. Chrome 130+ serves a `use_dynamic_url` entry to the crxjs loader's `import(chrome.runtime.getURL(...))`, and the chunk's relative imports resolve under the same dynamic origin. Phase 5 measures it. If wrong, #22 stays open. **Did not hold** (Chrome 152): the first import loads from the dynamic URL, but its relative imports resolve against the fixed origin and are refused. #22 was closed by step 1 instead.
- I7. The CLI runs with `--ignore-scripts` plus at most a `bcrypto`/`leveldown` rebuild. Phase 4 measures it. **Held:** `bcrypto` only (`@aztec-labs/aztec-node` cannot load without its binding); leveldown loads its bundled prebuild.
- I8. git-cliff's release-level `{{ commit_id }}` renders the tag's commit. Phase 3 measures it, and the placeholder is the fallback. **Did not hold** (Phase 3, git-cliff 2.14.2, the version `orhun/git-cliff-action` v4.9.1 installs): with `--include-path 'apps/extension/**'` it renders the newest commit the path filter keeps (a scratch rc tag at `50540c8` rendered `3b80761`). The template prints `@SOURCE_COMMIT@`, which `attach-assets-run.ts` replaces with the tag's commit; the renders then name the tag's commit for stable, rc and nightly.

### Asks (for the orchestrator; working assumption in each)

- A1. **S2 and S3: timing and who applies them.** They need Arc 1 on `main` (an owner-run promote), a green release on the new flow, and no in-flight runs. S3 is partly irreversible. Working assumption: the implementing session applies S1 only. S2 and S3 go into `follow-ups.md` with their exact calls and conditions, for the owner, or for the orchestrator on the owner's explicit go. Optional: the owner rehearses in a scratch repository first: draft-then-publish under immutable releases, and an interrupted release (tag created, publish cancelled, then a push to `main`) to check I2.
- A2. **Nightly in scope**: attestations, the shared publish path, `resolve` on `github.sha` with a `dev` ref guard. Working assumption: yes, so the shared notes stay true.
- A3. **vitest** stays at 4.1.10 with its two advisories acknowledged (exploit condition stated), because a bump triggers the soak matrix. Working assumption: acknowledge.
- A4. **Audit gate scope**: every severity; enforced on pull requests whose dependency-file diff is more than version lines; reported everywhere else, so Release and sync PRs report and a promote enforces. The accepted cost is stated under Arc 4. Working assumption: as proposed.
- A5. **`vue` 3.5.42**, a production dependency patch, is bumped in Arc 4 with the smoke suite on both browsers. Working assumption: yes.
- A6. **S1 without a bypass** (repair by briefly disabling the ruleset). Working assumption: as proposed.
- A7. **The `cliff.toml` text** above is approved with this plan. Working assumption: yes, because the brief asks for the verify command there.
- A8. **Four arcs, not three.** #20 gets its own PR. Working assumption: yes, as both audits asked.
- A9. **Nightly retention.** Under S1 and S3, nightly tags and releases are never deleted, so one accumulates per day. Working assumption: keep them protected, and record a follow-up for the owner to choose a retention rule (S1 can exclude `v*-nightly.*` later).
- A10. **Publish dispatches run with `--ref <tag>`** (manual unstick, rc). This replaces the runbook's `--ref dev` rule for rc publishes; store submissions stay on `--ref main`. Working assumption: yes.
- A11. **Store submission needs an attested release.** Every release published before Arc 1 (the latest is v0.30.2) has no attestation, so a `--ref main` store dispatch for it refuses; submitting such a version means a manual dashboard upload or a new release. A dispatch with `--ref <pre-Arc-1 tag>` runs that tag's old workflow, which replaces assets with `--clobber`; the runbook forbids it, and S1 does not stop asset replacement on those mutable releases. Working assumption: accept this compatibility boundary rather than weaken verification.

## Alternative outline considered (cheapest-first)

A second, independent outline was drafted before the audits and given to both reviewers:

- **Arc 1:** keep today's lifecycle, but make `auto-unstick` and the runbook create the release with `--draft`. Add one `gh release edit --draft=false` at the end of `attach-assets`. Keep `--clobber`. One tag ruleset (deletion, non-fast-forward, creation) with the GitHub Actions app, the release App and the owner as bypass actors. Attest release zips only. Branch the notes template on `-nightly`.
- **Arc 2:** replace the upstream installer with our own steps. Fix #22 with `use_dynamic_url: true` through a manifest hook.
- **Arc 3:** block `bun audit` at `high` with `--ignore` flags inline in the workflow, reasons in SECURITY.md. Everything else as in the main plan.

Its appeal: a smaller diff in Arc 1, no new TypeScript module, one ruleset.

## Decision ledger

| Decision | Chosen | Rejected | Source and reason |
|---|---|---|---|
| Who creates the GitHub Release | `attach-assets` only (draft, verify, publish) | auto-unstick creates a draft (alternative outline) | Planner; both audits agreed. One owner, and the runbook loses the line that can burn a version. |
| release-please publishing | `skip-github-release: true` | `draft` + `force-tag-creation`; leave as is | Codex [High] and Opus [High] found that a bug-fixing bump would publish an empty release. `skip-github-release` (Opus's first option) keeps a single tag creator; `draft` + `force-tag-creation` (Codex) would keep two. |
| Store submission on a published release | ship the downloaded, checksum- and attestation-verified published bytes | require rebuild equality | Codex [High] and Opus [High]: zip bytes depend on the runner's `zip`, and Chrome builds have no reproducibility proof. |
| Provenance commit | publish only when `GITHUB_SHA` equals the tag commit; publish dispatches use `--ref <tag>`; notes pin `--source-digest` | attest whatever the run checks out; pin `--source-ref` | Codex [High] (provenance named the dispatch branch's commit). Opus [Medium] asked for `--source-ref`; rejected because stable releases legitimately come from `refs/heads/main` (push) and `refs/tags/v…` (dispatch), and `--source-digest` pins the commit on either. |
| Signing-job hygiene | no install, no persisted token, step-level tokens, git-cliff moved out | keep the composite install and job-wide `GH_TOKEN` | Opus [High]; Codex [Medium]. `id-token: write` exposes signing to every step. |
| Tag creation in auto-unstick | REST `git/tags` + `git/refs` with the App token | `git push` with an App token in `.git/config` | Opus [High] (the token sat in `.git/config` during an install). REST is what release-please itself does. |
| plan/apply race | `apply --expect`, re-read by id, refuse on more than one release for the tag, compare again after publishing | trust the plan output | Opus [Medium], Codex [Medium]. The remaining window is stated honestly under § Security. |
| REST instead of `gh release` subcommands | `gh api` only | `gh release view/upload/edit` | Opus (Facts): the runner's `gh` is not pinned, and `isImmutable`/`digest` depend on its version. |
| Nightly | same runner, attested, `resolve` on `github.sha` with a ref guard | gh's single `release create` call with no read-back | Codex [Medium], Opus [Low]: the quality bar claimed a read-back that nightly lacked. |
| Settings split and timing | S1 when the PR is green; S2 + S3 after the promote, a green release and no in-flight runs; applied by the owner or on the owner's go | apply all three when the PR is ready (brief) | Planner; Codex [High] (transition, in-flight runs), Opus (A1, irreversibility). |
| `update` rule, no S1 bypass, nightly excluded from S2 | kept | combined single ruleset with bypass actors (alternative) | Both audits: bypass actors would also bypass deletion and update. |
| Runbook transition | a dated transition note, removed with S2/S3 | rewrite the runbook in one step | Codex [High]: `main` runs the old flow until the promote. |
| #22 | measure: drop the entry if the chunk has no imports, else `use_dynamic_url` via hook, else stop with an owner ask | `standaloneFiles` first (draft plan) | Codex [High] and Opus: the IIFE is an emitted asset the notices policy refuses, and claiming it would weaken a gate. Opus's "drop the needless entry" is step 1. |
| Installer | source the verified installer and override two functions, with `declare -F` checks and an x86_64 guard | replace it; patch file | Both audits accept the override (Codex: a patch is equally reviewable; not chosen for readability). |
| Audit gate scope | every severity, enforce on dependency-touching PRs, report elsewhere | enforce on every PR (draft plan); `high` with inline ignores (alternative) | Opus (A4): a new advisory or a withdrawn one would red Release and sync PRs to `main`. Codex accepted PR-only enforcement but asked for the risk to be stated, which § Arc 4 does. |
| Ack matching | id + package + range + severity, tool exit code passed in | id only | Codex [Medium]. |
| Arc count | four (#20 alone) | three (brief) | Opus [Implementation]: the reformat, a production bump and a new gate in one PR are not reviewable in one sitting. |
| Tagger lookup | none | `gh api users/<slug>[bot]` | Opus: a failure point for a cosmetic field. |
| Gate commands | `e2e:agent` from the root; `commitlint --from/--to`; manifest `git diff --exit-code`; the audit gate's own exit | the draft's commands | Opus and Codex found each draft command wrong or weaker than stated. |
| Signing-job checkout | the workflow's own revision; the built commit's time read with `git log` | checkout at `resolve.sha` with scripts taken by `git archive` (revised draft) | Final Codex [High]: an older tag's composite has no `install` input, so `install: "false"` was ignored and `bun install` ran under OIDC. |
| Nightly tag | `apply` creates the ref at the built commit before uploading, refuses one at another commit, re-checks after publishing | `target_commitish` on the draft | Final Codex [High]: GitHub ignores `target_commitish` for an existing tag, so a tag planted mid-run would be attested and locked. |
| Release PR selection in auto-unstick | require `mergeSha === headSha`; pick the PR by `merge_commit_sha` | first associated PR | Final Codex [Medium]: otherwise a wrong tag strands a version under S1 before the publish gate refuses. |
| Audit mode for Release and sync PRs | report when the dependency-file diff is version lines only | enforce on any path match; exempt by author or label | Final Codex [Medium]: Release PRs touch `package.json` and `bun.lock`. |
| Legacy store submission | refuse unattested releases (A11) | accept legacy releases on checksums alone | Final Codex [High]: the old releases carry no attestation; the plan does not claim what it cannot prove. |
| Hygiene test scope | strict in the four clean jobs; per-job action list and no persisted credentials in every other App or OIDC job | strict everywhere | Final Codex [Medium]: release-please and Google auth are required third-party actions. |
| Overclaims | Outcome 3 scoped to the Aztec toolchain; acks "only shrink" removed; OIDC "used only by the attest step" removed | — | Codex [Low], Opus (Facts). |
| Notes' source digest (implementation) | `@SOURCE_COMMIT@` in `cliff.toml`, replaced by `attach-assets-run.ts` with the tag's commit | `{{ commit_id }}` | Phase 3 render: I8 did not hold. |
| REST calls in `attach-assets-run.ts` (implementation) | `fetch` with `GH_TOKEN`, as `lock-version-run.ts` does | `gh api` | Uploads and downloads are plain HTTP there, and the plan's reason for REST (no dependence on the runner's `gh`) holds more strongly. `gh attestation verify` is the one `gh` call. |
| `plan` outputs (implementation) | `action` only; `PlanInput` also carries the tag | `action`, `create_draft`, `release_id` | Nothing read the other two (`apply` re-reads the state); the tag names the refusals. |
| Digest read-back (implementation) | up to three reads, 2 s apart, while an asset reports no digest | one read | A digest that lags the upload would otherwise refuse every publish; one that never appears still refuses. |
| Branch base (implementation) | rebased the unpushed plan commit onto `origin/dev` `e49e4ce` | merge | Four commits had landed, two in the workflows this arc edits; the branch was never pushed. |
| auto-unstick on a re-run (review) | a tag already at HEAD continues the publish, for a `pending` or `tagged` Release PR; only `pending` is ever tagged | continue on `create` only | A re-run after a failed relabel, or after a relabel whose attempt died, stranded a tag with no release. `concurrency: release` serializes runs and the publish is idempotent. |
| Nightly quiet-day skip (review) | skip only when a nightly tag at the commit has a published release | any nightly tag at the commit | The tag now precedes the draft, so an interrupted publish silenced every later run on that commit. |
| `install.sh` input (implementation) | `AZTEC_VERSION` from the caller's env, refused unless `cli/package.json` pins the same | read `apps/extension/package.json` itself | Both callers already read the pin; a fifth reader keyed by package name is one more site a rename misses (aztec-update skill). |
| Rebuild allowlist (implementation) | `bcrypto` | empty | Measured: `@aztec-labs/aztec-node` cannot be imported without its binding (Phase 4 lesson). Its script is a local `node-gyp rebuild`. |
| Node headers for the rebuild (implementation) | `npm_config_nodedir` in the rebuild's env | `--nodedir` flag | npm 11.19 warns that both forms will stop passing through; node-gyp reads the env var itself. A control run without it downloaded headers. |
| `docker-ci-like.sh` reinstall rule (implementation) | reinstall when a stamp of the whole action dir differs | reinstall only when `aztec-anvil` is missing | A volume installed by the old unpinned path would otherwise be reused forever; the stamp mirrors CI's cache key. |
| Caller pin (implementation) | `setup-aztec-pins.test.ts` also pins that both callers run `install.sh` and fetch no installer, with a mutated-copy control | lockfile and pin-file checks only | The regression this phase closes is a caller piping an installer again; one small check with its control. |
| #22 (implementation) | step 1, after isolating the content script's module graph with a resolve hook (one build) | ship `use_dynamic_url`; stop with an owner ask; a separate content-script Vite pass | Step 2 breaks discovery (measured). The isolated chunk is import-free, so crxjs drops the loader and the entry is unneeded; one build keeps every module under the notices plugin, so no gate loosens. |
| crxjs loader `VENDORED` claim (implementation) | removed | kept | It matched nothing once no loader is emitted, and the policy refuses a stale claim; without it, a content script that imports a chunk again fails the build. |
| `oven-sh/setup-bun` token (review) | the composite passes `token: ""` | the action's default (`github.token`) | The default handed the publish jobs' release-writing token to a third-party action; an exact version needs no API call. |
| Extension build scripts (implementation, arc 3) | typechecked by `apps/extension/tsconfig.scripts.json` (its `scripts/` and Vite configs), chained into the extension's `typecheck`, with `@types/bun` 1.4.2 declared there | leave them in no tsconfig; split to a follow-up | The orchestrator asked for a call. These Vite plugins shape the shipped bundle and nothing typechecked them; a probe found three errors. Codex: justified scope. Opus: not worth splitting, and its Medium (the `Bun` global resolved through the root's hoisted copy) made the extension declare its own pin. |
| Typecheck fixes (implementation, arc 3) | `moduleDetection: "force"`; `PublishResponse.warningInfo: unknown`; `string \| FormData` for the AMO body; a narrowing guard in `check-rp-id.ts` | casts or suppressions | Each type now says what the code already reads defensively; both reviewers checked every reader. |
| `bun pm diff` (implementation, arc 3) | the added root devDependencies reviewed through `git diff bun.lock` | `bun pm diff` | On Bun 1.4.2 a bare `bun pm diff` looks the root package up on npm (404); the lock diff is two packages, `@types/bun` and `bun-types` 1.4.2. |
| Home-path guard shape (review, arc 3) | add a home under a mount (`/mnt/<volume>/<user>`) to the shell guard, as the plans gate's `LOCAL_PATH_RE` already counts; the root user's home stays out, since container scripts use it | narrow CLAUDE.md's claim; name this host's prefix | Codex [Medium]: in CI the guard now stands alone, and it missed such homes. The generic shape matches the plans gate and names no host. |
| commitlint test runtime (review, arc 3) | the CLI runs on Bun (`process.execPath`) | rely on `_unit-tests.yml`'s Node 24 step | Opus [Low]: `@commitlint/cli` needs Node ≥ 22.12 and the test leaned on a step added for another reason; it behaves the same on Bun. |
| vue version (implementation, arc 4) | 3.5.42 exactly, floors raised to `^3.5.42` | 3.5.43, what `^3.5.42` resolves to | 3.5.43 adds a dozen runtime, reactivity and suspense changes past the fix; the plan names 3.5.42, the smallest bump that clears the advisory (phase 8 lesson has the resolution steps). |
| Ack file shape (implementation, arc 4) | groups that share `bundled`, `reason` and `revisit`, each listing its advisories (id, package, range, severity); an id appears once in the file | one flat entry per id | 23 undici entries would repeat one reason; a group keeps one sentence per cause, and every id still carries the fields it is matched on. |
| Exit code and report (implementation, arc 4) | exit 0 must come with `{}` and exit 1 with findings; anything else is unreadable | trust either alone | With `--audit-level=low` the two always agree; a disagreement means the tool did not do what the gate assumes. |
| Mode diff (implementation, arc 4) | `mode --base <sha> --head <sha>`: `git diff` from the merge base to the PR head, with `--no-textconv`, `--no-renames` and fixed prefixes; a hunk's lines are content, never headers | diff of the checkout's merge commit | The PR's own change, rendered the same whatever the runner's git config. |
| Audit step output (implementation, arc 4) | the gate's summary replaces the advisory `--audit-level=moderate` text dump; the JSON stays an artifact | keep both | One audit call, one summary that names what is acknowledged and why. |
| `changes` job timeout (implementation, arc 4) | 5 minutes | 2 | It now installs Bun and runs `git merge-base` on deps PRs; a timeout there would fail `quality-status`. |

**Unresolved disagreements.** None blocking.
- Opus preferred `--source-ref`; the plan pins `--source-digest` for the reason in the ledger.
- Codex's "rehearse I3 before S2" is met by S2's condition 2 (a real release with S2 off), not by a scratch repository: installing the App on another repository is a settings change outside this lane.

## Audit verdicts

### Codex (GPT-6.1 Sol, high), session `01a11c01-00ad-7ca2-b237-42eeee0b8718`

**Verdict:** `reject (with blocking findings: release-please can still publish early, legacy republish is incomplete, provenance identifies the wrong commit, and the standalone notices assumption is false)`.

Accepted:
- [High] release-please can publish: fixed with `skip-github-release`.
- [High] runbook transition incomplete and in-flight runs: fixed with the transition note and S2 conditions 3 and 4.
- [High] republish of a published release: fixed with the published-bytes path.
- [High] provenance names the dispatch commit: fixed with the commit-equality gate, `--ref <tag>` and `--source-digest`.
- [High] I6 (standalone passes notices) false: confirmed in `generate.ts:249-254` and `index.mjs:1350-1415`; dropped.
- [High] I4 (zip reproducibility) false: confirmed (`zip-reproducible.ts:44`); dropped.
- [Medium] read-back not atomic, and nightly had none: the second compare, nightly on the runner, and the residual stated.
- [Medium] privileged jobs install dependencies: fixed.
- [Medium] F7 contradicted CLAUDE.md:679: reworded.
- [Medium] ack matching by id alone: fixed.
- [Medium] gate commands (`baseline:complexity` regenerates; commitlint stdin lints one message; the audit's own exit 1): fixed.
- [Medium] I3 should be proven before S2: met by S2 condition 2.
- [Medium] A3 and A4 need explicit risk statements: added.
- [Low] "acks only shrink" and the broad "no unhashed code" claim: reworded.
- [Low] I1 is supported now: upgraded with the source cite.

Rejected:
- [Medium] "use direct pinned Bun setup" for privileged jobs. The plan uses the composite with `install: "false"` instead, so the Bun version stays in one place. Same effect.
- [Medium] the toolchain cache-hit integrity. Accepted as a residual: only a run on `dev` or `main` can write that cache key.

### Opus 5.5 (Plan agent)

**Verdict:** `conditional approve (with conditions: (1) jobs that hold id-token/attestations or an App token stop running bun install, stop keeping the checkout token, and set GH_TOKEN per step, with a test pinning this; (2) release-please can never create a published release, with a test pinning this; (3) apply uses the action plan chose and re-checks assets after publishing; (4) the verify command pins the ref; (5) a scratch-repo rehearsal of the draft flow and of I3 with immutable releases on, before S3, and the owner applies S2/S3 personally; (6) I6 moves to Asks and the broken gate commands are fixed)`.

Conditions:
- (1), (2), (3) and (6) are met as written.
- (4) is met with `--source-digest` instead of `--source-ref` (ledger).
- (5) is met in part. The owner applies S2 and S3 (A1). The rehearsal is a real release with S2 and S3 off (S2 condition 2), plus an optional owner-run scratch-repository rehearsal (A1), because installing the App elsewhere is outside this lane's authorization.

Also accepted:
- the `holdsWrite` coverage gap
- the `ReleaseState.immutable` messages
- the x86_64 guard, `CI=1` and a scratch home, the cache key on the whole action dir
- the lockfile test skipping `inBundle`/`link`
- the `@types/bun` Bun-bump site
- `e2e:agent` from the root
- the Arc split
- dropping the tagger lookup
- nightly retention (A9)
- the stale nightly comment
- gh version independence (REST)

### Final fresh Codex pass (GPT-6.1 Sol, high), session `01a11c1d-ea23-7bb1-8a79-2422acd41431`

**Verdict:** `reject (with blocking findings: legacy dispatches still run dependency installs with signing permissions, nightly publishing does not bind the actual tag target, and legacy store submission remains unsupported)`.

Each finding was checked against the tree and all are accepted. The plan above already carries the fixes:
- [High] On a store dispatch for an older tag, `attach-assets` ran that tag's `setup-bun` composite, which has no `install` input (`.github/actions/setup-bun/action.yml:39-40`). Fixed: every clean job checks out the workflow's own revision; the test pins it.
- [High] Nightly passed `target_commitish`, which GitHub ignores for an existing tag. Fixed: `apply` creates the ref at the built commit first, refuses one at another commit, and re-checks after publishing.
- [High] Legacy releases carry no attestation, so `verify-published` cannot pass for them, and an old-tag dispatch runs the old workflow. Fixed: A11 states the boundary; the runbook forbids old-tag dispatches; § Security records the residual.
- [Medium] `decideUnstick` never compares `mergeSha` with `headSha` (`scripts/release/auto-unstick.ts:60-70`), and the I/O takes the first associated PR (`auto-unstick-run.ts:132`). Fixed in Arc 1.
- [Medium] Release PRs change `package.json` and `bun.lock`, so path-based enforcement would hit them. Fixed: `auditMode` treats a version-only diff as report.
- [Medium] I2 is not proven by a green release. Accepted: I2 now says so, the runbook gains the finish-the-publish-first rule, and A1's optional rehearsal includes the interrupted case.
- [Medium] The hygiene test as written would reject `googleapis/release-please-action` and `google-github-actions/auth`. Fixed: strict rules for the four clean jobs, a per-job action list elsewhere.
- [Medium] The new notes job needs the `always()` guard on a dispatch (`release.yml:219-220`). Fixed and pinned.
- [Medium] The seeds demanded Phase 5 green although Phase 5 may stop; the loop used a 5-failure threshold. Fixed: a recorded Phase 5 stop counts as done; the threshold is 3.
- [Low] Two recon rows kept the superseded verdicts. Fixed in recon.md.

Rejected: none. No finding re-raised a ledger decision. The pass's "looks fine" list: S1 before the promote with S2/S3 deferred in both seeds; tag-ref publishing kept apart from main-ref store submission; published-byte verification for attested releases; notes passed as text; the four-arc split.

The implementing session's per-arc Codex loops review these fixes as built; no further plan round was run, per the mid tier's single final pass.

### Arc 1 implementation, Codex round 1 (GPT-6.1 Sol, high), session `01a11c4d-e378-7a60-9c0c-552bd1340f92`

**Verdict:** `approve with fixes`. Diff `1a2cbaa..a9f6cbd`. All four findings were checked against the tree and accepted; fixes in `cf8ecb3`.
- [Medium] `parseRelease` dropped `tag_name`, so a draft retargeted to another tag during upload was published (reproduced by the reviewer). Fixed: the record keeps the tag; `apply` refuses a draft that no longer belongs to the run's tag, before and after the publish; one regression test.
- [Medium] The nightly quiet-day skip counted any nightly tag at the dev commit, and the new flow creates the tag before the draft, so an interrupted publish silenced every later run on that commit. Fixed: only a published release counts (`GET releases/tags/<tag>`, which never returns a draft); an API error other than 404 fails the run. Both outcomes probed live; no unit test, since the logic is a shell step.
- [Low] The REST boundary had no real-data test. Fixed: an opt-in read-only probe (`NULO_RELEASE_PROBE=1`) reads v0.30.2, downloads `SHASUMS256.txt` and matches GitHub's digest, and reads an unknown digest as unattested. Passed locally.
- [Low] The `setup-bun` description carried history. Fixed: one line of contract.

### Arc 1 implementation, Opus 5.5 review (general-purpose agent, alongside Codex round 1)

**Verdict:** no High; two Medium. Diff `1a2cbaa..a9f6cbd`. Fixes in `cf8ecb3`.
- [Medium] A re-run of a failed `auto-unstick` found its own tag (`skip`) and emitted `unstuck=false`, so the run went green with a tag and no release. Accepted: `skip` continues the publish too (the release group's queue serializes runs, and the publish path is idempotent); CLAUDE.md gains the troubleshooting row.
- [Medium] Nothing pinned that a store submission ships the verified bytes. Accepted: `release-integrity.test.ts` pins `verify-published`'s guard and the artifact's source directory, one mutation each.
- [Low] The post-publish read was a single read while the pre-publish one settles. Accepted: both use the same settle loop; a lag test.
- [Low] `sync-main-to-dev`'s job token kept `contents`/`pull-requests: write` though every write uses the App token. Accepted: `contents: read`.
- [Low] `oven-sh/setup-bun` v2.2.0 has a `token` input defaulting to the job token (read at the pinned SHA: it is used only to list tags, which an exact version skips). Accepted: the composite passes `token: ""`, pinned by the test.
- [Low] `publish-nightly` lacked `!cancelled()`. Accepted.
- [Low] The quiet-day skip: same as Codex's second finding.
- [Low] Docs state S1 as applied before it is. Not a change: S1 is applied once this PR is open with green local gates, before merge, and its id replaces the placeholders.
- [Low] Stale comments (the REST claim beside `gh attestation verify`, "zero-API", the v4-abort framing, the staged-rollout tail in `release.yml`, an import kept alive by an export). Accepted, each rewritten or removed.
- Also folded: `privileged()` in the integrity test now treats `permissions: write-all` as privileged (found in self-review).

### Arc 1 implementation, Codex round 2 (same session)

**Verdict:** `approve with fixes`. Diff `a9f6cbd..cf8ecb3`; one finding, accepted, fixed in `eb03f15`.
- [Medium] The `skip` fix still stranded a release when the relabel landed but its attempt died before writing outputs: the retry saw `autorelease: tagged` and returned `noop`. Fixed: a Release PR labeled `tagged` whose tag names the merge commit continues the publish without a relabel; only a `pending` one is ever tagged; a `tagged` one with no tag stays a `noop`. Two tests, both shown to fail with the old label check.
- Its "looks fine": draft retargeting checked before and after the publish, the nightly skip, the live probe, the store-artifact pins, token narrowing, the cancellation guard.

### Arc 1 implementation, Codex round 3 (same session)

**Verdict:** `approve`, no new material findings, on diff `7a271a1..eb03f15`. The loop converged in three rounds.

### Arc 2 implementation, Codex round 1 (GPT-6.1 Sol, high), session `01a11d05-b909-7df3-9059-185cb4fc5280`

**Verdict:** `approve with fixes`. Diff `f5ca160..66ace77`. Fixes in `bfc90d6`.
- [Medium] `unhashedSources` exempted `link` entries, so a local directory would pass the "registry tarball" pin. Accepted: only bundled entries stay exempt; a `link` control added, shown to fail with the old exemption.
- [Low] The docker stamp replaced the binary-presence check, so a volume whose stamp matched but lost a tool skipped the install. Accepted: it reinstalls when any of the four tools `global-setup.ts` needs is missing, or the stamp differs.
- [Low] "Only a run on `dev` or `main` can write the cache" was too broad. Accepted: SECURITY.md and § Security now state GitHub's ref scoping.
- [Low] § Security still claimed #22 closed. Accepted: rewritten to the measured outcome.
- [Low] Comment density. Accepted for the test header and `install.sh`'s header (each cut to its contract). Rejected for the preflight comment in `action.yml`: unchanged by this arc, and still accurate.
- Its "looks fine": the overrides cover every Foundry and npm path of the pinned installer; the lockfile; the cache key and both lanes' filters; the #22 stop (no small supported option found); no release-path regression.

### Arc 2 implementation, Opus 5.5 review (general-purpose agent, alongside Codex round 1)

**Verdict:** `approve with small fixes`, no High or Medium. Diff `f5ca160..bfc90d6`. Fixes in `7eedad0` and the #22 commit.
- [Low] The cache-scope sentence (same as Codex's). Accepted, as above.
- [Low] The install could pass with a broken npm tree: a native package left unbuilt, or an override killed by SIGTERM, which upstream's `retry` counts as success (shown with a harness on the pinned installer). Accepted: each override sets `set -euo pipefail`, and the install ends by importing `@aztec-labs/aztec-node` (a negative control without the bcrypto build exits 1).
- [Low] `declare -F` proves only that the replaced functions exist. Accepted: `install.sh` checks each upstream body still holds the npm and Foundry lines it replaces.
- [Low] `--ignore-scripts` was not pinned. Accepted: `setup-aztec-pins.test.ts` pins it on `install.sh`.
- [Low] #22: a cheaper option than a separate build: the content chunk imports only three enums, so a resolve hook giving the content entry its own copies would make it import-free and let step 1 apply. Accepted and measured; it is how #22 closed.
- [Low] Comments: the stale preflight comment in `action.yml`, the `manifest.test.ts` comment repeating SECURITY.md, the description duplicating SECURITY.md. Accepted (each cut to one sentence or a pointer).
- Its "looks fine": errexit in the overrides, no network path left for Foundry or npm resolution, the pinned files, the lockfile, the Foundry member check, the cache key and filters, both Docker volume cases.

### Arc 2 implementation, Codex round 2 (same session)

**Verdict:** `approve with fixes`. Diff `66ace77..5a0e83b` (both reviewers' fixes and the #22 change). Fixes in the next commit.
- [Low] `SKILL.md` claimed `install.sh` refuses an npm step that installs another package; a second `npm install` line passes its anchor checks (Codex confirmed). Accepted: the skill now says the checks catch a lost anchor, not added work, and asks for both bodies to be read whole.
- [Low] The smoke check could leak its HTTP server if `newPage` or `page.close()` rejected. Accepted: the server closes in its own `finally`.
- [Low] The isolation plugin's comment promised every module stays isolated, while virtual ids and earlier resolvers are exempt. Accepted: cut to what the build guarantees (the current graph stays out of shared chunks; the notices policy refuses the loader if an import returns), plus one line on why virtual ids keep theirs.
- Its "looks fine": the round-1 fixes; both built manifests without `web_accessible_resources` and no loader asset; crxjs checks static and dynamic imports before emitting a loader; the notices collector keeps marked ids and strips the query for attribution; the manifest hook runs after crxjs's on both browsers; the smoke control; SECURITY.md, the README and the vendor-chunks comment describe the current build.

### Arc 2 implementation, Codex round 3 (same session)

**Verdict:** `approve`, no new findings, on diff `5a0e83b..2a6d556`. The loop converged in three rounds.

### Arc 3 implementation, Codex round 1 (GPT-6.1 Sol, high), session `01a11d62-3c4b-72b0-b3f7-bb081922c8fb`

**Verdict:** `approve with fixes`. Diff `3345189..bd6c67d`. All three findings checked against the tree and accepted; fixes in the next commit.
- [Medium] The shell guard, now the CI gate, matched only `/Users/` and `/home/`, so a home under a mount passed, and CLAUDE.md's new claim overreached. Accepted with the plans gate's generic shape rather than this host's prefix; the test seeds both shapes and fails without the new alternative.
- [Low] The `SUBMITTED_HOLDS` comment said the owner must act, which a `PENDING_REVIEW` verdict does not need. Accepted.
- [Low] Two helper comments restated their code. Accepted: `writeStrippedCopy`'s is cut to its invariant; `canaryJobFiles` loses its comment and labels its tuple instead.
- Its "looks fine": the reformat is formatting only (syntax-tree compare); the six splits keep behaviour; `warningInfo: unknown`; the extension scripts typecheck is justified scope; the auto-unstick flip leaves every runbook path intact; no automated commit subject breaks the case rule; the path-guard test proves refusal and recovery; the `STAGED` refusal (Chrome's own docs route a staged item back through "Cancel publish").

### Arc 3 implementation, Opus 5.5 review (general-purpose agent, alongside Codex round 1)

**Verdict:** approve once the Medium is fixed. Diff `3345189..bd6c67d`. Fixes in the same commit as Codex's.
- [Medium] `store-icons.ts` uses `Bun.Image`, and the extension scripts typecheck found `Bun` only because unplugin's types import `"bun"`, which resolved to the root's `@types/bun` through the isolated linker's hoist fallback. Accepted: the extension declares `@types/bun` 1.4.2 and lists `bun` in `types`; `--traceResolution` now resolves it from the extension's own `node_modules`. CLAUDE.md's Bun-bump list names both pins.
- [Low] A preflight test title still said "every documented non-pending state" though it covers the published revision only. Accepted. Its aside that the `STAGED` test's `PUBLISHED` control repeats that loop: kept, since the plan names that control and it sits beside the refusal it pairs with.
- [Low] The commitlint test claimed to mirror `quality-status`, and it needed Node ≥ 22.12 from an unrelated workflow step. Accepted: the header says what it runs, and the CLI runs on Bun.
- [Low] Open branches with an upper-case word in a subject go red. Accepted as one CLAUDE.md clause: identifiers go in backticks or quotes, which commitlint does not case-check (measured on all three quote forms).
- Its "looks fine": each refactor compared old against new (`interpretPreflight` order and messages, `readPublishInputs`, `rescore`'s cleanup, `formatDupReport`, the `Map` dedupe), every `warningInfo` reader, the auto-unstick flag (an unset variable renders `""`; the warning is a fixed string), the `STAGED` refusal blocks nothing the store accepts, both new tests fail on their mutations, every bot subject is lower-case.
- Also folded from self-review: a stale "(default path)" test title and the workflow comment's grammar.

### Arc 3 implementation, Codex round 2 (same session)

**Verdict:** `approve`, no new findings, on diff `bd6c67d..d8893c7`. The loop converged in two rounds. Its "looks fine": no tracked file matches the mount shape; the extension's `@types/bun` pin reuses the locked 1.4.2, changes no resolution and adds nothing to the notices; the commitlint test needs no ambient Node; the comments.

### Arc 4 implementation, Codex round 1 (GPT-6.1 Sol, high), session `01a11dd8-a43b-7d52-a4bd-d2292d973554`

**Verdict:** `approve with fixes`. Diff `86a89c5..44b0dae`. All three findings checked against the tree and accepted; fixes in the next commit.
- [Low] The version exception accepted nested keys, so a dependency or override named `version` (an npm package of that name exists) read as a version line. Accepted: only a manifest's own field (one indent) and a lockfile workspace's (six spaces) pass; one regression case, shown to fail with the old pattern. A real such dependency also adds a lockfile package entry, which enforced already; the rule is now exact anyway.
- [Low] The summary's acknowledged table omitted the reason. Accepted: a Reason column.
- [Low] Two test helper comments restated their filters. Accepted: deleted.
- Its "looks fine": the refused classes, the lint gate running on every dependency PR, the merge-commit checkout holding both parents, the acknowledgement chains, no new credential or write permission, no runbook path touched.

### Arc 4 implementation, Opus 5.5 review (general-purpose agent, alongside Codex round 1)

**Verdict:** the gate logic and the acknowledgements are sound; two Medium in the wiring. Diff `86a89c5..44b0dae`. Fixes in the same commit as Codex's.
- [Medium] Nothing pinned that `enforce` reaches the gate: dropping pr-quick's `audit_mode`, or hard-coding the step's mode, kept every test green. Accepted: the wiring test pins both, with one mutation each.
- [Medium] A git failure in the mode step failed `changes` and so every gate (a base commit a force-push left unreachable, replayed by a re-run). Accepted: the PR loses the exemption (`enforce`) with a warning and the job passes; one test.
- [Low] The mode line printed a changed line raw, so a `\r` in it could start a workflow command. Accepted: CR and LF replaced.
- [Low] CLAUDE.md omitted the unreadable-result cause. Accepted.
- [Low] `mismatch` on `package`, and the `revisit` check, had no test. Accepted: one row and one expectation.
- [Low] The first group's reason said "transports" and "only in tests and the e2e harness", while `apps/extension/scripts/seed-preflight-node.ts` loads foundation's JSON-RPC client from Node. Accepted and checked: the preflight passes its own fetch, and foundation keeps undici in `client/undici.js`, which that client never imports; the reason now says so.
- Not changed: commit 1's subject says "patch bumps" though axios, fast-copy and qs move a minor within their ranges; the squash takes the PR's title and body.

### Arc 4 implementation, Codex round 2 (same session)

**Verdict:** `approve`, no new findings, on diff `44b0dae..43c766d`. The loop converged in two rounds. Its "looks fine": the fallback always enforces, warns and keeps the gates running, while bad arguments and enforce-mode findings still fail; the indentation rule accepts the real release lines (an in-memory diff from the root and workspace manifests and `lockWithVersion` reported) and refuses nested keys; the new tests and their mutation controls; the Reason column's escaping; the corrected acknowledgement.

### Final cross-arc pass, Codex (GPT-6.1 Sol, high), session `01a11de4-cf0e-77e3-9fc1-ae8d5590edc6`

**Verdict:** `approve with fixes`, on the four arcs together (`ce7b646`, `3345189`, `86a89c5` and arc 4's diff). Both findings checked and accepted; fixes in the next commit.
- [Low] The gate's log escaped CR and LF but not `##[`, which the runner's legacy parser accepts anywhere in a line, so a manifest line could still forge an annotation; the store runner already escapes it. Accepted: `command` and a `plain` line helper escape it the same way; one test, shown to fail without the escape. Two small copies of the escaper (the gate's and the store runner's) stay separate: two sites, and the reviewer saw no duplication worth a shared module.
- [Low] `release.yml`'s `resolve` step still said release-please tags on a push and told the operator to check release-please, which arc 1 turned off. Accepted: the comment and both errors name auto-unstick; `resolve-tag.ts`'s copy of the message follows.
- Its "looks fine": signing-job isolation, the audit mode reaching the gate, `scripts/` lint and typecheck covering arc 4, the stable, rc, nightly and store paths; `.github/actions/setup-aztec/cli/package.json` selecting `enforce` matches the plan's broad filter.

### Final cross-arc pass, round 2 (same session)

**Verdict:** `approve`, no findings, on `c40b4b2`. The cross-arc loop converged in two rounds.

## Post-implementation

The implementing session runs these steps from this file. `code_review` is `off`, so there is no `/code-review` pass.

**Placement (multi-arc).** Steps 1-2 run per arc, at each arc boundary, after the arc's phases are green and before `gh stack add` opens the next arc. They are scoped to the arc's diff while the arc is the stack tip. After all four arcs, one final cross-arc pass runs. Then Delivery, then the close-out, then the teardown after the merge.

1. **Codex audit of the arc.** Run `CODEX_ACCOUNT=alejo-gmail ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`. The common brief's `gmail` name does not resolve on this host; `codex-usage list` names `alejo-gmail` and `alejo-icloud`. On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. The prompt carries:
   - the arc's diff (`git diff <arc base>...HEAD`)
   - this `plan.md` and its decision ledger
   - the arc map: "this is arc N of 4; arc 1 release integrity, arc 2 pinned toolchain and the content-script fix, arc 3 release and tooling guards, arc 4 the audit gate"
   - the adversarial ask: "What could go wrong? What would an attacker target? What are we trusting that we shouldn't? Where are the supply-chain / crypto / least-privilege weaknesses? Which runbook path (auto-unstick, manual unstick, publish dispatch with `--ref <tag>`, store submission on a published release, rc, nightly) does this break?"
   - the no-over-engineering rule, verbatim: *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - the comment-quality rule, verbatim: *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop.**
   - Verify each finding against the tree first.
   - Apply the accepted fixes and commit them.
   - Log the round (the consult, the verdict, and what was accepted and rejected with reasons) in `lessons/phase-N.md`.
   - Resume the same Codex session with `~/.claude/skills/codex/scripts/resume-codex.sh "" <followup-file> <codex-dir> high` and the fix diff, under the same two rules.
   - Repeat until a round brings no new material finding. Rejected nitpicks do not count.
   - After three rounds with material findings, stop and report `ARC_FAILED`.
3. **Final cross-arc pass.** Open a fresh Codex session (same command) on the net diff from `origin/dev` at the plan base. Ask for cross-arc issues: seams between arcs, duplication across arcs (for example two wrappers around the release REST calls), drift from this plan. Use the same two rules and the same loop.
4. **Delivery.** See § Delivery. PRs open only now.
5. **Close-out** (the stack's docs-only top layer, after the arc PRs exist):
   - Merge `origin/dev` into the branch. Read what changed in `implementations-plan/index.md`, `lessons.md` and `follow-ups.md`; never a union merge.
   - Write `## Outcome` directly after the front matter: the date; the status; what shipped, with PR numbers; what was dropped and why; S1's ruleset id; S2 and S3 as pending; one line that retires this plan's `/goal` and `/loop` seeds.
   - Promote the generalizable gotchas to `implementations-plan/lessons.md`, one line each, linking `archive/supply-chain-release/plan.md#<anchor>`. Stay under 8 KiB: dedupe first, retire what an entry supersedes, and date tool-version facts.
   - Move the open items to `implementations-plan/follow-ups.md`:
     - S2 and S3, with the exact calls and the four conditions
     - removing the runbook transition note
     - the store-match check
     - the Node and Bun bootstrap in `docker-ci-like.sh`
     - the live proofs pending the next release
     - nightly retention (A9)
     - #22 if it stopped
   - Delete the entries this lane resolves:
     - "Attest the release zips"
     - "The Chrome preflight lets a STAGED revision through"
     - "The auto-unstick switch's next stage is due"
     - "The home-path guard runs only as a local hook"
     - "Lint and type-check the root scripts/ tree"
     - "commitlint accepts a subject CLAUDE.md forbids"
   - Delete `STATUS.md`.
   - Run `git mv implementations-plan/supply-chain-release implementations-plan/archive/supply-chain-release` in its own commit. Repair the links broken by the extra directory level. Move the index line to `implementations-plan/archive/index.md`.
   - Comment on every issue whose fix was left out or did not hold, with the reason. Leave that issue open.
6. **Teardown after the merge.** The trigger is `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/supply-chain-release/plan.md`. When it succeeds, run `agent-worktree done supply-chain-release --merged`.
   - The session was started inside the worktree, so there is no `ExitWorktree`.
   - The helper refuses rather than forces. Relay a refusal and stop.
   - Who notices the merge: a `/loop` session checks on every firing. A `/goal` session arms one background wait right after its wrap-up report (`Bash` with `run_in_background` at the maximum timeout: `until <the check above>; do sleep 300; done`), and otherwise checks at the start of its next turn.
   - In this program the orchestrator merges, so it may run the teardown itself.

## Delivery

One `gh stack`, one PR per arc, plus a docs-only close-out layer. `code_review: off` on every arc.

| Arc | Branch | Phases | Stacks on | PR title (≤ 93 chars) | Closes |
|---|---|---|---|---|---|
| 1 release integrity | `worktree-supply-chain-release` (adopted) | 1-3 | `dev` | `ci(release): attest release zips, publish via draft, narrow app tokens` | refs #21 (closes it once S3 is read back) |
| 2 toolchain + install privacy | `supply-chain-release-arc2` (a new stack off `dev`: arc 1 had merged) | 4-5 | `dev` | `fix: ship the content script as one file and pin the aztec toolchain install` | #12, #22 |
| 3 release and tooling guards | `supply-chain-release-guards` | 6-7 | arc 2 | `ci: lint and typecheck scripts/, staged-preflight refusal, auto-unstick on by default` | — (follow-ups) |
| 4 audit gate | `supply-chain-release-audit` | 8 | arc 3 | `ci(deps): clear the audit backlog and block unacknowledged advisories` | #20 |
| close-out | `supply-chain-release-close-out` | — | arc 4 | `docs(plans): close supply-chain-release` | — |

Mechanics (agent-safe forms):
- Start: `gh stack init --adopt worktree-supply-chain-release --base dev`.
- At each arc boundary, after that arc's Codex loop has converged: `gh stack add <next branch>`.
- Publish, only after every loop and the cross-arc pass: `gh stack submit --auto`, then `gh pr edit <n> --body-file <file>` for each PR. Each body says what changed and why, the validation run with outcomes, and `Closes #n` where the table says so. It ends with the generated-with line.
- Then `gh stack add supply-chain-release-close-out`, the close-out commits, and `gh stack submit --auto` again.
- Open each PR without labels. Add `e2e:extension-smoke` afterwards on Arc 4 if its path filter would skip the smoke suite the `vue` bump needs.
- Watch with `gh pr checks <n> --watch`. Merging is the orchestrator's call.

## Post-implementation hardening

Not scheduled (Phase 0 answer). The surface touches CI/CD and publishing. A `/harden security` pass before the first public store listing would cover it; CLAUDE.md's follow-up for Chrome's Public visibility already names one.

## Seeds (draft; finalized after approval)

Use exactly one per session. They do not compose.

**Recommended: `/goal`** (completion is visible in the transcript):

```
/goal All phases 1-8 marked ✓ in implementations-plan/supply-chain-release/plan.md, each backed by its validation gate reported passing in the transcript (Phase 5 may instead be marked stopped, with its measurement, OWNER-ASKS.md and the #22 comment in the transcript); for each phase `LESSONS_FILE=implementations-plan/supply-chain-release/lessons/phase-N.md` printed; S1 applied and read back with its ruleset id recorded in plan.md and CLAUDE.md, and S2/S3 NOT applied but handed over in follow-ups.md with their exact calls and four conditions; `/code-review` NOT run (code_review: off); the Codex fix loop converged for arcs 1, 2, 3 and 4 at their boundaries and for the final cross-arc pass, each evidenced by a resumed Codex pass with no new material findings quoted in the transcript; the stack of 4 arc PRs plus the close-out PR exists (`gh stack view` in the transcript), created only after all loops converged, and the close-out archived the plan (`git show --stat` of the archive-move commit in the transcript); `bun run test:all`, `bun run test:ci-gating`, `bun run test:release` and `bun run lint` all report exit 0 in the transcript.
```

**Alternative: `/loop`:**

```
/loop 15m Drive implementations-plan/supply-chain-release forward. Never idle. Each firing: (1) Reality check: read plan.md (from the stack's top layer once a stack exists) and lessons/, including Outcome & Quality Bar; if the live plan path is gone, run `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/supply-chain-release/plan.md` — success means merged: run `agent-worktree done supply-chain-release --merged`, report its output (never force past a refusal), clear this loop and stop; failure means delivered and awaiting merge: babysit CI only. Otherwise rebuild the task list from plan.md, run `git status`, `git log --oneline -5`, and `gh stack view` if a stack exists. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step; after each edit run `bun run lint` and the touched tests; commit; push. (4) Stuck or facing a decision: consult Codex (`CODEX_ACCOUNT=alejo-gmail run-codex.sh … high read-only gpt-6.1-sol`), log the consult in lessons/phase-N.md, act; never merge, never push to main, never apply S2 or S3, never change any other repository setting, never widen scope. (5) Same step failed 3 times: stop and reassess with Codex. (6) Phase green per its gate (or Phase 5 stopped with its measurement recorded, per plan.md): mark ✓, log lessons, print LESSONS_FILE; at an arc boundary run the Codex fix loop with the arc map and the plan's two rules until clean, then `gh stack add`. (7) All phases ✓: final cross-arc Codex pass, then Delivery and the close-out per plan.md, then `gh pr checks --watch`, then the wrap-up report; stop.
```
