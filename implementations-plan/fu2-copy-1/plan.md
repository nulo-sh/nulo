---
plan: fu2-copy-1
tier: light
status: arc 1 merged (#1543); arcs 2 and 3 building on OA-2 B and OA-1 A (page 98)
issues: "#1505, #1506, #1510 (arc 1); #1509 (arc 2); #1507, #1508 (arc 3)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at 1e6c5bc1f (arc 1); 6509f2ff1 (arcs 2 and 3)
trunk: dev
post_implementation_hardening: not scheduled
---

# fu2-copy-1: grammar slips, Strict mode's line, the store note; the website row; the Glossary's new words

Three arcs. Arc 1 ships three signed picks whose words and layout need nothing more. Arc 2 (the website row) waits on OA-2, because the signed words cut the row's title at 360 px. Arc 3 (Glossary entries, dotted Proof) waits on OA-1, because nobody has signed a definition. Recon and measurements: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/` unless they name a package.

## The picks, checked (decision page 93, signed 2026-11-02)

| Item | Issue | Signed pick (quoted) | Checked | Arc |
|---|---|---|---|---|
| P93-13 | #1505 | B: "“1 token”, “Already exists” and “there are no assets”, with singular and plural handled wherever a count is shown." | Demonstrated: `holdings.vue:119` and `settings/connected-apps/index.vue:95` print a plural at 1; "Already exist" in nine components. The third slip (`reset.vue:323`) is rewritten by P93-40 C in fu2-security-1 (#1529; D3) | 1 |
| P93-23 | #1506 | B: "Strict mode's line says when: “Locks whenever Nulo restarts in the background, as well as after the timeout.”" | Holds (Fact 2) | 1 |
| P93-46 | #1510 | C: "The line stays, followed by “Not audited. See the Privacy Policy for what leaves your device.”" | Holds; the claim repeats in a store caption | 1 |
| P93-03 | #1509 | B: "The row still ticks Done on the click, but carries the outside-link mark and the word “website” beside “1 min”." | Holds (`general.vue:119-120`); on one line it cuts the title at 360 px (Fact 3) | 2 |
| P93-34 | #1507 | C: "B's new entries only, with no pointer from Home." B: "the Glossary gains profile, account, network, Mainnet, recovery phrase, full backup, passkey, FPC and strict mode." | No definition signed (Fact 4) | 3 |
| P93-52 | #1508 | C: "“Proof” becomes a dotted Glossary term on the existing line." | Needs a `proof` entry: `proving` cannot be dotted (Fact 5) | 3 |

## Outcome & Quality Bar

- **For whom:** a first-time user reading Holdings and Settings in a 360 px popup or Firefox's 240 px sidebar; a careful reader of the store page before install.
- **Excellent:** every count beside a noun reads right at 0, 1 and many, through one helper; every "Already exist" reads "Already exists", and no popup's check can drift from its message; the strict line tells the truth about when the wallet locks.
- **Good enough:** nothing else a person sees changes. Every migrated count site prints exactly what it printed before.

## Assumptions

**Facts** (verified at `1e6c5bc1f`; citations in recon)
1. The picks are quoted above. The lane brief: copy ships as the option says it; where an option leaves a detail open, the closest reading, stated here (R1-R4).
2. Strict mode on: `session-manager.ts:299` persists no restore bearer, and the restore gate (`:611`) closes a session without one, so every background restart locks. Expiry (`:594`) runs first in both modes.
3. Measured (smoke harness, Chrome): "1 min · website" on the row's right cuts "How Aztec works" to 101 of 110 px at 360 px; below 359 px the row stacks and nothing is cut.
4. `glossary.test.ts:4` pins every entry as the owner signed it, word for word; CLAUDE.md § Tooltips and the glossary makes a changed definition an owner sign-off.
5. `DottedTerm.scan.test.ts` refuses a dotted key whose definition is over one sentence or 100 characters; `proving`'s is two sentences, 123 characters.
6. The strict line has one source (`utils/settings-search.ts:216-217`); the store claim is `store/listing.md:31` and the caption `scripts/store-art.ts:37`; the dashboards are filled by hand from `listing.md` (BEFORE-LAUNCH.md § 2).
7. P93-40 C (fu2-security-1, #1529) makes `reset.vue:323` read "I have my recovery phrase or a full backup".
8. Vitest auto-imports only `vue` and `vue-router` (`vitest.config.ts:14`); the build auto-imports `src/utils/` and writes `src/types/` (`vite.config.ts:110-118`), which CI checks (`_build-extension.yml:113-121`).

**Inferences:** I1. The caption with two more sentences fits its column (`frame.html:67-74`: 500 px wide, no height cap); Phase 2 renders it.

**Asks:** OA-1 (arc 3), OA-2 (arc 2), both answered on decision page 98, signed 2026-11-02 (ledger below). Arc 1 depends on neither.

**Closest readings.** R1: every "Already exist" in the wallet reads "Already exists", not only the two screens photographed; the profile popup's other wordings ("Name in use") are not slips and stay. R2: the strict line replaces the whole description, "Recommended." included. R3: the listing's qualifier follows on the same bullet; the caption repeating the claim gets the same two sentences (the lane brief: "anywhere the same claim is repeated for the stores"). R4: "a count" is a number printed beside a noun; a heading with a bare number (`SectionLabel`) and phrase-level alternations are not.

## Decisions

- **D1. One plural helper.** `src/utils/plural.ts`: `pluralize(count: number, singular: string, plural: string): string` returns the noun; both forms are required, so an irregular noun cannot come out wrong. It fixes `holdings.vue:119` and `connected-apps/index.vue:95`, and replaces the 12 noun ternaries in recon plus `security/export/full.vue:254`'s noun (its pronoun stays). Output unchanged; number formatting stays at each site.
- **D2. One verdict constant.** `src/utils/entity-rules.ts` exports `ALREADY_EXISTS = "Already exists"` (#1449's proposed home). Every producer, comparison and display reads it, `EditProfilePopup.vue:159`'s unchanged-name warning included; `CONTACT_EXISTS` goes. #1449 keeps the reducers and limits.
- **D3.** `reset.vue:323` stays: P93-40 C replaces the sentence, and editing it here only makes a merge conflict. The PR says so and names #1529.
- **D4.** `settings-search.ts:217` reads the P93-23 line.
- **D5. Store.** `listing.md:31` → "• No account, no telemetry. Not audited. See the Privacy Policy for what leaves your device." `store-art.ts:37` gains the same two sentences; `(cd apps/extension && bun scripts/store-art.ts)` re-renders every frame, and only `store/screenshot-4-1280x800.png` is kept (`git checkout` the rest). If the caption leaves its column, the caption stays and goes to the owner. A BEFORE-LAUNCH.md § 4 step names the owner's dashboard paste (description, screenshot 4, both stores).
- **D6. Imports.** Callers import `pluralize` and `ALREADY_EXISTS` explicitly; the build's regenerated `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` are committed with them.
- **D7 (arc 2, OA-2 B).** `GetStartedCard.vue`'s aztec row: `description: "1 min · website"`, no value, and `external`, which draws the `open` glyph in the chevron's place. *Accessibility call (2026-10-19 delegation):* a click row's `RowTarget` is named by its title only (`SettingItem.vue:130`), so an `external` row with no `to` is named by its title, description and value, as the anchor form is named by its content; the spoken name then says "website".
- **D8 (arc 3, OA-1 A).** The ten entries as OA-1's table drafts them, both alternatives taken; a first section "Your wallet" (profile, account, network, alpha, recovery-phrase, full-backup, passkey, strict-mode); `fpc` last in Fees; `proof` first in Transactions. `<DottedTerm term="proof" testid="settings-proving-proof-term">Proofs</DottedTerm>` on `proving.vue:100`, the page's first dotted term.
- **D9. Tests.** T1 `src/utils/plural.test.ts`: 0, 1, 2. T2 `holdings.test.ts:185` reads "1 token"; `connected-apps/index.test.ts` gains "Disconnect all 1 session?" with a 2-session control. T3 each verdict test asserts the literal "Already exists". T4 `lock.test.ts:97`. T5 singular assertions at `AmountCard.test.ts` and `OperationCard.fallback.test.ts`, whose sites test only the plural today. T1-T4 red on the base copy; T5 green before and after. The other migrated sites' tests (`details-table.test.ts:106`, `permission-rows.test.ts:193`, …) pass unchanged. Arc 2: `GetStartedCard.test.ts` asserts the row's text, `open` glyph and resolved accessible name, the other rows' chevron as control. Arc 3: `glossary.test.ts`, `settings/glossary.test.ts:21` and `proving.test.ts` (the real `DottedTerm`). No new e2e scenario.

## Architecture & Implementation

| Arc | Files | Change |
|---|---|---|
| 1 | `src/utils/plural.ts` (+ test); `pages/holdings.vue`, `pages/settings/connected-apps/index.vue` (+ tests); the 13 noun sites in recon | D1, T1-T2, T5 |
| 1 | `src/utils/entity-rules.ts`, `utils/contact-rules.ts`; the nine verdict components and two network popups (+ tests) | D2, T3 |
| 1 | `utils/settings-search.ts`, `pages/settings/lock.test.ts` | D4, T4 |
| 1 | `store/listing.md`, `scripts/store-art.ts`, `store/screenshot-4-1280x800.png`, `BEFORE-LAUNCH.md` | D5 |
| 1 | `src/types/auto-imports.d.ts`, `src/types/.eslintrc-auto-import.json` | D6 |
| 2 | `GetStartedCard.vue`, `components/ui/Settings/SettingItem.vue` (+ tests) | D7 |
| 3 | `utils/glossary.ts`, `pages/settings/proving.vue` (+ tests) | D8 |

Simpler alternatives rejected: string edits at each site (the brief asks for one helper, and a verdict literal compared back breaks when one copy is reworded); a default plural (`${singular}s` gets "match" and "class" wrong).

## UI impact

- **Arc 1:** Holdings' count and the Disconnect all confirm at 1 (P93-13 B); "Already exists" in New and Edit account, Import account, New and Edit FPC, Import token, New sender, Edit profile, New and Edit contact (P93-13 B, R1); Settings › Lock's strict line (P93-23 B); the store listing and screenshot 4's caption (P93-46 C). The PR quotes each pick (page, item, date, option) with before/after captures (light, Chrome).
- **Arc 2:** Get started row 2. P93-03 B (page 93, signed 2026-11-02): "The row still ticks Done on the click, but carries the outside-link mark and the word “website” beside “1 min”." OA-2 B (page 98, signed 2026-11-02): "“1 min · website” moves under the title as the row's second line, drawn as row 1's “The 24 words that restore this wallet”; the mark takes the chevron's place. The title stays whole; the row is 16 px taller. The words are the pick's." Before/after at 360 px.
- **Arc 3:** Settings › Glossary and Settings › Proving. P93-34 C (page 93, signed 2026-11-02): "B's new entries only, with no pointer from Home." P93-52 C (page 93, signed 2026-11-02): "“Proof” becomes a dotted Glossary term on the existing line." OA-1 A (page 98, signed 2026-11-02): OA-1's ten entries word for word, both alternatives, "Alpha", "Your wallet" first, FPC last in Fees, Proof first in Transactions; the Proof tooltip one sentence of at most 100 characters. Before/after of the new section, the two moved entries and the Proof tooltip.

## Security & Adversarial Considerations

- Copy only: no permission, message, storage, log line, dependency or CSP changes. Vue interpolates every string as text; `pluralize` takes literals and numbers, never dApp text, even in the approval windows.
- The risk is a false claim: the strict line describes a security behaviour (Fact 2 proves it); OA-1 flags two signed definitions that over-promise recovery. The store note sends the reader to the policy. D2 removes the path where a reworded verdict silently stops a popup's warning.
- Known limits: none.

## Phase 1 (arc 1): reproduce, tests, fixes ✓

1. Write a capture spec under `~/.cache/nulo-backlog/fu2-copy-1/capture/`, copy it to `tests/e2e/zz-copy1.test.ts`, and run it on the base armed build (`~/.cache/nulo-backlog/fu2-copy-1/dist-base-chrome` via `EXTENSION_PATH`). Capture, light, Chrome, 360 px: Holdings with one token, Settings › Lock, New account and Import token with a taken name, each other verdict popup the smoke harness reaches, and Disconnect all with one session if it can seed one (else its component test is the evidence, said in the PR). Delete the spec.
2. Add T1-T5 with the base sources; require T1-T4 red. Commit.
3. Make D1, D2, D4 and D6; run `bun run --cwd apps/extension build:chrome` and commit `src/types/` with them. Require T1-T5 green. Commit.

**Gate:** `bun run lint`; `bun run typecheck:all`; `(cd apps/extension && bun --bun vitest run src --retry=0)`. Pass: all exit 0; T1-T4 red before, green after.

## Phase 2 (arc 1): store, captures, gates ✓

1. Make D5. Inspect the frame; require `git status --short apps/extension/store` to list only `listing.md` and screenshot 4. Commit.
2. Run the capture spec on the armed build again (`after`), copy the pictures to `screenshots/<surface>-{before,after}.png`, and delete the spec.

**Gate:** 1. `bun run audit:vue`; `bun run test:all`; `(cd apps/extension && bun --bun vitest run scripts/store-listing.test.ts --retry=0)`. 2. `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox`. 3. The full smoke suite (CLAUDE.md § Quality gates): `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`, then with `NULO_E2E_BROWSER=firefox`; record each wall-clock. 4. `bun run check:plans` after staging. Pass: every run green at retry 0 (a red reruns once on base first, per lessons); `git status` lists nothing untracked under `apps/extension/tests/`.

**Arc 1 as built** (`fu2-copy-1-a1`). Gate passed at the final code commit: `audit:vue`, `test:all`, `store-listing.test.ts`, both armed builds, `check:plans`; the full smoke suite at retry 0 as four parallel shards, each on its own copy of the build (setup sweeps every Chrome loading one path): Chrome 62 files green in 10.4 min, Firefox 66 in 15.75 min, on a host at load ~150.
- D5: screenshot 4's popup capture still showed strict mode's earlier line, so one run of the opt-in `store-captures` spec re-captured it and only `store/captures/security.png` is kept. Its sandbox address differs from screenshots 1-3 and 5; the PR says so (Codex: proportionate). `git status --short apps/extension/store` lists `listing.md`, screenshot 4 and that capture. The caption fits its column.
- T5's execute-window singular sits in `call-surface.test.ts` (`rawToggleLabel` is a pure export), not `OperationCard.fallback.test.ts`.
- Strict mode's row gains "secure" and "unlock" as search synonyms: the signed line names neither, and both searches found the row at the base. Synonyms are never shown.
- Holdings' and Import token's before pictures are the lab's own frames: on the base build the network harness read "Prices unavailable" with no seeded quote. Disconnect all at one session rests on its component test.
- `tests/e2e/helpers/profile-chaos/model.ts` cites `accounts/import.vue` by line number; the added import moved it one down.

## Phase 3 (arc 2, on OA-2) and Phase 4 (arc 3, on OA-1) ✓

Each makes its decision (D7, D8) with its tests, red on the base copy. **Gate:** Phase 1's commands, then Phase 2's whole gate (steps 1-4: `audit:vue`, the full smoke suite on Chrome and Firefox); before/after captures of the surface. `tests/e2e/security-backup.test.ts` (arc 2) and `tests/e2e/tooltips-glossary.test.ts tests/e2e/settings-proving.test.ts` (arc 3) serve as quick checks while working.

**Arcs 2 and 3 as built** (`fu2-copy-1-a2`). Tests red (`f66a497d6`, `245abc5af`), then green (`af24cd686`, `1897681e3`); Phase 1's commands green after each arc. Phase 2's whole gate ran once, on the final code head: both arcs land in one PR, so an intermediate head never lands alone.
- D7: the external click row's label is read at render, not in a `computed`, since `useSlots()` is not reactive (Opus r1). In Chrome its target is named "How Aztec works 1 min · website"; the row is 72 px and the title whole at 360 px.
- D8: a section's testid joins a multi-word title with a hyphen (`glossary-section-your-wallet`); the four existing testids are unchanged. `proving.test.ts`'s note assertion starts after "Proofs", since the term's hidden definition sits between; the new test pins the word, its key and its definition.
- Pictures: `screenshots/{get-started-360,glossary,proving}-{before,after}.png`, Get started taken once the funds have loaded (before that the card is greyed).

## Delivery

- **As run for arcs 2 and 3** (arc 1 merged as #1543): one branch `fu2-copy-1-a2` off `dev`, one PR `feat(glossary): ten first-path entries, proof dotted, how aztec works says website`, `Closes #1507, #1508, #1509`; arc 2's commits, then arc 3's, then the close-out as its last commits. This replaces the separate PRs and close-out layer below.
- Arc 1: branch `fu2-copy-1-a1` off this plan's commit; PR `fix(copy): plural helper, "already exists", strict mode's line and the store's audit note` (89 characters), `Closes #1505, #1506, #1510`. Arc 2: `fix(home): how aztec works says it opens a website` (50), `Closes #1509`. Arc 3: `feat(glossary): ten first-path entries, and proof dotted on the proving page` (76), `Closes #1507, #1508`. Arcs 2 and 3 are independent; each runs when its answer arrives, stacked on the tip (off `dev` if the arc below has merged). Close-out: docs-only top layer `fu2-copy-1-close-out`. `gh stack`; PRs ready, base `dev`, no label at creation.
- Body: what changed and why; D3 with #1529; each pick quoted; R1-R4; before/after pictures (`?raw=true` at the head SHA); the owner's dashboard step (D5); runs and outcomes; "no e2e scenario added or changed", with each browser's smoke wall-clock; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No lanes: arcs 2 and 3 wait on answers.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `1e6c5bc1f`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs per arc at its boundary over `git diff <arc base>...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1. After the last arc, one fresh Codex session over the net diff. Prompts under `~/.cache/nulo-backlog/fu2-copy-1/`. Hard stop at three rounds; each round in `lessons/phase-N.md` and the table below.
- Approval boundary (a plan change; stop): any word, row or layout beyond the quoted picks, R1-R4 and the owner's answers; D5's caption rule firing; a new e2e scenario.
- Close-out: the Outcome; an unanswered OA filed as an `owner-decision` issue; a comment on #1449 that the verdict part shipped; lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done fu2-copy-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/fu2-copy-1/plan.md`.

## Audit verdicts and decision ledger

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a19d40) | conditional approve | OA-1's factual caveats (profile, network, Mainnet, recovery phrase, full backup, FPC); D1's inventory (12 sites, `full.vue:254`); arc 3's `settings/glossary.test.ts` and the Proof testid; `audit:vue`, the full smoke suite and `store-listing.test.ts` in the gate; explicit imports plus regenerated `src/types/`; OA wording "a newly signed revision" | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | the same OA-1 corrections ("Alpha" is the word on screen); the website row's accessible name (D7); the stop rule at 360 px, then measured: it fires, so P93-03 became arc 2 behind OA-2; the owner's dashboard step; both plural forms required; singular assertions where only plurals are tested; the profile popup's "Already exist" is its unchanged-name state (R1 reworded); #1529 named | an owner ask on the profile popup's "Name in use" (not a slip; no change); an owner ask on the Get Fee Juice row (it is P93-04's own item on the same page) |
| final 1 | Codex, resumed (session 01a19d40) | conditional approve | arcs 2 and 3 run `audit:vue` and the full smoke suite on both browsers, the named files only as quick checks; arc 2's title is 50 characters | none |
| final 2 | Codex, resumed | **approve** | the condition verified; no regression | none |
| arc 1 r1 | Codex, gpt-6.1-sol (session 01a19d6f) | **approve** | no finding; the security capture's re-take judged in scope | none |
| arc 1 r1 | Opus 5.5 (general-purpose) | conditional approve | New sender's duplicate test; the constant's comment; "secure" and "unlock" as synonyms; the store address disclosed; the PR claims D2 only for "Already exists" | an owner ask on the synonyms (they restore the base results and are never shown; Codex agreed); re-rendering all five store images |
| arc 1 r2 | Codex, resumed | **approve** | the comment's wording | none |
| arcs 2-3 r1 | Codex, gpt-6.1-sol (session 01a19df8) | **approve** | no finding: all 30 new strings match OA-1; no existing `SettingItem` caller changes | none |
| arcs 2-3 r1 | Opus 5.5 (general-purpose) | **approve** | two nits: the comment's "never its title" (about.vue's "Nulo Website"); the slot read in a `computed` | none |
| arcs 2-3 r2 | Codex, resumed | **approve** | the nits' commit verified, no regression | none |
| net | Codex, fresh (session 01a19e0a), arc 1's squash `9cb340363` plus this branch | **approve** | the `SettingItem` label comment in two lines | comment nits on arc 1's merged files (settled there; the "Utils" import header is CLAUDE.md's SFC convention); strict mode's line held twice, in `settings-search.ts` and the Glossary, as two signed texts each pinned by its own test (no wrong output) |

**Owner answers** (decision page 98, signed 2026-11-02 at 19:39 UTC, no note): OA-2 = option B, "“1 min · website” moves under the title as the row's second line, drawn as row 1's “The 24 words that restore this wallet”; the mark takes the chevron's place. The title stays whole; the row is 16 px taller. The words are the pick's."; OA-1 = option A, the ten entries as drafted with both alternatives ("The 24 words that restore your accounts, except the ones you imported."; "Your accounts, imported keys, tokens, contacts and history, in one password-protected file."), the term "Alpha", "Your wallet" first with the eight wallet words in the table's order, FPC last in Fees, Proof first in Transactions. These are the sign-off for exactly those words.

Both legs kept OA-1 as an owner ask over "closest reading": a definition is the entry's whole content, not a detail the option left open.

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1 and 2 of implementations-plan/fu2-copy-1/plan.md marked ✓ with their gates passing in the transcript; the arc 1 Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1505, #1506 and #1510 with its pictures; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/fu2-copy-1 per its plan.md and the README § Post-implementation standard at 1e6c5bc1f: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open the arc's PR, never merge, never change copy beyond the quoted picks and the owner's answers; stop once its checks are green and report.
```
