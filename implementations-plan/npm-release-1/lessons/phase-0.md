# Phase 0: planning consults

## Recon (2026-10-24)

- One Sonnet explorer (reuse sweep, seven capabilities); its findings are in `recon.md`.
- Planner measurement: staged 0.3.0 at `dda72e321` into a scratch directory with Bun 1.4.2, Node 24.12.0 and npm 11.6.2, packed it, and diffed it against `npm pack @nulo-sh/<p>@0.2.0` (F2, F3).

## Plan audit, round 1

- **Codex** (`gpt-6.1-sol`, high, fresh session `01a16d2f`): **conditional approve**, three findings, each verified against the tree and accepted.
  1. D4 confused the repository's tree with a consumer's: the root `overrides.zod` never reaches a consumer, and `stage.test.ts` links the repository's installed zod (only `zod@4.6.7` in `node_modules/.bun`). `@aztec-labs/{aztec.js,stdlib,foundation}@6.0.0` declare `zod ~4.4.3` (`npm view`); GHSA-mrhx-c7xc-m3w5 is high, zod < 4.6.6, memory exhaustion while validating oversized constrained collections (`gh api /advisories/...`). Accepted: a factual note in the schema patch's Requirements, before the rehearsal; the range stays (D4).
  2. The P2 control could run `M`'s checker, which passes an unlisted later version (`checkDigests`, the `listed === undefined` branch). Accepted: restore only the READMEs from `M`, stage and pack, restore, run the head's checker; pass means exactly three sha256 failures.
  3. The dispatch checklist expected `6.0.0` peers on `resolve-asset`, which has none (F1). Accepted.
- **Opus 5.5** (Plan agent, fresh; it reproduced F2 and F3 in its own scratch staging): **conditional approve**, six findings, each verified.
  1. Nothing compared the digests after the last `dev` merge, the close-out's included, and the drift list left out each package's `tsconfig.json`, `bun.lock` and `stage.ts`. Accepted: a digest gate (stage, pack, `check-digests.ts`) after every `dev` merge and last before the PR; the full input list in the plan. No CI gate (D5 stands).
  2. The `npm-publish` reviewer is `alejoamiras` with `prevent_self_review: false`, and the agents' `gh` is that account with `repo` scope (`gh api .../environments/npm-publish`, `gh auth status`). Accepted: Security states a policy boundary, not a credential one; the checklist recommends the owner's UI approval and forbids the API; the claims section cites the lane brief for the orchestrator's dispatch.
  3. After a `dev` merge, the net diff from the plan's commit includes `dev`'s commits. Accepted: review `origin/dev...HEAD`.
  4. `Closes #1109` closes the issue before publication; #481 used `Refs`. Accepted in part (D7): `Closes` stays, as the lane brief and the program rule require; checklist step 6 comments the `verify` run and reopens #1109 on a failed dispatch.
  5. The control's staging was unspecified. Same fix as Codex #2.
  6. Nits, accepted: `resolve-asset` has no peers to check; the `@aztec-labs/*` peers clear the gate around 2026-10-29 10:30Z (`npm view ... time`: 10:22-10:24Z), not 10-30; the plan was over 150 lines.
- Opus held D4's "no note"; Codex's argument (the repository's override and its test tree say nothing about a consumer's) is the stronger one, and a factual sentence adds no obligation.

## Plan audit, round 2 (final Codex pass)

- **Codex**, resumed (`01a16d2f`): **conditional approve**, one condition, accepted: the threat model said a compromised workstation can only make the dispatch refuse, yet its `gh` identity can approve the pending deployment (F7). The sentence now says the clean dispatch catches changed bytes and compromised GitHub credentials can bypass the approval policy. All round-1 fixes confirmed; no other finding.
- **Codex**, resumed again (`01a16d2f`): **approve** ("the round-2 condition is satisfied"; confidence high).
