---
plan: floor-superseded-1
tier: light
status: planned, Codex approve; arc 1 next
issues: none (the owner's pick P77-06 B is the record; no issue to close)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit round-trip (gpt-6.1-sol high) plus one Opus Plan leg
base: origin/dev at 85edeb866
trunk: dev
post_implementation_hardening: not scheduled
---

# floor-superseded-1: the floor rule reads the lists at publish PR and branch heads

One arc, one PR against `dev`. No screen changes. The owner's pick, decision page 77, 2026-10-20: **P77-06 B**, "Evaluate the floor rule against superseded envelopes too."

Today `raisesFloorAt` (`infra/token-list/scripts/open-publish-pr.ts:74-80`) compares the next list with the list `dev` serves only. After this arc, the publisher also compares it with the list of every publish PR that is open or closed unmerged, and of every publish branch, signed at or above the compiled floor and before the next list. A drop or a new flag against any of them raises the floor to the next sequence, as a drop against the served list does today.

**Invariant:** every signed list at the head of a publish PR (open or closed unmerged) or of a publish branch, signed at or above the compiled floor and before the next list, is retired by the floor rule as the served list would be.

## Outcome & Quality Bar

- **For whom:** the owner, who merges publish PRs and sometimes closes one unmerged; and every wallet built after a later publish, which must refuse what that publish retired.
- **Excellent:** (1) the floor decision is exact: a raise happens when, and only when, the next list drops a token or adds a flag against a list the rule reads, or a list it must read cannot be read; (2) the publish PR body says which list raised the floor, so the owner can check the raise before merging.
- **Good enough:** the rule reads the lists at PR heads and existing branches (D9). No change to the wallet, the verifier or the workflow.

## Assumptions

**Facts**
- F1 `raisesFloor(served, next)` (`infra/token-list/scripts/floor.ts:15-19`) is true when `next` drops a token `served` lists or flags a pair `served` did not flag.
- F2 `runPublish` (`open-publish-pr.ts:82-105`) computes the floor before any write, then commits, opens or finds its PR, then closes every open publish PR with an older sequence as "Superseded by #n". `close` (`:154-157`) comments and sets the state; it deletes no branch.
- F3 The repository is public and deletes a head branch on merge only (`gh repo view`: `deleteBranchOnMerge: true`). A closed PR's branch stays until a person deletes it; GitHub's "Delete branch" button offers that after a close.
- F4 The contents API reads a file at a PR's head commit after the branch is gone: `#507`'s branch is deleted and its head `d8fd601c` is not an ancestor of `dev`, and the read at that SHA returns its envelope (checked 2026-10-20).
- F5 The verifier refuses only `sequence < floor` (`packages/token-list/src/index.ts:56`). `floor.json` is 1792014908; `dev` serves 1792099312. All three publish PRs (#425, #434, #507) merged, so no list was ever closed unmerged.
- F6 The tree check refuses a floor above the committed list's sequence (`infra/token-list/scripts/check.ts:90-101`); a floor equal to the next sequence, committed beside the next list, always passes.
- F7 Sequences are the signing time in seconds (`SECURITY.md` § Token list signing), and runs are serialized (`publish-token-list.yml`, `concurrency: publish-token-list`, no cancel).
- F8 The `publish-pr` closure may import only `node:` builtins and relative files (`infra/token-list/test/publish.test.ts:248-256`); its App token has `contents` and `pull-requests` write, which covers the new reads.

**Inferences**
- I1 *Transitivity.* If a list raises no floor against its predecessor, its tokens include the predecessor's and its flags are a subset of the predecessor's, and both relations are transitive. The served lists from the floor to the one `dev` serves form such a chain, so a list that raises nothing against the served one raises nothing against any of them: merged PRs need no read.
- I2 GitHub keeps `refs/pull/<n>/head` for a closed PR, so a read at its head SHA stays possible (F4 is one sample).

**Asks** (none for the owner; each settled by the panel, see the ledger)
- A1 Which lists the rule reads (D1). A2 What an unreadable list does (D2).

## Architecture & Implementation

- **Where:** `infra/token-list/scripts/open-publish-pr.ts` (the rule's inputs, the IO, the PR body), `floor.ts` (a reader for `floor.json` beside its writer), `summary.ts` (one line), the tests, the docs. `packages/token-list` is untouched.
- **IO:** `openPublishPrs()` becomes `unmergedPublishPrs(): { number, branch, head, open }[]`: publish PRs into `dev` from this repository, open or closed unmerged, with their head SHA. `githubIO` pages `pulls?state=all&base=dev&per_page=100&page=n` until a short page; the pure `publishPrs(pulls, repo)` keeps the fork filter and also drops merged PRs (`merged_at !== null`). A page that is not a list throws (a 404 answers an object, which would otherwise page until the job's timeout). New `publishBranches(): { branch, head }[]` from `git/matching-refs/heads/token-list-publish-`.
- **Flow in `runPublish`:** parse the next envelope → stale-base guard (unchanged, first) → list PRs and branches → `floor = floorSequence(read(FLOOR_PATH, baseSha))` (0 when absent or malformed) → candidates: each PR head and branch head whose name ends in a canonical decimal sequence `s` (`/^[1-9][0-9]*$/`, a safe integer) with `floor ≤ s < next`, deduplicated by head SHA → read each envelope at its head → `raisedBy`: the served list if `raisesFloor(served, next)`, plus `#n` or the branch for each candidate that raises or cannot be read → commit (floor file when `raisedBy` is not empty) → find the run's PR among the **open** PRs, or open it → close the open older ones, as today. Closed PRs feed the comparison only: they are never found, commented on or closed again.
- **Unreadable:** no file at the head, not an envelope, or an envelope whose sequence differs from the name's. Each raises the floor and logs one line naming the PR or branch (D2). A branch whose commit failed after its creation holds the served envelope under another name, so it reads as unreadable and raises.
- **PR body:** `prBody(input, keyId, sequence, raisedBy)` names what raised the floor ("against the list `dev` serves", "against the list of #12, closed unmerged", "#13, whose list cannot be read").
- **Simpler alternative not taken:** raise the floor whenever a publish PR is superseded (P77-06 A). The owner picked B; A raises on every supersede, including ones that only add a token.

## Security & Adversarial Considerations

- **Threat model:** the host (DNS, Cloudflare, the deploy) is untrusted and can serve any signed list (`SECURITY.md` § Token list signing). The rule's job: a list at a publish PR or branch head, signed at or above the floor and before a later list, does not restore a token that later list dropped, or drop a flag it added, on a wallet built after it merges.
- **A repository writer** can push a `token-list-publish-*` branch or PR with any file. The worst it gets is an extra floor raise: one e2e run on the publish PR and a floor at the next sequence, which never refuses the list the PR publishes (F6). It already holds stronger powers.
- **Fail closed:** a read that errors (HTTP other than 404) throws before any write, as today; the run is re-run.
- **Least privilege:** no new permission, secret or dependency; the closure stays `node:` plus relative (F8).
- **Out of scope:** the wallet, the verifier, the signer, `SECURITY.md`'s accepted limits other than the floor sentence.

## UI impact

None. The arc changes CI tooling, a GitHub PR body, a CI step summary line and docs; no wallet screen.

## Phases (arc 1, branch `floor-superseded-1-a1` off `origin/dev`, this plan's commit cherry-picked first)

### Phase 1: the rule reads every unserved list ✓
- `floor.ts`: `floorSequence(text: string | null): number`, the sequence when it is a positive safe integer, else 0 (absent, not JSON, `null`, wrong type, unsafe).
- `open-publish-pr.ts`: the IO, flow, bound, unreadable rule and body above; `raisesFloorAt` returns `raisedBy: string[]`; `githubIO` exported for its paging test.
- `summary.ts`: the floor line says "against the served list", and points to the publish PR body for the final decision.
- `test/publish.test.ts`: `fakeIO` stays stateless and gains `prs` and `branches` inputs; existing cases move to the new IO shape with unchanged expectations. New cases:
  - T1, two runs: run 1 publishes R1, which adds a token to the served N, and opens PR 1 with no floor; run 2's state is run 1's recorded commit and PR; it publishes R2 = N from the same base, closes PR 1 as superseded and commits the floor at R2's sequence. Control: R2 keeps the token, no floor. Re-run: PR 1 closed unmerged and run 2's branch already carrying both files: no call.
  - T2, `test.each`: a PR closed earlier (read at its head, no branch) whose list R2 drops from: raises; a publish branch with no PR: raises; a PR exactly at the floor: read, raises; R2 re-flags a pair the served list flags and an unserved list unflagged: raises; a PR below the floor, one at or above the next sequence, and one with a non-canonical suffix, each unreadable: not read, no raise. Every closed PR gets no close call.
  - T3, `test.each`, one row per unreadable class: no file, not an envelope, sequence not the name's: each raises, and the body names it.
  - The re-run case gains a closed PR on the run's own branch: it is not found, and `openPr` is called.
  - T4, paging: `githubIO` over a stubbed `fetch`: a first page of 100 PRs none of which is a publish PR, then a short page holding one: it is found; a page that is not a list: rejects. A listing that rejects: `runPublish` rejects with no write.
  - The `publishPrs` filter case adds a merged PR (dropped) and carries the head SHA; the PR-body case names the reasons.
- **Validation gate:** `bun run --cwd infra/token-list test` (all pass); `bun run --cwd infra/token-list typecheck` exit 0. Copy `open-publish-pr.ts` from `origin/dev` into place with a scratch fake that also answers `openPublishPrs`: T1 and T2's closed-PR row fail on their floor assertion, not a type error; restore. Layers: typecheck, unit.

### Phase 2: the docs state the rule ✓
- `infra/token-list/README.md`: the floor invariant gains the one-sentence invariant above; step 4 and the "close it and re-dispatch" paragraph say that a closed PR's list stays on record and the next publish's floor rule reads it at the PR's head, branch deleted or not; the Rotation step adds the unserved lists to the hand-set floor check.
- `SECURITY.md` § Rollback and freeze and § The floor's writer: one clause each naming the unserved lists.
- **Validation gate:** `bun run test:ci-gating` exit 0; `bun run lint` exit 0.

### Phase 3: arc gate ✓
- **Commands:** `bun run lint`; `bun run typecheck:all`; `bun run --cwd infra/token-list test`; `bun run --cwd packages/token-list test`; `bun run test:ci-gating`; `bun run check:plans` after staging. No e2e: nothing a wallet runs changes.
- **Pass criteria:** each exits 0; `git diff origin/dev --stat` touches only the files named in Phases 1-2 and this plan's directory.

## Decision ledger

- **D1 Which lists.** The served list, every publish PR open or closed unmerged (read at its head SHA), and every publish branch. Alternative: PRs only, the way `runPublish` finds the PR it supersedes. Branches are added because a run whose commit landed and whose PR never opened leaves a list on a branch with no PR, and a re-dispatch would not see it; head SHAs are read because a closed PR's branch can be deleted with one click while its head commit stays in the repository (F4).
- **D2 Unreadable raises the floor.** Rejected: skip with a logged reason, which leaves the one rule the floor exists for open on an input it cannot judge. Cost: one e2e run per affected publish; once a raise merges, the floor passes that list's sequence and the bound never reads it again. The rule is an OR, so a garbage input can only add a raise, never hide one.
- **D3 The bound** `floor ≤ s < next`, on the name's sequence. Below the floor at the base every later build refuses it already; at or above the next sequence, a floor at the next sequence cannot retire it. A floor file absent or malformed at the base reads as 0: every list is read, which can only add raises.
- **D4 Sequence check.** An envelope whose sequence is not the name's is unreadable: the bound was computed on the name.
- **D5 Order.** Read and decide before any write; close after the PR exists, as today. A re-run finds the superseded PRs closed unmerged, still in the bound, and reaches the same decision.
- **D6 Paging** by page number until a short page. Rejected: stopping at PRs older than the floor's time, which ties the listing to sequence-as-time to save a few calls on a rare job.
- **D7 The prepare summary** keeps its served-list answer and says so. The decision lives once, in `publish-pr`, on the snapshot it writes from; a second discovery in `prepare` could read another snapshot and disagree (Codex r1 corrected the first rationale: public reads need no token). Giving `prepare`, which runs installed dependencies, a token would also widen the unprivileged job (Opus r1).
- **D8 No workflow change:** the permissions and the step command (pinned by `scripts/ci-cd/behavior-gating.test.ts`) already fit.
- **D9 Scope:** the rule reads the lists at PR heads and existing branches. The owner settles anything further privately; the arc does not wait on it.
- **D10 The stale-base guard is unchanged:** it still stops before any write. A change to it is the owner's call, sent privately with both legs' views (Opus r1 for a change, Codex r1 against).

## Review verdicts

- **Round 1, Codex (gpt-6.1-sol high, session 01a15b98): `conditional approve`.** Accepted: (1) the invariant overstated what discovery sees: restated as PR heads and existing branches; (2) D9 needs a private disposition: sent to the owner through the orchestrator, no committed trace; (3) the fake cannot prove paging: T4 and the floor-equal and re-flag rows added, red-on-base cut to representative rows; (4) canonical suffix and floor parsing (D3); (5) D7's rationale corrected. Kept: D1 with branches, D2, D6, I1's relation.
- **Round 1, Opus Plan leg: `conditional approve`.** Accepted: (1) a non-list page would page to the timeout: it throws, and T4 pins it; (2) find and close read open PRs only, with a T2 assertion; (3) `merged_at` marks a merged PR; (4) I1 restated as the reason merged PRs need no read; (5) negative scope text removed; (7) the fake stays stateless, T1 built from run 1's recorded writes, a re-run row added. Deferred to the owner: (6) a change to the stale-base guard (D10). Kept: D1-D3, D6, D7.
- **Round 2, Codex resumed: `conditional approve`.** Three low conditions, accepted: recon's fake row matched the stateless decision; the title and threat model narrowed to the bounded invariant; a closed PR on the run's own branch is not found (re-run case). D10 confirmed. **Round 3: `approve`**, "No remaining conditions. Confidence: high."

- **Arc 1 review, round 1, Codex (gpt-6.1-sol high, session 01a15ba9, on the arc diff): `approve`.** Three low findings, accepted: (1) `call` treated a 404 as an answer for writes too, so a failed `openPr` returned `undefined`: a 404 now passes for reads only, pinned in T4; (2) T4 did not pin `state=all`: it asserts the query; (3) comments: two that restated their names removed, the floor comment no longer claims every head list is signed, the bound comment cut to one line, three test comments removed or rewritten.
- **Arc 1 review, Opus (general-purpose, same diff): `conditional approve`.** Accepted: (1) as Codex 2; (2) the re-run row passed whatever the re-run decided: its branch now lacks the floor, so only a raise writes; the unreadable log line asserted; (3) a PR opened mid-listing can repeat across pages: `publishPrs` dedupes by number; (5) the PR body says "The floor rises because:" and labels a closed PR "closed unmerged"; (6) README step 4 names the unreadable case. Rejected: (4) paging `matching-refs`, which documents no page parameters (Codex verified).
- **Arc 1 review, round 2, Codex resumed: `approve`.** One low finding, accepted: the paging comment overstated the guarantee (a PR opened mid-listing can be missed; publish PRs open only after this run's listing).

## Delivery

- **Arc 1** = Phases 1-3, one PR against `dev` (the orchestrator's D-orch-1: no stack), ready, not a draft. Title: `fix(token-list): the floor rule also reads lists of publish PRs closed unmerged`. Body: what changed and the invariant it keeps; the owner's pick quoted by id and text ("P77-06 B: Evaluate the floor rule against superseded envelopes too."); the validation runs; no `Closes` line. No label: the change touches no e2e path.
- **Parallelism:** none.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `85edeb866`. Plan-specific values:
- **Diff review:** `code_review: off`; the step is absent.
- **Review loop**, once over the arc diff after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the diff from `origin/dev`, this plan and its ledger, the adversarial ask and the README's two rules verbatim. One Opus `general-purpose` review of the same diff beside round 1. Hard stop at three rounds; log each in `lessons/phase-3.md` and under Review verdicts.
- **Delivery:** `gh pr create --base dev`, then `gh pr checks <n> --watch`; one rerun for a known flake. Never merge.
- **Close-out** as the PR's final commits: merge `origin/dev` and read `index.md` and `lessons.md`; the `## Outcome` block; lessons only within the 8 KiB budget; delete `STATUS.md`; `git mv implementations-plan/floor-superseded-1 implementations-plan/archive/floor-superseded-1` in its own commit, index line moved to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/floor-superseded-1/plan.md` succeeds, run `agent-worktree done floor-superseded-1 --merged`; relay a refusal, never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds (draft until approval)

```
/goal Arc 1 of implementations-plan/floor-superseded-1/plan.md done: Phases 1-3 marked ✓, each gate reported passing in the transcript; the Codex loop (gpt-6.1-sol high) converged on the arc diff, quoted; the PR open against dev (gh pr view output).
```

```
/loop 15m Drive arc 1 of implementations-plan/floor-superseded-1 per its plan.md (plan.md is the state). Next unchecked step, fast gates after each edit, signed commits. After Phase 3 run the Post-implementation loop, open the PR, watch checks, report and stop. Never merge.
```
