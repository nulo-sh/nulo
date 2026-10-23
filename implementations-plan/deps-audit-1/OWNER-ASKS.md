# deps-audit-1: owner asks

## OA-1: may arc 1 carry the one-line test fix for #987? (answered: A)

- **Surface:** none a person sees. The ask concerns scope: one test file outside the lane's dependency files.
- **Why:** the soak could not pass `infra/token-list` at any commit: `test/live-check.test.ts:263` spawned `process.execPath`, which is `node` under the Node reference, on a TypeScript script Node refuses (#987, pre-existing).
- **Options:** A, carry `spawn("bun", …)` and rerun Phases 2-3 at the new candidate; B, fix #987 in its own PR first; C, open the PR with the red stated.
- **Answer (the orchestrator, under the owner's standing rules):** "**option A**, 'arc 1 adds `test(token-list): spawn the live-check script with bun, as ci runs it` (`spawn("bun", …)`, closing #987 in the same PR). Then Phases 2-3 rerun in full at the new candidate, and the PR opens when every compare exits 0.'" Landed as `dc82d009d` (D11).

## OA-2: a quiet window for the `apps/extension` soak pair (granted: A)

- **Surface:** none a person sees. The ask is host time.
- **Why:** at candidate `dc82d009d` every gate is green except the extension soak pair and the `test:all` ×5 run that follows it. The green gates: fresh install, audit gate 41/0/0/0, every build, the artifact check, smoke on both browsers, 12 of 13 compares and the `pr-quick` dispatch. Both attempts of the pair failed while other leads' runs held load1 at 120 to 300 on this host. Each failure is a vitest timeout at the default 5000 ms, and the one retry the brief allows is used (D12). A third red ends the arc as ARC_FAILED.
- **Options:**
  - **A (recommended):** the orchestrator schedules a window with no other lead's unit suites or e2e on the host, about 4 h at load5 under 80. It authorizes one final attempt of the extension pair plus `test:all` ×5, run at a detached `dc82d009d`, and every failing test's name is kept. If it passes, the PR opens. If it fails, the arc ends ARC_FAILED and the failures are read as a finding.
  - **B:** an exception: open the PR now with the extension pair stated as unpassed. Not recommended, for the same reason as OA-1's C.
- **What ships now:** nothing. The branch `deps-audit-1-a1` is pushed, with no PR. #980 and #987 stay open, and the audit gate keeps failing dependency PRs.
- **Answer:** A, granted by the orchestrator. The window opened at the resume, 2026-10-22T00:39Z, after ten minutes with load5 under 80 (load5 56.0 at the resume). The soak rules are unchanged: 30 retry-0 runs per engine of the extension pair at a detached `dc82d009d`, then `test:all` ×5, with no timeout, retry or config change. Load5 above 150 on three consecutive five-minute samples stops the attempt, and the orchestrator schedules the next window.
- **Attempt:** started 00:42:01Z at the detached `dc82d009d`. Node runs 1-10 passed (14770 tests each, 245 to 315 s). The load rule stopped it at 01:32:01Z, after load5 read 158.2, 178.0 and 170.2 on three consecutive samples. Other leads' suites carried that load: fit-gate-1, encryption-at-rest-1 and pxe-limits-1. No failure was recorded, and the 30-run bar is unmet.

## OA-3: one window for the whole remaining bar

- **Surface:** none a person sees. The ask is host time and the order of the remaining runs.
- **Why:** the close-out must merge `dev` first (README step 4). `dev` now carries #978's two e2e vitest configs, which match Phase 3's trigger, so the merged HEAD reruns Phases 2-3 (Codex r7). Rerunning only the extension pair at `dc82d009d` therefore buys a PR, not a close-out. Measured on this host when it was quiet, the full rerun takes about 6 h: Phase 2 with both smokes 1.4 h, the 12 smaller soak pairs 0.75 h, the extension pair 3.5 h, `test:all` ×5 0.4 h.
- **Options:**
  - **A (recommended):** at the next window, merge `origin/dev` first. The merged HEAD becomes the candidate, and Phases 2-3 run in full there in one window of about 6 h, under the same load rule. On a pass, the PR opens and the close-out follows. The close-out reruns only if a later trunk merge touches a trigger file again.
  - **B:** keep `dc82d009d`. One window of about 4 h for the extension pair and `test:all` ×5, then the PR opens at the pre-merge head. The close-out then needs a second window of about 6 h after its merge (Codex r7, A-i).
  - **C:** B, plus an approved narrowing of Phase 3's trigger. The two e2e configs feed only the e2e runners, so the close-out reruns only Phase 2 (about 1.4 h). It needs the orchestrator's or the owner's explicit approval: the lead may not narrow an approved gate.
- **What ships now:** nothing. The branch is pushed, with no PR. #980 and #987 stay open.
- **Answer:** A, granted by the orchestrator. It holds the window: no other lead runs a unit or e2e suite until this lane reports, and one measurement lane keeps about one core. The window opened at the resume, 2026-10-22T05:29:44Z, at load5 101.4 (load1 121.8). Processes outside this session's view were using about 37% of the CPU as niced time. Plan: merge `origin/dev` first, then run Phases 2-3 in full at the merged HEAD under the same soak and load rules.
- **Run:** `origin/dev` (`11439b1be`) merged as `f9da1bd3c`, the candidate. `index.md` kept every lane's row: the four rows dev removed are in dev's `archive/index.md`. The fresh frozen install passed, and the store holds only `vite@8.2.4` and `follow-redirects@1.16.1`. The audit gate then failed at 05:32:45Z: `41 acknowledged, 2 unacknowledged, 0 stale, 0 unreadable` (OA-4). The run stopped there, before any build or test.

## OA-4: two new advisories; may arc 1 fix them too?

- **Surface:** none a person sees. The ask concerns scope: two packages outside #980's five.
- **Why:** both advisories were published after this plan, and #1032 tracks them:
  - `@vitest/mocker` 4.1.10: [1242767](https://github.com/advisories/GHSA-qxg6-89mg-rqv8), moderate, fixed in 4.1.12;
  - `storybook` 10.5.8: [1242753](https://github.com/advisories/GHSA-f2ph-cmg5-wxc8), critical, fixed in 10.6.2.

  `quality-status` enforces the gate on every PR that changes a dependency file, this one included, so this PR cannot reach its bar (41/0/0/0) without them. Fixing them changes `package.json` and `bun.lock`, so Phases 2-3 must run after the fix either way. Running them at `f9da1bd3c` would be spent.
- **Age:** storybook 10.6.2 (2026-10-12T18:22Z) is past the 7-day gate; 10.6.3 is not. vitest and `@vitest/mocker` 4.1.12 (2026-10-15T14:51Z) clear it at 2026-10-22T14:51Z. 4.1.12 also fixes the two vitest advisories acknowledged today (D7), so those two entries leave `audit-acks.json` and the bar becomes 39/0/0/0.
- **Options:**
  - **A (recommended):** arc 1 takes both.
    - storybook and every `@storybook/*` the tree locks go to 10.6.2, landed as D3 landed vite.
    - vitest and `@vitest/*` go to 4.1.12 after 14:51Z, with the two stale acknowledgements removed.
    - Codex reviews the diff, and then Phases 2-3 run once at the new candidate (about 6.5 h). The soak this arc runs is the soak D7 deferred vitest to. The PR closes #980, #987 and #1032.
    - Before 14:51Z the vitest half needs SECURITY.md's per-package bypass, an uncommitted `--config=` exclude as in D4, for a moderate advisory. Waiting is cheaper.
  - **B:** a separate lane fixes #1032 first. Arc 1 then merges `dev`, whose manifests trigger a new candidate, and runs Phases 2-3 once.
  - **C:** acknowledge both. Not compliant: storybook's fix has cleared the gate, and the policy is to fix before acknowledging.
- **What ships now:** nothing. The branch is pushed at the merge, with no PR. #980, #987 and #1032 stay open. The orchestrator's window can be released.
- **Answer:** A, the orchestrator's call, recorded on #1032. It runs in two steps (D13). Step 1, storybook, landed as `64d61e4bc` on one core while another lane's e2e held the host. Step 2, vitest 4.1.12, waits for the age gate at 2026-10-22T14:51Z and the orchestrator's window.

## OA-5: the extension soak's third red ends arc 1; what runs next?

- **Surface:** none a person sees. The ask is host time and the order of the next runs. Any further run needs a new arc.
- **Why:**
  - At `9b414dc39`, every other Phase 2-3 gate passed. The `apps/extension` Node leg failed 1 of its 30 runs: a 5000 ms timeout in `background.transport.test.ts` › `with VITE_NULO_ALLOW_IFRAME_DAPPS=1` › `a same-origin subframe completes a key exchange` (#1101).
  - Nothing shows the vitest bump as the cause, and nothing shows host saturation. So no retry is allowed, and a test fix has no identified target.
  - It is that step's third red, so the arc ends `ARC_FAILED` (D15, Codex r10).
- **Options:**
  - **A (recommended):** a matched control first, as a diagnostic and not a gate. Run the same 30-run Node soak of `apps/extension` at a detached `0fe71361a`, the commit just before the vitest bump: vite 8.2.4, storybook 10.6.2 and #987's fix are all there. It takes about 2 h on a quiet host, and each failing run's raw report is kept. Then:
    - **The control goes red:** vitest 4.1.12 is not necessary for the red. #1101 needs its own fix (stalled step identified, no raised budget) before any candidate of this plan can pass. A new arc then merges `dev` and reruns Phases 2-3.
    - **The control is clean, 30 of 30:** suspicion of 4.1.12 rises, but nothing is proven. The choice is then B or a #1101 diagnosis.
  - **B:** a new arc that drops the vitest bump. It keeps vitest 4.1.10, acknowledges 1242767 (moderate, the test runner only) beside the existing vitest entry, as D7 acknowledged 4.1.11 until its own soak, and leaves that acknowledgement to the next vitest bump. Then Phases 2-3 rerun at that candidate. This adds an acknowledgement whose fix is past the age gate, so it is the orchestrator's call.
  - **C:** an exception: open the PR with the red disclosed. Not recommended: CLAUDE.md's soak is fail-closed, and Codex r3 rejected the same for #987.
- **What ships now:** nothing. The branch is pushed at the records, with no PR. #980, #987 and #1032 stay open, and #1101 is open. No run is in flight, so the window can be released.
