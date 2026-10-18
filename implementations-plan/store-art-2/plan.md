---
plan: store-art-2
tier: light
status: closed with its delivery (a draft PR that merges on the owner's signature of the new set)
issues: "#627 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) with its resume; one Opus Plan leg
base: origin/dev at b53e1d4a
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-18.
- **Status:** delivered as one draft PR against `dev`, which carries this close-out. It merges only after the owner signs the old and new pairs; then the orchestrator quotes the record, checks the head's store blobs against the PR's hashes and marks it ready (§ Delivery). That merge closes the plan.
- **Shipped:** the five store captures and five framed screenshots regenerated at `b53e1d4a` (image commit `7081a393`), from one capture run (344 s, fits 58 and 46 px) and `store-art.ts`, with no hand edit; the promo tile rendered byte-identical and is unchanged. Closes #627, with its comments' #649 and #790.
- **Owner asks:** OA-1 (screenshot 3's cut row; C recommended) and OA-2 (screenshot 1's top row under the hero's fade; A recommended), both D4 (b). Both ship A until answered; a B or C answer means a spec change, a new run and new pairs before the signature.
- **Review loop:** the plan took Codex conditional then approve, and an Opus conditional approve. The arc: Codex approve twice, and an Opus review of every pair with six record fixes.
- **Gates at the head:** `bun run lint`, `typecheck:all`, `test:all` and `check:plans`, all exit 0; the capture run itself. No e2e scenario changed.
- **Deviations:** none from the procedure. D2 did not apply; D4 (b) applied twice.
- **Known limits:** none.
- **Open items:** none. OA-1 and OA-2 are answered before this PR merges; an answer that defers work becomes an issue then.
- **Lessons:** none promoted (`lessons.md` is at its 8 KiB budget). The agent-shell trap of the run, zsh reading `$B:a` as a path modifier, is in [lessons/phase-1.md](lessons/phase-1.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# store-art-2: the store pictures after Home's fixed hero

One arc, one draft PR against `dev`, no stack. It reruns the opt-in capture spec and `store-art.ts`, reviews every picture against its caption, and commits what they produce. It changes no product code. The owner signs the new set on the orchestrator's decision page; until then the PR stays a draft. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue claims that did not hold

- **The lane brief's "listing's captions" and "listing's procedure"**: `store/listing.md` holds neither. The captions are `scripts/store-art.ts:18-44`; the procedure is `tests/e2e/README.md:104-116` (recon). The plan uses those two.
- **The brief's run command** omits `NULO_E2E_PROVERLESS=1`, which the written procedure sets (D1).
- **#762 "changed what the store pictures show"**: no captured screen is the token page (recon). #627 itself, and its two comments folding in #649's type scale and #790's glyphs, hold.

## Outcome & Quality Bar

- **For whom:** a person who reads the Chrome Web Store or Firefox Add-ons listing to decide whether to install Nulo.
- **Excellent:** (1) each listing picture is the wallet as `dev` ships it at the recorded capture base, made only by the spec and `store-art.ts`, and each frame still shows what its caption says; (2) the owner judges every change from an old and new pair with its caption, and the bytes the owner signs are the bytes that merge.
- **Good enough:** Chrome only (the spec skips Firefox). Home without a Get started card is the owner's decided state for an imported profile, before and after onboarding-3 (#743's OA-16), so it is not a shortfall.

## Scope

**In:** `apps/extension/store/captures/{home,send,history,security,approve}.png`, `apps/extension/store/screenshot-{1..5}-1280x800.png`, the promo tile only if `store-art.ts` changes its bytes (D2), this plan directory, its index line.
**Out:** the listing text, the captions, the tile's design, any product change, shared e2e fixtures, Firefox pictures. A spec change only under D4.

## Architecture & Implementation

No code. The capture spec stages a sandbox wallet through the UI and writes five 720×1200 captures; `store-art.ts` frames each into a 1280×800 picture with its title and caption, and renders the promo tile. Reused as they are: `agent.sh` (ports, build, teardown), the spec, `store-art.ts`. Scratch `S` = `~/.cache/nulo-backlog/store-art-2`, outside the repo. The simpler alternative, regenerating with no review, fails criterion 1: a frame can drift from its caption.

## Security & Adversarial Considerations

No trust boundary, input, storage, permission or dependency moves. The pictures go public on two stores and into the `git archive` source zip that AMO reviewers rebuild, so phase 2 checks each one: no recovery phrase, password or local path; every address shown is the staged account, the contact (a sandbox account), a receipt sender or the USD Coin contract; no PNG chunk `tEXt`, `zTXt`, `iTXt` or `eXIf` (any other extra chunk is recorded and passes). The staged phrase is random sandbox entropy. `store-art.ts` runs as `bun --no-install` on the locked Puppeteer (25.8.0): Bun reads the root `bunfig.toml` (`auto = "disable"`) from its working directory only, so a run from `apps/extension` needs the flag to never fetch past the lockfile and the age gate. The PR body links images only at commit SHAs of `nulo-sh/nulo`. The signature binds bytes: the pairs come from the image commit `I`, the PR body lists `I` and the hashes, and nothing merges unless the head's store blobs match them.

## Assumptions

**Facts** (recon.md has the line references):
- F1. Every testid and helper the spec uses exists at `b53e1d4a`; the Fee Juice text still ends in ` FJ`.
- F2. `agent.sh` builds `dist/$NULO_E2E_BROWSER` (default `chrome`; proverless with the flag), claims its ports from `~/.agents/ports.md`, releases them on exit, and maps a failed sandbox boot to exit 86. The spec skips on Firefox and runs at retry 0 with a 40-minute timeout.
- F3. The captions (`store-art.ts:18-44`): home "A wallet for Aztec…", send "Before you send, Nulo shows exactly what stays hidden…", approve "…Nulo spells it out in plain words. You say yes or no.", security "Protected by your password or your passkey…", history "Every payment is labeled private or public…".
- F4. The last set is #573's (`78b4b754`, captured at `71f98db4`). Since then #633, #649, #655, #789, #790, #793 and others changed the five screens (recon table). No stable tag carries #633 yet (`git tag --contains eb5dc145` lists nightlies only).
- F5. The tile's tracked inputs (`tile.html`, two fonts, Puppeteer 25.8.0) are unchanged since `71f98db4`, and #573's run rendered it byte-identical. This proves the inputs, not the rendering.
- F6. Home at `b53e1d4a` has no Get started card; PR #743 holds it, open, and would show none for an imported profile.
- F7. The repository is public, so a raw image link at a commit SHA renders in a PR body.
F5 and F6 hold at the plan base; phase 1 step 2 checks them again when `B` moves.

**Inferences:**
- I1. The spec passes at the capture base with no change: #633 rewrote its Home fit and it ran green then (31 px), and on #743's branch. Phase 1's gate tests this.
- I2. The tile renders byte-identical again (F5). If not, D2 applies.
- I3. Home's fit may differ from 31 px; the spec computes it. Nothing in the fit keeps the Holdings row clear of the fixed hero, so phase 2 checks it.

**Asks:** none at planning beyond the set's signature, which the orchestrator's decision page carries. Phase 2 and its review raised OA-1 (screenshot 3's cut row) and OA-2 (screenshot 1's top row under the hero's fade), both D4 (b); the set ships as produced ([OWNER-ASKS.md](OWNER-ASKS.md)).

## UI impact

The store listing's pictures (both stores): the five framed screenshots, their five source captures, and the tile if D2 commits it. Budget: the lane brief's record, "the store listing's pictures; owner sign-off on the page or the PR". No popup surface changes.

## Arc 1 (#627)

### Phase 1: capture and frame ✓
1. Run `git fetch origin dev`. Record `B` = `git rev-parse origin/dev`.
2. If `B` equals this plan's base, run `git switch -c store-art-2-a1`. Otherwise run `git switch -c store-art-2-a1 origin/dev`, then cherry-pick the plan commit, and write `git log --oneline b53e1d4a..B -- apps/extension/src packages/design apps/extension/tests/e2e apps/extension/store apps/extension/scripts/store-art.ts` and F6's state (`gh pr view 743 --json state`) to `lessons/phase-1.md`.
3. Copy the 11 committed PNGs at `B` into `S/pairs/old/`, in the store's layout (`captures/*.png`, `*.png`), with `git show B:<path>`.
4. Wait until `cut -d' ' -f1 /proc/loadavg` is under 150. Poll in calls of at most 10 minutes; after 3 hours, stop and report the arc not started.
5. From the worktree root, start `{ STORE_CAPTURES=1 NULO_E2E_BROWSER=chrome NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/store-captures.test.ts; echo "exit=$?"; } > S/capture.log 2>&1` detached. Poll the log in calls of at most 10 minutes until it shows `exit=`.
6. If step 5 is red, skip steps 7-9, run `git restore apps/extension/store`, and follow D5.
7. From `apps/extension`, run `bun --no-install scripts/store-art.ts`.
8. If `git status` shows `promo-440x280.png` changed, follow D2.
9. Write the run's facts to `lessons/phase-1.md`: duration, both fits, the hashes.

**Validation gate.** Pass when all hold:
- The log ends in `exit=0` and shows `1 passed`, five `[store-captures] wrote` lines, and `{"scrolled":N}` for both fits.
- `store-art.ts` exits 0.
- `git status --short apps/extension/store` lists only modified PNGs: at most the five captures, the five screenshots and the tile.
- The IHDR sizes are 720×1200 (captures) and 1280×800 (screenshots).
Layers: e2e-live-network (the sandbox run).
Result: pass on the first run at `B` = `b53e1d4a` (344 s; fits 58 and 46 px; the tile byte-identical, so D2 did not apply). [lessons/phase-1.md](lessons/phase-1.md).

### Phase 2: review against the captions ✓
1. View each new picture beside its old one and its caption. Write one verdict per frame in `lessons/phase-2.md` ("pass" or "pending owner", D4), with what changed.
2. Check every frame: each glyph draws (no empty box, no icon name as text); no spinner, skeleton or toast; the header's network chip reads Testnet (the approve window's account card reads "SANDBOX", as in the signed set).
3. Check each frame. Home: the hero reads `$1,250.00` and `1,000 FJ` twice; the USD Coin row is whole below the hero's shadow, its private and public split readable; no activity row is cut by the nav. Send: the recipient card reads Alice; both type toggles read private; the amount line (≈ $120.00, the balance, MAX) sits clear of the footer; the footer's publish strip reads You, To and Amount hidden. Approve: the request names the app and the account; its grant sections and both buttons are whole. Security: the Lock page shows Lock now, Auto-lock and the strict mode line naming the password. History: every row's private or public chip is whole (a chip may drop under its title).
4. Run the Security section's checks on every PNG.
5. Commit the PNGs: `chore(store): regenerate the listing captures after the fixed home hero`. Record its SHA as `I`.
6. Fill `S/pairs/new/` from `git show I:<path>`, same layout. Write `sha256sum` of both sets to `S/pairs/SHA256SUMS`. A later capture run (D4, D5) replaces `I`, the pairs, the hashes and the review.

**Validation gate.** Pass when all hold:
- Every frame's verdict is "pass" or "pending owner", with its reason.
- `bun run lint`, `bun run typecheck:all`, `bun run test:all` and `bun run check:plans` (after staging) exit 0, each started with load1 under 150.
- `git diff --name-only B...HEAD` lists only the phase 1 PNGs, `implementations-plan/` files, and `store-captures.test.ts` if D4 fixed it.
Layers: lint, typecheck, unit, the plans gate.
Result: pass. Three frames pass; frames 1 and 3 are pending owner (OA-2, OA-1). `I` = `7081a393`. [lessons/phase-2.md](lessons/phase-2.md).

## Decision ledger

| # | Question | Chosen | Not taken, and why |
|---|---|---|---|
| D1 | Which build | proverless, as `tests/e2e/README.md:110-111` says: no frame shows a proof, and it costs the shared host far less CPU | the brief's unarmed command: real proving, same pixels |
| D2 | A tile that renders differently | view both, find the cause (inputs, or the Chrome in Puppeteer's cache), commit it as the eleventh pair and name the cause in the PR body: the same renderer drew the five frames, so a change is a signal the owner sees | restore it as noise (hides a renderer change); commit it unseen |
| D3 | The pairs | `S/pairs/{old,new}/` from `B` and `I` plus `SHA256SUMS`; the PR body links raw images at `B` and `I` and lists the hashes | committed composites or a compose script: one use, more to review |
| D4 | A frame that fails step 3 | verdict "pending owner", never "pass". (a) The spec misses its own stated frame (its comments): the panel agrees a fix inside `store-captures.test.ts` only, then phase 1 reruns from step 4. (b) The spec meets its frame but the frame reads poorly, or the cause is in a shared fixture or product code: an owner ask (and an issue for a defect), the set ships as produced, flagged in the PR | edit an image by hand (forbidden); pick other content without the owner; patch a shared fixture for an opt-in spec |
| D5 | A red capture run | read it. Rerun once only when the log names an environmental cause (exit 86, a port claim or sandbox boot error), after step 4 again. An assertion, timeout or race gets a diagnosis and a D4 (a) fix. Three failures on the step end the arc (`ARC_FAILED`) | a rerun on a hunch; a raised timeout or a retry (never) |
| D6 | When the close-out lands | the PR's final commits, while it is a draft (onboarding-3's #743 did the same) | after the signature: no session would be alive to write it |

## Delivery

Branch `store-art-2-a1` off `origin/dev`, carrying the plan commit. After the loop converges: `gh pr create --draft --base dev`, no label. Title (71): `chore(store): regenerate the listing captures after the fixed home hero`. Body: what changed and why; `B`, and the Home state (no Get started card, OA-16); a table of the five screenshots (and the tile under D2), old and new side by side under their titles and captions, linked at `B` and `I`; the five captures in a `<details>` block; the run's duration and fits; `I` and the hashes; each "pending owner" frame; the gates and their outcomes; "No e2e scenario changed" (or, after a D4 fix, the spec's runtime before and after; CI skips it without `STORE_CAPTURES`); "Upload with the first stable release that carries #633, #649 and #790"; `Closes #627`; the Claude Code line.

**After the signature (the orchestrator):** quote the page record into the PR body; check the head's store blobs against the listed hashes (`git show <head>:<path> | sha256sum`); then mark the PR ready. A PNG that changed after the signature voids it.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `b53e1d4a`:
- Step 1 is absent (`code_review: off`).
- Step 2: one loop over `B...HEAD` after phase 2's gate. `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh`; the prompt carries the run's facts, the verdicts and the hashes, since Codex reads no pixels. One Opus review (`general-purpose`) runs beside round 1 and views every pair against its caption. Log rounds in `lessons/phase-3.md`. Hard stop at three rounds.
- Step 3: the Delivery above, then `gh pr checks <n> --watch` once.
- Step 4: the close-out as the PR's final commits: merge `origin/dev` first; the Outcome (Status: delivered as a draft, merging on the owner's signature); `STATUS.md` deleted; the `git mv` into `archive/` in its own commit; the index line moved. Then `git diff I HEAD -- apps/extension/store` must print nothing.
- Step 5: after the merge, `agent-worktree done store-art-2 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a15077): conditional approve; all seven accepted. #1 `--no-install` (Security); #2 a changed tile is looked at, never dropped silently (D2); #3 F5 and F6 checked again on a new `B` (step 2); #4 "pending owner" apart from "pass", D4's bounds and the diff allowlist; #5 the signature bound to bytes (D3, Delivery, step 4); #6 a rerun needs a named environmental cause (D5); #7 `NULO_E2E_BROWSER=chrome`.
**Round 1, Opus Plan:** conditional approve; 15 of 16 accepted. #1-#2 the pairs from `I`, the orchestrator's after-signature step; #3 the Send check names the amount line and the strip in the footer (`send.vue:851-852`); #4 Home's Holdings row checked against the hero (I3); #5-#6 D4's third case and D2 flipped to commit a changed tile (Codex #2 asked only that it not be dropped silently, so both hold); #7 `exit=` logged; #8 a red run restores the tree; #9 the status gate scoped to the store; #10 the load bound; #11 the per-frame checklist; #12 Home's state is OA-16's; #13 the range log; #14 the upload line; #15 the address and chunk rules; #16 one lessons file per phase, title 71. Rejected: #5's both-browser runs for a fixture fix, since D4 keeps fixtures out of scope.
**Round 2, Codex** (resume): approve, no new material finding; agrees with D2's flip (a changed tile is shown as the eleventh pair).
**Arc 1, Codex** (gpt-6.1-sol, high, session 01a150a2; [lessons/phase-3.md](lessons/phase-3.md)): r1 approve, no new material finding (hashes, sizes, chunks, the log and OA-1's container verified). r2 (after the Opus fixes) approve, no new material finding. Converged.
**Arc 1, Opus review** (viewed every pair): conditional approve; six accepted, all records. #1 Home's top row sits in the hero's 12 px fade, so frame 1 is pending owner (OA-2); #2 the spec redraws the window at 360×600, it opens at 400×800; #3 OA-1 gains option C, an 11 px fit, now recommended; #4 #759's wording named; #5-#6 small changes and the SANDBOX label recorded.

## Seeds

Not run; the orchestrator drives the lane.

```
/goal Phases 1-2 of implementations-plan/store-art-2/plan.md marked ✓, each gate's output in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); draft PR against dev with "Closes #627" and the old/new table, opened after the loop; the close-out commits on it; `bun run lint` and `bun run test:all` exit 0.
```

```
/loop 15m Drive implementations-plan/store-art-2 forward: read plan.md and lessons/; run the next unticked step; gate it as written; at the end run the Codex loop, open the draft PR, write the close-out, watch checks once, report and stop. Never merge; never edit an image by hand.
```
