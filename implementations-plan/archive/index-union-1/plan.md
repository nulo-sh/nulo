---
plan: index-union-1
tier: light
status: completed (delivered in #962)
issues: "#957"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg
base: origin/dev at 01c27912
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-20.
- **Status:** delivered as one ready PR against `dev`, #962, which carries this close-out; its merge closes the plan and #957.
- **Shipped:** `.gitattributes` gives `implementations-plan/archive/index.md` `merge=union`, that path only; a fixture test merges two appends clean and shows an edit beside an append refused as "listed twice"; a tree test pins `union` to that path and `unspecified` to every other; fixture git calls skip signature checks; README rule 10 and step 4.
- **Review loop:** plan: Codex and Opus conditional approve, Codex resumed approve. Arc: Codex r1 one finding (fixed), Opus diff review folded, Codex r2 clean.
- **Gates at the head:** lint, `typecheck:all`, `test:all`, `test:ci-gating` (640), `test:release` (341), `check:plans` 0; the merge of `origin/dev` at `7ef85e9a` was clean.
- **Dispositions:** `index.md` stays off union (D1); no new gate rule, the guard existed (D2); no `runGit` input option (D3); the blueprint skill unedited, its rule still true (D4); GitHub's behaviour read from the next merges, #957 reopened if it ignores the attribute (D5).
- **Known limits:** #963. **Open items:** none.
- **Lessons:** none promoted: `lessons.md` sits at its budget, and the head-SHA fact is its line 17. The `attr.tree` transition merge is in the PR body and F5.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# index-union-1: the archive index merges by union, so close-outs stop conflicting on it

One arc, one PR against `dev` that closes #957 (§ Delivery). Recon and probes: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

For the orchestrator and every lead with a close-out PR open against `dev`:

- Two close-outs that each append a line to `implementations-plan/archive/index.md` merge into each other with no hand edit: locally always, and on GitHub only if its mergeability check honours the attribute (I1).
- A wrong union result (one plan listed twice, an archived plan with no line) fails `quality-status` on any PR whose head contains it, the first branch that merges `dev` after it included.
- Only that one path has a merge attribute: a test fails the day another path gains one.

Out of scope: `index.md`, whose neighbouring deletions can still conflict (D1). Good enough: GitHub's behaviour is read from the next real merges (§ Delivery). If GitHub ignores the attribute, the gain is local only (a `dev` merge with no hand edit; the CI re-run stays), which the lane brief accepts as the fallback; the orchestrator then reopens #957 with the evidence.

## Assumptions

**Facts** (verified at `01c27912`; evidence in recon.md):

- F1. `.gitattributes` sets no `merge=` attribute; `git check-attr --cached merge` over all tracked paths reports none. No script or test reads it.
- F2. `archive/index.md` is append-only: 26 commits in 24 h, 115 in 7 days, no deleted or edited line in its history. Without an attribute, two appends at the end conflict (probe 3b).
- F3. The guard exists: `archive-structure` (`scripts/ci-cd/plans/structure.ts:188-225`) refuses a line listed twice, an archived directory with no line, a malformed line and a line whose target is not tracked. `tree.test.ts:15-24` runs it over the real tree inside `test:ci-gating`, enforced on pull requests and only reported on push (`lib.ts` `mode`).
- F4. Union keeps both sides of a conflicting hunk: two appends give both lines (probe 1); an edited line beside an append gives the old and the new line (probe 2), which F3 refuses as "listed twice".
- F5. A local merge takes attributes from the working tree, so a branch cut before the attribute conflicts once more when it merges `dev` (probe 4); `git -c attr.tree=origin/dev merge origin/dev` merges it clean (probe 6). A bare-repo `merge-tree` takes them from `HEAD` (probes 3, 5, 5b).
- F6. `index.md` changes by deletion and replacement too (of 15 commits in 24 h: 8 delete, 5 add, 2 replace a line).
- F7. README:110 says the close-out's trunk merge is "never a union merge"; README:95 is the one doc line on `.gitattributes` for this tree.

**Inferences:**

- I1. GitHub honours `merge=union` when it computes mergeability. Unverified, with counterevidence: firsthand reports that it did not (github.com/orgs/community/discussions/9288, a 2016 RuboCop PR). Probes on bare git cannot settle GitHub's implementation; § Delivery says how the next merges answer it.
- I2 (corrected, both legs r1): CI tests the PR's `head.sha` (`.github/workflows/pr-quick.yml:241`), not the merge ref, and push and nightly runs only report. So a union duplicate that reaches `dev` fails the first branch that merges `dev` (every close-out does), on a line it did not write, until a one-line fix.

**Asks:** none. No surface a person sees changes.

## Architecture & Implementation

- **`.gitattributes`**: after the two `implementations-plan/` lines, one comment and one line:
  `# Close-outs only append here; check:plans refuses the duplicate a union keeps when a line was edited.`
  `implementations-plan/archive/index.md merge=union`
- **Merge test** (`structure.test.ts`, `describe("archive-structure")`): a fixture repo seeded with the repo's real `.gitattributes` (read from the root), whose archive index lists plan `a` as its last line. Branches `b` and `c` each `git switch -q -c <x> dev`, add `archive/<x>/plan.md` with an Outcome and append `<x>`'s line, then `commitAll`. `git merge -q --no-ff -m m b` on `c` exits 0 (`git()` throws on a conflict) and the rule finds nothing: the success control. Branch `edit` rewrites `a`'s hook; merging it into `c` exits 0 and the rule reports exactly `a is listed twice`.
- **Scope pin** (`tree.test.ts`, "plan tree gate"): `spawnSync("git", ["-c", "core.attributesFile=/dev/null", "check-attr", "--cached", "--stdin", "-z", "merge"])` at the root, with an explicit `maxBuffer` (today's output is about 500 KB, half the default), fed every tracked path NUL-separated (`createCtx({ cwd: ROOT }).tracked`). Parse `path, attribute, value` triples. Expect exit 0, one triple per path, and the paths whose value is not `unspecified` to equal `["implementations-plan/archive/index.md union"]`, with an assertion message that says a merge attribute is added here only on purpose. `set`, `unset` (the `binary` macro), `lfs` and any driver name count as a change. `check-attr` resolves nested files and macros.
- **README**: rule 10 gains one sentence: "`archive/index.md` merges by union, since close-outs only append to it; `archive-structure` refuses the duplicate line a union keeps when a line was edited, and a test in `tree.test.ts` keeps union off every other path." Step 4's "never a union merge" becomes "neither of those two merges by union".

### Decision ledger

- **D1, one path only.** `index.md` is left out: it changes by deletion and replacement (F6), where union brings back a deleted line or keeps both sides of an edit, and the blueprint skill forbids union on it and on `lessons.md`. The owner's condition was a couple of files at most.
- **D2, no new guard rule.** The lane brief asks for a duplicate and one-line-per-directory check; it exists and is enforced (F3). The brief's claim did not hold. What was missing is a proof that the real merge driver and the rule work together, which the merge test gives with git itself rather than a hand-written union result.
- **D3, the scope pin is a test, not a gate rule, and it calls `spawnSync` itself.** `runGit` takes no input; Opus r1 proposed an `input` option on it, Codex r1 a direct `spawnSync`. Taken: the direct call, since a new option on the gate's library for one test caller is the generality the house rules refuse. A `tree.test.ts` case reads the real tree like its neighbours and costs one test; a new rule would add a rule id, enforcement wiring and fixtures for one fact. It also catches a merge attribute set on code by mistake; it is not a boundary against a hostile PR (§ Security).
- **D4, no blueprint-skill edit.** The skill lives outside this worktree (write boundary), and its rule names `index.md` and `lessons.md`, which stay off union, so it stays true. Reported to the orchestrator.
- **D5, no probe commit; GitHub's answer decides the issue.** The behaviour cannot be observed before the attribute is on `dev`. Codex r1 asked to make it an acceptance condition; Opus r1 asked for `Refs #957`, closed on the first `MERGEABLE`. Taken: `Closes #957`, as the lane brief says, with a reopen rule: if the next real merges show GitHub ignoring union (§ Delivery), the orchestrator reopens #957 with that evidence. The brief already accepts the local-only fallback. The next option then is to remove the shared file (an archive index built from each plan's own record), a larger change for the owner.
- **D6, the residual's label.** Opus r1: "needs unsupported conditions". Codex r1: plausible but unverified, since nothing forbids editing an archive line; history only makes it unlikely. Taken: Codex's label. The disposition (a closed `known-limit` issue) is the same either way.

## Security & Adversarial Considerations

- **What the pin is**: a review tripwire against widening union by mistake (a `merge=union` on code keeps both sides of two conflicting edits). It is not a boundary against a hostile PR, which can edit the test in the same diff; review of `.gitattributes` and the test is that boundary. `$GIT_DIR/info/attributes` and `core.attributesFile` would override tracked attributes, but only on a runner or machine the attacker already controls. A custom driver also needs git configuration no file in the repo can set; an undefined one falls back to the 3-way text merge (probed).
- **Residual (plausible but unverified)**: `dev` does not require an up-to-date branch. If GitHub honours union (I1), one PR edits an archive line while another appends beside it; each passes CI on its own head; the second squash-merges with a fresh union nobody tested. No close-out has ever edited an archive line (F2). Consequence: a duplicate line on `dev`; the push run only reports; each PR fails `quality-status` once its head contains the line (I2), until a one-line fix. No code, credential or user surface. Disposition (D6): a closed `known-limit` issue, #963; reopen if an archived line is edited after its close-out, or a union duplicate reaches `dev`. A stronger fix (an up-to-date rule on `dev`, or a check of the merged tree) changes delivery for every PR and is not proposed.
- No runtime code, dependency, workflow, token or permission changes.

## Phases

### Phase 1: the attribute, its tests and the README ✓

- Change map: `.gitattributes`; `scripts/ci-cd/plans/structure.test.ts` (one test); `scripts/ci-cd/plans/tree.test.ts` (one test); `implementations-plan/README.md` (rules 10 and step 4).
- Red/green: with the base `.gitattributes` (`git show 01c27912:.gitattributes`) in the working tree and staged (`--cached` reads the index), both new tests fail: the merge test at its first `git merge` (conflict), the pin on a missing `union`. Both pass with the change restored and staged.
- Gate: `bun test scripts/ci-cd/plans/` passes; `bun run lint`, `bun run typecheck:all`, `bun run test:ci-gating` and `bun run test:release` exit 0; `bun run check:plans` exits 0 after staging. Layers: lint, typecheck, unit (`bun:test`). No e2e: no runtime path changes.

## UI impact

None: a git attribute, two CI-gating tests and a planning doc.

## Delivery

- One arc: branch `index-union-1-a1` off `origin/dev`, this plan's commit first. One PR, ready, no label (the e2e filters do not match these paths).
- Title: `chore(plans): merge the archive index by union; pin the attribute to that one file` (84).
- Body: the change and why, the measurement, `Closes #957`, the gates, `UI impact: none`, and **how to read GitHub's answer**: after this merges, take a pair of open close-outs that conflict only in the archive index and whose branches both contain this change. When the first merges, `gh pr view <second> --json mergeable` reads `MERGEABLE` if GitHub honours union. On `CONFLICTING`, `git -c attr.tree=origin/dev merge-tree --write-tree --name-only origin/dev origin/<branch>` decides: exit 0 means only GitHub refused the union, so `git merge origin/dev` (no hand edit), a push, and #957 reopens (D5); a conflict it names proves nothing about union. A branch cut before this change merges once with `git -c attr.tree=origin/dev merge origin/dev` (F5); a git that predates `attr.tree` ignores the key and conflicts as today (2.43 has it, probed). Parallelism: none.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `01c27912`; step 1 absent (`code_review: off`).

- After Phase 1: the Codex loop over the arc's diff against `origin/dev` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/index-union-1/`). Each prompt carries the two verbatim rules and asks: can a union result pass the gate while wrong, can the pin be bypassed, does any doc now contradict the attribute. Hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1; rounds logged in `lessons/phase-1.md` and § Audit verdicts. A fix that grows the design stops for the orchestrator.
- Close-out: merge `origin/dev` and read `index.md` and `lessons.md`; Outcome (`Known limits:` the issue § Security names; `Open items: none`); no lesson unless a round finds one (`lessons.md` sits at its budget); delete `STATUS.md`; `git mv` to `archive/` in its own commit, this plan's line moved to `archive/index.md`; `bun run check:plans` green.
- Teardown once `implementations-plan/archive/index-union-1/plan.md` is on `origin/dev`: `agent-worktree done index-union-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a15ab4): conditional approve.
- #1 I2 false, CI tests `head.sha`: demonstrated (`pr-quick.yml:241`); I2, the quality bar and the residual corrected.
- #2 I1 carries the outcome, with community counterevidence: D5's reopen rule and the § Delivery reading.
- #3 `runGit` takes no stdin: the pin calls `spawnSync` (D3); strict `unspecified` elsewhere.
- #4 the pin is no hostile-PR boundary: § Security reworded; runner-side attribute files need runner control.
- #5 residual: kept as a closed `known-limit`, wording corrected (D6).

**Round 1, Opus Plan:** conditional approve.
- #1 I2: same as Codex #1; the first branch that merges `dev` is the one that fails.
- #2 residual label "needs unsupported conditions": not taken (D6).
- #3 `Closes` premature; title overclaims: title narrowed, `index.md` named out of scope; `Closes` kept with the reopen rule (D5); the `merge-tree` diagnostic adopted.
- #4 pin mechanics: explicit `maxBuffer`, `core.attributesFile=/dev/null`, triples, an assertion message, the red step stages the base file. The `runGit` `input` option: not taken (D3).
- #5 no bypass found; false positives (`binary`, `lfs`) need a deliberate edit, as intended.
- #6 the merge test seeds the real `.gitattributes`, `a` last, `switch -c` and `merge --no-ff -m`.
- #7 `attr.tree` needs a git that has it: one clause in the PR body.

**Round 1 resumed, Codex** (verification): **approve**, no remaining finding.

**Arc 1, Codex r1** (gpt-6.1-sol, high, session 01a15ac8): one finding: a global `merge.verifySignatures=true` fails the fixture's unsigned merges (it also failed four existing `permalinks.test.ts` tests; reproduced). Fixed at the cause: `fixture-repo.ts`'s isolation config passes `-c merge.verifySignatures=false`.
**Arc 1, Opus diff review:** the same finding; both halves of the merge test shown to need union (probed without the attribute under four diff algorithms). Taken: `GIT_ATTR_NOSYSTEM=1` on the pin, beside `core.attributesFile=/dev/null`. Not changed: a repo-local `info/attributes` is read by the pin on a developer machine (git has no switch; CI has none), filed with the close-out's known limit.
**Arc 1, Codex r2** (resumed): **clean**.

## Seeds

- `/goal` Phase 1 marked ✓ in implementations-plan/index-union-1/plan.md with its red/green and gate output in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); PR `chore(plans): merge the archive index by union; pin the attribute to that one file` open against `dev` with the close-out commits and `Closes #957`; `bun run test:ci-gating` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/index-union-1: read plan.md and lessons/, run Phase 1 and its gate, tick it, then the Codex loop, the PR and the close-out; never merge.
