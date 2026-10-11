# Phase 0: planning consults

Every consult of the planning run, with its verdict and what changed. Transcripts stay local (`audit-*.md`, gitignored); what matters is recorded here and in plan.md § Audit record.

## Consult 1: Codex plan audit, round 1 (gpt-6.1-sol, high, read-only)

Verdict: **conditional approve** (conditions: Phase 2's runs must reproduce the PR leg's proverless environment; OA-1 must outlive #309's closing; the close-out sequence must put the PR and the close-out before the merge). Seven findings; each verified against the tree or the web before acting.

- C1 (Medium) Phase 2's e2e commands lacked `NULO_E2E_PROVERLESS=1`, which `agent.sh:101` needs for the proverless build the PR chaos leg runs (`_extension-network-e2e.yml:139`). Verified; accepted: full commands with the flag and `NULO_E2E_RETRY=0`.
- C2 (Medium) OA-1 would lose its tracking when #309 closes. Accepted: the close-out records the owner's answer, or opens one `owner-decision` issue.
- C3 (Medium) Post-implementation put the PR and close-out "after the merge". Verified; accepted: only teardown follows the merge.
- C4 (Low) GitHub's CLI restates `tag_name` on every edit because "the API will remove the current tag"; one recon citation over-attributed `target_commitish`. Verified (`cli/cli` `edit.go`, `editRun`); accepted: cited in plan and recon, citation split.
- C5 (Low) D3's wording ("converts exactly") is wider than `Number.isSafeInteger`. Accepted: "nonnegative decimal safe integers"; boundary cases `9007199254740991` (accepted) and `9007199254740992` (refused).
- C6 (Low) The race guarantee was overstated. Accepted: the quality bar names exactly what the post-publish read-back reports.
- C7 (Low) The destination mask's explanation was wrong (`burst.other` is `randomAztecAddress()`, `burst-account.ts:103`) and masking all destinations hides a changed recipient choice. Verified; accepted: relabel destinations by first appearance.
- Rejected: an OWNER-ASKS entry for "a cancelled run's draft lacks notes". A draft is visible only to people with push access, and every publish (or re-run) writes the notes in the publishing call, so no published release differs; nothing a user sees changes.
- Facts F1-F3, F5-F10 confirmed by Codex; F4 softened to what first-parent timestamps show.

## Consult 2: Opus Plan lens, round 1 (same-family leg, in parallel with consult 1)

Verdict: **conditional approve**. Nine findings, recorded with their dispositions in plan.md § Audit record (O1-O9). The material ones:

- O1 (High) The publish created a second git tag, `refs/tags/untagged-29f161d8864377d68cb4`, at `61060c0`. Verified by GET. My draft's "nothing wrote a ref at the publish" read rule insights as complete; they cover only refs a ruleset guards (`v*`). Lesson: an absence in rule insights is an absence only inside the rulesets' ref patterns.
- O2 (Medium) A re-run runs its own commit's code, so any publish job from before the fix detaches again; `main` has no `attach-assets-run.ts` (verified). Became OA-2.
- O6 (Medium) D2 (one publishing write) reversed: with the tag named, the notes write cannot change what the read-back checks, so the owner's keep-the-design rule decides for two writes. Codex had called one write the smallest change and two writes workable; Opus's argument holds.
- O7 (Medium) partly rejected: the Firefox twin run stays, by the common brief's rule for `tests/e2e/fixtures/**`.

## Consult 3: Codex plan audit, round 2 (resumed session)

Verdict: **conditional approve**. Round-1 conditions met; the D2 reversal accepted. Two Medium findings, both verified and accepted (plan.md § Audit record, R2-1 to R2-4): the fake must not assert an undocumented published-release detachment (now it models drafts only and the `verify-published` test asserts the request it sends), and OA-2 must separate the defective draft-flow runs from `main`'s older `gh release` flow (verified in `origin/main:.github/workflows/release.yml`). Noted while applying R2-1: renaming the fake's `calls` strings would make the existing `not.toContain("publish")` assertions pass vacuously, so the edits are recorded in a separate list.

## Consult 4: Codex plan audit, round 3 (resumed session)

Verdict: **conditional approve** (Phase 4's file gate must allow this plan's index line). Round-2 conditions met; four consistency findings, all accepted (plan.md § Audit record, Round 3).

## Consult 5: Codex plan audit, round 4 (resumed session)

Verdict: **approve**. "The round-3 condition is met. No material remaining findings." The audit converged in four rounds of one session (gpt-6.1-sol, high, read-only); no quota or login failure.
