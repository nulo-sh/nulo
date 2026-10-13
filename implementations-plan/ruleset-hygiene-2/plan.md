---
plan: ruleset-hygiene-2
tier: light
status: planned, awaiting approval (Codex: conditional approve, condition met)
issues: none
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex review of the plan (gpt-6.1-sol, high) plus one resumed round on its findings; no Opus leg (orchestrator's call)
base: origin/dev at dd9228237a5115c2d39f7def1e79a3ab69119580
trunk: dev
post_implementation_hardening: not scheduled
---

# ruleset-hygiene-2: complexity and logging become skills; plans and CI point at their standards

One arc, one docs PR into `dev`. Four `CLAUDE.md` sections keep their rules and lose their depth: § Complexity budgets and § Logging policy move to two project skills, § Implementation plans to `implementations-plan/README.md`, and the "In CI" bullets give way to `CI.md`, which already holds all but two of their facts. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: none ([OWNER-ASKS.md](OWNER-ASKS.md)).

## Scope

**In:** the lane brief's five items. **Out:** code under `apps/` and `packages/`; any workflow, required check or ruleset; the aa-skills repository; rewording a rule; § Branching + merging and `### Release runbook` (D6); other plans' prose (D1).

## Outcome & Quality Bar

- **For whom:** every session that loads `CLAUDE.md`, and whoever touches a complexity directive, a log line, a plan or CI.
- **Excellent:** (1) `CLAUDE.md` drops from 86,744 bytes to about 64 KB (D6). (2) Each moved block equals its source except the edits D2 lists, and each destination's diff shows nothing else. (3) Every existing anchor and "§" reference still lands in one hop; live links and strings that name moved text reach its new home directly. (4) No gate or pin weakens; `test:ci-gating` is green after every phase.
- **Good enough:** the same, with the In CI deletion proven by recon's claim table, row by row, instead of a diff (nothing there moves verbatim).

## Assumptions

**Facts** (verified at the base):
- F1. No test pins the prose that moves. The tests the brief names carry comments or synthetic fixtures; `check:plans` reads these files only for their links (`scripts/ci-cd/plans/links.ts:146-152`). Two strings name a moved section (`check.ts:77`, `structure.ts:329`). The brief's "tests read CLAUDE.md by content" does not hold.
- F2. `check:plans` reads the git index, not the working tree (`scripts/ci-cd/plans/lib.ts:5-8`), fails a link to a missing file in root `*.md`, `.claude/skills/**`, `.github/WORKFLOWS.md` and the plans tree, and strips `#fragments` (`links.ts:33-40,160-163`): stage before it runs, and check anchors by hand.
- F3. No path filter matches the touched files (`CLAUDE.md`, `CI.md`, `.claude/**`, `implementations-plan/**`, `scripts/complexity-baseline/check.ts`, `scripts/ci-cd/**/*.ts`); only `pr-quick.yml`'s unconditional gates run.
- F4. The "In CI" bullets (`CLAUDE.md:542-547`) state nothing `CI.md`, `WORKFLOWS.md`, `FIREFOX.md` or `CLAUDE.md` § Branching lack, except the server address `127.0.0.1:59833` and the subtitle `Proving with Presto ✦` (recon table). One claim is stale: `verify-store-copies.yml` is also scheduled, so `nightly.yml` is not "the only scheduled workflow besides `source-rebuild.yml`".
- F5. Links to a moved anchor: `CLAUDE.md:43`, `:491`, `implementations-plan/README.md:9`, `:84` (all `#where-open-work-lives`); none in the archive, none in an issue body. Prose: `CLAUDE.md:477`, `nightly.yml:265`, eleven mentions in eight active plans.
- F6. Biome has three complexity ceilings (`biome.json:58-66`), not the brief's four; the manifest holds the 23 acceptances the section states.
- F7. `scripts/ci-cd/plans/permalink-bases.json` is `{}`, so "that list starts empty" still holds.

**Inferences:** I1. A skill body loads when its description matches the task or when a session names it; nothing guarantees either. So `CLAUDE.md` keeps every prohibition an author must apply, and each pointer says to read the full text before such an edit (D3). I2. GitHub derives an anchor from heading text alone, so a lifted heading keeps its anchor.

**Asks:** none for the owner. A1, for the orchestrator: accept about 64 KB against the brief's 60, with `### Branches + releases` left in place (D6)? Working assumption: yes; folding it would expand scope. **Answered: folded (D9).**

## Architecture & Implementation

Text moves and two strings; no code path changes.

| File | Change | Phase |
|---|---|---|
| `.claude/skills/complexity-budgets/SKILL.md` (new); `CLAUDE.md:115-127`, routing table `:34-41` | the section (D2); a short section (D3); a routing row | 1 |
| `.claude/skills/logging-policy/SKILL.md` (new); `CLAUDE.md:165-225`, routing table | the same | 2 |
| `implementations-plan/README.md`; `CLAUDE.md:43`, `:477`, `:484-519` | the rules the README lacks (D4); ten lines and a `### Where open work lives` stub (D1, D3) | 3 |
| `CI.md` § Presto in CI; `CLAUDE.md:540-547` | two literals; a five-line pointer (D5) | 4 |
| `scripts/complexity-baseline/check.ts:77`, `scripts/ci-cd/complexity-rescore.test.ts:8`, `scripts/ci-cd/plans/structure.ts:329`; `.claude/skills/update-docs/SKILL.md` | name the new home (D7); route depth to its home (D8) | 5 |

**Alternative not taken:** one `docs/` tree for all four. Rejected: each domain already has a home that its readers open (brief), and a skill loads on demand.

## UI impact

None. No screen, copy or behaviour a person sees changes.

## Security & Adversarial Considerations

- **A dropped or altered rule is the real risk.** The logging policy keeps secrets out of a log a user can export; the complexity rules guard a gate; the open-work rules keep an unpublished advisory out of committed text. Each phase's gate diffs every destination against the base with `-U0`, so a deleted or edited line outside the planned edits shows; Phase 4 re-checks recon's claim table row by row before the bullets go.
- **A session that never loads a skill** still sees, in `CLAUDE.md`, every prohibition (D3), and the instruction to read the full text first. The static guards are textual (`log-payload-ban.test.ts:19-24` lists what defeats it), so they back the rules; they do not replace them.
- No workflow, permission, token or dependency changes. `bash scripts/check-no-local-paths.sh` runs in every gate.

## Phases

Each phase is one signed commit. Before its gate, stage the phase's files (`git add -A`); re-stage after any fix. Every gate also runs `bun run lint`, `bash scripts/check-no-local-paths.sh`, `bun run check:plans` and `bun run test:ci-gating` (item 5: nothing pinned breaks), each exit 0, and reads `git diff -U0 $B -- CLAUDE.md`: its hunks are only the planned edits of this phase and the phases before it. The diffs use `B=dd9228237a5115c2d39f7def1e79a3ab69119580; old() { git show $B:CLAUDE.md | sed -n "$1p" | sed -E 's/^##+ /# /; s#\]\(\./#](../../../#g'; }` and `body() { tail -n +6 "$1"; }` (after the four front-matter lines and a blank).

**Phase 1: complexity budgets.** ✓ (1) Create `.claude/skills/complexity-budgets/SKILL.md`: `name: complexity-budgets`, a `description` naming its triggers (a `biome-ignore lint/complexity` directive, `JUSTIFICATION REQUIRED`, `baseline:complexity`, `baseline:rescore`, a `@biomejs/biome` bump, `audit:dup`, a function over budget), then `:115-127` with D2's edits. (2) Replace `:117-127` with D3's short section. (3) Add the routing row.
Gate: `diff -w <(old 115,127) <(body .claude/skills/complexity-budgets/SKILL.md)` changes only the gates-warning sentence (D2).

**Phase 2: logging policy.** ✓ Same steps for `.claude/skills/logging-policy/SKILL.md` (triggers: a `console.*` or `this.log*` call, `trim()`, `REDACTED_KEYS`, `log-payload-ban`, `scrubUrls`, the log viewer or its CSV export) from `:165-225`, D3's short section, the routing row.
Gate: `diff -w <(old 165,225) <(body .claude/skills/logging-policy/SKILL.md)` is empty.

**Phase 3: implementation plans.** ✓ In `implementations-plan/README.md` (D4): (1) `## Where open work lives` after § Proportion: `:500-519` verbatim. (2) `:494-496` as bullets nested under portable rule 9. (3) § The gate gains `:490`'s permalink clause as "A permalink is `https://github.com/nulo-sh/nulo/blob/<full sha>/<path>` at a SHA listed in …", through "restated in place instead." (4) Rule 5's last sentence gains "; until then a running `/loop` only babysits delivery"; § What lives gains ", never re-cut as `plan-v2.md`". (5) `:9` and `:84` link `#where-open-work-lives` in-file. Then in `CLAUDE.md`: `:484-519` become D3's ten lines; `:43` links `./implementations-plan/README.md#where-open-work-lives`; `:477`'s "(§ Implementation plans)" names the README's § The gate.
Gate: `diff -w` of `:500-519` against the README section body is empty, and of `:494-496` against the nested bullets is empty; `git diff -U0 $B -- implementations-plan/README.md` shows only steps 1-5, each added clause traced to its `CLAUDE.md` line in the PR body; `git grep -n 'CLAUDE[.]md#where-open-work-lives' -- . ':!implementations-plan/archive'` prints nothing.

**Phase 4: quality gates.** (1) `CI.md` § Presto in CI: "the headless server is HTTP-only" gains "(`127.0.0.1:59833`)"; "the exact subtitle" gains ", `Proving with Presto ✦`". (2) `CLAUDE.md:540-547` become D5's pointer; the Locally subsection and the `:549` warning stay byte-identical.
Gate: `git diff -U0 $B -- CI.md` shows exactly those two lines changed and nothing removed; `CLAUDE.md`'s `-U0` hunks touch none of `:521-537` or `:549`; each row of recon's In CI table is re-read against its named home, and the PR body quotes the home of each.

**Phase 5: pins and strings.** (1) `check.ts:77` and `complexity-rescore.test.ts:8` name `.claude/skills/complexity-budgets/SKILL.md`; `structure.ts:329` names `implementations-plan/README.md § Where open work lives`. (2) `update-docs` (D8). `nightly.yml:265` stays (D7).
Gate: also `bun run test:release` and `bun run typecheck:all`; `git grep -n 'CLAUDE.md § \(Complexity budgets\|Where open work lives\)' -- scripts` prints nothing.

**Final gate:** `bun run typecheck:all`, `bun run test` and `bun run lint:actions` exit 0; every `](…#anchor)` in the touched files resolves to a heading (listed with `git grep -no '](\([^)]*\)#[^)]*)'` and checked by hand); `wc -c CLAUDE.md` recorded; this plan stays at most 150 lines.

## Decision ledger

- **D1. Every moved section keeps its heading in `CLAUDE.md`,** `### Where open work lives` as a stub, so eleven active-plan mentions, `nightly.yml:265` and any outside link land in one hop (the `### Release runbook` precedent). Live links and strings point straight at the new home; other plans' prose stays theirs.
- **D2. A move is verbatim except:** headings change level (`#` in a skill, `##` in the README); relative links gain `../../../` in a skill; deixis: the complexity skill's "see the gates warning below" names `CLAUDE.md` § Quality gates with a link, and the README's permalink sentence starts at "A permalink is". The two README clause insertions (Phase 3, step 4) carry the only text the README lacked.
- **D3. What `CLAUDE.md` keeps**, lifted sentences plus a pointer that says to read the full text before such an edit. Complexity: `:117`'s first sentence; the three ceilings (`:119-121`, the bold heads); "The baseline only shrinks — NEVER add a complexity suppression"; "a NEW acceptance is a blueprint with owner sign-off, never a PR nit"; "The generator never writes an acceptance for you"; `:126` whole. Logging: `:167-171`; "Pass the value as an object property NAMED for what it is" with "A finished string is opaque to it"; `:194-196`, the "Never log" list, whole; "Pick the level by REACH, not by tone" with its `warn`/`error` and stranger's-bug-report sentences; `:222-225`, the `REDACTED_KEYS` paragraph. Plans: committed artifacts; the README is the standard; read `lessons.md` first; Proportion in one sentence; under the stub, `:500` and the advisory bullet's "Until publication its finding never appears in a committed plan, a PR body or a test name", then "read the README section before filing an issue, a known limit or an advisory"; each with its README anchor.
- **D4. One home per rule in the README.** § Where open work lives follows § Proportion, which the Post-implementation standard and rule 5 cite. The path bullets nest under rule 9, which states the same rule; a new section would restate it. The allowlist goes in § The gate, keeping rule 4 portable.
- **D5. The CI pointer:** where CI lives (`.github/`, `CI.md`, `WORKFLOWS.md`); the five required checks by produced name and branch (§ Branching); the two labels, and that a skipped lane's aggregator passes; the warning, unchanged. The stale scheduling claim (F4) is not carried.
- **D6. `### Branches + releases` (about 1.6 KB) and `### Release runbook` stay.** The first restates § Branching + merging, `CI.md` § Branch model and the `release` skill, but it is outside the brief's four items (A1). With it, the file lands near 64 KB, not 60. Superseded for `### Branches + releases` by D9.
- **D7. Item 5 is a string phase, not a test phase** (F1): two strings and a comment move to the new home, and `test:ci-gating` runs in every gate. `nightly.yml:265` stays: a workflow edit is out of scope, and D1 resolves it.
- **D8. `update-docs` routes depth to its home.** Phase 2 gains one sentence: a section that names its home (a skill in § Skills own their domains, the plans README, `CI.md`) is a pointer, so a change to its depth goes there. Phase 4 step 1 reads "from current CLAUDE.md or the home it names"; Phase 5's `git diff dev -- CLAUDE.md` also names each home edited. Without it the skill maps a change under `scripts/complexity-baseline/` back into `CLAUDE.md`.
- **D9 (orchestrator). A1: scope grows by one item.** `### Branches + releases` is deleted after any sentence it alone states moves, verbatim, into § Branching + merging (one line) or the `release` skill; the PR body carries each destination's `-U0` diff and the exact bytes (about 62 KB expected). Done in Phase 4.
- **D10 (orchestrator). Moves are verbatim; stubs stay.** Only deixis changes; the three repoints follow their text; `test:ci-gating` runs after every phase; every moved heading keeps a stub, and no plan file is edited for it.
- **D11 (orchestrator). Proportion.** Later Codex rounds verify; `lessons.md` is at its 8 KiB budget, so nothing is promoted unless a retirement pays for it; no issue is filed unless the tree proves a defect outside this scope; the close-out ships in this PR.
- **D12. Deviation, Phase 3 gate:** the grep also hits `lessons/phase-0.md:7`, which quotes the pattern (C3's self-match). It ran again with this plan's directory excluded, and in link form over the whole tree; both printed nothing.

## Audit verdicts

**Round 1, Codex (gpt-6.1-sol, high; session `01a136fe-f602-7530-9f75-96892800f111`), 2026-10-13: reject.** All seven verified against the tree and accepted.
- C1 High, demonstrated: the gates compared two README blocks only, so a dropped clause insertion or an edited `CI.md` line passed. Fixed: a `-U0` diff of every destination; In CI rows re-read and quoted.
- C2 High, plausible: a session that skips the skill lost the "Never log" list, and the static guard is textual. Fixed: D3 keeps it, keeps the advisory secrecy sentence, and each pointer says to read the full text first; the Security section no longer overclaims.
- C3 Medium, demonstrated (reproduced): the Phase 3 grep matched the plan itself. Fixed: `CLAUDE[.]md`.
- C4 Medium, demonstrated: `check:plans` reads the index (F2). Fixed: stage before every gate.
- C5 Medium, plausible: `update-docs` still read and diffed only `CLAUDE.md`. Fixed: D8 widened by two phrases.
- C6 Low: F1 overclaimed, F5 miscounted, D3 cited `:222-224`. Fixed.
- C7 Low: settle the size against 60 KB. Fixed: A1 asks the orchestrator to accept about 64 KB.

**Round 2, Codex (same session resumed), 2026-10-13: conditional approve; the condition is met below, no third round.** C1 to C7 verified as resolved (C7 as an open ask).
- C8 Medium, demonstrated: a gate diffing `CLAUDE.md` against the base also shows the earlier phases' edits, so "only the phase's lines" refused a correct run. Fixed: the hunks are the planned edits of this phase and the phases before it.

## Delivery

Single arc: `gh pr create --base dev` from `worktree-ruleset-hygiene-2` (the worktree's branch, not the brief's `ruleset-hygiene-2`), after the loop converges. Title: `docs(claude): move complexity budgets and logging to skills; point plans and ci at standards` (92 characters). No `Closes` line, no label (F3). Body: `CLAUDE.md` bytes before and after, each normalized diff, the traced README clauses, the In CI claim homes, the validation runs; no e2e lane runs, so no wall-clock. The close-out is this PR's final commits.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at commit `dd9228237a5115c2d39f7def1e79a3ab69119580`. Specific to this plan:

- **Loop:** single arc, once over the whole diff after the final gate, at `high`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; resume with `resume-codex.sh`. On a quota or 401 error retry once with `CODEX_ACCOUNT=alejo-icloud`, then log it and continue within scope. The prompt attaches the normalized diffs and asks first for a rule dropped or changed in a move.
- **Approval boundary:** the orchestrator approves plan changes; the owner keeps persistence, permissions, public contracts, background work and scope.
- **Close-out:** merge `origin/dev` first. `Known limits:` and `Open items:` read `none` unless the loop files one. Delete `STATUS.md`, keep `OWNER-ASKS.md`, archive to `implementations-plan/archive/ruleset-hygiene-2`.
- **Teardown:** the orchestrator merges and tells the session; a `/loop` session also checks each firing. Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ruleset-hygiene-2/plan.md` succeeds, run `agent-worktree done ruleset-hygiene-2 --merged --trunk dev`. The session starts inside the worktree, so it has nothing to exit.

## Seeds

Recommended: `/goal`. Drafts until the orchestrator approves.

```
/goal Phases 1-5 of implementations-plan/ruleset-hygiene-2/plan.md are marked ✓, each backed by its gate reported passing in the transcript, including every normalized and -U0 diff showing only the planned edits; LESSONS_FILE=implementations-plan/ruleset-hygiene-2/lessons/phase-N.md printed per phase; /code-review NOT run; the Codex loop (run-codex.sh … high read-only gpt-6.1-sol) converged, quoted; the PR into dev exists, opened after the loop (gh pr view in the transcript), with the archive-move commit (git show --stat); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/ruleset-hygiene-2. Each firing: read plan.md and lessons/; if the plan moved to archive/, run the teardown in § Post-implementation and stop. Otherwise take the next unmarked phase, stage it, run its gate, mark ✓, log lessons, commit (signed). After the final gate: the Codex loop, Delivery, the close-out, then report and stop. Anything a person sees goes to OWNER-ASKS.md. Never merge, never push to main, never edit a workflow or a file under apps/ or packages/.
```
