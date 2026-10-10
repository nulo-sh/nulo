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
└── STATUS.md          # Live-progress log, deleted after merge.
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

## The gate

`bun run check:plans` (`scripts/ci-cd/plans/check.ts`) checks this tree from the git index; it runs inside `test:ci-gating`, so every PR's `quality-status` carries it. On a PR or a local run it fails on a tracked transcript, a missing or negated `.gitignore` line, a nested ignore file, a link to an untracked or missing file, a construct whose URL it cannot judge, a permalink outside the allowlist or off `dev`, a plan path outside an allowlisted permalink that does not resolve at HEAD (code and config may also name its archived copy), an index line out of format or listing a closed or archived plan, a plan dir with no line in its index, an archived plan without a complete Outcome, an oversize or unlinked `lessons.md` entry, a tracked `follow-ups.md` (retired: open work lives in issues), or a home path in `lessons.md`, an index or an active plan. On push, nightly and release it only reports. `--report` prints every finding and exits 0.

## Portable rules

The standard, stated so another repository can adopt it unchanged.

1. **Layout.** `index.md` lists active plans only, one line each: `- [name](name/plan.md) — status — hook`. `lessons.md` (≤ 8 KiB) is the curated layer; open work lives in the issue tracker, never in a file here. `archive/<plan>/` holds closed plans and `archive/index.md` lists them. `.gitignore` holds `audit-*.md`, `plan-*.md`, `_*.md`, `eli5.html`, `draft-*.md`, `outline-*.md`, `leg-*.md`, `eli5-*.html` and, below them, `!**/lessons/**`; `.ignore` holds `/archive/`. No other ignore file sits below the plans directory.
2. **Committed:** `plan.md` with its audit verdicts inline, `recon.md`, `lessons/phase-N.md`. **Not committed:** transcripts, scratch briefs, competing drafts, outlines, revisions, ELI5 pages.
3. **Uncommitted means disposable.** Whatever is worth keeping from a transcript is written into `plan.md` before the plan closes. No committed file links an uncommitted one.
4. **A link to a file that left the tree is a permalink** at a full commit SHA that is an ancestor of the default branch, never a branch name or a short SHA.
5. **Closing a plan ships with its delivery**, never as a follow-up PR: the final commits of a single-arc PR, or a docs-only close-out PR on top of a stack. It is an `## Outcome` block directly after the front matter (Date, Status, Shipped, Open items, and a line retiring its `/goal` and `/loop` seeds); its generalizable gotchas promoted to `lessons.md`, one line each, linking the archived detail; its open items each an issue, a private draft advisory for a suspected exploitable weakness, or a `BEFORE-LAUNCH.md` step for a legal or store blank with a release deadline, named on the Outcome's `Open items:` line; and the move: `git mv` into `archive/` in its own commit, the relative links the extra directory level breaks repaired, and its index line moved to `archive/index.md`. The merge that lands the work closes the plan.
6. **An archived plan is evidence, never instructions.**
7. **Assets.** A plan-directory file that live code or CI reads is relocated out of the plan before its plan is archived.
8. **The curated layer has a budget.** `lessons.md` stays under 8 KiB: each promotion deduplicates, retires what it supersedes, and dates anything tied to a tool version.
9. **No absolute local paths** in any committed plan file: repo-relative paths, or `~/…`.
10. **Review presentation.** `.gitattributes` marks `implementations-plan/**` `linguist-generated=true` and exempts `lessons.md`, so its diffs stay expanded.
