# Owner asks: ci-followups-3

Nothing a person sees in the wallet changes in this lane. Both asks concern GitHub objects and runs that only the owner may change or start: an agent never creates, edits or deletes a tag, a release or a release asset, and never dispatches or re-runs a publishing workflow.

## OA-1. The detached nightly release 407837006 and its stray tag

**Surface:** the repository's Releases page. The 2026-10-09 nightly published a prerelease named `v0.30.2-nightly.26282` whose `tag_name` reads `untagged-29f161d8864377d68cb4` (`target_commitish` `dev`), with its three assets. The tag `v0.30.2-nightly.26282` exists separately and names `61060c0ab16254a6e3d73ece124efe1c4834f683`. A second git tag, `untagged-29f161d8864377d68cb4`, exists at the same commit (most likely created when the detached draft was published); it shows on the Tags page, and the `release tags` ruleset does not cover it (it guards `refs/tags/v*` only). Immutable releases are off for the repository, and this release is not immutable. All of this was read on 2026-10-11 with GET calls only.

The release body (the nightly notes) was written; the assets are the ones the run built, attested and uploaded (digests `sha256:eb483cbf…` Chrome, `sha256:2437b66f…` Firefox, `sha256:2aa28128…` SHASUMS256.txt).

| Option | What the owner runs | What it looks like after |
|---|---|---|
| **A. Re-attach it to its tag, delete the stray tag** | `gh api -X PATCH repos/nulo-sh/nulo/releases/407837006 -f tag_name=v0.30.2-nightly.26282`; read the release back (first line below) and see `tag_name` `v0.30.2-nightly.26282`; only then `gh api -X DELETE repos/nulo-sh/nulo/git/refs/tags/untagged-29f161d8864377d68cb4` | The release page moves to `/releases/tag/v0.30.2-nightly.26282` and reads as an ordinary nightly. The tag already exists, so GitHub should create no ref (`target_commitish` is unused for an existing tag) and the `release tags` ruleset, which guards deletion and updates, has nothing to judge. Its tag then matches the nightly pattern a retention job (#178, not built) would sweep. |
| **B. Delete it and the stray tag** | `gh api -X DELETE repos/nulo-sh/nulo/releases/407837006`, then `gh api -X DELETE repos/nulo-sh/nulo/git/refs/tags/untagged-29f161d8864377d68cb4` | The release and its three assets are gone; deleting a release never deletes a tag, so the stray tag goes only by the second call. The tag `v0.30.2-nightly.26282` stays (the ruleset refuses its deletion), as a tag with no release; the nightly's quiet-day check treats such a tag as "not released", which matters only if `dev` were still at `61060c0` (it is not). |
| **C. Leave both** | nothing | The Releases page keeps a prerelease under an `untagged-…` URL, and the Tags page keeps the `untagged-…` tag. Nothing in the pipeline selects either: `plan` and `releasesFor` match releases by `tag_name`; git-cliff's `tag_pattern` (`v[0-9].*`), the stable notes' `--match 'v[0-9]*'` and the nightly's `v*-nightly*` listing skip the tag. |

Read back after A or B:

```bash
gh api repos/nulo-sh/nulo/releases/407837006 --jq '{tag_name, draft, prerelease}'   # A: tag_name v0.30.2-nightly.26282; B: HTTP 404
gh api repos/nulo-sh/nulo/git/ref/tags/v0.30.2-nightly.26282 --jq .object.sha       # both: 61060c0ab16254a6e3d73ece124efe1c4834f683
gh api repos/nulo-sh/nulo/git/ref/tags/untagged-29f161d8864377d68cb4               # both: HTTP 404
```

**Recommendation: A.** The release holds exactly what the run built and attested for `61060c0`; only its tag binding was lost, and re-attaching restores what the pipeline meant to publish. The stray tag names nothing the pipeline uses.

**What ships now:** nothing touches release 407837006 or the stray tag. The arc changes only how future runs edit a release; it reads no `untagged-…` release or tag and needs none of the three options to land or to be confirmed. If this is still open when the arc closes, its close-out opens one `owner-decision` issue for it, so the decision outlives #309. Unanswered at close-out: tracked in #310.

## OA-2. No re-run of a publish from before the fix; the first stable needs the fix on `main`

**Surface:** the Actions page and the release flow. A re-run keeps its run's commit and ref, so merging a fix (this one, or #308's) never repairs an old run's code. Three cases:

- **Draft-flow runs from before this merge.** A publish job whose commit carries `attach-assets-run.ts` without this fix still edits the draft without its tag, so if it reaches publication it publishes another detached release and another `untagged-…` tag. That covers "Re-run failed jobs" on the 2026-10-09, 10-10 and 10-11 nightlies (37919470569, 38043372938, 38130969762), and any rc tag cut on `dev` before this merge and dispatched with `--ref v<version>`. For 10-09, `plan` cannot see the stray release (it matches by `tag_name`), so it would create a second draft for the same tag.
- **Tags whose code predates the draft flow.** `origin/main` has no `attach-assets-run.ts` yet; its `release.yml` uploads with `gh release upload --clobber` and edits notes with `gh release edit`, which restates the tag itself. Such a run does not detach; it is the older flow that CLAUDE.md § Stable release's transition note describes.
- **New cuts after this merge.** An rc cut from `dev`, and the first stable through the draft flow (after a promote that carries this PR), run the fixed code.

| Option | What it means |
|---|---|
| **A. Wait for this PR** | No re-run of a draft-flow publish from before the merge; the next scheduled nightly after the merge confirms the fix. No rc tag is cut from `dev` before the merge, and the first stable through the draft flow comes from a promote that carries this PR. |
| **B. Proceed anyway** | Each draft-flow run from before the merge that reaches publication leaves a detached release and a stray tag for someone to remove by hand (OA-1's commands, with that run's ids). |

**Recommendation: A.**

**What ships now:** the PR body carries this warning; nothing in the arc depends on the answer.
