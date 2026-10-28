# Phase 0 — planning consults

## Consult 1 — Codex plan audit (gpt-6.1-sol, high, read-only), 2026-10-27

Verdict: `conditional approve` (correct the title budget; bind the squash to the chosen subject). Findings:
1. Medium, demonstrated: a 93-character title on a four-digit PR lands a 101-character subject; the budget is 92.
2. Medium, plausible: an edited title is not atomic with the merge; `gh pr merge --squash --subject` is.
3. Low, demonstrated: CLAUDE.md § Branching's 93-character bullet says a long title reds commitlint; nothing lints a squash subject.
4. Low, demonstrated: the recon overstated the heuristic (the "Dependabot commit" is an author-name substring match; the prefix enters the last fallback).

## Consult 2 — Opus Plan leg (opus), 2026-10-27

Verdict: `conditional approve` (reword CLAUDE.md § Branching's length bullet; name the owner as merger; squash only).
It found that the orchestrator's watcher squashes with no subject and that a Dependabot PR is the owner's unless
delegated, which turns D2 from Codex's `gh pr merge --subject` to a title edit that every squash path honours.

## Consult 3 — Codex final pass (resumed), 2026-10-27

Verdict: `approve`. It withdrew `gh pr merge --subject` on the new evidence (owner's merge box, the watcher's plain
squash) and asked for "may rewrite; recheck after an update" in the step, which the plan took.
