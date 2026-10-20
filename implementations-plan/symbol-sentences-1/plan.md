---
plan: symbol-sentences-1
tier: light (the lane brief's call; one Codex audit round-trip plus one Opus Plan lens)
status: planned, Codex approve; waiting on P75-01 (page 75, unsigned); arc 1 starts only on the orchestrator's resume with the pick
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

# symbol-sentences-1: a blank token symbol inside a sentence reads as words, not a gap

One arc, one PR against `dev`, no stack, `Closes #949`. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** a person who holds a token whose contract returned an empty symbol or a symbol of spaces, and who meets it on Send, on the token page, on a transaction page or on the Allow sheet.
- **Excellent:** each of the eleven sentences and the unit switch read as the owner's pick and words say (under C: whole sentences, no sentence that starts with a space, ends on "for" or holds "pin :"; the switch by the page-72 label rule). Every non-blank symbol, every amount slot and every test pin for a normal symbol reads as today.
- **Good enough:** glyphs that draw nothing but are not whitespace stay #931 (closed known limit); the transaction banner's second line ("This token not found in your token list") stays unless the owner's note rewords it.

## Decision (pending) and UI impact

- **P75-01** (page 75, unsigned at planning): A leave it; B the dash inside the sentences; C (recommended) a noun per sentence and the dash on the unit switch; D a noun everywhere, the switch included. **Assumption: C, with the page's proposed words.** The PR quotes the owner's pick and note; the note's words replace the proposals below verbatim. A: arc 1 is D1, D4 and their tests only (the list item is a label, signed by P72-05 C), and its PR closes #949 as the owner's call.
- **UI impact under C**, "before → after" for a blank symbol (`""` or spaces; see D3 for the switch). Non-blank symbols unchanged.
  1. Send clamp hint: "supports 6 decimals" → "Token supports 6 decimals".
  2. Send rate line, in both modes while the field is empty: "1 ≈ $1.00" → "1 token ≈ $1.00".
  3. Send switch hover text, USD mode: "Type in" → "Type in token".
  4. Send switch label: "/ USD" → "— / USD" for spaces; `""` keeps "Token / USD" (OA-1; what ships now).
  5. Token page, no activity: "Send or receive to see activity here." → "Send or receive this token to see activity here."
  6. Token page, Home is full: "…to pin : USDC, EURC, GBPC" → "…to pin this token: USDC, EURC, GBPC".
  7. Transaction page banner title: "is missing" → "This token is missing" (also for a restored record whose symbol is not text).
  8. Allow sheet title: "Allow ?" → "Allow this token?"
  9. Allow sheet body: "You received **** from a contract…" → "You received a token from a contract you haven't seen before." (no bold).
  10. Allow snack: "Now showing receives for" → "Now showing receives for this token".
  11. Block snack: "Hiding receives from" → "Hiding receives from this token".
  - Every option: a blank pinned symbol in the Home-is-full list, an empty item (", EURC, GBPC") → "—, EURC, GBPC" (a label, page-72 rule; page 75 states it).
  - Unchanged: every amount slot (Send's balance corner and USD-mode derived amount, the tx page's hero), every non-blank sentence.
- **Branch B:** the same sites read "—" in place of the symbol ("— is missing", "Allow —?", "1 — ≈ $1.00", "— / USD"); no new words; `""` keeps the word sites 1, 3 and 4 show today (OA-1).
- **Branch D:** C, with site 4 reading "Token / USD" for a blank symbol.

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

**Inferences.** I1: "blank" is #932's rule (JS whitespace after the strip); glyphs that draw nothing stay #931. I2: under C the switch keeps "Token" for `""` (D3).

**Asks.** P75-01, on page 75 already. OA-1 (OWNER-ASKS.md): `""` against spaces on the switch under C, and at sites 1, 3, 4 under B; what ships now is D3.

## Architecture & Implementation

- **D1, one predicate, under every option.** `utils/string.ts` exports `isBlank(s: string | null | undefined): boolean` (`stripWireControl(s ?? "").trim() === ""`), and `dashIfBlank = (s) => (isBlank(s) ? "—" : (s as string))`, same outputs as today. `isBlank` gets "Absent, or only whitespace once the wire sanitizer's strip has run."; `dashIfBlank` keeps its contract: "The empty-value \"—\" for a blank name, title or label; any other value exactly as given." *Rejected:* a fallback-taking helper (`orIfBlank(s, word)`): a second helper the brief rules out, and it cannot carry sites 7 and 9, whose sentences change shape, not only a word.
- **D2, words at each site (C).** Each component decides once and keeps its words in its template:
  - `AmountCard.vue`: `const symbolBlank = computed(() => isBlank(props.token?.symbol))`; site 1 `symbolBlank ? "Token" : token.symbol`; site 2 `symbolBlank.value ? "token" : props.token.symbol`; site 3 `symbolBlank ? 'token' : token.symbol`.
  - `RecentActivityView.vue:917`: `isBlank(token.symbol) ? "this token" : token.symbol`.
  - `tokens/[id].vue:159`: `isBlank(subject.symbol) ? "this token" : sanitizeWireString(subject.symbol, 32)`.
  - `tx/[id].vue`: `transferSymbol` becomes `missingTitle`: `"This token is missing"` when `isBlank(sym)`, else the template literal of today's title, where `sym` is today's `displaySymbol(...)`.
  - `IncomingTrustPopup.vue`: `tokenSymbol` unchanged (`sanitizeWireString(raw ?? "Token", 32)`); `symbolBlank` = `isBlank(tokenSymbol)`; `subject` = `symbolBlank ? "this token" : tokenSymbol`, used by the title and both snacks; the body keeps one sentence: `<strong v-if="!symbolBlank">{{ tokenSymbol }}</strong><template v-else>a token</template>`. An absent symbol reads "Token" as today (Fact 4).
- **D3, the switch label (site 4) under C:** `dashIfBlank(token?.symbol || "Token")`. Token-dash-2's D3 (the page-72 rule as shipped): a fallback that catches `""` stays, the dash covers what renders blank. D: `symbolBlank ? "Token" : token.symbol`. *Rejected:* `dashIfBlank(token?.symbol)`, which turns today's "Token / USD" for `""` into "— / USD", a change no pick names. The predecessor left the switch to #949, so OA-1 puts the split to the owner; D3 ships until the owner answers.
- **D4, the pinned list, every option:** `symbolOf` maps to `dashIfBlank(sanitizeWireString(t.symbol, 32))`.
- **D5, accessibility** (the owner's 2026-10-19 delegation): the noun and the dash are plain text in the existing elements; no ARIA, focus or Tab change.
- **D6, tests.** Each sentence gets one case fed the wire-shaped blank `"   "` (the tx page also keeps its non-text case), red on the base. Text is read with `.text()`, `attributes("title")`, the confirm's `description` or the toast spy's `label` (the decision mock resolves `true`). Normal-symbol controls: the existing pins (the Allow body at `IncomingTrustPopup.test.ts:266`), plus new ones where none exists (the switch title, the Allow title, the tx banner "TST is missing"). The blank cases also assert that the amount slots keep the raw symbol (Send's balance corner, the tx hero), read with `element.textContent`, since VTU's `.text()` trims. No e2e scenario: each sentence is one template or script expression that a component test renders, and no e2e reads these sentences.
- **Branch B:** D1 as above. Site 1 `dashIfBlank(token.symbol || "Token")`, site 2 `dashIfBlank(props.token?.symbol ?? "token")`, site 3 `dashIfBlank(token?.symbol || 'token')`, site 4 as D3; `dashIfBlank(token.symbol)` at `RecentActivityView.vue:917`; `dashIfBlank(sanitizeWireString(subject.symbol, 32))` at `tokens/[id].vue:159`; `transferSymbol` = `dashIfBlank(displaySymbol(…))`; `tokenSymbol` = `dashIfBlank(sanitizeWireString(raw ?? "Token", 32))` (title, body, snacks); D4 as above.

## Phase 1: the predicate, the sentences, the tests (#949)

Assumptions: Facts 1-7; I1, I2. The steps below are option C's, with page 75's proposed words; the owner's words from the resume message replace them. Under B or D, each edit and assertion takes that option's reading (§ Decision, § Architecture). Under A, run only D1 and D4 with the `isBlank` describe and the pinned-list case, and picture only `token-home-full-list`. Checks of unchanged behaviour may already pass on the base.

0. Base pictures for the two states the pictures lane did not take: build armed at the base (phase 2 step 2's command), run the spec of phase 2 step 3 in its `today` mode for `token-home-full-list` and `incoming-block-toast` only, asserting today's readings.
1. Tests first, red on the base; record each red in `lessons/phase-1.md`:
   - `utils/string.test.ts`: move `fromField` to file scope; a `describe("isBlank")` asserts true for each of `dashIfBlank`'s blank classes and `undefined`/`null`, and false for its non-blank values.
   - `AmountCard.test.ts`: blank clamp hint `toBe("Token supports 6 decimals")`; blank rate line `toBe("1 token ≈ $1.00")`; blank switch text `"—/USD"` after whitespace removal, and `""` still `"Token/USD"`; switch `title` in USD mode `"Type in token"`, with a `cUSD` control; the balance corner's `textContent` keeps the raw `"   "`.
   - `RecentActivityView.test.ts`: blank → `toContain("Send or receive this token to see activity here.")`.
   - `tokens/[id].test.ts`: blank subject → the description with "to pin this token:"; a blank pinned token → "—" in the list.
   - `tx/[id].test.ts:126`: `"This token is missing"` for the non-text symbol; a `"   "` case reads the same and its hero's `textContent` keeps the raw symbol; a `TST` control reads `"TST is missing"`.
   - `IncomingTrustPopup.test.ts`: widen the `@/utils/string` mock with `importOriginal`; blank → title "Allow this token?", body "You received a token from a contract you haven't seen before." with no `strong`, and both snack labels with the decision mock resolving `true`; a `TST` control for the title.
2. `utils/string.ts`: D1.
3. The five SFCs: D2, D3, D4, with an explicit `import { … } from "@/utils/string"` in each.
4. `bun run build`; commit the two regenerated files (Fact 6).

**Gate.** `bun run lint && bun run typecheck:all && bun run test && bun run test:all`, then `bun run build`. Pass: exit 0; each red recorded; after the commit `git status --porcelain apps/extension/src/types` is empty.

## Phase 2: pictures, then the pre-delivery gate

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

Branch `symbol-sentences-1-a1` from this plan's commit. No PR before the pre-delivery gate passes and the Codex loop converges. `gh pr create --base dev --draft`, no labels; it stays a draft until its body quotes the pick. Title under C (74): `fix(ui): a blank token symbol inside a sentence reads as a noun, not a gap`; under B (77): `fix(ui): a blank token symbol inside a sentence shows the empty-value dash`. Body: what changed and why; P75-01 quoted with the owner's note as the sign-off; D3 in one sentence; D5 as an accessibility call under the owner's 2026-10-19 delegation; every picture beside today's, light and dark; the validation runs; no e2e scenario added, so no suite wall-clock moves; `Closes #949`; `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `gh pr checks <n> --watch`.

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

**Decision ledger.** The legs agreed on every point but one. Codex (C2) keeps D1 under every option, as the brief says; Opus (O7) found dropping it under B sensible if recorded. Taken: D1 everywhere, since the brief names it and it costs one export. Unresolved: none. Open for the owner: P75-01 and OA-1.

## Seeds

```
/goal Phases 1-2 of implementations-plan/symbol-sentences-1/plan.md marked ✓, each gate reported passing in the transcript, with the owner's P75-01 pick and words quoted; the Codex loop converged (a resumed pass with no new material finding, quoted); one draft PR against dev with Closes #949, opened after that, with the close-out commits on it; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/symbol-sentences-1 forward per its plan.md: read plan.md and lessons/ first; never start phase 1 without the owner's P75-01 pick quoted; run the next pending phase and its gate; then the Codex loop, Delivery, the close-out; never merge; stop and report when the PR is green.
```
