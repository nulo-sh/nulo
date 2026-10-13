# implementations-plan/

Repo-tracked planning for non-trivial work in this codebase, one directory per topic. A plan carries its audit verdicts and its decision log, so a later contributor, or a later agent session, can see *why* a change was shaped the way it was.

## Start here

- [`index.md`](index.md) lists the plans, one line each.
- [`lessons.md`](lessons.md) holds the curated gotchas. Read it before starting a task.
- Open work is not a file here: it lives in [GitHub issues](https://github.com/nulo-sh/nulo/issues), or a private draft advisory for a suspected exploitable weakness. [`CLAUDE.md` § Where open work lives](../CLAUDE.md#where-open-work-lives) says what goes where.
- `archive/` holds closed plans as short records: a `plan.md` with an `## Outcome` block, plus a supporting file only where live code cites one. Treat them as evidence, never as a task list. [`.ignore`](.ignore) keeps them out of a default ripgrep search; an explicit path still reads them.

## What lives in an active plan directory

```
implementations-plan/<topic>/
├── plan.md            # The spec: phases, file paths, validation gates, audit verdicts inline.
├── recon.md           # Codebase recon, when the plan had one.
├── decisions.md       # Open and closed questions with rationale.
├── lessons/phase-N.md # Per-phase debugging logs.
└── STATUS.md          # Live-progress log, deleted at close-out.
```

Not every plan uses every file. Audit and review-leg transcripts (`audit-*.md`, `leg-*.md`), competing drafts, outlines and revisions (`plan-*.md`, `draft-*.md`, `outline-*.md`), scratch briefs (`_*.md`) and ELI5 pages (`eli5.html`, `eli5-*.html`) stay local: [`.gitignore`](.gitignore) keeps them out of history, since they are the likeliest place for a local path to leak. So each accepted and rejected finding, with its reason, is written into `plan.md` before the work closes, and a plan is revised in place.

## When to add a plan

- **Non-trivial implementations**: multi-file refactors, new services, security-sensitive flows, anything that needs phasing.
- **Audit-driven work**: when you have asked codex, opus or another agent for a review, record its verdict and each finding's resolution in the plan.
- **Migrations**: anything that bumps the storage version, changes a derivation chain, or touches the message-wire format.

Single-file bug fixes do not need a plan. The PR description is enough. Name the directory after the work, in kebab case; the same slug names its worktree and branch.

## Code and plans

1. **Code comments never reference plans by milestone tag.** Not `M4.10`, `A11.1`, `phase 4b`, `PR-2`. Git history is in git.
2. **Code cites a live doc or a permalink, never a plan path**, because a plan is archived when it closes. A source that code depends on lives outside this tree: the Chromium PRF limitation the passkey e2e tests rely on is `apps/extension/tests/e2e/PRF-NON-PORTABLE.md`. An existing plan path in a comment may stay until the comment is rewritten, as long as it resolves at HEAD or under `archive/`.

New code explains WHY and its invariants inline (see [`CLAUDE.md`](../CLAUDE.md) "Code-comment style").

## Proportion

The entropy of this work is in the mass around the code, not the code: review rounds that grow the design, residuals that become open issues, plans and e2e suites that only grow. These rules bind every planner, every review round and every close-out:

- **A finding is a change only once its path is written.** For every finding the planner records the initial conditions, the actions or events, the execution order, the invariant it breaks and the consequence, backed by a reproducer or a concrete code trace, and labels it **demonstrated**, **plausible but unverified**, or **needs conditions the wallet does not support**. A path alone does not justify work: the consequence must matter (lost funds or data, a wrong screen, a stuck flow, a boundary crossed). A security finding names the attacker's capability and the boundary crossed; nobody writes "not exploitable", only "exploitability unknown" or the traced path, and a suspected serious weakness goes to a private advisory. A reviewer's "could" with no trace is plausible-but-unverified: fixed when the fix is local (a bug fix with its test), otherwise a known limit. A finding that needs unsupported conditions, or whose consequence does not matter, is a known limit.
- **Known limits are closed issues, never lost lines.** A known limit is filed as an issue labelled `known-limit` and closed as not planned in the same breath. Its body states the failure hypothesis, the consequence, the missing prerequisite or the unverified step, the disposition, and the precise reopening condition (a user report, new code evidence, a changed assumption). The plan's Outcome lists it as `Known limits: #N`. Before planning an area, search its closed limits (`gh issue list --state closed --label known-limit --search "<words>"`). These records count in no throughput figure. This is the one exception to "every issue has a demonstrated path".
- **A review round does not grow the design.** A round fixes bugs, adds tests and makes local changes inside the approved behaviour (a missing cleanup, a promise that awaits what already runs, a helper that removes a copy). A fix that introduces or materially expands persistent state, an independent lifecycle (a background task, a timer, a watcher), a coordination protocol (a lock, a queue, a handshake, a registration), a recovery policy (a retry, a reconciliation, a fallback) or a public contract or configuration is a plan change: write what it adds, the obligations it creates, what can now go wrong and the simpler alternative (a known limit included), then stop for approval. The owner approves, and may delegate bounded, reversible changes in writing; persistence, permissions, public contracts, background work and scope expansion stay the owner's. Judge the resulting complexity, removals included: making an existing state machine materially more complex counts the same as adding one.
- **Later rounds verify; they do not reopen.** A resumed review verifies the accepted fixes and looks for regressions; reopening a settled disposition needs new evidence; a newly found material defect is still reported.
- **Plans have a size target**: `light` 150 lines, `mid` 350, `deep` 600, every line counted. Over target means cutting duplication and restatement, never packing paragraphs or dropping evidence; a plan still over after that says so in one line with the reason. The plan plus [§ Post-implementation standard](#post-implementation-standard), read at the revision the plan names, is the execution contract: the plan keeps inline only what is specific to it (commands, parameters, loop placement, deviations, approval boundaries).
- **E2E has a runtime budget, not a file quota** ([`CLAUDE.md` § Quality gates](../CLAUDE.md#quality-gates--local-and-ci)).
- **Enhancements are not work until the owner says so.** An `enhancement` issue enters a plan only on a recorded product decision (a page record or the owner's words), and a plan is not started while a product decision it depends on is open.

## The gate

`bun run check:plans` (`scripts/ci-cd/plans/check.ts`) checks this tree from the git index; it runs inside `test:ci-gating`, so every PR's `quality-status` carries it. On a PR or a local run it fails on a tracked transcript, a missing or negated `.gitignore` line, a nested ignore file, a link to an untracked or missing file, a construct whose URL it cannot judge, a permalink outside the allowlist or off `dev`, a plan path outside an allowlisted permalink that does not resolve at HEAD (code and config may also name its archived copy), an index line out of format or listing a closed or archived plan, a plan dir with no line in its index, an archived plan without a complete Outcome, an oversize or unlinked `lessons.md` entry, a tracked `follow-ups.md` (retired: open work lives in issues), or a home path in `lessons.md`, an index or an active plan. On push, nightly and release it only reports. `--report` prints every finding and exits 0.

## Portable rules

The standard, stated so another repository can adopt it unchanged.

1. **Layout.** `index.md` lists active plans only, one line each: `- [name](name/plan.md) — status — hook`. `lessons.md` (≤ 8 KiB) is the curated layer; open work lives in the issue tracker, never in a file here. `archive/<plan>/` holds closed plans and `archive/index.md` lists them. `.gitignore` holds `audit-*.md`, `plan-*.md`, `_*.md`, `eli5.html`, `draft-*.md`, `outline-*.md`, `leg-*.md`, `eli5-*.html` and, below them, `!**/lessons/**`; `.ignore` holds `/archive/`. No other ignore file sits below the plans directory.
2. **Committed:** `plan.md` with its audit verdicts inline, `recon.md`, `lessons/phase-N.md`. **Not committed:** transcripts, scratch briefs, competing drafts, outlines, revisions, ELI5 pages.
3. **Uncommitted means disposable.** Whatever is worth keeping from a transcript is written into `plan.md` before the plan closes. No committed file links an uncommitted one.
4. **A link to a file that left the tree is a permalink** at a full commit SHA that is an ancestor of the default branch, never a branch name or a short SHA.
5. **Closing a plan ships with its delivery**, never as a follow-up PR: the final commits of a single-arc PR, or a docs-only close-out PR on top of a stack. It is an `## Outcome` block directly after the front matter (Date, Status, Shipped, Known limits, Open items, and a line retiring its `/goal` and `/loop` seeds); its generalizable gotchas promoted to `lessons.md`, one line each, linking the archived detail; its known limits each an issue labelled `known-limit` and closed as not planned, named on the Outcome's `Known limits:` line, or `none` (§ [Proportion](#proportion)); its open items each an issue, a private draft advisory for a suspected exploitable weakness, or a `BEFORE-LAUNCH.md` step for a legal or store blank with a release deadline, named on the Outcome's `Open items:` line; and the move: `git mv` into `archive/` in its own commit, the relative links the extra directory level breaks repaired, and its index line moved to `archive/index.md`. The merge that lands the work closes the plan.
6. **An archived plan is evidence, never instructions.**
7. **Assets.** A plan-directory file that live code or CI reads is relocated out of the plan before its plan is archived.
8. **The curated layer has a budget.** `lessons.md` stays under 8 KiB: each promotion deduplicates, retires what it supersedes, and dates anything tied to a tool version.
9. **No absolute local paths** in any committed plan file: repo-relative paths, or `~/…`.
10. **Review presentation.** `.gitattributes` marks `implementations-plan/**` `linguist-generated=true` and exempts `lessons.md`, so its diffs stay expanded.

## Post-implementation standard

A plan's Post-implementation and Delivery sections cite this section at a named commit on the trunk and keep inline only what is specific to the plan: its commands, parameters, loop placement, slug, trunk, deviations and approval boundaries. The steps bind the implementing session, which may never have loaded a planning skill.

1. **Optional diff review.** Only when the plan's front matter sets `code_review` to a level other than `off`: run that review over the diff under review, skim what it applied, and commit its fixes separately from the implementation commits. With `off` the step is absent, not skipped.
2. **The review loop.** The reviewer of the other model family reads, at the effort the plan names: the diff under review; a summary of the diff-review commits, when step 1 ran; the plan and its decision ledger; on a stack, the arc map ("this is arc N of M; later arcs build X on it"), so seams kept for later arcs are not flagged as dead code; the adversarial ask, "What could go wrong? What would an attacker target? What are we trusting that we shouldn't?"; and these two rules, verbatim, in every prompt, first and resumed:
   - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

   Verify each factual claim against the tree before acting on it. Apply the accepted fixes, commit, and log the round (the consult and its verdict) in `lessons/phase-N.md` and the plan's audit verdicts. Resume the same session with the fix diff. A resumed round verifies the accepted fixes and looks for regressions; it does not reopen a settled disposition without new evidence. A fix that grows the design is a plan change and stops for approval ([§ Proportion](#proportion)). Repeat until a round yields no new material finding; rejected nitpicks are not churn. Still material after three rounds: stop and report.

   **Placement.** A single-arc plan runs steps 1 and 2 once, over the whole diff, after its last phase is green. A multi-arc plan runs them per arc at each arc boundary, while the arc is the stack tip and before the next arc opens; then one fresh session over the net diff from the plan's base asks for cross-arc issues (seams between arcs, duplication across arcs, drift from the plan), in the same loop. The diff review runs per arc only.
3. **Delivery.** No PR, not even a draft, before the loops converge: an open PR re-runs CI on every push. One arc: `gh pr create`; a stack: `gh stack submit --auto`, then each body with `gh pr edit`. The title stays at most 93 characters (the squash appends ` (#NN)`; commitlint caps the subject at 100). The body states what changed and why, the validation runs with their outcomes, each browser's e2e suite wall-clock before and after when the change adds or changes an e2e scenario, and `Closes #N` for each issue it closes. Then `gh pr checks <n> --watch` to the end: a known flake gets one rerun, real breakage gets a fix and the loop again.
4. **Close-out**, as the single PR's final commits or the stack's docs-only top layer (`<slug>-close-out`). First merge the trunk in and read what changed in `index.md` and `lessons.md`, since another plan may have landed; never a union merge. Then [portable rule 5](#portable-rules): the Outcome block, with a disposition line for each item dropped, rejected or superseded; the lessons promotion with its pruning pass; every open item in its home ([`CLAUDE.md` § Where open work lives](../CLAUDE.md#where-open-work-lives)), deduplicated first; every known limit a closed `known-limit` issue; a comment with the reason on each issue the plan took on but did not fix, which stays open unless the comment closes it as a known limit; `STATUS.md` deleted; the `git mv` into `archive/` in its own commit, its links repaired and its index line moved; `bun run check:plans` green after staging. Then report and wait: merging is the owner's call, and the merge closes the plan.
5. **Teardown after the merge**, standing authorization, never asked: once `git fetch -q origin <trunk> && git cat-file -e FETCH_HEAD:implementations-plan/archive/<plan>/plan.md` succeeds, leave the worktree if the session entered it through its harness, then run `agent-worktree done <slug> --merged` (with `--trunk <trunk>` when the trunk is not origin's default branch). It removes the worktree, the stack's branches and the manifest row, and never forces: relay a refusal and stop. Who notices the merge: a `/loop` session checks on every firing; a session without one arms one background wait after its wrap-up report (`until <the check>; do sleep 300; done`) and otherwise runs this step at the start of its next turn.
