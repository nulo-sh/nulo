# Phase 4: arc gate and the Codex fix loop

## Gate (2026-10-11, at 11b5ab4)

- `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:ci-gating`, `bun run test:release`, `bun run lint:actions`: each exit 0.
- `git diff origin/dev --stat`: 17 files, all in the change map, this plan directory or `implementations-plan/index.md`.

## Codex fix loop, round 1 (gpt-6.1-sol, high, read-only; the diff `origin/dev...HEAD` at c11ec77)

Verdict: **approve**, "no material findings". It confirmed: no tagless release PATCH remains in `scripts/` or `.github/`; restating an existing tag moves no ref (`target_commitish` is unused when the ref exists); the matrix adds exactly the two chaos runners with boolean inputs typed, and `attach-assets`' needs, the aggregation, the job conditions, the store jobs and the publish order are unchanged; the seed parse runs only when armed, after the boot-ready marker, so exit 1 cannot become the exit-86 retry; the tests are substantive; the comments state constraints. It restated the accepted race (another `contents: write` holder acting between the read-back and the publish), which the plan's quality bar already names.

## Opus review of the final diff (in parallel with round 1)

Verdict: **approve**, three nits, all accepted and applied:
- The `verify-published` happy path's `expect(world.releases[0].tag).toBe("v1.2.3")` could never fail: the fake moves a published release's tag only when the edit names one, and the exact-patch assertion above it already pins the request. Deleted (Phase 1 step 4 had asked for it; the patch assertion is the contract).
- `-5` and `1.5` were labelled "another spelling of a number"; they are numbers that are no nonnegative integer, which `>>> 0` maps to other seeds. Relabelled as their own class.
- `chaosSeed`'s TSDoc said "a random draw when unset"; the suite always sets the variable, empty by default, so it now says "unset or empty".

## Codex fix loop, round 2 (resumed; the fix diff 92124e1)

Verdict: **approve**, "Findings: none". Removing the assertion "loses no meaningful coverage. An omitted or incorrect tag still fails the retained exact-patch assertion." The loop converged.

## Final-head gates (445ea36)

`bun run lint`, `typecheck:all`, `test:all`, `test:ci-gating`, `test:release`, `lint:actions` and `check:plans`: each exit 0. `send-chaos.test.ts` with seed 1095865833 (proverless, retry 0): green on Chrome and on Firefox, its actions equal to PR run 38162383273's after relabelling destinations.

## Close-out consult: the lessons promotion (Codex, resumed)

`lessons.md` sat at 8191 of 8192 bytes and every entry still held, so no merge alone fit (folding the rule and the base-SHA entry into the success-control entry still came to 8250). Options put to Codex: retire the vite-plugin-pages redirect entry, which `apps/extension/src/popup/legacy-routes.test.ts` now holds (it asserts each old path is claimed by its redirect record alone over the real generated route tree), and add a 135-byte § Git & GitHub line; or promote nothing, as ci-followups-2 did. Codex: option 1, "the real-route test preserves the retired lesson's local protection, while the GitHub API quirk deserves durable visibility because it applies beyond this repository's guarded release runner." Applied.
