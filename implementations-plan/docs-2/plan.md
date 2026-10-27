---
plan: docs-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
trunk: dev
base: 17f35c504
---

# docs-2 — the manual-bump reason as policy, and the plans standard's title cap (#1267)

Three sites say Dependabot "cannot read Bun's lockfile", so npm dependencies are bumped by hand. GitHub now lists
Bun version updates as supported, so the stated reason may be stale; the manual bumps remain the right call for
other reasons. This plan restates the reason as policy, with its source and the date it was read. It also corrects
the plans standard's PR-title cap from 93 to 92 characters. Docs and one test-file comment only.

## Outcome & Quality Bar

- **For whom**: a maintainer or an agent who reads § Dependency policy before a dependency change, or the plans
  standard before opening a PR.
- **Excellent**: (1) each sentence is true at the date it names, and what nobody checked is called untested, not
  assumed; (2) the reason and its source live once, in SECURITY.md, and the other two sites point there; (3) every
  title cap in the live docs is the same number, with its arithmetic.
- **Good enough**: no change to `.github/dependabot.yml` and no Dependabot experiment (lane brief).

## Assumptions

**Facts** (search trails in `recon.md`):
1. The claim stands at exactly `CLAUDE.md:106`, `SECURITY.md:550` and `scripts/ci-cd/dependabot.test.ts:2`.
2. GitHub's "Dependabot supported ecosystems and repositories" page (fetched 2026-10-27, no last-updated date shown)
   lists `bun` `>=v1.1.39` with version updates Supported and security updates Not supported. Its Bun section supports
   the text `bun.lock` from 1.1.39 and not the binary `bun.lockb`. It names no `lockfileVersion`.
3. `bun.lock` is `lockfileVersion: 2` (`CLAUDE.md:49`), so whether Dependabot reads it is untested.
4. `.github/dependabot.yml` holds one `github-actions` entry; `dependabot.test.ts` pins `updates` to length 1.
5. `implementations-plan/README.md:109` says "at most 93 characters" and writes the suffix ` (#NN)`.
6. **The lane brief's claim on CLAUDE.md does not hold**: § Branching + merging (line 98) already says "≤ 92 chars"
   with `len(title) + len(" (#NNNN)") ≤ 100`, since `17f35c504` (#1265). No change there.
7. `.commitlintrc.json` extends `@commitlint/config-conventional` 21.2.2, whose `header-max-length` is 100.
8. No test asserts on the wording of any edited file (`recon.md` § Claim C).
9. SECURITY.md § Dependency policy holds the age gate above the Dependabot paragraph and the `bun pm diff` review
   below it; the CVE-on-Friday runbook, the Aztec line and the Bun-version trap sit under § Binary dependencies (D6).

**Inferences**: (a) ` (#NNNN)` is eight characters while PR numbers have four digits; at #10000 the cap is 91 (E4 says so).
(b) A reader takes "cannot" as a tool limit (the issue's impact); "as policy" makes it a choice the owner may revisit.

**Asks**: none for the owner. Whether to turn on Dependabot's Bun version updates is the owner's call and stays out of
this lane; the PR body says so. `OWNER-ASKS.md` says none.

## Architecture & Implementation

Reuse: SECURITY.md § Dependency policy is "the full version" (CLAUDE.md says so), so the dated facts go there once.

Exact edits (the implementer may re-wrap lines; the words are the contract):

- **E1 `SECURITY.md:548-551`**, after "(`.github/dependabot.yml`).": replace "It cannot read Bun's lockfile, so npm
  dependencies are updated by hand, under the age gate above." with: "npm dependencies are updated by hand, as policy.
  Each update is held to the age gate above and read with `bun pm diff` (the review workflow below). The CVE-on-Friday
  runbook and the exact-pinned Aztec line, bumped through the `aztec-update` skill, both further down this file, are
  exceptions to the age gate. GitHub's supported-ecosystems page for Dependabot, read 2026-10-27, lists version updates
  for Bun ≥ 1.1.39 (the text-format `bun.lock`) as supported and security updates as not supported. Whether Dependabot reads this repository's
  `lockfileVersion: 2` lockfile, or resolves under the age gate (a frozen install never re-gates a locked version), is
  untested. Turning on its Bun version updates is the owner's decision." The page name links to `recon.md`'s URL.
- **E2 `CLAUDE.md:106`**: replace "It cannot read Bun's lockfile, so npm dependencies, Bun, Biome and the Aztec line are
  bumped by hand." with: "npm dependencies, Bun, Biome and the Aztec line are bumped by hand, as policy; SECURITY.md
  (Dependency policy) records what GitHub lists Dependabot as supporting for Bun, and what is untested." The how is
  already in the bullets around it (age gate, review, Aztec, Bun-version sync), so E2 repeats none of it.
- **E3 `scripts/ci-cd/dependabot.test.ts:2-3`**: "It updates only GitHub Actions: Bun's lockfile is unreadable to it, and
  Bun, Biome and the Aztec line are bumped by hand." becomes "It updates only GitHub Actions; npm dependencies, Bun,
  Biome and the Aztec line are bumped by hand, as policy (SECURITY.md, Dependency policy)." The rest stays.
- **E4 `implementations-plan/README.md:109`**: "The title stays at most 93 characters (the squash appends ` (#NN)`;
  commitlint caps the subject at 100)." becomes "The title stays at most 92 characters: the squash appends ` (#NNNN)`,
  eight characters at four-digit PR numbers, and commitlint caps the header at 100."
- **Not changed**: `CLAUDE.md:98` (Fact 6), `CLAUDE.md:49` and `SECURITY.md:592` (Bun ≤ 1.3, a different claim),
  `.github/dependabot.yml`, every archived plan (evidence, never edited).

### Decision ledger

| # | Question | Chosen | Rejected, and why |
|---|---|---|---|
| D1 | Close #1267 or leave it open | `Closes #1267`: its impact (a policy read as a tool limit) is gone once no site rests on the tool claim, and the untested point is stated where the policy lives | leave open for the fork test: the brief forbids the test, and the docs no longer depend on its result; enabling Bun updates is a new owner decision, not this finding |
| D2 | Where the source and date live | once, in SECURITY.md (E1); E2 and E3 point there | in all three sites, or E2 listing the reasons: copies of a dated fact drift, and E2 sat beside the bullets it repeated (both legs) |
| D3 | The reasons named | E1: the age gate and the `bun pm diff` review with their exceptions named, the Aztec runbook, no Bun security updates (dated) | "every bump passes the gate": false for the CVE runbook, the Aztec excludes and a Bun-binary bump (both legs); "Dependabot would bypass the gate": unverified, so stated as untested (D5) |
| D4 | Fix CLAUDE.md § Branching's "~93" | no edit | the brief's claim did not hold at `17f35c504` (Fact 6) |
| D5 | Dependabot's `cooldown` beside the age gate | E1 names the gate under "untested": a bot-resolved lock that ignored `bunfig.toml` would pass CI's frozen install | silence: a reader equates `cooldown` with the gate (Opus 4) |
| D6 | The CVE runbook and Aztec paragraph sit under § Binary dependencies | E1 names them by title, "further down this file"; E2 claims only the source and the untested points | move them into § Dependency policy (Opus review): right, and it fixes `bunfig.toml`'s and CLAUDE.md's older pointers too, but a third correction outside the lane: an issue at close-out |

## Security & Adversarial Considerations

- **Threat model**: the edits change no gate, permission or config. The risk is a doc that loosens supply-chain
  practice: an agent reading "supported" (or a "not a tool limit") and adding a `bun` entry to `dependabot.yml`. E1
  states the two untested points and names the switch as the owner's decision; `dependabot.test.ts` already pins one
  `updates` entry, so a quiet addition reds `test:ci-gating`.
- **Supply chain**: the age gate, the frozen lockfile and `bun audit` are unchanged. Least privilege, crypto, input
  validation and domain risks: not applicable; no code path changes.

## Phase 1 — four edits

UI impact: none (contributor docs and one test comment). Files: the four of E1-E4. Tests: none added; no behaviour
changes, and no test asserts on the wording (Fact 8).

**Validation gate**
- Commands: `bun run lint`, `bun run typecheck:all`, `bun run test:ci-gating`, `bun run test:release`; after staging,
  `bun run check:plans`; on the final head, `bun run test:all` once.
- Pass criteria: each exits 0. `git grep -n -i -E "cannot read bun|lockfile is unreadable|at most 93|\(#NN\)"
  -- ':!implementations-plan/archive' ':!implementations-plan/docs-2'` prints nothing.
- Layers: lint, typecheck, unit (`test:ci-gating` runs `dependabot.test.ts` and the plans-gate tests). No e2e: nothing
  a suite reads changes.

## Delivery

Single arc, single PR, no stack: branch `docs/docs-2` off this plan's commit, PR into `dev`, title
`docs: npm bumps by hand are a policy, and a pr title stays at most 92 characters` (80 characters). Body: what changed
and why, the gates with outcomes, `Closes #1267`, that CLAUDE.md § Branching already said 92 (Fact 6), that the
issue's fork test was not run (the lane forbids it), and that turning on Dependabot's Bun version updates is the
owner's call, out of this lane, with the two untested points to check first. No label. The close-out lands as the
PR's final commits. `code_review: off`.

## Post-implementation

Follows `implementations-plan/README.md` § Post-implementation standard at `17f35c504`, single-arc placement. Here:
- Review loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's
  diff against this plan's commit, resumed with `resume-codex.sh` until no new material finding; hard stop at three
  rounds. One Opus diff review (`Agent`, `model: "opus"`, `general-purpose`) runs beside the first round.
- Gates once more on the final head, then `gh pr create --base dev`, then `gh pr checks <n> --watch` once. Merging is
  the orchestrator's call.
- Close-out per the standard's step 4: merge `origin/dev` first, then the Outcome, `STATUS.md` deleted, and the archive
  move in its own commit. Known limits: none expected. Teardown per step 5, slug `docs-2`, trunk `dev`.

## Audit verdicts

**Codex, round 1 (gpt-6.1-sol, high): `conditional approve`.** 1. Medium, demonstrated: E1/E2 made the gate and the
review universal; the CVE runbook, the Aztec excludes and a Bun-binary bump contradict it. Accepted (D3). 2. Medium,
demonstrated: "rather than a tool limit" asserts what the same paragraph calls untested. Accepted: dropped. 3. Low: E2
repeated the undated "no security updates" fact. Accepted (D2). Facts 1-9 hold; D1 honest; no missed site.

**Opus Plan leg (opus): `conditional approve`.** 1 = Codex 2 and 2 = Codex 1 + 3, accepted; E2 becomes a pointer. 3. Low,
demonstrated: "each update passes the gate" skips the CVE runbook. Accepted: exceptions named in E1. 4. Low,
plausible: `cooldown` reads as equal to the gate; a bot lock that ignored `bunfig.toml` would pass the frozen install.
Accepted as one clause (D5). 5. Nit: commitlint caps the header, not the subject. Accepted (E4). On D1: honest; the PR
body names the unrun fork test. Facts hold; gate commands exist.

**Codex, final pass (resumed session): `approve`**, no remaining material finding; each revised sentence verified.

**Post-implementation loop (arc 1, diff `3e85212ca..cde95ac1e`).** Codex round 1 (gpt-6.1-sol, high): `findings`, one
low, plausible: "the exceptions below" could read as exempting the CVE runbook from the `bun pm diff` review too.
Accepted: "exceptions to the age gate". Opus diff review: `findings`. 1. Low, demonstrated: the CVE runbook and the
Aztec paragraph sit under § Binary dependencies, so Fact 9 was wrong and E2's "says how" pointed at a section without
them. Accepted as D6 (E1 names them by title; E2 claims less); the move itself is out of scope. 2. The link answered
301: canonical URL taken. 3. A 123-character comment line: re-wrapped. 4. "the text `bun.lock`" read as a literal:
"text-format". Fixes in the round-1 fix commit.

## Seeds

Not run (orchestrator-owned). `/goal`: phase 1 ✓ with its gate pasted; the Codex loop converged; the PR into `dev`
open with `Closes #1267` and the close-out on it; `bun run test:ci-gating` and `bun run lint` exit 0.
