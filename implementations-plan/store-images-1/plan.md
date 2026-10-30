---
plan: store-images-1
tier: light (the orchestrator's spawn: one Codex audit round-trip and the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 9fba3c295
trunk: dev
status: approved
issues: "#1376 (filed in 1.0; dedupe: #364 and #627 closed, none open)"
post_implementation_hardening: not scheduled
---

## Goal

Re-render the store listing's eleven images from the current build: the five popup captures (`E/store/captures/*.png`), the five framed screenshots (`E/store/screenshot-{1..5}-1280x800.png`) and the promo tile (`E/store/promo-440x280.png`). `E` is `apps/extension`. Generated PNGs and, only if the staging no longer holds, the capture spec. No product file, prose, frame copy or template changes. One arc, one PR. Recon with its search trails: [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** a person who meets Nulo on the Chrome Web Store or Firefox Add-ons, and the owner, who uploads the set by hand.
- **Excellent:** (1) every frame is the real current UI with honest staging, and no frame shows a node URL, a recovery word, Manage networks, or a clipped chip; (2) the PR shows each frame before and after, so the owner can sign the set without running anything.
- **Good enough:** byte-identical re-runs are not required where the staging is random by design (D2); the report names each such difference and its cause.

## Assumptions

**Facts**
- F1. The captures and frames date from #801 (2026-10-19, `fba0360e6`); the tile's template is unchanged since the starting commit (`git log -- E/store/templates/tile.html`), and #801 rendered it byte-identical.
- F2. Four of the five captures show the header (Home, Send, History, Lock settings); each shows the text chip "LOCK" (looked at with Read). Since #1369 the Lock chip is a padlock alone and the network chip has 8 px sides and a 6 px gap at 359 px and wider (`9fba3c295` body).
- F3. Three changes the lane brief names show in no frame: #945 squared the logs and JSON windows, popovers, focus rings and a banner button (`f73ce69d6` body); #986's rules sit under `@media (width < 359px)` and the captures are 360 px wide (`b88c20a39` body); #1334 is on Manage networks, which no frame shows. The issue says so.
- F4. The captured account changes on every run: `setupPreFundedAccount` draws random entropy for the phrase (`E/tests/e2e/fixtures/aztec.ts:576-578`), and the header shows the address (`0x17e8…ea6c` at `78b4b7541`, `0x0fda…3f4f` at `fba0360e6`). Tx hashes and History's day header (the capture date) also vary.
- F5. `e2e:agent` exists only in the root `package.json` (`bash apps/extension/scripts/e2e/agent.sh`, which `cd`s into `E` and passes the file to vitest); the lane brief's "from `apps/extension`" does not hold. The e2e README's command is `STORE_CAPTURES=1 NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/store-captures.test.ts` from the root.
- F6. The spec's test sets `retry: 0` itself (`store-captures.test.ts`, the `test(...)` options), so the network config's `e2eRetry(2)` does not apply to it.
- F7. `store-art.ts` renders from the captures and templates with embedded fonts; its `FRAMES` copy is the owner's and does not change.
- F8. Since #1117 the default network is the Mainnet seed, named "Alpha" since #1369; "Testnet" and "Local Network" are still seeded (`E/src/wallet/services/network/seeds.ts:42-69`). An import lands on Alpha, the spec switches to Local Network, and its rename order respects name uniqueness (recon.md).
- F9. A probe run at the base (recon.md § The probe run) staged every frame: exit 0 in 160 s, five captures, five changed frames, the tile byte-identical. Every frame passed the 1.2 checks by eye.
- F10. The permission window shows the dApp's full origin since #806 (2026-10-19, after #801's capture): the approve frame reads `http://localhost:<port>`, the port drawn per run (`E/scripts/e2e/resolve-ports.ts:159`). Its account row reads "SANDBOX" (`getChainName(0)`), as in the set the owner signed for #801.

**Inferences**
- I1. Once settled, a proverless build shows the five screens as a prover-ON build does. It differs in two ways: no proofs, and faster wallet clocks (`VITE_NULO_E2E_WALLET_CLOCKS=1`, `E/scripts/e2e/agent.sh:105-123`: the incoming scan and the finality re-read every 10 s). Both change timing only. The spec waits for the fresh balances, both receipts and the confirmed send, and `settle()` waits until no skeleton, spinner, stale or refreshing mark shows. #801's signed set was proverless.
- I2. The store-art frames and the tile are deterministic for fixed captures (embedded fonts, fixed viewport, no clock): two `store-art.ts` runs over the same captures give byte-identical PNGs. Phase 1.3 checks it.

**Asks**
- OA-1 ([OWNER-ASKS.md](OWNER-ASKS.md)): the owner signs the final set. It blocks the merge, not the arc (D5).

## Architecture & Implementation

- **Reuse:** the opt-in spec and `store-art.ts` as they are (recon.md, Reuse map). Nothing new is built.
- **Flow:** `stageChain` (script side) → `stageWallet` through the UI → receipts and a send → five captures at 360×600, 2× → `store-art.ts` frames them and renders the tile.
- **Spec fix, only on a failed staging:** the smallest edit that makes the staging match the header comment again (a selector, a name, a wait). A change to what a frame shows beyond the landed changes stops in the report (lane brief).
- **Alternative not taken:** make the captures deterministic (a fixed phrase, a fixed clock). It would stabilise only the address; tx hashes and note randomness still move (F4). Rejected (D2).

## Decision ledger

- D1. One arc, one PR; a spec fix, if any, lands in its own commit before the PNG commit (lane brief).
- D2. No determinism work. The second run's per-file comparison is reported: which captures differ and which run-specific value causes it (address, hashes, capture date). Byte identity is required only of `store-art.ts` re-rendering the same captures (I2).
- D3. Proverless run, the documented command (F5, I1).
- D4. No new assertion for the chip fit. `appearance.test.ts:194-212` pins "Alpha" whole at 360 px; "TESTNET" (53.1 px of text in an 83.1 px chip, #1369's measure) is checked by eye on the 2× capture in 1.2. An assertion here would copy that inline check into an opt-in spec for one screen.
- D5. Sign-off is OA-1 in [OWNER-ASKS.md](OWNER-ASKS.md): the owner signs the final set at merge, by the PR's before/after table and the six SHA-256 sums it lists. Earlier PRs' sign-offs cover the changes inside the frames, not this public set (CLAUDE.md § UI changes, as Codex argued). The arc does not depend on the answer: the owner can sign only a set that exists, so the arc captures, reviews and opens the PR, and merge waits for the owner's words, quoted in the PR.
- D6. The issue keeps the lane brief's title, `store: the listing images predate the chip, corner and network-switch changes`: it is true as dated (the images are older than all three). Its body says that #945, #986 and #1334 show in no frame (F3).
- D8. Superseded by D10. First shipped as produced: `http://localhost:<port>`, #806's full-origin display over the run's own port. A fixed port is refused by run isolation. "SANDBOX" is unchanged from the signed set.
- D10. Frame 3's origin line reads `https://playground.nulo.sh`. The owner, on #1377: "I don't like the "localhost:27493" is there a way we can have "playground" there or something? Even if we edit manually the html before the photo." Then: ""https://playground.nulo.sh" looks good, thanks". The spec writes that origin over the `capabilities-hostname` line just before the approve capture, as it already stages the network name and the quote. It first checks that the line names the run's own playground origin, and after the capture that the staged text held. No testid or product file changed. Nothing else in the window changes; the name line stays `nulo-playground`. From here, 1.2's check for frame 3 is that its origin line reads exactly `https://playground.nulo.sh`.
- D9. Gates: the lane brief's list, plus `test:all` (the common gate). Smoke e2e is left out: it drives the popup, which this arc does not change, and cannot see a store PNG.
- D7. Out of scope, unchanged: `E/store/listing.md` (its reviewer note is #1370, the owner's), the frame copy, the templates' design (the frame's rounded device outline included), icons, a Firefox capture.

## Phases and gates

### 1.0 File the issue ✓
- Dedupe: `gh issue list --state all --search "store images"` and `--search "store captures"` (done at planning: #364, #627 closed; none open). File the issue with the five sections and the `ux` label. Write its number into this plan's front matter.

### 1.1 Capture ✓
- Run from the worktree root: `STORE_CAPTURES=1 NULO_E2E_PROVERLESS=1 NULO_E2E_BROWSER=chrome NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/store-captures.test.ts`, polled to its end. The planning probe (F9) is this run if the base and this command are unchanged at approval.
- On a red, read the cause. A stale selector or name: fix the spec (D1) and rerun. A host stall: one rerun after load falls (common brief).
- Gate: exit 0; the log prints five `[store-captures] wrote store/captures/<name>.png` lines and every `scrollToFit` result is `{"scrolled":<n>}`.

### 1.2 Frame and look ✓
- Run `cd apps/extension && bun scripts/store-art.ts`.
- Look at all eleven PNGs with Read. For each: it is its intended screen, never an import, reveal or phrase screen; no URL, host or path but the playground's own origin on the approve frame, whose port must be the run's playground port, not its node port (`[resolve-ports]` line of the log); no password or key; no Manage networks page; no clipped or cut text in the header chips; Home's header reads "TESTNET" with its dot whole; the Lock chip is a padlock alone. History's day header is the capture date, not a launch date.
- Compare each with its committed copy (`git show 9fba3c295:<path>`) and note what changed per frame for the PR body.
- A frame that shows more than the landed changes imply (a new cut line, a missing row): stop, keep the PNGs uncommitted, and report it as an owner ask.
- Gate: all eleven pass the checks above, recorded per file in `lessons/phase-1.md`.

### 1.3 Reproducibility ✓
- Copy the eleven PNGs that 1.2 looked at to a scratch directory outside the repository, with their SHA-256 sums.
- Run 1.1's command a second time. Compare each capture's SHA-256 with run 1's. All five are expected to differ (F4, F10): view each pair with Read and record the cause per file.
- Copy run 1's five captures back, then run `bun scripts/store-art.ts`. The six rendered PNGs must hash as run 1's did (I2); this also restores the reviewed set.
- Gate: the store-art hashes match; every capture difference is a run-specific value (the captured account's address, hash slices, date, port). Alice's address comes from the sandbox's fixed initial accounts (`E/tests/e2e/fixtures/aztec.ts:146`), so it must match across the two runs. Any other difference stops the arc and goes to the report.

### 1.4 Commit and fast gates ✓
- Gate: `bun run lint`, `bun run typecheck:all` and `bun run test:all` exit 0; `cd apps/extension && bun --bun vitest run scripts/store-listing.test.ts scripts/store-icons.test.ts --retry=0` green. The build `audit:vue` adds already ran inside each capture run. Smoke e2e is not run: no popup file changes, and the smoke suite cannot see the store PNGs (D9).
- Commit the changed PNGs in one commit: `chore(store): re-render the listing images from the current build`. Git records only the files that changed; the PR body names any that rendered identical (likely the tile).

## Security & Adversarial Considerations

- **Threat model:** the images are public. The risk is disclosure, not attack: a node URL (the local node's is `http://`), a recovery phrase, a password, a local path, or an account that is not a throwaway.
- **Disposable secrets:** each run creates a test phrase and its keys (`E/tests/e2e/fixtures/aztec.ts:576-583`) and imports them into an isolated sandbox wallet, with the e2e password. They are never committed, and no frame may show them. `stageChain` hands `words` to `importSeed`, which types them into the import page; nothing logs them (`grep -n words` over the fixture and the driver). The keys derive for the local chain only (`LOCAL_L1_CHAIN_ID`). The price host is refused, so no live quote leaves the run.
- **Checks:** phase 1.2's per-file look. No dependency, workflow or permission changes; the 7-day age gate and frozen lockfile are untouched.
- **Domain risks:** N/A for contracts and publishing; the upload is the owner's, by hand.

## UI impact

- **Store listings (both stores' graphic assets):** the five screenshots show the current header (padlock-only Lock chip, roomier network chip) and the other signed changes on the framed screens; the tile is unchanged or re-rendered identical. Before/after per frame in the PR. No popup surface changes.

## Delivery

- Single arc on `worktree-store-images-1` against `dev`; plain `gh pr create`, no stack. Opened as #1377. The plan's close-out is the PR's final commits, after the orchestrator's word.
- PR title: `chore(store): re-render the listing images from the current build` (64 characters). Body: per frame, the caption and a before/after pair (blob links at full SHAs, `?raw=true`); what changed and why; the gates with outcomes; the reproducibility result; `Closes #<1.0's issue>`; the owner's upload list (below). Opened without labels; the spec is opt-in, so no e2e label is needed (no lane covers it).
- Owner's upload list: Chrome Web Store → Store listing → Graphic assets: screenshots 1280×800 in order 1..5, small promo tile 440×280. AMO → Edit product page → Images: the same five screenshots. The images carry no launch date (History's day header is the capture date) and no network endpoint (frame 3 shows the playground's public origin, staged by the spec, D10).

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `9fba3c295`, with:
- Loop once over the arc's diff (single arc): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the diff (the spec diff, if any, and the list of changed PNGs with their before/after notes), this plan, the adversarial ask and the standard's two rules verbatim. Three rounds at most.
- `/code-review`: off.
- Close-out after the orchestrator's word: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; lessons; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans`.
- Teardown once the close-out merges: `agent-worktree done store-images-1 --merged --trunk dev`; a `/loop` checks each firing, a `/goal` arms one wait after its report.

## Review verdicts

Each finding was checked against the tree; detail in [lessons/phase-0.md](lessons/phase-0.md).

- **Codex, round 1** (gpt-6.1-sol, high): conditional approve; 5 findings, all accepted. The disclosure check names every URL, host and path, since the local node is `http://` (1.2); the security section says the run creates disposable secrets (§ Security); I1 names the faster wallet clocks; the set's sign-off is OA-1, blocking merge only (D5); `test:all` and an explicit `NULO_E2E_BROWSER=chrome` join the gates (D9, 1.1). On D6 it held the assigned title; the plan keeps it (D6). Looks fine: D2, D3, D4, D8, the 1.3 restore.
- **Opus Plan leg:** conditional approve; 6 findings, all accepted. Alice's address is fixed per Aztec version, so 1.3 expects it equal across runs (1.3, recon.md); § Asks lists OA-1; OA-1 names History's capture date and the TESTNET staging; "no recovery word" is undecidable (BIP-39 holds "account", "home", "lock") and becomes "no import, reveal or phrase screen" (1.2); the log claim cites the trace (§ Security); the approve port is checked against the node port (1.2). Looks fine: I1, I2 (the probe's hashes), D2-D4, D8, the 1.3 restore, no PNG metadata chunk.
- **Codex, final pass** (the same session, resumed): approve, no remaining material finding. It notes that the final PNG look, the reproducibility gate and OA-1 stay required.

### Arc 1 review

- **Codex round 1** (gpt-6.1-sol, high): conditional approve; 2 findings, both accepted. `test:all` ran at the head before 1.4 counts (exit 0); the 1.3 log gains its hashes, commands and run B's prefixes. It found only IHDR/IDAT/IEND chunks and the right sizes in all eleven PNGs.
- **Opus review** (general-purpose), beside round 1: conditional approve; 2 findings, both accepted. #1027's repainted icons show in every frame and join the per-frame list (recon.md, OA-1, the PR body); the same `test:all` gap.
- **Codex round 2** (resumed): approve, no remaining material finding; it re-checked the eleven hashes against HEAD.

### Owner round (frame 3's origin, D10)

- **Codex** (gpt-6.1-sol, high, a fresh session over `570e26e9d..HEAD`): approve, no correctness or security finding. Two comment findings, both accepted: the helper's comment restated its name and checks (deleted), and "as the window first shows it" no longer held once the origin line is staged (now "before any scroll"). It re-checked the pixel bands and the PNG chunks. On disclosure, it found the header comment's statement enough, plus one PR line saying the shown origin is staged.

## Seeds

```
/goal Every phase in implementations-plan/store-images-1/plan.md marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE printed per phase; the Codex loop converged (a resumed pass reporting no new material finding, quoted); the PR on GitHub, opened after the loop; `bun run lint` and `bun run typecheck:all` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/store-images-1 forward per its plan.md and the README's Post-implementation standard: reality check from plan.md and lessons/ (the archived path present on dev means merged: tear down and stop); next pending step; fast gates after each edit; Codex consult instead of waiting; five failures on one step: reassess with Codex; never merge.
```
