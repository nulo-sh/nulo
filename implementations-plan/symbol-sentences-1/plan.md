---
plan: symbol-sentences-1
tier: light (the lane brief's call; one Codex audit round-trip plus one Opus Plan lens)
status: closed (arc 1 delivered in one PR against dev, #958; the merge closes the plan)
issues: "#949 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens
base: origin/dev at 05313d5e6
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-20.
- **Status:** closed. One arc, one PR against `dev` from `symbol-sentences-1-a1` (#958); the merge that lands it closes the plan.
- **Shipped:** #949 by P75-01 D. `isBlank` in `utils/string.ts` is the predicate `dashIfBlank` already used; the eleven sentences read a noun for a blank symbol in page 75's words (the switch "Token / USD"), a blank pinned symbol in the Home-is-full list reads "—", amount slots and non-blank symbols unchanged. A case per sentence, each red on the base; 40 pictures in `screenshots/`.
- **Dispositions:** the plan was written on C and rewritten to D when the owner picked; OA-1 (the `""` split on the switch) is moot under D. Codex R1 (a restored transfer symbol longer than the display cap) fixed on the transaction page; not extended to the pinned list or the Allow sheet, whose stored symbols `cleanSymbol` caps on add and on restore (unsupported conditions). Page 75's "the list refuses a blank symbol" held only for `""`; nothing depends on it.
- **Known limits:** none new; #931 still covers glyphs that draw nothing.
- **Open items:** none.
- **Lessons:** none promoted: `lessons.md` holds 8152 of its 8192 bytes. The harness trap (a foreground call past 600 s is moved to the background, then stopped) is in `lessons/phase-2.md`, as in token-dash-2's phase 3.
- **Size:** about 165 lines against the light target of 150: the Outcome and five review rows.
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# symbol-sentences-1: a blank token symbol inside a sentence reads as words, not a gap

One arc, one PR against `dev`, no stack, `Closes #949`. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** a person who holds a token whose contract returned an empty symbol or a symbol of spaces, and who meets it on Send, on the token page, on a transaction page or on the Allow sheet.
- **Excellent:** each of the eleven sentences and the unit switch read in the owner's words: whole sentences, none that starts with a space, ends on "for" or holds "pin :", and a switch that reads "Token / USD". Every non-blank symbol, every amount slot and every test pin for a normal symbol reads as today.
- **Good enough:** glyphs that draw nothing but are not whitespace stay #931 (closed known limit); the transaction banner's second line ("This token not found in your token list") stays: the owner added no words.

## Decision (owner, quoted) and UI impact

- **P75-01, option D** (decision page 75, 2026-10-20, recorded on #949): "A noun everywhere, the unit switch included ("Token / USD")." No note: the eleven words proposed on the page's pictures stand as the owner's words. D is option C (a noun per sentence) with site 4, the unit switch, worded "Token / USD" instead of the dash. The options not picked were A (leave the gaps), B (the dash inside the sentences) and C (the dash on the switch). This is the sign-off for every line below.
- **UI impact**, "before → after" for a blank symbol (`""` or spaces). Non-blank symbols unchanged.
  1. Send clamp hint: "supports 6 decimals" → "Token supports 6 decimals".
  2. Send rate line, in both modes while the field is empty: "1 ≈ $1.00" → "1 token ≈ $1.00".
  3. Send switch hover text, USD mode: "Type in" → "Type in token".
  4. Send switch label: "/ USD" → "Token / USD" (`""` already reads so).
  5. Token page, no activity: "Send or receive to see activity here." → "Send or receive this token to see activity here."
  6. Token page, Home is full: "…to pin : USDC, EURC, GBPC" → "…to pin this token: USDC, EURC, GBPC".
  7. Transaction page banner title: "is missing" → "This token is missing" (also for a restored record whose symbol is not text).
  8. Allow sheet title: "Allow ?" → "Allow this token?"
  9. Allow sheet body: "You received **** from a contract…" → "You received a token from a contract you haven't seen before." (no bold).
  10. Allow snack: "Now showing receives for" → "Now showing receives for this token".
  11. Block snack: "Hiding receives from" → "Hiding receives from this token".
  - A blank pinned symbol in the Home-is-full list, an empty item (", EURC, GBPC") → "—, EURC, GBPC" (a label, page-72 rule; page 75 states it).
  - Unchanged: every amount slot (Send's balance corner and USD-mode derived amount, the tx page's hero), every non-blank sentence.

## Assumptions

**Facts** (verified at 05313d5e6; lines in recon.md):
1. `dashIfBlank`'s rule is `stripWireControl(s ?? "").trim() === ""` (`utils/string.ts:55`); no boolean blank helper exists in `utils/`, and no export named `isBlank` exists in the app or the auto-import list.
2. Sites 1, 3, 4 catch `""` with a fallback word; sites 2 and 8-11 catch only an absent symbol; sites 5-7 catch nothing. So `"   "` leaves a hole at all eleven and `""` at eight.
3. A stored symbol keeps its spaces, and the signed list's `isText` accepts a symbol of spaces (recon § Where the symbol comes from).
4. Both emit paths of the Allow sheet's event pass a stored token's string symbol (`pendingEvent(…, token, …)`, `incoming-transfer/service.ts:2794`), but the event type marks it optional (`spec.ts:314`) and the composable copies it unchecked; the `?? "Token"` fallback (`IncomingTrustPopup.vue:49`) stays, and it shows today in the sheet's closing frames after a purge or an identity switch resets the prompt to `{}` while `Popup.vue`'s leave transition keeps the content (`useIncomingTrustPrompts.ts:107-108,150-151`).
5. Today's pins: recon § Test pins. `IncomingTrustPopup.test.ts:73-75` mocks `@/utils/string` with `trimAddress` only, and its decision mocks resolve `undefined` (`:25-26`), which shows no snack; `tx/[id].test.ts:126` pins "is missing" and no test reads the banner for a normal symbol.
6. A new export from `src/utils/` regenerates `src/types/auto-imports.d.ts` and `src/types/.eslintrc-auto-import.json` on build, and CI's build job fails when either is stale; vitest needs explicit imports.
7. `copy-dash-ban.test.ts` reads literals only; no option adds a literal em dash inside a sentence.

**Claims checked.** #949's five places and the pictures lane's eleven sentences hold at this base, line for line. The pictures report left open whether the list refuses a symbol of spaces: it accepts one (Fact 3), so page 75's "a blank one reaches them only through a contract added by hand" holds for `""` only; nothing in this plan depends on it. The report's B line "one edit at `IncomingTrustPopup.vue:49` covers the title, the body and both snacks" holds.

**Inferences.** I1: "blank" is #932's rule (JS whitespace after the strip); glyphs that draw nothing stay #931. I2: under D a symbol of spaces and `""` read the same word at every site, so OA-1 (the `""` split C would have made on the switch) is moot.

**Asks.** None open: P75-01 is answered (D), and OA-1 is moot under D (OWNER-ASKS.md).

## Architecture & Implementation

- **D1, one predicate.** `utils/string.ts` exports `isBlank(s: string | null | undefined): boolean` (`stripWireControl(s ?? "").trim() === ""`), and `dashIfBlank = (s) => (isBlank(s) ? "—" : (s as string))`, same outputs as today. `isBlank` gets "Absent, or only whitespace once the wire sanitizer's strip has run."; `dashIfBlank` keeps its contract: "The empty-value \"—\" for a blank name, title or label; any other value exactly as given." *Rejected:* a fallback-taking helper (`orIfBlank(s, word)`): a second helper the brief rules out, and it cannot carry sites 7 and 9, whose sentences change shape, not only a word.
- **D2, words at each site.** Each component decides once and keeps its words in its template:
  - `AmountCard.vue`: `const symbolBlank = computed(() => isBlank(props.token?.symbol))`; site 1 `symbolBlank ? "Token" : token.symbol`; site 2 `symbolBlank.value ? "token" : props.token.symbol`; site 3 `symbolBlank ? 'token' : token.symbol`.
  - `RecentActivityView.vue:917`: `isBlank(token.symbol) ? "this token" : token.symbol`.
  - `tokens/[id].vue:159`: `isBlank(subject.symbol) ? "this token" : sanitizeWireString(subject.symbol, 32)`.
  - `tx/[id].vue`: `transferSymbol` becomes `missingTitle`: `"This token is missing"` when `isBlank(sym)`, else the template literal of today's title, where `sym` is today's `displaySymbol(...)`.
  - `IncomingTrustPopup.vue`: `tokenSymbol` unchanged (`sanitizeWireString(raw ?? "Token", 32)`); `symbolBlank` = `isBlank(tokenSymbol)`; `subject` = `symbolBlank ? "this token" : tokenSymbol`, used by the title and both snacks; the body keeps one sentence: `<strong v-if="!symbolBlank">{{ tokenSymbol }}</strong><template v-else>a token</template>`. An absent symbol reads "Token" as today (Fact 4).
- **D3, the switch label (site 4), P75-01 D:** `symbolBlank ? "Token" : token.symbol`, the word `""` already reads. (Under C it would have been `dashIfBlank(token?.symbol || "Token")`, keeping "Token" for `""`: OA-1, now moot.)
- **D4, the pinned list** (a label, the page-72 rule, as page 75 states): `symbolOf` maps to `dashIfBlank(sanitizeWireString(t.symbol, 32))`.
- **D5, accessibility** (the owner's 2026-10-19 delegation): the noun and the dash are plain text in the existing elements; no ARIA, focus or Tab change.
- **D6, tests.** Each sentence gets one case fed the wire-shaped blank `"   "` (the tx page also keeps its non-text case), red on the base. Text is read with `.text()`, `attributes("title")`, the confirm's `description` or the toast spy's `label` (the decision mock resolves `true`). Normal-symbol controls: the existing pins (the Allow body at `IncomingTrustPopup.test.ts:266`), plus new ones where none exists (the switch title, the Allow title, the tx banner "TST is missing"). The blank cases also assert that the amount slots keep the raw symbol (Send's balance corner, the tx hero), read with `element.textContent`, since VTU's `.text()` trims. No e2e scenario: each sentence is one template or script expression that a component test renders, and no e2e reads these sentences.

## Phase 1: the predicate, the sentences, the tests (#949) ✓

Assumptions: Facts 1-7; I1, I2. Words: page 75's, which the owner kept (P75-01 D). Checks of unchanged behaviour may already pass on the base.

0. Base pictures for the two states the pictures lane did not take: build armed at the base (phase 2 step 2's command), run the spec of phase 2 step 3 in its `today` mode for `token-home-full-list` and `incoming-block-toast` only, asserting today's readings.
1. Tests first, red on the base; record each red in `lessons/phase-1.md`:
   - `utils/string.test.ts`: move `fromField` to file scope; a `describe("isBlank")` asserts true for each of `dashIfBlank`'s blank classes and `undefined`/`null`, and false for its non-blank values.
   - `AmountCard.test.ts`: blank clamp hint `toBe("Token supports 6 decimals")`; blank rate line `toBe("1 token ≈ $1.00")`; blank switch text `"Token/USD"` after whitespace removal; switch `title` in USD mode `"Type in token"`, with a `cUSD` control; the balance corner's `textContent` keeps the raw `"   "`.
   - `RecentActivityView.test.ts`: blank → `toContain("Send or receive this token to see activity here.")`.
   - `tokens/[id].test.ts`: blank subject → the description with "to pin this token:"; a blank pinned token → "—" in the list.
   - `tx/[id].test.ts:126`: `"This token is missing"` for the non-text symbol; a `"   "` case reads the same and its hero's `textContent` keeps the raw symbol; a `TST` control reads `"TST is missing"`.
   - `IncomingTrustPopup.test.ts`: widen the `@/utils/string` mock with `importOriginal`; blank → title "Allow this token?", body "You received a token from a contract you haven't seen before." with no `strong`, and both snack labels with the decision mock resolving `true`; a `TST` control for the title.
2. `utils/string.ts`: D1.
3. The five SFCs: D2, D3, D4, with an explicit `import { … } from "@/utils/string"` in each.
4. `bun run build`; commit the two regenerated files (Fact 6).

**Gate.** `bun run lint && bun run typecheck:all && bun run test && bun run test:all`, then `bun run build`. Pass: exit 0; each red recorded; after the commit `git status --porcelain apps/extension/src/types` is empty.

## Phase 2: pictures, then the pre-delivery gate ✓

In this order, since `audit:vue`'s build replaces the armed build:

1. `bun run audit:vue && bun run test:all`.
2. The armed build: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`.
3. Pictures, Chrome popup 360x600 at scale 2, light and dark by the root `theme` attribute. Scratch spec `~/.cache/nulo-backlog/symbol-sentences-1/zz-shots-949-after.test.ts`: shots-949's `zz-shots-949-sentences.test.ts` with the same seeds, plus a Block decision and a pin set holding the blank token. Remove its mockup gate, its `step()` wrapper that records a failure and goes on, and every `.catch(() => undefined)` or noted catch on a wait: each failure fails the test. Before each frame it asserts the words of its mode (`today` for step 0, `after` here); at the end it asserts that every expected PNG exists. Frames `949-<site>-after`: send-unpriced, send-rate, send-amount, token-activity, token-home-full, token-home-full-list, tx-missing, incoming-allow, incoming-toast, incoming-block-toast; the switch title is read, not pictured. Copy it into `apps/extension/tests/e2e/`, run `cd apps/extension && env -u EXTENSION_PATH -u NULO_E2E_ARTIFACT_RUN NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/zz-shots-949-after.test.ts --retry=0`, delete it. Commit the `-after` PNGs, step 0's two `-today` pairs and shots-949's eight `-today` pairs under `implementations-plan/symbol-sentences-1/screenshots/`; readings in `lessons/phase-2.md`.
4. The smoke suite on Chrome, same build and env: `bun run test:e2e -- --retry=0`.
5. `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-amount-clamp.test.ts tests/e2e/network/fiat-send.test.ts tests/e2e/network/incoming-transfers.test.ts --retry=0` (they render these components with normal symbols).
6. `bun run check:plans` after staging.

**Gate.** Every run exits 0 at retry 0; `test -z "$(git status --porcelain apps/extension/tests apps/extension/src/types)"`. A red is one rerun for a known flake or a fix, never a retry, timeout or skip. Firefox runs in CI: no fixture, focus, window, activation or WebAuthn change.

## Security & Adversarial Considerations

- **Hostile symbol text.** A contract or a restored backup chooses the symbol; it is sanitized on the way in and rendered as text interpolation. A contract can name itself "this token" and read like the blank noun; the noun means the same thing, and the contract address on the sheet and the banner's copy action still tell tokens apart, as today.
- **Allow and Block bind the prompt's profile, network and contract** (`useIncomingTrustPrompts.ts:69-79`), never its words, so a look-alike symbol changes no decision.
- **A non-string symbol** would make `isBlank` throw where two sites rendered it as is; that needs a stored non-string symbol, which `TokenSchema` refuses on add and on restore (unsupported conditions, no change). The tx page reads records through `displaySymbol`, which maps one to `""`.
- **Display only.** Nothing stored, sent, compared or logged changes; amount slots and `data-*` attributes stay raw.
- **N/A:** cryptography, credentials, storage shape, logging, supply chain (no dependency).

## Delivery

Branch `symbol-sentences-1-a1` from this plan's commit. No PR before the pre-delivery gate passes and the Codex loop converges. `gh pr create --base dev --draft`, no labels, with the pick quoted; `gh pr ready` after the close-out commits. Title (74): `fix(ui): a blank token symbol inside a sentence reads as a noun, not a gap`. Body: what changed and why; P75-01 D quoted by id and text as the sign-off; D5 as an accessibility call under the owner's 2026-10-19 delegation; every picture beside today's, light and dark; the validation runs; no e2e scenario added, so no suite wall-clock moves; `Closes #949`; `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `gh pr checks <n> --watch`.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 05313d5e6. Plan-specific values:

- Attempts in `lessons/phase-N.md`; `agent-worktree status symbol-sentences-1 "phase N green: <next>"` at each gate; three failures on one step: stop.
- Step 1 is absent (`code_review: off`).
- Step 2, once over the net diff from 05313d5e6 after phase 1's gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; later rounds `resume-codex.sh <session-id> <followup-file> <codex-dir> high`. One Opus 5.5 `general-purpose` review beside round 1. Hard stop at three rounds.
- Step 4, close-out as the PR's final commits: the Outcome, `STATUS.md` deleted, the `git mv` into `archive/` in its own commit, the index line moved. Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/symbol-sentences-1/plan.md`, then `agent-worktree done symbol-sentences-1 --merged`.

## Audit verdicts

| Leg | Verdict | Record |
|---|---|---|
| Codex gpt-6.1-sol high, session `01a15a59-afa4-7863-a813-b738235c7c7d` | conditional approve (C1-C6) | C1 D3's `""` split on the switch is not the pick's: accepted as OA-1, D3 ships meanwhile. C2 B dropped the brief's export and left sites 1-4 vague: accepted, D1 under every option, B's expressions written out. C3 the pictures spec records failures and goes on, swallows waits, and lacks base frames for the two new states: accepted (phase 1 step 0, phase 2 step 3). C4 keep `?? "Token"` on the Allow sheet: accepted. C5 snack labels need the decision to resolve `true`: accepted. C6 a tx normal control, raw amount slots, the Allow body pin recon missed: accepted. |
| Opus 5.5 Plan lens | conditional approve (O1-O8) | O1 under A the list dash never ships: accepted, A runs D1 and D4. O2 = C6. O3 Fact 4's `{}` shows in the closing frames; the clamp pin is `:165-170`: accepted, and it confirms C4. O4 = C1. O5 `dashIfBlank` keeps its own TSDoc, `isBlank` gets a `describe`: accepted. O6 the rate line shows in both modes: accepted. O7 = C2. O8 one sentence for the Allow body, a template literal on the tx page: accepted. Security: a non-string symbol would throw in `isBlank`, unsupported conditions, recorded. |
| Codex, same session resumed twice over the revision | conditional approve (C7, C8), then **approve** | C7 OWNER-ASKS.md still said A runs no arc: fixed. C8 phase 1 required C's edits and reds under every pick: scoped to the picked option. Every earlier fix verified; no regression. |
| Codex gpt-6.1-sol high, review round 1 over the arc's diff (755b490e5), session `01a15a76-1357-74e2-9094-13d40293f483` | changes requested (R1) | R1, demonstrated: a restored transaction whose transfer symbol is 33 spaces passes `TxSchema`, `displaySymbol` caps it to 32 spaces and "…", so `isBlank` fails and the banner read "… is missing". Fixed in ce45a01c6: `missingTitle` judges the raw symbol first; a 33-space case, red before the fix. Not extended to the pinned list or the Allow sheet: both read a stored token's symbol, which `cleanSymbol` caps on add and on restore (`token/service.ts:1018,1071,1081`), so a longer run is already stored ending in "…" (unsupported conditions, no change). |
| Opus 5.5 `general-purpose` review of the same diff | approve, V1-V2 | V1 the activity empty-state test's name did not cover its blank case: renamed. V2 no test pinned the raw symbol after USD mode's derived amount: added ("≈ 2    "). It checked every site against the plan, each red against the base templates, and found no missed sentence (every other interpolation is an amount slot or already dashed). |
| Codex, review round 2 (resume) over ce45a01c6 | **approve**, no finding | R1's fix and the two nits verified; the stored-symbol disposition settled. Loop converged. |

**Deviations (arc 1).** The pick was D, not the planned C: § Decision, D3 and phase 1 were rewritten before any code. Phase 1 step 0's first Block frame caught the Allow sheet fading out; the snack frames now wait for `settled()`, and the rerun is the one kept. The review loop ran after phase 1's gate, beside phase 2's first step; R1's fix landed before the armed build, so the pictures and e2e ran on the final code. The first smoke run was stopped by the harness at its 10-minute background limit, nothing red, and rerun detached.

**Decision ledger.** The legs agreed on every point but one. Codex (C2) keeps D1 under every option, as the brief says; Opus (O7) found dropping it under B sensible if recorded. Taken: D1 everywhere, since the brief names it and it costs one export. Unresolved: none. Open for the owner: none (P75-01 answered D on 2026-10-20; OA-1 moot under D).

## Seeds

```
/goal Phases 1-2 of implementations-plan/symbol-sentences-1/plan.md marked ✓, each gate reported passing in the transcript, with the owner's P75-01 pick and words quoted; the Codex loop converged (a resumed pass with no new material finding, quoted); one draft PR against dev with Closes #949, opened after that, with the close-out commits on it; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/symbol-sentences-1 forward per its plan.md: read plan.md and lessons/ first; never start phase 1 without the owner's P75-01 pick quoted; run the next pending phase and its gate; then the Codex loop, Delivery, the close-out; never merge; stop and report when the PR is green.
```
