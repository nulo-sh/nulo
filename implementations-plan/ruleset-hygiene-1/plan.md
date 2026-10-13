---
plan: ruleset-hygiene-1
tier: light
status: approved (orchestrator, 2026-10-13); implementing
issues: none
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex (gpt-6.1-sol, high) round 1 plus one resumed round on its material findings; no Opus leg (orchestrator's call)
base: origin/dev at 36c43155
trunk: dev
post_implementation_hardening: not scheduled
---

# ruleset-hygiene-1: the release runbook becomes a skill; proportion, known limits, an e2e runtime budget

One arc, one PR into `dev`, docs plus one new label. The planning standard gains a Proportion section, closed `known-limit` issues listed on the Outcome's `Known limits:` line, and a Post-implementation standard that plans cite instead of restating. CLAUDE.md gains an e2e runtime budget and loses its 31.9 KB release runbook to `.claude/skills/release/SKILL.md`. The advisory CI summary step is left out (D1). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: none ([OWNER-ASKS.md](OWNER-ASKS.md)).

## Scope

**In:** the lane brief's five items as revised on 2026-10-13, with the common brief's § Proportion as the wording to carry.
**Out:** code under `apps/` and `packages/`; any required check or ruleset; the aa-skills repository; the shard summary step (D1); edits to files that trigger an e2e lane (D3); a gate for the new rules (D2).

## Outcome & Quality Bar

- **For whom:** every agent session and contributor that loads CLAUDE.md, writes a plan or adds an e2e scenario, and the person running a release.
- **Excellent:** (1) CLAUDE.md shrinks by about 30 KB, and every live reference to a moved section reaches it in one hop. (2) The skill body equals the old section except the edits D4 permits, and a normalized diff proves it. (3) Each rule is written once and cited elsewhere.
- **Good enough:** review enforces the new rules; no new check does.

## Assumptions

**Facts** (verified at 36c43155):
- F1. `OUTCOME_FIELDS` (`scripts/ci-cd/plans/structure.ts:42`) requires `Date:`, `Status:`, `Shipped:`/`Delivered:`, `Seeds retired:` and ignores every other line: `Known limits:` is already accepted and optional, and `Open items:` is documented but unchecked today.
- F2. No check demands restated Post-implementation text (recon.md).
- F3. Only chaos and `canary*` lanes write vitest's json report; the env expression is pinned exactly at `scripts/ci-cd/behavior-gating.test.ts:968`.
- F4. `check:plans` checks that links in `.claude/skills/**`, root `*.md` and `.github/WORKFLOWS.md` resolve to tracked files, and ignores `#fragments` (`scripts/ci-cd/plans/links.ts:34-40,157-168`).
- F5. The runbook is `CLAUDE.md:555-751`: four repo-relative links, and one sentence (`:559`) that calls it "the one runbook still living in CLAUDE.md". No test reads CLAUDE.md's text.
- F6. `auto-unstick-run.test.ts:215` pins only `toContain("Troubleshooting")`; `open-sync-pr-run.ts:91`'s sentence has no pin.
- F7. `_extension-network-e2e.yml` triggers both network lanes; each Firefox caller and `apps/extension/**` trigger e2e lanes; CLAUDE.md, CI.md, `.claude/skills/**`, `scripts/release/**` and `release-prerelease.yml` trigger none.
- F8. GitHub records each job's start and end. Over the jobs named `Run / …` of a run whose first attempt succeeded, `gh run view <id> --attempt 1 --json jobs,conclusion` gives the **CI suite job envelope**: 21 min Chrome network (38364426588), 23 min Firefox network (38373410977), 9 min Chrome smoke (38391403979). It includes setup and teardown, so it is not vitest's test time. A rerun mixes attempts (38373410688 reads 50 min, its cancelled first attempt 35 min).
- F9. The `known-limit` label does not exist yet.

**Inferences:** I1. Claude Code discovers `.claude/skills/release/SKILL.md` as it does the four sibling skills. I2. GitHub derives an anchor from heading text alone, so a lifted heading keeps its anchor.

**Asks:** none for the owner. A1 (the summary step) is answered by D-orch-2: dropped.

## Architecture & Implementation

Text moves and edits, one label; no code path changes. Two strings in `scripts/release/` change wording only.

| File | Change | Phase |
|---|---|---|
| `CLAUDE.md` § Where open work lives, § Implementation plans; `implementations-plan/README.md` rule 5 | the `known-limit` row, the path sentence, the closed-limits search, `Known limits:` in the Outcome | 1 |
| `implementations-plan/README.md` § Proportion (new); `CLAUDE.md` § Implementation plans | the rules, defined once; a short citing paragraph | 2 |
| `implementations-plan/README.md` § Post-implementation standard (new) | the shared execution contract | 3 |
| `CLAUDE.md` § Quality gates → Locally; `.claude/skills/e2e-testing/SKILL.md` § 2 | the runtime budget; how to measure it | 4 |
| `.claude/skills/release/SKILL.md` (new); `CLAUDE.md` `:41`, `:541`, `:553`, `:555-751` | the runbook; routing row, two links, a pointer of at most ten lines | 5 |
| `CI.md` `:34`, `:91`, `:113`, `:175`; `release-prerelease.yml:16`; `auto-unstick-run.ts:124`; `open-sync-pr-run.ts:91` | name the skill instead of CLAUDE.md | 5 |

**Alternative not taken:** trim the runbook in place. Rejected: every session still pays for it, and the lane brief orders the move.

## UI impact

None. No screen, copy or behaviour a person sees changes.

## Security & Adversarial Considerations

- **A dropped runbook line is the real risk.** The manual unstick refuses a 1.0.0 tag while a legal blank remains; losing that line lets an operator tag past it. Phase 5's normalized diff must show only the permitted sentence (Codex mutated three safety lines in memory; each surfaced in the diff).
- The label is created through `gh` with the session's own credentials; it grants nothing. No workflow logic, permission, token or dependency changes; the one workflow edit is a comment, checked by `lint:actions`.
- `bash scripts/check-no-local-paths.sh` runs in every gate.

## Phases

Each phase is one signed commit. Every gate also runs `bun run lint` and `bash scripts/check-no-local-paths.sh` (exit 0).

**Phase 1: known limits.** Add to CLAUDE.md § Where open work lives, after the "Rejected, superseded" row, the lane brief's row: "A finding whose path needs conditions the wallet does not support, or whose consequence does not matter | an issue labelled `known-limit`, closed as not planned in the same breath: failure hypothesis, consequence, missing prerequisite, disposition, reopening condition; the Outcome lists it as `Known limits: #N`". Extend the five-sections bullet: `## What happens` states the path (initial conditions, actions, order, broken invariant, consequence) and labels it demonstrated or plausible but unverified. Add the closed-limits search to the "Finding work" bullet. Add `Known limits:` (the closed `known-limit` issues, or `none`) to README rule 5 and to CLAUDE.md's closing bullet. Create the label: `gh label create known-limit --color 6E7781 --description "no demonstrated path; closed with its reopening condition" --force` (D-orch-3). Change no check (D2).
Gate: `bun run check:plans` exits 0; `gh label list --search known-limit` prints the label.

**Phase 2: Proportion.** Write README § Proportion after § Code and plans: the common brief's § Proportion bullets verbatim, with three substitutions: "lane" becomes "plan"; the approval sentence becomes "the owner approves, and may delegate bounded, reversible changes in writing; persistence, permissions, public contracts, background work and scope expansion stay the owner's"; the e2e bullet becomes one line citing CLAUDE.md § Quality gates (D6). Add a paragraph of at most four sentences to CLAUDE.md § Implementation plans that names the rule and links `implementations-plan/README.md#proportion`.
Gate: `bun run check:plans` exits 0.

**Phase 3: Post-implementation standard.** Write README § Post-implementation standard, harness-neutral ("the reviewer of the other model family", never a script path). It opens with one sentence: a plan cites this section at a named commit and keeps inline its commands, parameters, loop placement, slug, trunk, deviations and approval boundaries. Then: (1) the optional diff review when `code_review` is not `off`, committed separately; (2) the review loop: diff, plan, decision ledger, arc map on a stack, adversarial ask, the two rules; verify the reviewer's claims; fix, commit, log; resume; a resumed round verifies and does not reopen; a design-growing fix stops for approval (§ Proportion); stop after three material rounds; single-arc and per-arc placement, then a fresh cross-arc pass; (3) delivery: no PR, not even a draft, before convergence, title ≤ 93 characters, body with the validation runs and the e2e wall-clocks, `gh pr checks --watch`; (4) close-out: merge trunk first and read `index.md` and `lessons.md`, the Outcome, lessons, open items and known limits, `git mv` to the archive in its own commit with link repair, the index line moved, `check:plans`, then report and wait; (5) teardown: the archive check, `agent-worktree done <slug> --merged`, relay a refusal and stop, and who notices the merge. Copy the no-over-engineering and comment-quality rules verbatim (as in the active plans' Post-implementation sections). Then write this commit's full SHA into this plan's § Post-implementation.
Gate: `bun run check:plans` exits 0; `grep -c 'If code works and is clear, leave it alone' implementations-plan/README.md` prints 1.

**Phase 4: e2e runtime budget.** Add to CLAUDE.md § Quality gates → Locally, after the `audit:vue` paragraph, the common brief's e2e bullet: each added scenario names its distinct failure mode, why a cheaper layer cannot prove it, and its estimated then measured runtime; the PR body states each browser's suite wall-clock before and after; file count is diagnostic only. Copy its last sentence too: a timeout stays visible in the numbers. Add to the e2e skill's § 2 a link to that CLAUDE.md rule, then how to measure: the F8 envelope on first-attempt-green runs of the same workload (the PR's and the latest on `dev`), with cancelled, timed-out and rerun attempts reported apart, and the per-file duration vitest prints for the scenario. Leave out the CI step (D1).
Gate: `bun run check:plans` exits 0; the skill's one-liner prints `21` on run 38364426588.

**Phase 5: the runbook moves to a skill.** (1) Create `.claude/skills/release/SKILL.md`: front matter (`name: release`, a `description` naming its triggers), then `CLAUDE.md:555-751` with D4's edits. (2) Replace `CLAUDE.md:555-751` with a pointer under the same `### Release runbook` heading (D5): what a release is, the near-one-click summary, a link to the skill, a link named "Staged-rollout switches" to its `#staged-rollout-switches`, and "update the skill when the process changes". (3) Point the routing row (`:41`) and the links at `:541` and `:553` at the skill. (4) Repoint the last change-map row's files. Leave archived plans and other plans' prose alone (D5).
Gate: `bun run check:plans`, `bun run test:release`, `bun run test:ci-gating` and `bun run lint:actions` exit 0. Normalize the old section with `git show 36c43155:CLAUDE.md | sed -n '555,751p' | sed -E 's/^##(#+ )/\1/; s#\]\((\.github/|implementations-plan/)#](../../../\1#g'`; its diff against the skill body (all lines after the front matter) changes exactly line 5, the D4 sentence. `git grep -n 'CLAUDE.md#after-a-stable\|(#staged-rollout-switches)' -- CLAUDE.md CI.md` prints nothing.

**Final gate:** `bun run typecheck:all` and `bun run test` exit 0; this plan stays at most 150 lines.

## Decision ledger

- **D1. The shard summary step is left out.** Pool shards write no json report (F3); making them write one changes the pinned env expression, the lane brief's stated fallback. A CLI `--reporter` would replace the configured reporters (annotations, retry errors, stall watchdog). A canary-and-chaos-only step touches no pin but times a fixed five or six files, not the suite. The budget's suite numbers come from the CI suite job envelope (F8), which every run already records; a scenario's own runtime comes from vitest's per-file duration. Editing `_extension-network-e2e.yml` would also run both network lanes on a docs PR (F7).
- **D2. `Known limits:` stays documentation, like `Open items:`.** F1: it is already accepted and optional. Requiring it only on new archives needs a grandfather list or a base-aware check: configuration to keep for a cross-reference whose issues stay findable by label.
- **D3. Three references stay as they are:** the two Firefox caller comments and `FIREFOX.md:84` name CLAUDE.md's staged-rollout switches. Editing them runs their e2e lanes (F7); the pointer keeps a link by that name, so each still resolves in one hop.
- **D4. The moved text changes in three ways.** Headings rise two levels (`###` → `#`, `####` → `##`) so the skill reads as its own document; anchors stay (I2). Four repo-relative links gain `../../../`. The `:559` sentence becomes "CLAUDE.md's § Release runbook and its skill-routing table point here."
- **D5. The pointer keeps the `### Release runbook` heading,** so `#release-runbook` anchors and prose in archived and other active plans still land; live docs and strings point straight at the skill.
- **D6. Where each rule lives.** Proportion, known limits and the Post-implementation standard: README, cited from CLAUDE.md. The e2e budget binds e2e authors: CLAUDE.md § Quality gates, with the measuring steps in the e2e skill.
- **D-orch-1 to D-orch-5 (orchestrator, 2026-10-13).** (1) One PR, no stack. (2) Approved as planned; A1: D1 stands, no pin change, no CI step; suite numbers come from the F8 envelope. (3) The label is created exactly as Phase 1 gives it; another lane runs the same command, so the two cannot disagree; the row, the path sentence and the search carry the common brief's § Proportion wording. (4) README § Proportion and § Post-implementation standard are the one authoritative home; CLAUDE.md cites them in short paragraphs; the standard is harness-neutral, and its review-loop step states the two rules verbatim and that a resumed round verifies and does not reopen a settled disposition without new evidence. (5) Commit trailers name the model that ran (`Claude Opus 5.5`).

## Audit verdicts

**Round 1, Codex (gpt-6.1-sol, high, read-only; session `01a13515-7586-70c3-b0e4-a51c3a30f23d`), 2026-10-13: reject.** The lane brief and common brief changed on disk during the audit.
- R1-1 High: Phases 1, 2 and 4 carried the superseded rules. Accepted: rewritten against the revised briefs.
- R1-2 Medium: the cited standard was unversioned and incomplete. Accepted: Phase 3 lists the whole contract and records its commit; the merge-notice line is in § Post-implementation.
- R1-3 Medium: recon missed `FIREFOX.md:84`; Phase 5 did not require the pointer to name the switches. Accepted: both fixed; D3 is a decision with its cost, not a residual.
- R1-4 Medium: D2 did not settle documentation versus gate. Accepted: documentation, with the reason.
- Normalizer: sound; require the exact permitted sentence. Accepted (Phase 5 gate).

**Round 2, Codex (same session resumed), 2026-10-13: conditional approve.** R1-1 to R1-4 verified as resolved.
- R2-1 Medium: F8 called a rerun's completion latency suite runtime (traced on 38373410688, attempt 2). Accepted and reproduced: F8 is the CI suite job envelope of a first-attempt-green run; failed and rerun attempts are reported apart.
- R2-2 Low: the e2e skill gave the measuring steps without citing the rule. Accepted: Phase 4 links it and copies the timeout sentence.
- Both conditions are met in this revision. No third round: the orchestrator allowed a second only on a material finding.

## Delivery

Single arc: `gh pr create --base dev` from `worktree-ruleset-hygiene-1`, after the loop converges. Title: `docs(claude): move the release runbook into a skill; add proportion and e2e budget rules` (88 characters). No `Closes` line, no label (F7). The close-out is this PR's final commits. `code_review`: off.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at commit `<Phase 3 SHA, written by Phase 3>`. Specific to this plan:

- **Loop:** single arc, once over the whole diff after the final gate; round 1 at `high`, a second only on a material finding. `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; resume with `resume-codex.sh "" <followup> <codex-dir> high`. On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`, then log it and continue within scope. The prompt asks for dropped runbook lines first.
- **Approval boundary:** the orchestrator approves plan changes; the owner keeps persistence, permissions, public contracts, background work and scope.
- **Delivery:** the PR body gives no wall-clock (no e2e lane runs) and says so.
- **Close-out:** `Known limits:` and `Open items:` read `none` unless the loop files one. Lesson candidate: git's `*` pathspec crosses `/` (smoke files read 173 instead of 55 without `:(glob)`). Delete `STATUS.md`, keep `OWNER-ASKS.md`, archive to `implementations-plan/archive/ruleset-hygiene-1`.
- **Teardown:** the orchestrator merges and tells the session; a `/loop` session also checks each firing. Then, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ruleset-hygiene-1/plan.md` succeeds, run `agent-worktree done ruleset-hygiene-1 --merged --trunk dev`. The session starts inside the worktree, so it has nothing to exit.

## Seeds

Recommended: `/goal`. Drafts until the orchestrator approves.

```
/goal Phases 1-5 of implementations-plan/ruleset-hygiene-1/plan.md are marked ✓, each backed by its gate reported passing in the transcript, including Phase 5's normalized diff changing only line 5; LESSONS_FILE=implementations-plan/ruleset-hygiene-1/lessons/phase-N.md printed per phase; /code-review NOT run; the Codex loop (run-codex.sh … high read-only gpt-6.1-sol) converged, quoted; the PR into dev exists, opened after the loop (gh pr view in the transcript), with the archive-move commit (git show --stat); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/ruleset-hygiene-1. Never idle. Each firing: read plan.md and lessons/; if the plan moved to archive/, run the teardown in § Post-implementation and stop. Otherwise take the next unmarked phase, run its gate, mark ✓, log lessons, commit (signed). After the final gate: the Codex loop, Delivery, the close-out, then report and stop. A decision you would bring to a person goes to Codex; anything a person sees goes to OWNER-ASKS.md. Never merge, never push to main, never edit a file that triggers an e2e lane.
```
