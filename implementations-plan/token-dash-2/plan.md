---
plan: token-dash-2
tier: light (the lane brief's call; one Codex audit round-trip plus one Opus Plan lens, then a fresh Codex pass)
status: closed (arc 1 delivered in one PR against dev; the merge closes the plan)
issues: "#932 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens
base: origin/dev at 21eb96866
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-20.
- **Status:** closed. One arc, one PR against `dev` from `token-dash-2-a1`; the merge that lands it closes the plan.
- **Shipped:** #932 by P72-05 C. `dashIfBlank` in `utils/string.ts` holds the rule (absent, or only whitespace after the wire strip, reads "—"; any other value as given), and the Register token card's `safeWireOrDash` now composes it. Thirteen name, title and label sites use it: Home's token and import rows, Send's picker row and asset card, Settings → Tokens, the token page's header, the metadata popup, History and Recent activity titles (settled, receipt, journal, running), the journal page's title and History's filter chip. Amount slots and `data-symbol` stay raw; the words a title falls back to for `""` stay (D3). A wire-shaped case per site, each red on the base; 38 pictures in `screenshots/`.
- **Dispositions:** the brief's "transaction and receipt pages' titles" did not hold (neither title carries the symbol; the transaction page's banner is a sentence); its "settings and token pages have no colocated tests" did not hold (each got a case). C3's owner ask was declined on D3's argument; the final Codex pass agreed.
- **Known limits:** none new; #931 still covers glyphs that draw nothing.
- **Open items:** #949 (OA-1, `owner-decision`: a blank symbol inside a sentence, and Send's unit toggle).
- **Lessons:** one line promoted to `lessons.md` (a long Bash call is moved to the background and then stopped).
- **Size:** about 175 lines against the light target of 150: the 13-site change map and five audit rows.
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# token-dash-2: the empty-value dash for a blank token name or symbol wherever it names the token

One arc, one PR against `dev`, no stack, `Closes #932`. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, non-blocking). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** a person holding a token whose contract returned an empty or blank name or symbol, which they added after the Register token card showed "—" (#930).
- **Excellent:** every place that would show that name or symbol blank as a name, title or label reads "—", in the same element, role and colour; no row collapses or reads as a screen that failed to draw. Every non-blank value, every symbol after an amount, every data attribute, and every word a title already falls back to for `""` stay exactly as today.
- **Good enough:** the sentences that carry a symbol stay as they are (OA-1); the words titles fall back to for `""` stay (D3).

## Decision (owner, quoted) and UI impact

- **#932, P72-05 C** (decision page 72, 2026-10-20): "The dash for names, titles and labels; after an amount the symbol stays blank, as today. The token page's balance, Send's balance and History's amount column keep their Today pictures." This is the sign-off for every line below; the pictures lane's `-b` frames minus their amount slots are its mockup.
- **UI impact**, each "before → after" for a blank value; non-blank values unchanged:
  - Home's token row: no symbol line, name "unknown" or blank → "—" over "—" (`""` names too: P72-05 C replaces "unknown").
  - Home's import row while the add runs: a title of spaces collapses to 0 px → "—". A title of `""` keeps the short contract address.
  - Send's token picker row: an unlabelled checkbox → "—".
  - Send's asset card: an empty initial square, no symbol, no name → "—" in each.
  - Settings → Tokens: an empty 56 px row → "—" over "—" at 72 px.
  - The token page's header: no title → "—".
  - The metadata popup: Name and Symbol with no value → "—".
  - History and Recent activity titles (settled sends, receipts, journal cards, the running Send): no title → "—". Where `""` falls back today ("Transfer", "Token", the call's title) it still does (D3), so a token with symbol `""` reads "—" on Home, Send, Settings, the token page and the filter chip but "Transfer" or "Token" in activity.
  - The journal page's title: blank → "—".
  - History's token filter chip: empty → "—".
  - Unchanged: every symbol after an amount (History's amount column, receipts, the token page's hero, Send's balance corner, the tx, journal and receipt pages' amounts), the sentences of OA-1.

## Assumptions

**Facts** (verified at 21eb96866; details and line numbers in recon.md):
1. Every stored name and symbol is `sanitizeWireString`'s output at 80 and 32 code points, untrimmed, so `""` and `"   "` are stored as such; a contract read never reaches either cap.
2. The rule lives in `safeWireOrDash` (`popup/windows/execute/humanize.ts:46-48`), used only by `OperationCard.vue:474,481`. `popup/components/modules/**` may not import `@/popup/windows/**`; `src/utils/` has no import ban and already imports `capability-meta`.
3. The sites in recon § Render sites render the stored strings verbatim; the ones with a fallback catch only `""`, so `"   "` renders blank everywhere.
4. `TransactionIncomingCard` binds one `tokenSymbol` prop to its title and its amount symbol (`:52,:55`).
5. `tx/[id].vue`'s header is `getTxTitle`, which never reads a symbol, and `received/[id].vue`'s header is the fixed "Received" with the symbol only after the amount.
6. Tests hold today's non-blank and fallback values (recon § Pins): a 400-character symbol in full, `""` → "Transfer", the filter "USDC". e2e reads `data-symbol` attributes and normal symbols' text only.
7. `src/utils/` exports are auto-imported: the build regenerates `src/types/auto-imports.d.ts` and `src/types/.eslintrc-auto-import.json` (both tracked), and CI's build job fails when either changes (`.github/workflows/_build-extension.yml`, "Assert the build left generated sources unchanged"). Vitest's auto-import has no `dirs`, so each file imports the helper explicitly.

**Claims checked.** The brief's "transaction, journal and receipt pages' titles": only the journal page's title shows the symbol (Fact 5); the transaction page's "{symbol} is missing" is a sentence (OA-1), the receipt page has none. The brief's "settings and token pages have no colocated tests": both have one (recon § Pins), so each gets a case. The issue's "Activity rows (`tx-amount.ts:20-78`)": `displaySymbol` feeds the title and the amount; the title is dashed in `TransactionCard`, `displaySymbol` stays. #932's other claims hold (the pictures lane's report).

**Inferences.** I1: "blank" is #897's rule (JS whitespace after the strip); glyphs that draw nothing stay #931, closed. I2: the dash restores a collapsed line's box (the import title, the Settings row); the pictures read the boxes.

**Asks.** OA-1 (the symbol in sentences and Send's unit toggle). What ships now: as today; arc 1's diff is the same whatever the answer.

## Architecture & Implementation

- **D1, one rule in `src/utils/string.ts`**, beside `sentenceName`: `dashIfBlank(s: string | null | undefined): string` returns `"—"` when `stripWireControl(s ?? "").trim() === ""`, else `s` unchanged. *Rejected:* moving `safeWire` and `safeWireOrDash` to `utils` and calling them with a cap at each surface: the cap is either the stored bound (noise) or smaller and newly cuts a value shown in full today (the card's 64 against the 80 stored; `TokenCard.test.ts:283`), and stored text is already sanitized. *Rejected:* a new module for one function.
- **D2, the card keeps its helper**: `safeWireOrDash = (s, max) => safeWire(dashIfBlank(s), max)`. Same outputs for every `max >= 1` (both callers pass 32 or 64): a blank gives "—", which `safeWire` leaves alone; blank is still judged before the cap. At `max = 0` it would give "…"; no caller passes 0. `OperationCard.vue` is untouched.
- **D3, fallbacks.** A surface whose fallback catches `""` keeps it, and the dash covers what renders blank: `dashIfBlank(x || fallback)`. The exception is Home's "unknown", which the brief replaces: it already means "missing", the dash's own meaning. This is the pick's own scope: P72-05 C is #932's option B ("the same dash wherever the stored name or symbol shows") minus the amount slots, and where a title shows "Transfer", "Token" or the call's title the stored symbol does not show. So a `""` token reads "—" on Home, Send, Settings, the token page and the chip, and keeps its word in activity; the PR body says so in one sentence. *Rejected:* the dash for `""` wherever a token exists: it replaces readable words the pick does not reach, and the import row's address also stands for a read not yet done.
- **D4, amount slots and attributes stay raw**: `TransactionIncomingCard` dashes its title only (`:title="dashIfBlank(tokenSymbol)"`, `amountSymbol` unchanged); `data-symbol` on Home's and the picker's rows stays raw for the e2e.
- **D5, accessibility** (the owner's 2026-10-19 delegation): the dash is plain text in each existing element, the form token-dash-1 used (its D4): no `aria-hidden`, no hidden words (those would be copy).
- **D6, tests.** Unit tests of the rule and one wire-shaped case (`"   "`, three spaces) per changed site that has a colocated test. Each new case also asserts a normal value (its success control), since three sites have none today (the running Send's title, the token page's header, the Settings row). Amount-slot sites assert the symbol stays raw, read through `props()` or `element.textContent`: VTU's `.text()` trims, so `"   "` would read as `""`. No e2e scenario: each site is one template expression a component or unit test reads.

## Phase 1: the rule and the card (#932) ✓

Assumptions: Facts 1, 2; I1.

1. Tests first, red on the base (record in `lessons/phase-1.md`):
   - `src/utils/string.test.ts`, `describe("dashIfBlank")`: move `fromField` and the blank-class case from `humanize.test.ts:51-67` (a zero field, three spaces, tab and newline, U+200B, U+00A0 with U+3000 through the real decoder; `undefined` and `null`) → "—". Non-blank values return as given: `"USDC"`, `" A "` (not trimmed), U+200B + `"USDC"` (not stripped), `"—"`.
   - `humanize.test.ts`: keep `safeWireOrDash`'s "as safeWire does" case with plain literals in place of `fromField` (`"USDC"`, U+200B + `"USDC"` → `"USDC"`, `" A "`), and its "before the length cap" case unchanged.
2. `src/utils/string.ts`: add D1 (import `stripWireControl` from `@/wallet/services/dapp-session/capability-meta`; one-line TSDoc stating the contract).
3. `humanize.ts`: D2; import `dashIfBlank` from `@/utils/string`; drop the `stripWireControl` import if unused.

**Gate.** `bun run lint && bun run typecheck:all && bun run test`. Pass: exit 0; the red recorded.

## Phase 2: the surfaces (#932) ✓

Assumptions: Facts 3-7; D3, D4.

Change map (`apps/extension/src/`; explicit `import { dashIfBlank } from "@/utils/string"` in each file):
- `popup/components/modules/general/TokenCard.vue`: `dashIfBlank(token.symbol)`; `dashIfBlank(token?.name)` (drops "unknown").
- `popup/components/modules/general/TokenImportRow.vue`: `title` returns `dashIfBlank(props.op.title)` when `hasName`; `hasName` and `titleIsAddress` unchanged.
- `popup/components/popups/SelectTokenPopup.vue`: `:title="dashIfBlank(tb.token.symbol)"`.
- `popup/components/modules/send/SelectTokenCard.vue`: `dashIfBlank(token.symbol).charAt(0)`, `dashIfBlank(token.symbol)`, `dashIfBlank(token.name)`.
- `popup/pages/settings/tokens/index.vue`: `:title` and `:description` through `dashIfBlank`.
- `popup/pages/tokens/[id].vue`: `:title="token ? dashIfBlank(token.symbol) : ''"`.
- `popup/components/popups/TokenMetadataPopup.vue`: both values through `dashIfBlank`.
- `popup/components/modules/activity/TransactionCard.vue`: `title` returns `dashIfBlank(amount.value.symbol)` in its transfer branch.
- `components/composite/activity/TransactionIncomingCard.vue`: D4.
- `utils/journal-state.ts`: `transferTitle` returns `dashIfBlank(token?.symbol || "Transfer")`.
- `popup/components/modules/general/RecentActivityView.vue:184` and `popup/pages/journal/[id].vue:79`: `dashIfBlank(<today's expression>)`.
- `popup/pages/activity.vue:130`: `dashIfBlank(sanitizeWireString(filterToken.value.symbol, 32))`.
- `src/types/auto-imports.d.ts`, `src/types/.eslintrc-auto-import.json`: run `bun run build` and commit what it regenerates (Fact 7).

Tests (a `"   "` symbol, and `""` for names where the site shows names): `TokenCard.test.ts` (symbol and name "—"; `data-symbol` stays `"   "`), `TokenImportRow.test.ts` ("—" in the symbol style; `""` keeps the address), `SelectTokenPopup.test.ts` (row title "—"; `data-symbol` raw), `SelectTokenCard.test.ts` (initial, symbol, name), `TokenMetadataPopup.test.ts` (Name, Symbol), `TransactionCard.test.ts` (title "—"; the amount symbol stays `"   "`), `TransactionIncomingCard.test.ts` (title "—"; `amountSymbol` raw), `journal-state.test.ts` (title "—"; `""` still "Transfer"), `RecentActivityView.test.ts` (the running Send's title), `journal/[id].test.ts`, `settings/tokens/index.test.ts`, `tokens/[id].test.ts`, `activity.test.ts` (the chip). `settings/tokens/index.test.ts` fixes its token list inside the `vi.mock` factory: hoist it (`vi.hoisted`) so the case can add a blank row.

**Gate.** `bun run lint && bun run typecheck:all && bun run test && bun run test:all`, then `bun run build`. Pass: exit 0; after the commit, `git status --porcelain apps/extension/src/types` is empty and `git diff --quiet 21eb96866 -- apps/extension/src/popup/windows/execute/OperationCard.vue apps/extension/scripts/type-roles` exits 0.

## Phase 3: pictures, then the pre-delivery gate ✓

In this order, since `audit:vue`'s build replaces the armed build the smoke suite and the pictures need:

1. `bun run audit:vue && bun run test:all`.
2. The armed build: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`.
3. Pictures, Chrome, scratch only. `~/.cache/nulo-backlog/token-dash-2/zz-shots-932.test.ts` is shots-p72's spec without its gate: the same seeds (Test USDC beside a token named `""` with symbol `"   "`, an import record titled `"   "`, one send of each, a never-answering Testnet node) and one `-after` frame per surface plus History's filter chip. Before each frame it asserts the dash on that surface and, after an amount, its absence (Send's balance corner, the token page's hero, the blank History row's amount "1.5"); History's checks wait for History itself, not Home's cards; no readiness wait is swallowed. Copy it into `apps/extension/tests/e2e/`; run `cd apps/extension && env -u EXTENSION_PATH -u NULO_E2E_ARTIFACT_RUN NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/zz-shots-932.test.ts --retry=0` (the smoke launcher claims its ports from the registry); remove the spec. Commit the `-after` PNGs and shots-p72's `-today` PNGs (taken at 72c63794f, which differs from the base only in `NotificationManager.vue`) under `implementations-plan/token-dash-2/screenshots/`; readings in `lessons/phase-3.md`.
4. The smoke suite on Chrome on the same armed build: `bun run test:e2e -- --retry=0`, env as in step 3.
5. `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-picker.test.ts tests/e2e/network/token-management.test.ts --retry=0` (both read these text nodes).
6. `bun run check:plans` after staging.

**Gate.** Every run exits 0 at retry 0, and `test -z "$(git status --porcelain apps/extension/tests apps/extension/src/types)"`. A red is a known flake (one rerun) or a fix, never a retry, timeout or skip. Firefox runs in CI: no fixture, focus, window, activation or WebAuthn changes.

## Security & Adversarial Considerations

- **Hostile token text.** A contract or a restored backup chooses the name and symbol; they pass the sanitizer on the way in and render as text interpolation. The dash is a fixed glyph: a token can make it show (by being blank) or name itself "—", which looks the same; the contract address on the token page and the metadata popup still tells tokens apart, as today.
- **Confusion with an unreadable amount.** Home's amount column shows "—" for a balance it cannot read; the dash added here sits only in name, title and label slots, never in an amount slot (P72-05 C), so the two meanings stay apart.
- **Display only.** Nothing stored, sent, compared or logged changes; the `data-symbol` attributes stay raw.
- **N/A:** cryptography, credentials, storage shape, logging, supply chain (no dependency).

## Delivery

Single arc on branch `token-dash-2-a1`, created from this plan's commit on `worktree-token-dash-2` (itself `origin/dev`). No PR before the pre-delivery gate passes and the Codex loop converges. `gh pr create --base dev`, not a draft (the pick is signed), no labels. Title (89): `fix(ui): a blank token name or symbol shows the empty-value dash where it names the token`. Body: what changed and why; P72-05 C quoted by id and text as the sign-off; D5 as an accessibility call under the owner's 2026-10-19 delegation; the `""` split (D3) in one sentence; OA-1 and what ships; each picture beside today's, light and dark; the validation runs; no e2e scenario added, so no suite wall-clock moves; `Closes #932`; `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `gh pr checks <n> --watch`.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 21eb96866. Plan-specific values:

- Attempts in `lessons/phase-N.md`; `agent-worktree status token-dash-2 "phase N green: <next>"` at each gate; three failures on one step: stop.
- Step 1 is absent (`code_review: off`).
- Step 2, once over the net diff from 21eb96866 after the pre-delivery gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; later rounds `resume-codex.sh <session-id> <followup-file> <codex-dir> high`. One Opus 5.5 `general-purpose` review beside round 1. Hard stop at three rounds.
- Step 4, close-out as the PR's final commits: the Outcome, `STATUS.md` deleted, the `git mv` into `archive/` in its own commit, the index line moved. Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/token-dash-2/plan.md`, then `agent-worktree done token-dash-2 --merged`.

## Audit verdicts

| Leg | Verdict | Record |
|---|---|---|
| Codex gpt-6.1-sol high, session `01a15995-8a5a-7603-97e0-51303f74d620` | conditional approve (C1-C6) | C1 `audit:vue`'s build replaces the armed build: accepted, phase 3 reordered. C2 the moved `fromField` breaks a kept case: accepted, literals. C3 D3 leaves `""` on the activity fallbacks while Home dashes it: the narrower Outcome wording and the UI-impact line accepted; the owner ask declined (ledger). C4 History's checks could read Home's cards: accepted, the spec waits for History and keys the rows by hash. C5 the spec swallowed readiness waits and lacked picker, header and amount-slot checks: accepted. C6 D2 holds for `max >= 1`: accepted, stated. D1, D4-D6, `TransactionIncomingCard` in scope and the tx and receipt pages left alone: confirmed. |
| Opus 5.5 Plan lens | conditional approve (O1-O7) | O1 the build also rewrites `.eslintrc-auto-import.json`, and CI fails on either: accepted (Fact 7, phase 2 and 3 gates). O2 = C2. O3 VTU's `.text()` trims, three new cases lack a normal control, the settings test needs a hoisted list: accepted (D6, phase 2). O4 = C5 (picker, header, amount slots). O5 = C3. O6 Send's unit toggle is a label, not a sentence: accepted, OA-1 reworded. O7 = C6. Confirmed: no import cycle or bundle leak from `capability-meta` in `utils/string.ts`, no name clash, every phase 2 expression and harness, no missed site. |
| Codex final fresh pass, session `01a159a3-6c9f-73c1-822d-e81eb0baab20` | conditional approve (F1), then **approve** on resume | F1 the spec's transition wait had been raised from 3 to 10 s: restored to 3 s, matcher and no-catch kept. Every first-round resolution verified; D3 held the stronger reading, no owner ask needed. |
| Codex gpt-6.1-sol high, review round 1 over the arc's diff, session `01a159bc-db3f-7f20-aa2f-f8c5a708531a` | **approve**, no finding | Every change-map site covered; amount slots and `data-symbol` raw; `""` fallbacks kept; each new case fails on the base; generated files and layer rules clean. |
| Opus 5.5 general-purpose review of the same diff | approve, V1-V3 | V1 the receipt card's prop comment named only the title: rewritten (1ed1f14cc). V2 the import row's case asserted only "not the address style": it now asserts the symbol style too (1ed1f14cc). V3 `dashIfBlank` throws on a non-string: needs unsupported conditions (`TokenSchema` holds strings on add and restore), no change. It reran the 13 suites against the base templates: exactly the 13 new cases failed, each on the dash. |
| Codex, review round 2 (resume) over 1ed1f14cc | **approve**, no regression | V1 and V2 verified. Loop converged. |

**Deviations (arc 1).** The review loop ran beside phase 3 once the code diff was final (after phase 2's gate); a red there would have restarted it. The first smoke attempt was stopped at 618 s by its own process group (lessons/phase-3.md) and rerun.

**Decision ledger.** The legs agreed on every point but one. C3 asked for an owner ask on the `""` split; O5 offered a UI-impact line and a PR sentence instead. Taken: no ask, since the split follows from the pick's own definition (D3), and a `""` title that shows a word shows no stored symbol to dash; the UI-impact line, the Outcome wording and the PR body state the split. The final Codex pass agreed. Unresolved: none. Open for the owner: OA-1 (non-blocking; filed as an `owner-decision` issue at close-out).

## Seeds

```
/goal Phases 1-3 of implementations-plan/token-dash-2/plan.md marked ✓, each gate reported passing in the transcript; the Codex loop converged (a resumed pass with no new material finding, quoted); one PR against dev, opened after that, with the close-out commits on it; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/token-dash-2 forward per its plan.md: read plan.md and lessons/ first; run the next pending phase and its gate; then the Codex loop, Delivery, the close-out; never merge; stop and report when the PR is green.
```
