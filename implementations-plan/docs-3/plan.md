---
plan: docs-3
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
trunk: dev
base: 210d02f1f
---

# docs-3 — two SECURITY.md corrections (#1186, #1274)

#1274: five dependency paragraphs sit at the end of § Binary dependencies, where pointers to § Dependency policy do
not lead. #1186: #1142 had already fixed the passkey sentences; checking the same section found one clause the code
does not support. Docs only, one file (`SECURITY.md`); evidence and search trails in `recon.md`.

## Outcome & Quality Bar

- **For whom**: a maintainer who handles a CVE or a dependency bump under time pressure and follows a pointer to
  § Dependency policy; a reviewer who reads § Strict-mode toggle semantics to judge a change to the session code.
- **Excellent**: (1) every dependency paragraph is in § Dependency policy, word for word, and every pointer and anchor
  into SECURITY.md resolves to what it names; (2) each strict-mode sentence matches the code, and the PR cites the
  `file:line` or the test for each sentence it changes.
- **Good enough**: no rewording of the moved text, no other reordering, no duplicates pruned (lane brief).

## Assumptions

**Facts** (verified at `210d02f1f`; trails in `recon.md`):
1. #1142 (`518170a18`) rewrote #1186's quoted sentences; SECURITY.md:118-121 and :182-188 now say what
   `session-manager.ts:299` does, pinned by `unlock-method.composition.test.ts:176` and `service.passkey-unlock.test.ts:744`.
2. SECURITY.md:162-164's second cause, "a toggle that lands while a restarting worker is restoring the session", is no
   separate path: in every ordering the bearer goes unless a storage read or write fails or the worker stops before
   the persisted bearer is removed (`recon.md` § Claim A has the trace).
3. § Binary dependencies holds five dependency paragraphs after "License posture" (SECURITY.md:839-896): the CVE-on-Friday
   runbook, Bun bug #25305, `bun pm scan`, the Aztec line, the Bun-version sync trap. #1274 names three.
4. They are bold-led, not headings; the only anchors into the file are `#binary-dependencies` (×3) and
   `#how-findings-are-tracked` (×1), and both stay. `bunfig.toml:37` and `CLAUDE.md:105` (§ Dependency policy, runbook
   step 4) become exact after the move; SECURITY.md:551-554's "further down this file" stays true.
5. No test or script reads SECURITY.md (`recon.md`, reuse map).

**Inferences**: (a) #1186 was filed against a tree without #1142, which merged five hours later. Why the
mid-restore clause and the code disagree is unknown: both arrived in the repository's first commit (`e1c75331a`).
(b) The shipped popup cannot reach the mid-restore race: a client posts only after Ready, which the worker sends once
its services have started (`packages/extension-messaging/src/background/service.ts:65-76`), after `restore()`. The
re-check at `session-manager.ts:654` is defence in depth. Nothing in E2 rests on this.

**Asks**: none for the owner (contributor docs; no product UI change). `OWNER-ASKS.md` says none.

## Architecture & Implementation

Reuse: § Dependency policy is "the full version" (CLAUDE.md § Dependency policy), so the paragraphs join it. No link
edits: no heading moves.

- **E1 (#1274)**: cut SECURITY.md:838-896: the blank line before the runbook, then the five paragraphs to the end of
  the file. Paste that block after the "**Lockfile is text (`bun.lock`)**" paragraph (:630-631), before line 632's
  blank line and `## GitHub Actions`, in present order. The result: one blank line on each side of the block, and
  the file ends with "License posture"'s last line. Change no word, no step number and no heading.
- **E2 (#1186)**: at SECURITY.md:162-164, replace "a bearer can be left behind by a failed storage write (logged, not
  retried) or by a toggle that lands while a restarting worker is restoring the session." with "a bearer can be left
  behind by a failed storage read or write (logged, not retried), or by a worker that stops before the removal
  completes." No sentence claims the race is closed.
- **Not changed**: the rest of :99-188 (`recon.md` § Claim A), `bunfig.toml`, `CLAUDE.md`, the moved text.

### Decision ledger

| # | Question | Chosen | Rejected, and why |
|---|---|---|---|
| D1 | #1186's disposition | `Closes #1186`: #1142 fixed the quoted sentences; this PR fixes the one clause in the same section that the code does not support (E2) | comment and close without a PR: the lane closes both in one PR, and the check found E2; leave it open: nothing remains |
| D2 | Which paragraphs move | all five (Fact 3) | the issue's three: #25305 and `bun pm scan` are dependency topics too, and would stay behind the presto licence paragraph, the same defect |
| D3 | Where in § Dependency policy | the end, present order (the issue's fix) | each beside its kin (#25305 after the age gate, the sync trap after "Bun pinned"): reorders the section, which the lane keeps, and needs bridging words |
| D4 | Edits inside the moved text | none | "a few jobs" → "five", merging the sync trap into "Bun pinned", pruning #25305's copies: substance edits the lane excludes; "a few" is not false |
| D5 | E2's shape | drop the clause; list what does leave a bearer: a failed read or write, a worker that stops first | state the race as closed (first draft; Opus 1 kept that, with a fuller mechanism): a failed read and a stopped worker leave the bearer, so "none" is false (Codex 1, Opus 4); keep the clause: false |
| D6 | The presto paragraphs after geckodriver (`recon.md`, adjacent) | out of scope; a closed `known-limit` issue at close-out (no duplicate found): the next sentence names `~/.presto/versions/` and port 59833, so the cost is a re-read, below the Proportion bar | an open `documentation` issue (Opus: a fixable defect, not a residual): no traced consequence (Codex 4); fold into E1: the lane keeps the section order |
| D7 | Restore from a backup absent from the bearer-writing list (:170-171) | no change: "import" covers a backup import in the repo's own vocabulary, and :119-121 covers every session open | add "or restore": no reader acts on the difference |
| D8 | Sentences a skill owns | the Aztec procedure is `aztec-update`'s; the moved paragraph holds only the exception and a pointer; the PR says so | — |

## Security & Adversarial Considerations

- **Threat model**: no gate, permission, config or code changes. Two doc risks. (1) A move that drops or alters a
  runbook step, so a CVE response skips the "remove the exclude in the same PR" step: phase 1's gate rebuilds the
  expected file byte for byte. (2) E2 understates a residual, so a reviewer believes no bearer survives strict ON: E2
  keeps the failed write, adds the failed read and the stopped worker, and drops only the refuted path.
- **Supply chain**: the age gate, the frozen lockfile and `bun audit` are unchanged. Least privilege, crypto, input
  validation and domain risks: not applicable.

## Phase 1 — move the dependency paragraphs (#1274)

UI impact: none (contributor doc). File: `SECURITY.md`. Tests: none added; no test reads the file (Fact 5).
Commit: `docs(security): the dependency paragraphs move under dependency policy`.

**Validation gate**
- Commands (before phase 2), with `b.md` the base file (`git show 210d02f1f:SECURITY.md > b.md`, in the scratch dir):
  `{ sed -n '1,631p' b.md; sed -n '838,896p' b.md; sed -n '632,837p' b.md; } | cmp - SECURITY.md`;
  `diff <(grep '^#' b.md) <(grep '^#' SECURITY.md)`; `grep -n` for the five bold leads and the three `##` headings
  around them; `bun run lint`; `bun run test:ci-gating`.
- Pass criteria: `cmp` and `diff` print nothing (the file is the base with lines 838-896 moved after line 631, byte
  for byte). Each bold lead falls between `## Dependency policy` and `## GitHub Actions`, in its old order. Lint and
  `test:ci-gating` exit 0.
- Layers: lint, unit (`test:ci-gating`). No e2e: no suite reads the file.

## Phase 2 — the strict-mode clause (#1186)

UI impact: none. File: `SECURITY.md` (:162-164). Tests: none added; the cited tests exist and must pass.
Commit: `docs(security): name what can leave a bearer after strict mode turns on`.

**Validation gate**
- Commands: `cd apps/extension && bun --bun vitest run src/wallet/services/profile/session-manager.test.ts
  src/wallet/services/profile/unlock-method.composition.test.ts src/wallet/services/profile/service.passkey-unlock.test.ts`;
  `bun run lint`; then, after staging the plan files, `bun run check:plans`; on the final head once:
  `bun run typecheck:all`, `bun run test:all`.
- Pass criteria: each exits 0. `git diff HEAD~1 -- SECURITY.md` shows E2's change only.
  `git grep -n 'restarting worker is restoring' SECURITY.md` prints nothing (one line in the old text);
  `git grep -c 'failed storage read or write' SECURITY.md` prints 1.
- Layers: lint, typecheck, unit (the three cited test files and `test:all`).

## Delivery

Single arc, single PR, no stack: branch `docs/docs-3` off this plan's commit, PR into `dev`, title
`docs(security): move dependency paragraphs to their section, correct a strict-mode clause` (89 characters). Body:
what moved and why (five paragraphs, not three: D2), E2 with its trace and test, that #1142 had fixed #1186's quoted
sentences, D8's skill note, the gates with outcomes, `Closes #1186` and `Closes #1274`. No label. The close-out lands
as the PR's final commits. `code_review: off`.

## Post-implementation

Follows `implementations-plan/README.md` § Post-implementation standard at `210d02f1f`, single-arc placement. Here:
- Review loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's
  diff against this plan's commit, resumed with `resume-codex.sh` until no new material finding; hard stop at three
  rounds. One Opus diff review (`Agent`, `model: "opus"`, `general-purpose`) runs beside the first round.
- Gates once more on the final head, then `gh pr create --base dev`, then `gh pr checks <n> --watch` once. Merging is
  the orchestrator's call.
- Close-out per the standard's step 4: merge `origin/dev` first; the Outcome; D6's closed `known-limit` issue (the
  Outcome's `Known limits:` line); `STATUS.md` deleted; the archive move in its own commit. Teardown per step 5, slug
  `docs-3`, trunk `dev`.

## Audit verdicts

**Codex, round 1 (gpt-6.1-sol, high): `conditional approve`.** 1. Medium, demonstrated: E2's first draft called the
race closed; a toggle during the alarm await (:682) is cleared by `clearBearer`, and a failed read (:581-589, :555)
keeps the bearer. Accepted (D5). 2. Low: an unsupported inference on the clause's history; "no product UI change".
Accepted. 3. Medium, demonstrated: sorted lines miss a reorder in the block. Accepted: byte-exact rebuild. 4. Low: D6's
open issue names no consequence. Accepted: closed `known-limit`. D1-D4 and D8 sound; no pointer made false.

**Opus Plan leg (opus): `conditional approve`.** 1 = Codex 1; its "leaves none beyond that case" text rejected (D5).
2. Medium, plausible: cutting 839-896 leaves a stray blank line. Accepted: E1 names 838-896. 3. Low: the phase-2 grep
could pass vacuously. Accepted: a negative and a positive grep. 4. Low: strict ON is saved before `clearBearer` runs,
so a stopped worker keeps the bearer until the next start (`config/store.ts:44-66`, :611). Accepted into E2. 5. Info:
the popup cannot reach the race (Ready gate). Inference (b). 6. Low: a comment on #1186 citing `518170a18`: already
there (2026-10-27). D6: dissent in the ledger.

**Codex, final pass (resumed session): `approve`.** E2 verified word by word; the rebuild reproduces E1 byte for byte.
Two low fixes taken: recon's reuse map named the sorted check; Fact 2 said "before `clearBearer` runs" (now "before
the persisted bearer is removed"). Its suggested "before the removal completes" replaces "runs" in E2. Over the light
target (150 lines) by these audit records.

## Seeds

Not run (orchestrator-owned). `/goal`: phases 1 and 2 ✓ with their gates pasted; the Codex loop converged; the PR into
`dev` open with `Closes #1186`, `Closes #1274` and the close-out on it; `bun run check:plans` and `bun run lint` exit 0.
`/loop`: until that PR is open and its checks are green, read `STATUS.md`, run the next unticked gate, fix a red one.
