---
plan: legal-dating-2
tier: light
status: approved (Codex r3)
issues: none (supersedes PR #1538)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit, resumed until approve
base: origin/dev at fa6913668
trunk: dev
post_implementation_hardening: not scheduled
---

# legal-dating-2: date Terms 1.2.1 and privacy 1.2.8 and 1.2.9 for the 1.2.0 promote

The owner set 4 November 2026 as the 1.2.0 promote day. `BEFORE-LAUNCH.md` § 4 says Terms 1.2.1, privacy 1.2.8 and privacy 1.2.9 each take effect the day the promote publishes them; on `dev` all three still read `«FILL: effective date»`. The `launch-legal` job refuses a PR into `main` while `legal/terms.md` or `legal/privacy.md` holds a `«FILL` line, so the promote cannot pass without this change. PR #1538 dates Terms 1.2.1 alone, to 3 November 2026; this plan supersedes it. No issue tracks the work; the lane brief is the scope. Recon: [recon.md](recon.md).

**UI impact.** `nulo.sh/terms` and `nulo.sh/privacy` (and AMO's privacy field, pasted by hand) show `4 November 2026` where they now show the placeholder or "not yet effective", and lose the DRAFT banner once `main` deploys. That is the date the owner set; no other surface changes. The extension shows no effective date (recon § Reuse map).

## Outcome & Quality Bar

- **For whom**: a person who reads the Terms or the Privacy Policy on `nulo.sh` after the promote, and the release owner, whose promote PR must pass `launch-legal`.
- **Excellent**: (1) each of the three versions reads `4 November 2026` in every place that dates it (version line, every history row that names it, the archived 1.2.8 copy, the manifest), and no other byte of those files changes; (2) `BEFORE-LAUNCH.md` ticks exactly the boxes this PR completes, so the post-deploy and dashboard steps stay visibly open.
- **Good enough**: no new test (D3); no local e2e run (D4).

## Assumptions

- **Facts**:
  - F1: the placeholders are `legal/terms.md:3`, `:571`; `legal/privacy.md:3`, `:471`, `:472`; `legal/archive/privacy-1.2.8.md:3`, `:470`; and `effective: null` for terms 1.2.1, privacy 1.2.8 and privacy 1.2.9 in `packages/legal/src/manifest.ts` (recon § Reuse map).
  - F2: `manifest.test.ts:54-60` holds every archived copy's version line to its manifest entry, so dating privacy 1.2.8 in the manifest reds unless `archive/privacy-1.2.8.md:3` changes in the same commit.
  - F3: no test holds a `terms.md` or `privacy.md` history row's date to anything: `manifest.test.ts:49-52` compares versions only. G2 proves the row edits.
  - F4: precedent dates the version line, the history row and the manifest entry, and the archived copy's own version line and row (`c96986491`, #1229; `9458838fd`, #893). The format is `D Month YYYY` (recon § Precedent).
  - F5: the extension renders no effective date, and acceptance status reads the Terms version only, so a patch's date moves no acceptance. The landing deploys from `main` only.
  - F6: `NULO_LAUNCH_GATE=1 bun run test src/launch.test.ts` in `packages/legal` reads the root `package.json` version (1.1.0), so it refuses the base tree locally and is the `launch-legal` check (`pr-quick.yml`).
  - F7: `packages/legal/**` trips the smoke and network e2e path filters, so the PR runs all four e2e lanes (CLAUDE.md § Terms acceptance).
  - F8: PR #1538 is a draft on `worktree-legal-dating-1`, checked out in another lane's worktree.
- **Inferences**:
  - I1: the promote merges, and the landing redeploys, on 4 November 2026. If the promote moves, these dates are wrong; the orchestrator gives the new date and the same edit repeats. No check can know the publish day.
  - I2: `legal/archive/terms-1.0.md` keeps its placeholder: 1.0 never took effect, and #1229 left it.
- **Asks**: none. The date is the owner's; `OWNER-ASKS.md` says none.

## Architecture & Implementation

- **Shape**: literal text in four files and six checkbox lines. No code path, type, test or workflow changes.
- **Files**: the F1 set, plus `BEFORE-LAUNCH.md` lines 206-207, 215-216 and 228-229.
- **Alternatives not taken**: push to #1538's branch (D1); a test that pins row dates to the manifest (D3).

## Phase 1 — date the three versions

Warning: change no other byte of the archived copy (D2).

1. At the base, run `NULO_LAUNCH_GATE=1 bun run --cwd packages/legal test src/launch.test.ts`. Record that it fails on the five `«FILL` lines of the two documents (Terms two, privacy three).
2. In `legal/terms.md`, replace `«FILL: effective date»` with `4 November 2026` on line 3 and in the 1.2.1 row.
3. In `legal/privacy.md`, make the same replacement on line 3 and in the 1.2.8 and 1.2.9 rows.
4. In `legal/archive/privacy-1.2.8.md`, make the same replacement on line 3 and in the 1.2.8 row.
5. In `packages/legal/src/manifest.ts`, set `effective: "4 November 2026"` for terms 1.2.1, privacy 1.2.8 and privacy 1.2.9.
6. In `BEFORE-LAUNCH.md` § 4, tick the first two boxes of each of the three entries. Append ` (4 November 2026)` to each first box. Replace ``(now `null`)`` with `(4 November 2026)` in each manifest box.
7. Leave unticked every "After the deploy" box, the `alarms` justification box and both audit-note dashboard boxes.
8. Commit: `docs(legal): date terms 1.2.1 and privacy 1.2.8 and 1.2.9 for the 1.2.0 promote`.

**Validation gate** (`B` is `git merge-base origin/dev HEAD`: `fa6913668` until a `dev` merge, then that `dev` commit):
- G1: `git diff --name-only $B HEAD -- ':!implementations-plan'` lists exactly `BEFORE-LAUNCH.md`, `legal/archive/privacy-1.2.8.md`, `legal/privacy.md`, `legal/terms.md` and `packages/legal/src/manifest.ts`.
- G2: each of the five files equals its `$B` copy with exactly the planned edits, byte for byte. Pass: the block prints exactly `G2 fail=0` and nothing else. This also proves which six boxes changed and that every other box is untouched:

  ```sh
  set -o pipefail; fail=0
  B=$(git merge-base origin/dev HEAD)
  L='s/«FILL: effective date»/4 November 2026/g'
  M='/version: "1\.2\.[189]",/{n;s/effective: null,/effective: "4 November 2026",/}'
  C='s/^- \[ \] \(.*history row, dated the day it is published\)$/- [x] \1 (4 November 2026)/;s/^- \[ \] \(.*\)(now `null`)/- [x] \1(4 November 2026)/'
  for f in legal/terms.md legal/privacy.md legal/archive/privacy-1.2.8.md; do git show "$B:$f" | sed "$L" | cmp - "$f" || fail=1; done
  git show "$B:packages/legal/src/manifest.ts" | sed "$M" | cmp - packages/legal/src/manifest.ts || fail=1
  git show "$B:BEFORE-LAUNCH.md" | sed "$C" | cmp - BEFORE-LAUNCH.md || fail=1
  git grep -n "«FILL" -- legal/terms.md legal/privacy.md legal/archive/privacy-1.2.8.md; [ $? -eq 1 ] || fail=1
  echo "G2 fail=$fail"
  ```

  Applied to the base, these expressions change exactly the F1 lines and `BEFORE-LAUNCH.md` lines 206-207, 215-216 and 228-229 (checked at planning, Codex r1).
- G3: `NULO_LAUNCH_GATE=1 bun run --cwd packages/legal test src/launch.test.ts` and `NULO_LAUNCH_GATE=1 bun run --cwd apps/landing test scripts/legal-pages.test.ts` exit 0. `bun run --cwd packages/legal test` and `bun run --cwd apps/landing test` exit 0.
- G4: `bun run lint`, `bun run typecheck:all`, `bun run test` and `bun run test:all` exit 0 at retry 0. `bun run check:plans` exits 0 after the plan files are staged.
- Layers: lint, typecheck, unit. E2E: the PR's four CI lanes (D4).

## Security & Adversarial Considerations

- **Threat model**: no trust boundary, input, permission, dependency or stored shape changes. The manifest strings ship in the extension bundle, and no code reads `effective` there.
- **The risk that matters is a misstatement**: a date that is not the publication day, or a row that disagrees with its version line. Controls: G2's byte compare; the owner's date; I1's re-date path.
- **Hidden open steps**: an early tick would hide a post-deploy or dashboard step. Step 7 forbids it, and G2's byte compare of `BEFORE-LAUNCH.md` proves it.
- **Supply chain, cryptography, least privilege**: N/A.

## Decision ledger

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Supersede #1538 how | a new PR from this branch; then close #1538 with a comment naming it, keeping its branch | #1538's branch is checked out in another worktree (F8), so updating it means writing a branch this session does not hold; it carries the wrong date and a narrower scope; this branch carries the plan and its close-out |
| D2 | Date the archived `privacy-1.2.8.md` | version line and its 1.2.8 row | a narrow exception to `legal/archive/README.md`, which names only a dead-link exception. F2 requires the version line; precedent dates the row with it (F4); `BEFORE-LAUNCH.md` § 4 and the lane brief name the file. The copy was archived before its date was known, and the promote publishes it with this date |
| D3 | Add a test pinning history-row dates to the manifest | no | a forgotten row keeps `«FILL`, which `launch-legal` and the DRAFT banner already catch; only a mistyped date escapes, and G2's byte compare proves this edit. Terms 1.0's row ("Never in effect") would need a special case. A new rule is outside a dating lane |
| D4 | Local e2e | none | no e2e file, fixture or extension behaviour changes (F5); CI runs all four lanes on the PR (F7) |
| D5 | Close-out timing | the PR's final commits, pushed right after `gh pr create` so the Outcome cites the PR number; the trunk merge and the final gates come before `gh pr create`, and the checks are watched on the last pushed head | `pr-supersede.yml` cancels the first head's active runs; work they already did is lost, a few minutes at most, against a second full e2e cycle if the close-out waited for green |
| D6 | `BEFORE-LAUNCH.md` prose "until then it reads `«FILL: effective date»`" | unchanged | it states what held until the promote; the 1.2.2 to 1.2.5 entries kept it after their dates; the lane bounds `BEFORE-LAUNCH.md` to ticks |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high): `conditional approve`, four findings, all accepted:
  - G1's `--numstat` had no range, so it read a clean tree; step 1 said four `«FILL` lines where there are five (demonstrated). Fixed: G1 takes `$B`, the count reads five.
  - G2's word-diff expectation was wrong for the version lines (`date»**` is one word) and could not prove whitespace (demonstrated by a piped simulation). Fixed: G2 compares each file byte for byte with its base copy under the planned `sed` edits; dry-run on the base, the edits touch exactly the intended lines.
  - Six changed lines in `BEFORE-LAUNCH.md` did not prove which boxes were ticked (demonstrated counterexample). Fixed by the same byte compare.
  - D5 overstated what `pr-supersede.yml` guarantees, and step 3 watched checks before step 4 pushed a new head (control-flow gap). Fixed: the trunk merge and final gates precede `gh pr create`; checks are watched once, after the last push; D5 states the cost.

  Agreed: F1 to F3, I2, the change map, D1, D3, D4, D6; D2 reworded as the narrow exception it is.
- **Codex r2** (resumed): `conditional approve`. It re-verified the three `sed` edits independently (seven document, three manifest and six checklist substitutions, no other byte). Two shell findings, both demonstrated and accepted: a clean `git grep` exits 1, so "every command exits 0" refused correct work; a `for` loop's status hid an earlier `cmp` failure. Fixed: `pipefail`, a `fail` flag set by each compare, the grep required to exit 1, and one `G2 fail=0` line as the pass signal.
- **Codex r3** (resumed, verify only): `approve`. Both fixes verified under zsh, with failure controls (an early `cmp` failure, an upstream pipe failure, a remaining placeholder, a grep error) and the success control. No new material finding.

## Delivery

One arc, one PR, no stack: branch `worktree-legal-dating-2` → `dev`, `gh pr create`, opened ready after the Codex loop converges. Title (79 characters): `docs(legal): date terms 1.2.1 and privacy 1.2.8 and 1.2.9 for the 1.2.0 promote`. Body: what changed and why, the date's source (the owner's 1.2.0 promote day), "Supersedes #1538", each gate with its outcome, and the `BEFORE-LAUNCH.md` boxes left open. No `Closes` line: no issue tracks the work. Add no label: the path filters run all four e2e lanes (F7). Then `gh pr close 1538 --comment "Superseded by #<n>: it dates Terms 1.2.1 and privacy 1.2.8 and 1.2.9 as 4 November 2026, the 1.2.0 promote day."`, without `--delete-branch`.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `fa6913668`. Specific to this plan:

1. Step 1 (diff review) is absent: `code_review: off`.
2. The review loop runs once over the diff from `fa6913668`, after Phase 1: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` on the same session. Stop at a round with no new material finding; hard stop after three rounds, then report. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1.
3. Merge `origin/dev` and read what changed in `index.md` and `lessons.md`. Rerun G1 to G4 on that head; then delivery as above, and close #1538.
4. Close-out per the standard's step 4, as the PR's final commits, pushed right after `gh pr create` (D5). `Known limits:` none. `Open items:` `BEFORE-LAUNCH.md` § 4 (the post-deploy and dashboard boxes of the three entries). Delete `STATUS.md`, then `git mv` the plan into `archive/` in its own commit. Run `bun run check:plans` after staging. Then run `gh pr checks <n> --watch` once, on that last head: a known flake gets one rerun; real breakage gets a fix and the loop again.
5. Teardown after the merge per the standard's step 5: slug `legal-dating-2`, trunk `dev`. This headless session does not wait for the merge: the orchestrator, or the next session in this worktree at its start, runs it.

## Seeds

```
/goal Phase 1 of implementations-plan/legal-dating-2/plan.md marked ✓ with gates G1-G4 reported passing in the transcript; the Codex loop converged (a resumed gpt-6.1-sol pass with no new material finding, quoted); the PR to dev open with the Delivery section's body and #1538 closed with its comment; the close-out archive commit shown by `git show --stat`; `bun run --cwd packages/legal test` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/legal-dating-2 forward per its plan.md: read the plan (the authority), run Phase 1 and its gate, then the Post-implementation steps in order. Never merge; stop once the PR's checks are green and the close-out is committed.
```
