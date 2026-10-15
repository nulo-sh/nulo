---
plan: governance-1
tier: mid
status: completed
issues: [15, 21]
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
---

# governance-1: open work lives in GitHub issues; `follow-ups.md` is retired

## Outcome

- **Date**: 2026-10-09.
- **Status**: closed with this delivery, one PR against `dev` titled `docs: track open work in github issues and advisories, retire follow-ups.md`.
- **Shipped**: the routing rules in `CLAUDE.md` (§ Where open work lives), `implementations-plan/README.md`, `SECURITY.md` (§ How findings are tracked) and `BEFORE-LAUNCH.md`; every archived plan re-pointed at the issues and advisories that own its items; the live references re-pointed; the plans gate's `retired-file` rule; `follow-ups.md` deleted. #15 and #21 carry the edits the ledger recorded for them.
- **Open items**: none. Every ledger entry is an issue, an advisory, a `lessons.md` line, a `BEFORE-LAUNCH.md` step or a disposition (§ Disposition ledger).
- **Seeds retired**: the `/goal` and `/loop` seeds below are no longer live. Do not run them.

## Decision

Owner-approved on 2026-10-09 after a Codex review. `implementations-plan/follow-ups.md` held 208 entries in one 93 KB file that every plan was told to read and every parallel lane edited and had to reconcile at close-out, and anything exploitable in it was public. Open work now lives in GitHub issues, and a suspected exploitable weakness in a private draft security advisory. The file is deleted, and the gate refuses it if it comes back.

| Situation | Home |
|---|---|
| Work inside the implementation you are on | the active `plan.md` and the PR |
| Actionable work that outlives the plan: a bug, a gap, a missing test, a deferred refactor | a GitHub issue, with a domain label and a `Record` link to the archived plan |
| Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` (the body names the trigger) |
| A suspected exploitable weakness | a private draft security advisory; `plan.md` records only "tracked privately: GHSA-…" until it is published |
| Rejected, superseded or already done | a disposition line in the plan's Outcome block; no open item anywhere |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget, unchanged) |
| A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` (unchanged) |
| Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

## Codex verdicts

**Design review (gpt-6.1-sol, high, read-only).** Verdict: adopt issues-first, moderate confidence. Accepted: the routing table; `Closes #N` means integrated into `dev`, not released; dedupe with `gh issue list` before opening; private triage for anything with an exploit path, and the finding kept out of committed plans, PR bodies and test names until publication; a `v1.0.0` milestone pointed at once from `BEFORE-LAUNCH.md`; no retrofitted mandatory `#N` rule in the gate's Outcome check. Rejected, by the owner: the frozen ≤ 1 KiB redirect stub in place of deletion. The file is deleted, every archived link to it is re-pointed rather than redirected, and the `retired-file` rule keeps it gone. Adjusted: Codex rejected a "no CVE below high" rule; the rule adopted is no CVE request unless store-installed users must be notified, which does not depend on severity.

**Ledger review (gpt-6.1-sol, high, read-only).** Verdict: stop, high confidence on the source findings. Every row was applied before anything reached GitHub: `ux-feedback-technical-3`, the five `harden-dedupe-deferred-dedup` extractions and `harden-dedupe-robustness-10` became their own issues; `harden-dedupe-tests-and-ci-2` merged into the flake-ledger issue instead of being rejected; `issues-3` keeps its rejection with corrected evidence (the execution-canary gate); four entries moved from public issues to draft advisories, and two advisory texts were narrowed to what the code shows; three bodies were corrected; the concurrent-send clause moved to its own issue; labels and titles were validated before any call; `tests-and-e2e-8` replaced a `lessons.md` line instead of adding one. Not applied, by the owner: splitting the grouped `owner-decision` issues one per nit.

**Fix loop on this diff (gpt-6.1-sol, high, read-only).** Round 1, two findings, both accepted. The close-out rule required every open item to be an issue or an advisory, which contradicted the `BEFORE-LAUNCH.md` home for legal and store steps; the rule now admits such a step, named on the Outcome line, in `CLAUDE.md` and the plans README. Two security-ui-1 notes pointed a screenshot colour-transition gap at #90, which owns no such item; #66 had already fixed it, and the notes now say so. Round 2: clean.

## Counts

- Ledger: 208 entries. Verdicts: issue 182, advisory 7, merge-into 8, rejected 5, done 3, lessons 1, before-launch 2.
- GitHub: 155 issues (#77 to #231, all open at delivery), 7 draft advisories, and two existing issues extended (#15, #21).
- This PR: 81 archived files re-pointed by a ledger-driven script (88 rewrites, every owned entry accounted for), 6 live references, 1 gate rule, `follow-ups.md` deleted. `bun run check:plans` reports 0 findings with the file gone.

## Assumptions

- **Ask**: plain-text mentions of `follow-ups.md` in archived procedure (close-out checklists, recon notes) stay as history; only links, Outcome lines and present-tense pointers were rewritten. Working assumption: an archived plan is evidence, so rewriting its procedure would falsify it.
- **Ask**: archived plans still describe, in prose written before the advisories existed, the findings now tracked privately; the repository is public and those texts are in its history. Working assumption: no rewrite was made beyond the Outcome lines this PR touched, which name an advisory id with no description; a scrub is the owner's call.
- **Ask**: items an archived Outcome named that had already left `follow-ups.md` before the ledger was built say "closed by a later plan", the close-out that deleted them (code-followups-1, supply-chain-release). Working assumption: that wording is exact; "resolved" would claim more than the record shows.

## Disposition ledger

One line per entry of the retired file: the ledger id, its verdict, and what owns it now.

- `intro-1` · issue · #77
- `intro-2` · issue · #78
- `aztec-v6-1` · issue · #79
- `aztec-v6-2` · issue · #80
- `aztec-v6-3` · issue · #81
- `aztec-v6-4` · issue · #82
- `grants-and-scopes-1` · issue · #83
- `grants-and-scopes-2` · issue · #84
- `grants-and-scopes-3` · advisory · tracked privately: GHSA-gmg4-4ccr-fr65
- `grants-and-scopes-4` · issue · #85
- `grants-and-scopes-5` · issue · #86
- `grants-and-scopes-6` · issue · #87
- `grants-and-scopes-7` · issue · #88
- `grants-and-scopes-8` · issue · #89
- `grants-and-scopes-9` · issue · #89
- `send-amounts-1` · issue · #90
- `send-amounts-2` · issue · #90
- `send-amounts-3` · issue · #90
- `send-amounts-4` · issue · #90
- `send-amounts-5` · issue · #90
- `send-amounts-6` · issue · #90
- `wallet-safety-1` · issue · #91
- `wallet-safety-2` · issue · #92
- `wallet-safety-3` · issue · #93
- `wallet-safety-4` · issue · #94
- `wallet-safety-5` · issue · #95
- `wallet-safety-6` · issue · #96
- `wallet-safety-7` · issue · #96
- `wallet-safety-8` · done · a full-backup restore trusts each restored token with no trust row
- `wallet-safety-9` · issue · #97
- `wallet-safety-10` · issue · #98
- `wallet-safety-11` · issue · #99
- `wallet-safety-12` · issue · #100
- `wallet-safety-13` · advisory · tracked privately: GHSA-cwcc-mvf5-w7m9
- `wallet-safety-14` · issue · #101
- `wallet-safety-15` · issue · #101
- `wallet-safety-16` · issue · #102
- `wallet-safety-17` · advisory · tracked privately: GHSA-6wh5-mc2x-fc3w
- `amounts-sends-and-fees-1` · issue · #103
- `amounts-sends-and-fees-2` · issue · #104
- `amounts-sends-and-fees-3` · issue · #105
- `amounts-sends-and-fees-4` · issue · #106
- `amounts-sends-and-fees-5` · issue · #107
- `amounts-sends-and-fees-6` · issue · #108
- `amounts-sends-and-fees-7` · advisory · tracked privately: GHSA-vx7h-rpq3-2p9x
- `amounts-sends-and-fees-8` · issue · #109
- `amounts-sends-and-fees-9` · issue · #110
- `amounts-sends-and-fees-10` · issue · #110
- `amounts-sends-and-fees-11` · issue · #111
- `amounts-sends-and-fees-12` · issue · #112
- `amounts-sends-and-fees-13` · issue · #110
- `amounts-sends-and-fees-14` · issue · #110
- `amounts-sends-and-fees-15` · issue · #113
- `amounts-sends-and-fees-16` · issue · #113
- `amounts-sends-and-fees-17` · issue · #114
- `amounts-sends-and-fees-18` · issue · #113
- `amounts-sends-and-fees-19` · issue · #115
- `amounts-sends-and-fees-20` · issue · #115
- `amounts-sends-and-fees-21` · issue · #115
- `amounts-sends-and-fees-22` · issue · #116
- `amounts-sends-and-fees-23` · issue · #117
- `amounts-sends-and-fees-24` · issue · #118
- `amounts-sends-and-fees-25` · issue · #119
- `amounts-sends-and-fees-26` · issue · #120
- `amounts-sends-and-fees-27` · issue · #121
- `amounts-sends-and-fees-28` · issue · #122
- `connecting-a-dapp-1` · issue · #123
- `connecting-a-dapp-2` · issue · #123
- `connecting-a-dapp-3` · issue · #123
- `connecting-a-dapp-4` · issue · #124
- `connecting-a-dapp-5` · issue · #123
- `connecting-a-dapp-6` · issue · #125
- `connecting-a-dapp-7` · issue · #126
- `connecting-a-dapp-8` · issue · #127
- `connecting-a-dapp-9` · issue · #128
- `connecting-a-dapp-10` · merge-into · #228 (merged)
- `layout-1` · issue · #129
- `layout-2` · issue · #130
- `layout-3` · issue · #129
- `layout-4` · issue · #131
- `layout-5` · issue · #132
- `layout-6` · issue · #133
- `layout-7` · issue · #134
- `layout-8` · rejected · the owner declined both hub additions for now
- `layout-9` · issue · #135
- `copy-1` · issue · #136
- `copy-2` · issue · #137
- `incoming-transfers-1` · issue · #138
- `incoming-transfers-2` · issue · #139
- `incoming-transfers-3` · issue · #140
- `incoming-transfers-4` · issue · #141
- `incoming-transfers-5` · issue · #142
- `incoming-transfers-6` · issue · #143
- `incoming-transfers-7` · issue · #144
- `backup-and-storage-1` · issue · #145
- `backup-and-storage-2` · issue · #146
- `backup-and-storage-3` · issue · #147
- `backup-and-storage-4` · issue · #148
- `backup-and-storage-5` · issue · #148
- `backup-and-storage-6` · issue · #149
- `backup-and-storage-7` · advisory · tracked privately: GHSA-p5fc-5h56-5xw7
- `backup-and-storage-8` · issue · #150
- `backup-and-storage-9` · issue · #151
- `older-plans-residuals-1` · issue · #152
- `older-plans-residuals-2` · issue · #153
- `older-plans-residuals-3` · issue · #154
- `older-plans-residuals-4` · advisory · tracked privately: GHSA-hwrf-v993-jrv9
- `older-plans-residuals-5` · issue · #155
- `older-plans-residuals-6` · issue · #156
- `older-plans-residuals-7` · issue · #157
- `older-plans-residuals-8` · issue · #158
- `older-plans-residuals-9` · issue · #159
- `older-plans-residuals-10` · issue · #160
- `tests-and-e2e-1` · issue · #161
- `tests-and-e2e-2` · issue · #162
- `tests-and-e2e-3` · issue · #163
- `tests-and-e2e-4` · issue · #164
- `tests-and-e2e-5` · issue · #165
- `tests-and-e2e-6` · merge-into · #165 (merged)
- `tests-and-e2e-7` · issue · #166
- `tests-and-e2e-8` · lessons · a `lessons.md` line
- `tests-and-e2e-9` · issue · #167
- `tests-and-e2e-10` · issue · #168
- `tests-and-e2e-11` · issue · #169
- `tests-and-e2e-12` · issue · #169
- `tests-and-e2e-13` · issue · #169
- `tests-and-e2e-14` · issue · #170
- `tests-and-e2e-15` · issue · #171
- `dependencies-and-supply-chain-1` · issue · #172
- `dependencies-and-supply-chain-2` · issue · #173
- `dependencies-and-supply-chain-3` · issue · #174
- `dependencies-and-supply-chain-4` · issue · #175
- `dependencies-and-supply-chain-5` · rejected · five dormant external triggers, recorded in the third-party-notices plan
- `dependencies-and-supply-chain-6` · issue · #176
- `dependencies-and-supply-chain-7` · issue · #177
- `release-1` · before-launch · `BEFORE-LAUNCH.md` § 2
- `release-2` · merge-into · #21 (merged)
- `release-3` · merge-into · #21 (merged)
- `release-4` · issue · #178
- `release-5` · issue · #179
- `release-6` · issue · #180
- `release-7` · advisory · tracked privately: GHSA-6cj6-wp78-52mc
- `release-8` · issue · #181
- `release-9` · before-launch · already in `BEFORE-LAUNCH.md` § 4
- `plans-docs-and-tooling-1` · issue · #182
- `plans-docs-and-tooling-2` · issue · #183
- `plans-docs-and-tooling-3` · issue · #184
- `plans-docs-and-tooling-4` · issue · #185
- `plans-docs-and-tooling-5` · merge-into · #185 (merged)
- `plans-docs-and-tooling-6` · merge-into · #185 (merged)
- `plans-docs-and-tooling-7` · issue · #186
- `plans-docs-and-tooling-8` · issue · #187
- `issues-1` · issue · #188
- `issues-2` · rejected · an accepted residual, visible and revocable
- `issues-3` · rejected · the designed state, guarded by the execution canaries
- `ux-feedback-owner-decisions-1` · issue · #189
- `ux-feedback-owner-decisions-2` · issue · #189
- `ux-feedback-owner-decisions-3` · issue · #189
- `ux-feedback-technical-1` · issue · #190
- `ux-feedback-technical-2` · issue · #191
- `ux-feedback-technical-3` · issue · #221
- `ux-feedback-technical-4` · issue · #192
- `ux-feedback-technical-5` · issue · #193
- `ux-feedback-technical-6` · issue · #194
- `harden-dedupe-robustness-1` · issue · #195
- `harden-dedupe-robustness-2` · issue · #196
- `harden-dedupe-robustness-3` · issue · #197
- `harden-dedupe-robustness-4` · issue · #198
- `harden-dedupe-robustness-5` · issue · #199
- `harden-dedupe-robustness-6` · issue · #200
- `harden-dedupe-robustness-7` · issue · #201
- `harden-dedupe-robustness-8` · issue · #202
- `harden-dedupe-robustness-9` · issue · #203
- `harden-dedupe-robustness-10` · issue · #227
- `harden-dedupe-deferred-dedup-1` · issue · #204
- `harden-dedupe-deferred-dedup-1.1` · issue · #205
- `harden-dedupe-deferred-dedup-2` · issue · #222
- `harden-dedupe-deferred-dedup-3` · issue · #223
- `harden-dedupe-deferred-dedup-4` · issue · #224
- `harden-dedupe-deferred-dedup-5` · issue · #225
- `harden-dedupe-deferred-dedup-6` · issue · #226
- `harden-dedupe-owner-ui-and-drift-1` · issue · #206
- `harden-dedupe-owner-ui-and-drift-2` · issue · #207
- `harden-dedupe-owner-ui-and-drift-3` · done · in #36
- `harden-dedupe-owner-ui-and-drift-4` · issue · #208
- `harden-dedupe-owner-ui-and-drift-5` · issue · #209
- `harden-dedupe-owner-ui-and-drift-6` · issue · #210
- `harden-dedupe-owner-ui-and-drift-7` · issue · #211
- `harden-dedupe-owner-ui-and-drift-8` · issue · #212
- `harden-dedupe-tests-and-ci-1` · rejected · disproved by measurement
- `harden-dedupe-tests-and-ci-2` · merge-into · #185 (merged)
- `harden-dedupe-behaviour-alignment-1` · issue · #213
- `harden-dedupe-behaviour-alignment-2` · issue · #214
- `harden-dedupe-behaviour-alignment-3` · issue · #215
- `harden-dedupe-behaviour-alignment-4` · issue · #215
- `harden-dedupe-behaviour-alignment-5` · issue · #215
- `harden-dedupe-behaviour-alignment-6` · issue · #216
- `harden-dedupe-same-token-concurrent-sends-1` · issue · #217
- `harden-dedupe-same-token-concurrent-sends-2` · issue · #218
- `harden-dedupe-same-token-concurrent-sends-3` · issue · #217
- `harden-dedupe-same-token-concurrent-sends-4` · issue · #219
- `harden-dedupe-same-token-concurrent-sends-5` · issue · #220
- `harden-dedupe-same-token-concurrent-sends-6` · done · in #39
- `security-ui-1-close-out-1` · issue · #228
- `security-ui-1-close-out-2` · merge-into · #15 (merged)
- `security-ui-1-close-out-3` · issue · #229
- `security-ui-1-close-out-4` · issue · #230
- `security-ui-1-close-out-5` · issue · #231

## Seeds

```
/goal Every follow-ups.md entry is an issue, an advisory, a lessons.md line, a BEFORE-LAUNCH.md step or a recorded disposition; archived plans name their owners; follow-ups.md is deleted and the plans gate refuses it; check:plans reports 0 findings.
/loop Re-run bun run check:plans and the Codex fix loop on the diff against dev until both are clean, then open the PR.
```
