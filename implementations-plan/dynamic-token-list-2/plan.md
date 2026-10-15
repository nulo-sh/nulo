---
plan: dynamic-token-list-2
tier: light (the orchestrator's call; the common brief's panel of two still argues each decision)
status: arc 1 (P1–P3) implemented, PR open; the warning arc waits on W1
issues: "#383 (Refs: this arc ships the payload, the signer and the floor; the warning waits on OWNER-ASKS W1 and its own PR closes #383); #386 (Refs: the floor ends its fresh-install delisting half; it stays a closed known limit)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens; Codex resumes to verify
base: origin/dev at 116974dc
trunk: dev
post_implementation_hardening: not scheduled
---

# dynamic-token-list-2: a scam flag and a sequence floor for the signed token list

The owner chose option A on decision page 17 (2026-10-15, the `## Decision` block on #383). This plan ships its protocol half as one PR against `dev`:

- **`flagged`**: a top-level set of `{chainId, address}` pairs in the `nulo-token-list/1` payload. It is additive, because today's wallets accept it and discard it (Fact 2).
- **The floor**: `packages/token-list/src/floor.json` holds a sequence. A wallet refuses any list below it, fetched or stored. The publish PR of a list that delists or flags a pair raises it to that list's sequence, so each release built after it pins it.

The warning on flagged rows and in Send is a new surface. It goes to the owner as W1 ([OWNER-ASKS.md](OWNER-ASKS.md)) and ships in its own PR after W1 is signed; that PR carries the flags into the wallet's snapshot (D5) and closes #383. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** the owner, who flags or delists a token; a person on a fresh install to whom a hostile host serves an old list.
- **Excellent:**
  1. A wallet built after a flag or a delisting refuses every older signed list. Each refusal path (fetched, stored) has a test with a success control.
  2. The approver sees every flag change, and whether the floor moves, before approving `sign`. The signed digest covers the flags.
- **Good enough:** no warning yet (W1); the freeze stays a known limit (#386); no change to the keys, the `token-list` environment, who publishes, or `publish-token-list.yml`.

## Assumptions

**Facts** (verified at `116974dc`):
1. Wallet mode ignores unknown payload keys: `record()` checks keys only in `strict` (`packages/token-list/src/parse.ts:62-69`); `parse.test.ts:95` pins it for `payload.mirror`.
2. The base `readTokenList` accepts a signed payload carrying `flagged` and discards the key (planner run, `lessons/phase-0.md`).
3. Seeds, "Nulo knows" and prices read token pairs from `snapshot.entries` only (`token/default-tokens.ts:31`, `getVerifiedDefaults`, `price/price-map.ts:43`).
4. A throw in `readTokenList` is outcome `refused` on fetch. On boot it discards the stored envelope and clears `nextAttemptAt`, so boot refetches (`apps/extension/src/wallet/services/token-list/service.ts:136-148,180-185`).
5. The served list is sequence 1792014908 with no tokens. The one before it (1792005490) held the four rc.1 tokens, so 1792014908 delisted them (#429, #434).
6. `runPublish` commits only the envelope; it reads the branch's envelope only to compare text. It imports `node:fs` only, and `publish-pr` installs nothing (`infra/token-list/scripts/open-publish-pr.ts`).
7. The e2e lists are signed at `Date.now()` or an hour before; the artifact run's held list is the committed envelope (`tests/e2e/fixtures/token-list.ts:59-72,202-211`). The composition test signs sequences 5 to 99. Nightly `v0.30.2-nightly.26288` already reads the list.
8. `publish.test.ts:119-122` resolves every relative import by appending `.ts`.
9. `concurrency: publish-token-list` (no cancel) runs one publish at a time; a stale publish PR conflicts with `dev` on `public/v1/list.json`.

**Inferences:** I1. A source edit that lists and flags the same pair is an owner error, which the signer refuses in strict mode.

**Asks** (working assumption in brackets):
- A1. The warning, its words and its look [W1; nothing renders until it is signed].
- A2. The floor pins delistings and flags only, as decision P17-08 says. A replayed older list can still restore an unflagged pair or an old `priceId` on a fresh install [accepted as part of #386's "withheld corrections"; the PR body and `SECURITY.md` name it; D3 records the alternative].

## Architecture & Implementation

- **Payload.** `flagged?: {chainId, address}[]` takes the entry's `chainId` and `address` rules. It is unique, bounded by `MAX_TOKENS`, and disjoint from `tokens` in both modes, so a listed and flagged pair refuses the list. The 64 KiB envelope binds first, at about 450 flags. Strict mode refuses unknown keys in a flag; wallet mode ignores them. `checkPayload` returns `flagged: []` when the key is absent. FORMAT.md states the disjointness as a format rule.
- **Source and signer.**
  - `checkSource` accepts `{tokens, flagged?}` and returns `flagged` only when present, so `list.source.json` stays `{"tokens": []}` until the first flag. Editing it would trigger `publish-token-list.yml` on merge and ask the owner for a no-op approval.
  - `signList` always signs `flagged` (`[]` when the source has none), and `listSha256` digests `{tokens, flagged}`.
  - The CLI flag `--expect-tokens-sha256` and the `tokensSha256` output keep their names, so `publish-token-list.yml` and its pins stay byte-identical (D2). The labels a person reads change to "tokens and flags sha256": the summary line, the `sign` error and the PR body.
- **Floor rule.** `infra/token-list/scripts/floor.ts` holds `raisesFloor(served, next)` over `{tokens, flagged}` pairs: true when a served token pair is gone or a pair is newly flagged; a missing served envelope is an empty list. It imports nothing. `open-publish-pr.ts` uses it (its `envelopeMeta` also returns the pairs, so no new payload reader appears), and `summary.ts` prints "Raises the compiled floor: yes/no" from it.
- **Floor value.** `floor.json` is `{"sequence": 1792014908}` (Fact 5). `index.ts` exports it as `SEQUENCE_FLOOR`. `readTokenList(text, keys = PINNED_KEYS, floor = SEQUENCE_FLOOR)` throws `PayloadError("payload.sequence")` below it, after verification. The service gains no branch (Fact 4).
- **Publish PR.** `runPublish` reads the envelope at `baseSha`. When `raisesFloor` holds, the same `createCommitOnBranch` also writes `floor.json` with the new sequence, and the body says so. A rerun compares both files before it commits. The floor only rises: the new sequence is above the served one, which is at or above the floor.
- **Tree.** `floorFindings` refuses a non-canonical `floor.json`, a sequence below 1 and a sequence above the committed envelope's. A hand-lowered floor is a reviewed source change, like an edit to `keys.ts`.
- **Wallet.** `VerifiedTokenList` carries `flagged`. The snapshot does not yet (D5).

## Security & Adversarial Considerations

- **Threat.** A host attacker (DNS, Cloudflare, the deploy) serves any signed list. Before, an older list re-seeds a delisted pair on a fresh install (#386). After, every list below the floor is refused, fetched or stored. Still open: a wallet built before a flag never learns its floor; the freeze; the A2 rollbacks.
- **Bot write.** The App-token job now writes `floor.json`, which every build enforces, and the owner merges it. The tree test refuses a floor above the served list; a low floor only weakens it. `publish.test.ts` keeps the job's closure free of bare imports. A run whose base no longer holds the envelope `dev` serves refuses before any write.
- **Manual publishes.** A recovery-key publish bypasses `runPublish`; `infra/token-list/README.md` tells it to set `floor.json` when the list delists or flags.
- **Approval binding.** The digest covers the flags, so `sign` refuses a flag set the approver was not shown.
- **Unchanged:** the keys, the environment, the signing step, `contents: read`, no new dependency.

## UI impact

None in this arc. The warning (rows, Send) is W1 and ships only after the owner signs it.

## Phases

Every gate also runs `bun run lint` and `bun run typecheck:all`, each exiting 0.

### P1. `flagged` in the format and the signer ✓

1. Add the test "a signed list carrying a flagged set verifies and parses" to `parse.test.ts`. Run it on the unchanged parser, then commit it alone: it is the proof on the current parser.
2. Change `parse.ts` (payload, source, and `checkFlagged` sharing the entry's chainId and address rules), `sign.ts` (`listSha256`, `flagged` signed), `summary.ts` (flag diff, relabel), `open-publish-pr.ts` (body relabel). `list.source.json` stays untouched.
3. Document it: `FORMAT.md` (field row, example, disjointness, reader rules: show a warning, never treat a flagged pair as listed) and both READMEs.
4. Add these tests:
   - Both modes parse a flag set alike, with the same address on two chains as the success control. An absent key gives `[]`.
   - One refusal each: an upper-case address, a duplicate flag, a pair that is both listed and flagged, and an unknown key in a flag (strict only).
   - `sign.test.ts` refuses a flag set the digest did not cover.
   - `publish.test.ts` renders and escapes the flag diff.
- **Gate:** `bun run --cwd packages/token-list test`, `bun run --cwd infra/token-list test` and `bun run --cwd infra/token-list check` exit 0.

### P2. The floor ✓

1. Add `floor.json`, `SEQUENCE_FLOOR` and the `readTokenList` parameter. The P2 typecheck proves that the JSON import compiles; add `resolveJsonModule` to `packages/token-list/tsconfig.json` only if it does not.
2. Add `infra/token-list/scripts/floor.ts`. Change `open-publish-pr.ts` (read at `baseSha`, a commit of two files), `summary.ts` (the floor line) and `check.ts` (`floorFindings`).
3. In `publish.test.ts`, keep a specifier that already has an extension, treat a `.json` file as a leaf, and refuse any import other than `node:` or a relative one in `open-publish-pr.ts`'s closure.
4. Rebase the test sequences on the floor: `sign.test.ts`'s clock, and `service.composition.test.ts` on `SEQUENCE_FLOOR`.
5. Add these tests:
   - `readTokenList` refuses floor − 1 and accepts the floor.
   - `raisesFloor` table: delist yes, new flag yes, first publish with flags yes, addition no, re-add no, unflag no.
   - `runPublish` writes the floor only then, and a rerun that raised it makes no call.
   - `floorFindings` refuses a floor of 0, a floor above the envelope, and a non-canonical file.
   - In the composition test, a fresh install fetches a list below the floor: a request happens, the outcome is `refused`, nothing is stored, and the backoff deadline is set. At that deadline a list at the floor is accepted.
   - A stored list below the floor with a future deadline is dropped, refetched at once, and replaced.
- **Gate:** the P1 commands, `bun run test` and `bun run test:ci-gating` exit 0, and `import-closure.test.ts` passes unchanged.

### P3. Regression and docs ✓

1. Update the docs:
   - `SECURITY.md` § Token list signing: "Rollback and freeze", A2, and the bot write.
   - `infra/token-list/README.md`: a delisting or a flag raises the floor in its publish PR; manual publishes; such a PR runs the extension e2e lanes.
   - `packages/token-list/README.md`.
   - The `aztec-update` reset step: flags move with the chainId.
2. Gate:
   - `bun run audit:vue` exits 0.
   - Run the armed build: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`. Then run `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/token-list.test.ts --retry=0`. It is green.
   - `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/default-token-seeding.test.ts` is green at retry 0.
   - `bun run test:all` and `bun run check:plans` exit 0.
   - No e2e scenario is added: the composition test proves each refusal without a browser.

## Delivery

One arc, one PR against `dev`, no stack (D-orch-1). Open it only after the P3 gate passes and the Codex loop converges.

Title: `feat(token-list): flag a token and refuse a list below a compiled floor` (71 characters). Body: `Refs #383`, `Refs #386`, A2, the floor's bot write, the gates with outcomes, and no e2e scenario added. No label: the path filters already cover `packages/token-list/**`.

## Post-implementation

Follows [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `116974dc`. Specific to this plan:

- **Review loop:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over the net diff from `116974dc`, resumed with `resume-codex.sh`, at most three rounds. `code_review: off`.
- **Delivery:** `gh pr create --base dev`, then `gh pr checks <n> --watch`.
- **Close-out**, as the PR's final commits: the Outcome block; a comment on #383 (the warning waits on W1; it stays open) and on #386 (the floor ends the fresh-install delisting half; the freeze and the A2 rollbacks remain; it stays closed); `STATUS.md` deleted; the `git mv` into `archive/` in its own commit, with the index line moved.
- **Teardown:** when `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dynamic-token-list-2/plan.md` succeeds, run `agent-worktree done dynamic-token-list-2 --merged`.

## Decision ledger

| ID | Decision | Rejected alternative, and why |
|---|---|---|
| D1 | A top-level `flagged` set, disjoint from `tokens` | `flagged: true` on an entry: a flagged token is delisted, so it has no entry to mark |
| D2 | One digest over `{tokens, flagged}`; workflow names kept, readable labels changed (both legs agree) | A second digest and flag: it changes the signing step, which the lane keeps as it is today |
| D3 | The publish PR raises `floor.json` when the list delists or flags (both legs agree) | A hand-kept constant: a forgotten bump is silent. Floor = every published sequence, with equality in the tree (Opus): it pins A2 too, but it goes past the owner's words, runs the e2e lanes on every publish, and refetches lagging stored lists at each release. It is an option for the owner, not a quiet swap |
| D4 | The floor check lives in `readTokenList`, reusing `refused` (both legs agree) | A compare in the service: two call sites, and other readers would skip it |
| D5 | `VerifiedTokenList` carries `flagged`; the snapshot waits for the warning PR (Opus over Codex) | Snapshot now (Codex: "a small, useful seam"). No consumer reads it before the warning PR, which must add the popup channel anyway. A required field forces edits to unrelated test literals (`price/service.test.ts`, `token/service.composition.test.ts`) |
| D6 | `raisesFloor` lives in `infra/token-list/scripts` | In the package: it is publish policy, and a cross-package relative import from the App-token job |
| D7 | Implementation deviations (2026-10-15): the review diff's base is `0ac9e062` (`origin/dev`, merged in before P1), not `116974dc`, whose net diff would carry the rc.3 move; the plan stays active and this PR runs no close-out, by the orchestrator's call (the warning arc closes it); `floor.ts` also owns `floorText`, the file's canonical form, which both the tree check and the publish PR need and which the App-token job cannot import from `check.ts` | Close-out now: the warning arc belongs to this plan |

## Audit verdicts

**Round 1** (Codex `gpt-6.1-sol` high, fresh session; Opus 5.5 Plan, in parallel). Both: **conditional approve**.

- **Accepted, both legs:** the JSON import breaks `publish.test.ts` (Codex 2, Opus 1; Fact 8); rerun, supersede and first-publish semantics with a visible floor decision (Codex 3, Opus 4; P2.5, D6); the D2 relabel and an optional source key (Opus 8).
- **Accepted, Codex:** a floor of 0 and the only-rises rule (1; `floorFindings`); observable refusal tests with success controls (5; P2.5); Fact 2 narrowed and the old I1 dropped (6).
- **Accepted, Opus:** P2 was red until P3, so the rebase moved to P2 and `bun run test` joined its gate (2); the smoke gate needs the armed build (3, verified at `global-setup-smoke.ts:34-52`); the unpinned rollbacks (5; A2, D3); e2e lanes on floor PRs (6); D5 over Codex (7); the unreachable cap (10, noted); Facts 3, 6, 7 and the title length.
- **Rejected:** Codex 4, a stale `baseSha` that drops a flag. It needs conditions the workflow does not allow (Fact 9).

**Round 2** (Codex, same session, resumed over the revised plan): **approve**, "No new material findings. Confidence: high." Codex withdrew finding 4 on the Fact 9 trace.

**Implementation, arc 1** (Codex `gpt-6.1-sol` high, fresh session over `0ac9e062..HEAD`; one Opus 5.5 diff review beside round 1; log in [lessons/phase-3.md](lessons/phase-3.md)):

- **Round 1:** Codex conditional approve (a fixed-sequence compatibility test a raised floor would red; a publish closure scan blind to side-effect imports and run-time loads; comment trims), all accepted. Opus no must-fix: a flag test for `runPublish` accepted, two nits rejected with reasons.
- **Finding 4 reversed, on new evidence (Opus, agreed by Codex in round 2):** the stale-base conflict is not a reliable stop, since GitHub's web editor resolves it in M's favour, and the run's summary already diffed against a list no longer served. `runPublish` now refuses before any write when `dev` serves another envelope than the run's base, and the README says to close a conflicted publish PR and re-dispatch. That is a refusal, so it adds no state.
- **Round 2:** Codex conditional approve over the round-1 fixes and the stale-base path. The refusal landed in 5e3932d6.
- **Round 3:** Codex **approve**, "No new material findings. Confidence: high." The loop converged.

## Seeds

The plan runs past the `light` target (about 180 lines) because it records both review legs' dispositions, the gate commands the implementer runs verbatim, and these seeds.

Use exactly one per session, from inside the worktree (`agent-worktree resume dynamic-token-list-2`).

**Recommended: `/goal`**

```
/goal Phases P1-P3 marked ✓ in implementations-plan/dynamic-token-list-2/plan.md, each backed by its gate passing in the transcript, with LESSONS_FILE=implementations-plan/dynamic-token-list-2/lessons/phase-N.md printed per phase; code_review is off, so /code-review was NOT run; the Codex loop (gpt-6.1-sol, high) converged over the net diff from 116974dc, a resumed pass reporting no new material findings quoted in the transcript; one PR against dev exists, opened only after that (gh pr view output), including the close-out that archived the plan (git show --stat of the archive move); bun run test:all and bun run lint exit 0. No agent dispatches publish-token-list.yml or signs anything; no warning UI ships.
```

**Alternative: `/loop`**

```
/loop 15m Drive implementations-plan/dynamic-token-list-2 forward; never idle. Each firing: (1) read plan.md and lessons/; if the plan path is gone and `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dynamic-token-list-2/plan.md` succeeds, run `agent-worktree done dynamic-token-list-2 --merged`, report, clear this loop, stop; if delivered and unmerged, babysit CI only. (2) Take the next step, run lint and the touched workspace's tests, commit. (3) Decisions go to Codex (run-codex.sh … high read-only gpt-6.1-sol); log them. (4) Phase green = its gate passes: mark ✓, print LESSONS_FILE, advance. (5) All ✓: the Codex loop, then Delivery and the close-out per plan.md, then gh pr checks --watch, then stop. Never dispatch the publish workflow, sign, merge or render a warning.
```
