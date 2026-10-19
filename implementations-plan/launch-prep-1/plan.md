---
plan: launch-prep-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at b6208221
trunk: dev
issues: "#864 (A1 and A2 Refs; it closes at the release); #372 #385 #684 #775 (closed known limits: dispositions below, posted by the orchestrator)"
post_implementation_hardening: not scheduled
---

# launch-prep-1: the 1.0.0 checklist's agent items that do not wait for Aztec 6.0.0

Two arcs, each one PR against `dev`, not stacked (the orchestrator's D-orch-1). **A1** corrects `BEFORE-LAUNCH.md` (the boxes the evidence meets, the owner's two page-62 store calls, two checks that cannot pass as written) and `legal/README.md`'s Mainnet line, and records the four known-limit dispositions; it opens ready. **A2** prepares Terms 1.1 (P62-06 A) and the README banner, with the close-out; a draft until the owner signs OA-1 and OA-2, merged before the 1.0.0 promote. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **#864, "tick the boxes already met (Chrome's staged publish, the AMO privacy field, the two rc.3 conditions)".** Holds for the Chrome publish, both AMO privacy boxes and rc.3 (a). **Not** rc.3 (b): no record of the owner's live-Testnet send (OA-3). **Added:** § 4's 1.1.1 box is met in full. § 3's listing URLs resolve today, but that box is a ship-day check and stays open (D3).
- **`BEFORE-LAUNCH.md` § 2's AMO flag** is still on (`is_experimental: true`, re-fetched after an explorer misread it).
- **`BEFORE-LAUNCH.md` § 3, "`nulo.sh/terms/v1.0/` shows no DRAFT banner and no `noindex`"** cannot pass: every permalink carries `noindex` (`apps/landing/scripts/legal-pages.ts:160-161`). **The intro's `git grep -n "«FILL" -- legal/`** will list the archived Terms' blanks once A2 lands.
- **`legal/README.md:77`, "mainnet is the seeded default"**: wrong. `DEFAULT_SEEDS` holds Testnet and the Local Network (`seeds.ts:49-68`); Terms § 5 already says Testnet is the default.
- **#684, "Development only… no production users"**: every build, store builds included, seeds and lists the Local Network.
- **P62-06 A's "declining blocks only sending"** leaves out that the token-list download waits for current Terms (`token-list/service.ts:129,151`).

## Dispositions (posted by the orchestrator; this lane comments on no issue)

Outsider builds older than the two fixes are AMO 0.28.0, 0.30.0, 0.30.1 and 0.30.2, Chrome 0.30.2 (staged) and nightlies 26280–26282. 0.31.0 moved Testnet's chain id and re-pinned the account artifact in place (`nulo-v6` → `nulo-v6.1`), so every address those builds derived moved. **On update**, the seeded Testnet row and every chain whose derived accounts all moved are quarantined, then purged by the in-place reset. Rows survive on a chain-0 or custom chain holding no derived account (imported-only or none: `classify.ts:36`); a Tx row shared with another profile is kept and marked `ambiguous` (`transaction/service.ts:350-360`); a profile never opened stays quarantined, unpurged. **On restore**, a full backup carries no network rows: the build's networks are re-seeded (`full-backup-restore.ts:307-330`), derived accounts, tokens and history on a chain it does not serve are refused or dropped (`token/service.ts:1022`), an imported account there is kept as held with its history dropped (`full-backup-restore.ts:402-426`), and chain-0 rows restore into the same classification ([recon.md](recon.md#what-the-reset-and-the-integrity-check-do-to-030x-rows)).

| Issue | Does 1.0.0 meet the condition? | What follows |
|---|---|---|
| #372 | **Narrowly.** Pre-#379 rows survive only on a clean chain-0 or custom chain; restore still writes `contract` verbatim (`token/service.ts:1015-1030`), so any backup can carry another spelling. | **Known limit, condition corrected.** Reopen on a report of a missing mint figure, or a new token-row writer that skips `parseTokenInterface`. Possible fix (sized, deferred): lower-case `contract` in token and balance restore together, one helper, two tests. The consequence fails closed on the importer's own history. |
| #385 | **Yes:** production users exist and both stores review a release. | **Known limit, condition corrected, pending OA-4.** A leaked seed alone delivers nothing: wallets fetch only `tokens.nulo.sh`, deployed by Workers Builds from `dev`. Delivery also needs landing on `dev` (the owner's account, or the release App's key: `dev` needs no approving review), the Cloudflare account, or the user's TLS. A key leaked through the signer's own code path may come with `dev` access. A forged list seeds up to 16 tokens per chain per list, flags genuine ones, and its rows outlive the rotation (#387). Reopen on a suspected leak, a list gaining a power beyond seeding, naming, pricing and flagging, or a list served from a path the signing job can write. Possible fix: a recovery-signed revocation that outranks the sequence (format field, held-list rule, keyed run): a plan change, not built. |
| #684 | **In letter:** users exist. Moot: the fix's optional field is the additive change #865's guard accepts. | **Known limit, premise and condition corrected.** Production builds seed the Local Network; a store-installed developer meets the limit after a sandbox restart. A row saved by an earlier build may keep a non-loopback primary until it is edited (the issue's own caveat). Remedy: delete the network in Settings → Networks (purges chain 0), then add `localhost:8080` under Developer Mode (stored as `custom`). Reopen if chain 0 serves anything but a development L1 sandbox, the product promises isolation between sandbox deployments, or a developer reports the remedy fails. |
| #775 | **In letter** (0.30.x reached AMO); **narrowly in substance**: surviving rows are an imported account's on a clean chain, or `ambiguous` shared rows. | **Known limit, condition corrected.** Reopen on a person's report, or on a 0.30.x row read outside those cases. tx-record-1's `feeChoice` (#821) leaves these rows as they read today. |

## Outcome & Quality Bar

- **For whom:** the owner at the 1.0.0 promote, reading `BEFORE-LAUNCH.md`; a person who accepted the draft Terms and opens the wallet after the update.
- **Excellent:** (1) every ticked box cites evidence a reader can re-fetch, and every check left open can pass; (2) a person who accepted 1.0 sees the sheet once, listing only 1.1's changes, and a fresh install never sees it; (3) at the promote the owner fills one date in three places (`legal/terms.md` twice, `manifest.ts` once) and `launch-legal` passes.
- **Good enough:** the dispositions change no code; the archived 1.0 Terms keep their draft banner.

## UI impact

- **A1:** none. Repository documents only.
- **A2 · the re-acceptance sheet** (popup, an install that accepted 1.0): appears once, listing 1.1's `changes` (OA-1 a). P62-06 A, quoted from #864: "Ask once more at 1.0.0: they accepted a page marked not in effect." The words wait for OA-1.
- **A2 · "v1.0" reads "v1.1"** wherever the version shows: the sheet's label and consent line, the hint after ticking in onboarding and the sheet (`LegalConsent.vue:31-32`), the declined page's "Terms v1.1 not accepted" (`legal/declined.vue:36`), Settings → About. Implied by P62-06 A.
- **A2 · `nulo.sh/terms`, `/terms/v1.0/`:** the history table gains 1.1; the 1.0 row and version-list entry read as OA-1 b says.
- **A2 · `README.md`'s banner:** the copy the owner signs (OA-2).

## Architecture & Implementation

- **A1.** `BEFORE-LAUNCH.md`: tick § 2 Chrome publish, § 4 privacy 1.1.1 and 1.2.1, § 4 rc.3 (a), each with its evidence and date; note the dated listing fetches under § 3's box without ticking it. Rewrite § 2's visibility sentence and AMO box as the P62 calls, each a § 3 owner step (Chrome Public once the security work in flight lands; the AMO flag removed). § 3's permalink box: `nulo.sh/terms` shows no DRAFT banner and no `noindex`; the current version's permalink shows no DRAFT banner; both checked before the Release PR merges. The intro's grep names `legal/terms.md legal/privacy.md`. `legal/README.md:76-77`: "It must not promise a network the build does not seed: 1.0.0 seeds Testnet, and Mainnet arrives in a later 1.x (#80, #875)."
- **A2 · Terms 1.1.** `git cp legal/terms.md legal/archive/terms-1.0.md` (byte-exact; its header parses to `{1.0, null}`, the manifest entry). `legal/terms.md`: version line `1.1 — effective «FILL: effective date»`; history rows `| 1.0 | <OA-1 b> | … |` (no `«FILL`: 1.0 never takes effect, and `launch-legal` refuses any `«FILL` line) and `| 1.1 | «FILL: effective date» | <summary> |`. `packages/legal/src/manifest.ts`: append `{ version: "1.1", effective: null, material: true, changes: <OA-1 a> }`. `apps/landing/scripts/legal-pages.ts` `versionList`: an undated entry other than the head reads OA-1 b's words. `BEFORE-LAUNCH.md` § 3 and `legal/README.md` § Placeholders name 1.1; `legal/README.md`'s banner bullet goes.
- **A2 · tests.** `packages/legal/src/status.test.ts`: a record at an intermediate material version pends only the later ones (today's cases test 0.9 and the head). `apps/extension/src/components/LegalAcceptanceSheet.test.ts`: a record at the manifest's first version lists only the later material versions' changes (its 0.9 case cannot tell pending from all). `apps/landing/scripts/legal-pages.test.ts`: an undated superseded entry reads OA-1 b, an undated head still reads "not yet effective".
- **A2 · README.** `README.md:3-13` replaced by OA-2's signed text; § 3's banner box ticked.
- **Not taken.** A Terms text edit beyond the version line: nothing in the text says "draft". Dropping 1.0 from the manifest: 1.0 acceptances would name a version with no permalink. Re-seeding S7 at 1.0 (Codex r1): the component case proves the same at a cheaper layer, and S7's 0.9 seed keeps proving accumulation end to end.

## Decision ledger

| # | Question | Decision |
|---|---|---|
| D1 | Arcs | A1 = docs and dispositions, ready; A2 = Terms 1.1, banner, close-out, draft; if OA-2 is unsigned when OA-1 is, the banner moves to A3 so the Terms do not wait |
| D2 | #372, #684, #775 | known limits, conditions corrected; no owner ask: nothing a person sees changes and no product choice is open (Codex r1 asked for owner dispositions; rejected on the lane brief's rule) |
| D3 | § 3's listing-URL box | open; today's fetches noted under it (Codex r1; reverses the draft's tick) |
| D4 | rc.3 (b) | unticked; OA-3 |
| D5 | #385 | known limit pending OA-4; the plan records a recommendation, not the owner's acceptance (Codex r1) |
| D6 | 1.0's history row and version-list entry | literal words (OA-1 b, with § 20's consequence); the archived page keeps both banners. Phases and gates implement OA-1 b's A; its B amends them first (OA-1) |
| D7 | A2's tests | the unit, component and landing cases above; no new e2e |
| D8 | Nightlies between A2 and the promote | accepted residue, stated in OA-1; A2 merges right before the promote; no runtime gate (Codex r2) |

## Security & Adversarial Considerations

- **Threat model.** A wrong tick lets a launch step slip: each tick cites a public fetch or a merged PR. #385 names the attacker's capabilities (the signing key plus a delivery path) and the boundary (the default-token list); exploitability beyond the traced paths is unknown.
- **Consent.** Declining 1.1 gates broadcasting, dApp requests and the token-list download; view, export and import stay open (CLAUDE.md § Terms acceptance, S5/S6/S8). The consent control starts unchecked. Between A2's merge and the promote, a nightly asks for 1.1 while the production landing, built from `main`, serves its home page for `/terms/v1.1/`: a tester can record 1.1 without reaching its text, and counts as current at 1.0.0. Store builds are ordered: the promote's push to `main` deploys the landing before the Release PR's merge uploads 1.0.0, and § 3's permalink check runs before that merge. A2 merges right before the promote to keep the nightly window short (D8, OA-1).
- **Cross-lane.** For a person who declines 1.1 after a Testnet reset, default tokens come only from the list held before the update: the 6.0.0 lane should publish the new chain's list before the store release.
- **Input validation, crypto, least privilege, supply chain.** No new input, key, dependency or permission.

## Assumptions

**Facts:** F1 the Chrome page serves 0.31.0, updated 2026-10-18; AMO `is_experimental: true`. F2 `nulo.sh/privacy` and AMO carry privacy 1.2.1, no banner. F3 #485–#487 and #494 merged before the 0.31.0 upload. F4 #431 moved Testnet's chain id and every derived address (`address-freeze.ts:109,132`). F5 update and restore treat 0.30.x rows as § Dispositions says. F6 `launchBlanks` scans only `LAUNCH_DOCUMENTS` (`launch.ts:7,16-23`). F7 a 1.0 record against a material 1.1 is stale and pends `[1.1]` (`status.ts:126-144`). F8 `packages/legal/src/**` is in the smoke path filter (`pr-extension-smoke-e2e.yml:71`).

**Inferences:** I1 the Chrome item is published: the store page serves 0.31.0; visibility is not shown.

**Asks:** OA-1, OA-2 (A2 waits); OA-3, OA-4 (A1 ships without them).

## Phases

### Arc A1 (branch `launch-prep-1-a1`, from this plan's commit on `origin/dev`)

**Phase 1 — the checklist and the Mainnet line.** ✓ 2026-10-19: every fetch re-matched; gate green. Files: `BEFORE-LAUNCH.md`, `legal/README.md`. Re-fetch each URL in [recon.md](recon.md) first; tick a box only if the fetch still matches. Gate: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:ci-gating` exit 0; `bun run check:plans` exit 0 after staging; `git grep -n "seeded default" -- legal/` prints nothing.

### Arc A2 (branch `launch-prep-1-a2`, off `dev` after A1 merges; merged before the 1.0.0 promote)

**Phase 0 — OA-1's pictures (in the planning session, after the audit; scratch only).** ✓ 2026-10-19: both tests green, the sheet listed exactly 1.1's two lines, four shots (OA-1). Apply Phase 2's manifest and terms edits uncommitted with OA-1's recommended words; build the armed smoke build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`). Copy `~/.cache/nulo-backlog/launch-prep-1/lp1-terms-picture.test.ts` into `apps/extension/tests/e2e/` only while it runs (`NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_SHOT_DIR=<dir> bun run test:e2e -- tests/e2e/lp1-terms-picture.test.ts --retry=0`): a 1.0 acceptance's sheet at 400×600 and the onboarding gate, both themes. Revert. Gate: the shots exist; the sheet lists exactly 1.1's changes; `git status` is clean.

**Phase 2 — Terms 1.1.** Files and tests as above. Gate: `bun run --cwd packages/legal test`, `bun run --cwd apps/landing test`, `bun run test` exit 0; `bun run --cwd apps/landing build`, then `dist/terms/v1.0/index.html` carries both banners and `dist/terms.html` reads 1.1; `git grep -n "«FILL" -- legal/terms.md` prints the version line and the 1.1 row only; the armed build, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/legal-acceptance.test.ts --retry=0` green; lint, `typecheck:all` exit 0.

**Phase 3 — README banner and close-out.** `README.md` per OA-2; the close-out per Post-implementation. Gate: lint, `test:ci-gating`, `check:plans` after staging exit 0.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `b6208221`; step 1 absent (`code_review: off`). Per arc, after its last phase: the Codex loop over the arc's diff against its base (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`), the two verbatim rules in every prompt, A1's naming A2 ("A2 bumps the Terms to 1.1 and rewrites the README banner"), hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1; each round in `lessons/phase-N.md` and § Audit verdicts. A2's loop is the cross-arc pass. The close-out rides the last arc: merge `origin/dev` first; Outcome (`Known limits: none` filed; the four dispositions as lines); lessons pass; `STATUS.md` deleted; `git mv` to `archive/` in its own commit. Teardown once `implementations-plan/archive/launch-prep-1/plan.md` is on `origin/dev`: `agent-worktree done launch-prep-1 --merged`.

## Delivery

| Arc | Phases | Base | PR title (≤ 93) | Issues |
|---|---|---|---|---|
| A1 | 1 | `origin/dev` + this plan's commit | `docs(launch): tick the launch boxes the stores meet; 1.0.0 seeds no mainnet` (75) | Refs #864 |
| A2 | 0, 2, 3 + close-out | `origin/dev` after A1 merges | `docs(legal): terms 1.1 take effect at 1.0.0; a production readme banner` (73) | Refs #864 |

No `Closes`: #864 closes at the release (lane brief); the four known limits stay closed. A1 opens ready, A2 as a draft, without labels (`packages/legal/src/**` trips the smoke filter). A2's body quotes P62-06 A, the signed OA-1 and OA-2 text, and the pictures. No e2e scenario is added. Parallelism: none.

**Overlaps.** migration-rule-1 (#865) lists README's banner: A2 replaces the whole banner with the signed copy, whose storage line states #865's rule; if #865 lands first, A2 keeps the signed copy. Its 0.31.0 → 1.0.0 update test meets the Terms sheet once A2 lands. mainnet-arrival-1 (#875) tests that the sheet never stacks with its flow. harden-security-fixes-3 edits `SECURITY.md` § Token list signing (#661); this lane edits no `SECURITY.md` line.

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, session `01a155f3`): **reject**. Accepted: update and restore described apart, with every survivor (shared `ambiguous` rows, clean chains) and "only a hand-edited backup" dropped; a test that tells pending from all (at the component layer, not S7); § 3's `noindex` box corrected; #385's capability not always independent; § 3's listing box left open with today's evidence; #684's legacy non-loopback caveat; OA-4 a recommendation, not an acceptance. Rejected: owner dispositions for #372, #684 and #775 (D2).
- **Opus 5.5 r1** (Plan): **conditional approve**. Accepted: OA-1 a's § 7.5 line is false for 0.31.0 acceptors (reworded, dated); declining also stops the token-list download (Consent, cross-lane); the armed build and the landing build in the gates; three places for the date, and the A2/A3 split if OA-2 is late; the nightly residue; corrected cites and UI lines; 0.28.0 and 0.30.0 named; I2 replaced by the restore mechanism; #385 wording; the intro's grep scope; the README banner bullet; § 20's consequence in OA-1 b. Not taken: listing `terms/v1.1/index.html` in `pr-quick.yml` (the landing build already throws on a missing archive copy).
- **Codex r2** (resumed `01a155f3`): **conditional approve** (a nightly can record 1.1 before `/terms/v1.1/` is live; OA-1 b's B contradicts the byte-exact archive and the two-banner gate; restore keeps an imported off-seed account as held). Accepted all three: D8 and the store ordering; B's amendment written into OA-1; the restore sentence corrected. Confirmed the component-plus-status tests and D2.
- **Codex r3** (resumed `01a155f3`): **approve**, no new material finding.

## Seeds

- `/goal` Phase 1 marked ✓ in implementations-plan/launch-prep-1/plan.md with its gate's output in the transcript; A1's Codex loop converged (a resumed pass with no new material finding quoted); PR `docs(launch): tick the launch boxes the stores meet; 1.0.0 seeds no mainnet` open against `dev`; `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/launch-prep-1 arc A1: read plan.md and lessons/, run Phase 1 and its gate, tick it, run the Codex loop, open the PR; never merge.
