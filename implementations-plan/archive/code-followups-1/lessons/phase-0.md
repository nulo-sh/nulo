# Phase 0 — planning log

Every consult, including failed ones, with its verdict.

## Consult 1 — Codex (gpt-6.1-sol, high, read-only; default login): the boot-line "flake"

- Asked: is `[aztec-node] Error: Address already in use (os error 98)` a port collision; fix shape A (bypass the CLI wrapper), B (rewrite the line), C (docs only); is the `readAwaitingCard` wait right.
- Verdict: "high confidence the routine bind error is cosmetic; moderate confidence the Chrome failure is a hydration race and its successor a cascade. Choose C, and strengthen the DOM wait."
- Accepted: C over A (vendor-env drift plus a wrapper-parsing gate, only to remove expected noise) and over B (a rewritten line claims ownership the handler has not verified, and stderr arrives in chunks, not lines). Keep the Firefox `feeMethod:null` symptom open; do not assign authwit-consume-smoke to ledger row 4's cause without evidence. Read every awaiting card in one bounded predicate (exactly one, `queued`, cancel control present) instead of a separate wait and read. Validate causally first (probe the transient), then repeat the file per browser at retry 0, and state the statistical limit (zero failures in 100 exposures still allows about 3 %).
- Accepted as follow-ups, not fixed here: `resolve-ports.ts` bind-tests and releases before the build and uses no shared host registry, so two local worktrees can pick overlapping ports; teardown escalates on the group leader's exit, so a descendant that outlives its leader can escape. Neither is evidenced in this incident.
- Taken further than Codex: one explanatory startup line in the setup's own log (no rewrite of the vendor line), and a comment at `ANVIL_PORT` in the node's env saying it keeps the wrapper's anvil on the setup's port (without it the wrapper would start a second L1 on 8545).

## Consult 2 — Codex (gpt-6.1-sol, high, read-only; default login): plan audit, round 1

- Session `01a11e03-fbd7-73a1-9bdd-58a27c10ea66`. Asked: adversarial review, assumption attack, recon spot-check (all nine deletes, three keeps), implementation critique, overlaps.
- Verdict: `reject (blocking: prohibited file overlaps and a visible playground change; three validation steps cannot pass as written)`.
- Accepted: name the shared-document overlaps (#55, #56, #61); `cancel: true` in the Phase 2 `toEqual`; build the relabeled call from the relabeled artifact; scope the `urlTerm` grep to `EditNetworkPopup.vue`; entry 175 to rewrite; Phase 3 checks this build's Presto ports, not the host; drop the `STATUS.md` link at close-out; compare Storybook errors by message; the boot line arrives about 50 ms after the setup's start line (checked in the saved run log: 45-55 ms).
- Rejected: deferring the curated planning files until their PRs land (they are the shared files by the planning standard, and the brief requires editing them). The playground objection became moot when the change was dropped (consult 3).
- Found while checking: #60 merged as `a6c2fb5` during the audit; its freed entries were re-triaged. 151 stays parked (its pins keep the throw on purpose, "an owner lead"); `NetworkInfoSchema` (165) moved into Phase 7.

## Consult 3 — Opus (Plan agent, read-only): plan audit, round 1

- Verdict: `conditional approve (conditions: rework Phase 4's 101/63 item around the playground's existing register-then-read utility call, or close 101 on the tests that already cover it; convert the fourth ${chainId}:${address} site at full-backup-restore.ts:456)`.
- Accepted: close 101 on `stale-anchor-recovery.test.ts:166-187` and `connect-locked-queue.test.ts:51-57` (verified), 63 to the typed refusal only; the fourth restore key; `cache.store.ts`'s two fields; retitle `EditNetworkPopup.test.ts`'s dangling-endpoint case; a second budget in the awaiting-card wait (10 s, not 5 s: D9); the probe under `tests/e2e/network/`, never staged; the Storybook script run from `apps/extension`; the setup line without the vendor's text; `opfs-storage` as a boot smoke only; the `operation-result.ts` comment (156); base to `a6c2fb5`; a cheaper Phase 2 gate (`-t "two windows"` five times plus one full run per browser).
- Rejected: rewriting entry 162 in place (parked prose stays; the move is recorded in recon).
- Note: the agent ran one `git fetch` (moved `origin/dev` to `a6c2fb5`); no working file changed. The worktree was then fast-forwarded to `a6c2fb5` by the driver.

## Consult 4 — Codex (gpt-6.1-sol, high, read-only; default login): final fresh pass

- Session `01a11e19-57b1-75a1-8e9c-38ef928ace19`, new session over the revised plan.
- Verdict: `conditional approve (conditions: preserve duplicate-card failures, fix Storybook probe resolution, make Phase 3 timing measurable)`.
- Accepted, all: a two-or-more-card sample fails at once (a live two-card moment is a stop, not a loosening); Puppeteer through `createRequire` at `apps/extension`; Phase 3 timing via a never-staged probe copy, routed on the toast wait the 300 s bounds; stale text (open-PR list, Phase 4 headings, the line's wording, the cross-arc diff base `a6c2fb5`, recon's four restore keys); the `/loop` seed's reassess count to three.
- Confirmed on the merits: D9 (10 s), D10 (shared planning documents), D11, D12; the owner boundary; the triage arithmetic; no code or config overlap with open PRs.
