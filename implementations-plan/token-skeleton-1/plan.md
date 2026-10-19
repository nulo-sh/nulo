---
plan: token-skeleton-1
tier: light (the lane brief's call; one Codex audit round-trip plus one Opus Plan lens, then a fresh Codex pass)
status: planned, final Codex approve
issues: "#850 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens
base: origin/dev at b6208221
trunk: dev
post_implementation_hardening: not scheduled
---

# token-skeleton-1: the Register token card as labelled rows, with bars while it reads

One arc, one PR against `dev`, no stack, `Closes #850`. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** a person who approves an app's request to add a token, in the approval window, while the wallet reads the token's symbol, name and decimals (about a second on a local node, longer on a slow one).
- **Excellent:** the card shows "Symbol:", "Name:" and "Decimals:" from the first frame, with a grey bar where each value will be; when the read lands, each bar becomes its value and, for values on one line, nothing above or below the rows moves. The bars stay still for a person who asks for reduced motion.
- **Good enough:** the error state, the Confirm rule and every other card and window stay as they are. A long name still wraps inside the card, so it grows its row when it lands, as today's row does.

## Decision (owner, quoted) and UI impact

- **#850, P66-02 = B** (decision page 66, 2026-10-19): "Labelled rows (Symbol, Name, Decimals) with grey bars, then their values." The orchestrator's record: under B a token whose name equals its symbol still shows both rows, so the layout never changes. The signed pictures: `p66-850-s2-{light,dark}` (loading) and `p66-850-s2-loaded-{light,dark}` (loaded) in the program's shots store.
- **UI impact, Register token card, loading:** before, a spinner at the card's left edge and "Loading token metadata…" at its right edge. After, three rows, "SYMBOL:", "NAME:", "DECIMALS:" in the card's label role, each with a right-aligned grey bar (40, 84 and 20 px wide, 12 px high). Sign-off: P66-02 B.
- **UI impact, Register token card, loaded:** before, one row "TST · TestToken 18 decimals" (the name hidden when it is empty or equals the symbol). After, the same three rows with "TST", "TestToken" and "18" in the card's value role (`name`, 12 px, as the "From account:" value); the Name row shows also when it equals the symbol. A value that wraps keeps its label at the top of the row, as every other row of the card does. Sign-off: P66-02 B.
- **UI impact, everything else:** none. The error lines, the Contract address row and Confirm stay. An empty or blank-looking name is OA-1; what ships now is the value as the wallet sanitizes it.

## Assumptions

**Facts** (verified at b6208221):
1. `OperationCard.vue:468-514`: loading is a `.prop` row with `Spinner color="--txt-inverse"` (`role="status"`, label "Loading", `Spinner.vue:14,35`) and "Loading token metadata…", no testid; loaded is one `.prop` with `register-token-symbol` (`row-title`, 14 px), `register-token-name` (`· name`, `caption`, hidden when empty or equal ignoring case, `:488`) and `register-token-decimals` ("N decimals", `meta`); the error is a `.group` block; the Contract address `.prop` follows all three. The branches run loading, then metadata, then error.
2. `index.vue:109,323-353,623`: one window-wide `tokenMetadataLoading`, true before the `Promise.all` of `previewTokenMetadata` reads and false in `finally`; each read sets its metadata inside the `Promise.all`, so the card can hold metadata while the flag is still true; Confirm stays off while a token is unread (`index.vue:111,418,661`).
3. `index.vue:284-334` commits `operations` and sets the flag with no await between them, so the first render of the card already has the flag set.
4. `Skeleton` (`packages/design/src/ui/Skeleton.vue`) is an aria-hidden `inline-block` span with an explicit height whose animation stops under `prefers-reduced-motion` and `.noanimations`; the design resolver supplies it bare (`design-resolver.ts:28`).
5. The house puts a status region or busy state around its bars: `role="status"` around a `Skeleton` in `TransactionAwaitingCard.vue:88`; `aria-busy="true"` in `TokenCard.vue:90-97` and `BalanceView.vue:265`.
6. `register-token.test.ts:61-72` and `type-roles-windows.test.ts:251,535` (both network) wait for `register-token-symbol`; no test reads `register-token-name` or `-decimals`; `.token_meta` has no user beyond the loaded row and `OperationCard.long-strings.test.ts:184-198`.
7. `previewTokenMetadata` returns the contract's strings, `""` included; without a getter it returns Fee Juice's own name and symbol for Fee Juice, else `"<name>"`, `"<symbol>"`, `0` (`token/service.ts:847-851`). The card shows `safeWire`'s output: controls and format characters stripped, capped at 32 and 64 code points plus an ellipsis.
8. The pictures' run (shots-p65) measured the same rows at y 234, 258, 282 and the address at 306 in both states; the card was 162 px tall in both. Its loaded rows had no `align`; its loading rows were centred.

**Issue and brief claims checked:** #850's trace holds (`.prop`'s `space-between` splits the spinner from its line). The lane brief's "the smoke e2e that drives a register-token request" does not hold: no smoke e2e drives one; the two network files above do, so they are this arc's e2e, on both browsers. #850's first comment promises a readable spinner colour; under B the spinner leaves the card, so that promise has nothing left to fix.

**Inferences:**
- I1. Rows with the default (stretch) alignment keep their height when a 12 px bar becomes a 12 px line of text, and the label stays at the row's top: the bar's explicit height stops it stretching. This holds for one-line values only; the after pictures measure it (phase 2).
- I2. The status region (D2) gives a screen reader the busy-to-ready change the spinner's status gave; a DOM test proves the wiring, not what a given screen reader says.

**Asks:** OA-1 (an empty or blank-looking name or symbol). What ships now: the value as sanitized.

## Architecture & Implementation

- **D1, markup.** In the `register_token` branch, one wrapper (D2) with `v-if="tokenMetadataLoading || tokenMetadata"` holds three explicit `.prop` rows, no `align`, testids `register-token-symbol-row`, `register-token-name-row`, `register-token-decimals-row`. Each row: `<Text variant="label-section" color="secondary">Symbol:</Text>`, then `<Skeleton v-if="tokenMetadataLoading" :width="40" :height="12" />` (84 for Name, 20 for Decimals) and `<Text v-else-if="tokenMetadata" variant="name" color="primary" :class="$style.name_size" data-testid="register-token-symbol">` with `safeWire(symbol, 32)`; `register-token-name` (`safeWire(name, 64)`) and `register-token-decimals` (`decimals`) stay verbatim and now always render once loaded. `v-else-if` narrows the type for `vue-tsc`. The value testids sit only on loaded text, never on a bar, so the e2e ready waits keep their meaning. The error branch and the address row stay. Precedence stays loading, then metadata, then error. *Rejected:* a `v-for` over a computed row list (testids built from strings no grep finds; three rows read plainly); a shared design component for a labelled skeleton row (one caller); showing an operation's values while another operation still reads (the flag is window-wide today; a behaviour change outside the pick); centring the rows (Opus O5: a wrapped value would centre its label, unlike every other row, and the signed loaded picture is not centred).
- **D2, accessibility** (the owner's 2026-10-19 delegation). The wrapper is `<Flex direction="column" wide role="status" :aria-busy="tokenMetadataLoading || undefined" data-testid="register-token-details">`: a polite, atomic live region whose visible labels and values are its content, busy while the bars show; the bars stay aria-hidden. It replaces the spinner's status; the card's column Flex has no gap, so the wrapper moves nothing. *Rejected:* `aria-busy` on each row only (Opus): `aria-busy` marks pending change but makes no live region, so the arrival would go unannounced (Codex C2); hidden status text (new copy).
- **D3, style and comments.** Delete `.token_meta` (no user left). Replace the template's six-line comment with one sentence: the address row stays beside the contract's own strings, which a hostile token chooses.
- **D4, tests.** Component tests only (phase 1). *Rejected:* a committed e2e for the loading frame: it needs a production seam to hold the read, for a frame of about a second; the transition test pins that the same row elements serve both states, and the scratch run measures the geometry.

## Phases

### Phase 1: the rows and their tests (#850)
1. Write the tests first, run them on the base card, and record the red in `lessons/phase-1.md`. `OperationCard.test.ts`, "a token add": add a `Skeleton` stub (`props: ["width", "height"]`, `<span data-testid="stub-skeleton" :data-width="width" :data-height="height" />`). Cases:
   - transition: mount with `tokenMetadataLoading: true` and metadata `USDC`, `USDC`, 6 at a `0x` + 64-hex address. Assert the three rows in order, labels `Symbol:`, `Name:`, `Decimals:`, bars 40, 84, 20 by 12; the details region has `role="status"` and `aria-busy="true"`; no `register-token-symbol`, `-name`, `-decimals`; no "Loading"; the address row renders. Keep the three row elements, `setProps({ tokenMetadataLoading: false })`, then assert the same elements (`toBe`), values `USDC`, `USDC`, `6` with `variant="name"`, no bar, no `aria-busy`.
   - control: `TST`, `TestToken`, 18, not loading, shows `TestToken` with no `·` and `18` with no "decimals".
   - error: the existing case also asserts no `register-token-details`.
2. `OperationCard.long-strings.test.ts`: the symbol case becomes "a 31-character symbol and a 64-character name break inside their value column": each value has its text and is the last child of a `.prop`, and `declarationsOf(".prop", "> :last-child")` matches `WRAPS`.
3. Rewrite the `register_token` branch of `apps/extension/src/popup/windows/execute/OperationCard.vue` per D1-D3.

**Gate.** `bun run lint && bun run typecheck:all && bun run test`. Pass: exit 0; the step 1 red shows the transition case failing on the base card. Layers: lint, typecheck, unit, component.

### Phase 2: network e2e on both browsers, and the pictures
1. Per browser `b` in `chrome`, `firefox`, at load1 < 150 (poll inside one call), from the worktree root: `NULO_E2E_BROWSER=<b> NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/register-token.test.ts tests/e2e/network/type-roles-windows.test.ts --retry=0` (`NULO_E2E_BROWSER` unset for Chrome). Record each wall-clock in `lessons/phase-2.md`.
2. Pictures, Chrome, scratch only, from `~/.cache/nulo-backlog/token-skeleton-1/`. Copy `zz-shots-850-after.test.ts` and `zz-shots-p65-lib.ts` into `apps/extension/tests/e2e/network/`. Run `python3 -I ~/.cache/nulo-backlog/token-skeleton-1/apply-hold.py "$PWD"` from the worktree root: it adds shots-p65's read hold to `prefetchTokenMetadata` and a long-value override (31 `W` for the symbol, 64 for the name) behind a second page flag. Then, at load1 < 150: `P65_SHOTS=$HOME/.cache/nulo-backlog/token-skeleton-1/shots NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/zz-shots-850-after.test.ts --retry=0`. The spec waits for `register-token-details[aria-busy="true"]`, takes `850-after-loading` and `850-after-loaded` (light and dark, 400×600 at scale 2), and asserts the status region's busy state in each, three bars then none, and every row box and the address row's box equal between the two. A second request, released under the long flag, takes `850-after-long` and asserts the name's text and that neither the card's nor the page's `scrollWidth` passes its `clientWidth`.
3. Remove both files; `git restore apps/extension/src/popup/windows/execute/index.vue`. Commit the four after PNGs of the loading and loaded states and the four before pictures (`p66-850-today*`) under `implementations-plan/token-skeleton-1/screenshots/`. Record each row's y in both states, and the long case, in `lessons/phase-2.md`.

**Gate.** The two e2e runs and the picture run exit 0 at retry 0, so the rows keep their boxes across the load (I1) and the long values stay inside the card; `git diff --quiet b6208221 -- apps/extension/src/popup/windows/execute/index.vue && test -z "$(git status --porcelain apps/extension/tests/e2e/network)"` exits 0. Layers: network e2e on Chrome and Firefox.

### Pre-delivery gate
`bun run audit:vue && bun run test:all`; the smoke suite on Chrome at load1 < 150 (CLAUDE.md asks it for a popup edit; no smoke spec reaches this card, and CI runs both browsers): `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build`, then `cd apps/extension && env -u EXTENSION_PATH -u NULO_E2E_ARTIFACT_RUN NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`; then `bun run check:plans` after staging. Pass: exit 0 everywhere; a red is a known flake (one rerun) or a fix, never a retry, timeout or skip.

## Security & Adversarial Considerations

- **Hostile token strings.** A token contract chooses its symbol and name; a dApp chooses only the address. The strings still pass through `safeWire` (Fact 7), render as text interpolation (no HTML), and wrap inside the value column; the Contract address row stays on the card in every state. A name equal to its symbol now shows twice, which hides nothing. The name moves from a secondary caption to the primary value role, one row above the address: a name that mimics a trimmed address gains weight, in the body face, not the address's mono. The exposure exists today, the role is owner-signed, and the real address stays below it; no change.
- **Display is not identity.** The rows show what the contract says, never that it is the token a person expects; the address row and the execution service's own checks at approval (the interface re-parsed against its class id, the shown metadata passed into the add, `execution/service.ts:1139-1173`) stay unchanged.
- **Approval boundary.** Confirm's rule is untouched: it stays off while any token is unread (Fact 2). The bars never carry a value testid, so no test or reader can take a bar for a read value.
- **N/A:** cryptography, credentials, storage, logging (no new log line), supply chain (no dependency).

## Delivery

Single arc on branch `token-skeleton-1-a1` off `origin/dev`. No PR before the pre-delivery gate passes and the Codex loop converges. `gh pr create --base dev`, no labels (the path filter runs both network lanes and both smoke lanes for `apps/extension/**`). Title (70): `fix(execute): the token add card reads as labelled rows while it loads`. Body: the change and why; P66-02 B quoted by id and text; the accessibility call (D2) stated as made under the owner's 2026-10-19 delegation; OA-1 and what ships; before/after pictures, light and dark; the validation runs with outcomes; the network e2e wall-clock per browser on the last `dev` run and on this PR; `Closes #850`; `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `gh pr checks <n> --watch`. No parallel lanes.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at b6208221. Plan-specific values:

- Comments to the comment bar while coding; attempts in `lessons/phase-N.md`; `agent-worktree status token-skeleton-1 "phase N green: <next>"` at each gate. Three failures on one step: stop and reassess.
- Step 1 is absent (`code_review: off`).
- Step 2, once over the net diff from b6208221 after the pre-delivery gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; later rounds `~/.claude/skills/codex/scripts/resume-codex.sh <session-id> <followup-file> <codex-dir> high`. Prompt: the diff, this plan, the adversarial ask and the standard's two rules verbatim. One Opus 5.5 `general-purpose` review of the same diff runs beside round 1. Hard stop at three rounds.
- Step 3, Delivery above. Step 4, close-out as the PR's final commits; delete `STATUS.md`. Step 5, teardown: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/token-skeleton-1/plan.md`, then `agent-worktree done token-skeleton-1 --merged`.

## Audit verdicts

| Leg | Verdict | Record |
|---|---|---|
| Codex gpt-6.1-sol high, session `01a155ff-a185-78a3-96f0-d293c825a1d6` | conditional approve (C1-C4) | C1 Fact 7's fallback wording (Fee Juice; the ellipsis): accepted. C2 the spinner's status semantics would be lost: accepted, D2 is a status region. C3 the no-movement claim holds for one-line values only: accepted (Outcome, I1, the long case in phase 2). C4 a transition test, both bar dimensions, the value role: accepted. |
| Codex final fresh pass, session `01a1560e-5292-7d43-8bbf-7d27124abb59` | conditional approve (F1), then on resume **approve** | F1 the scratch spec waited on a row's `aria-busy` and lacked the long case: accepted; spec, script and exact invocation fixed (phase 2 step 2). Security, Facts, D1-D4 and D2 confirmed. |
| Opus 5.5 Plan lens | conditional approve (O1-O13) | O1 a blank-looking name: OA-1 widened. O2 the name's weight beside the address: a Security line, no code. O3 an exact gate for the scratch edits: accepted. O4 line references, the hidden empty name: corrected. O5 no centring: accepted (D1). O6 first frame: Fact 3. O7 one-line values: as C3. O8 `v-else-if` for `vue-tsc`: accepted (D1). O9 the transition test with metadata while loading and the same elements: accepted, merged with C4. O10 stub mechanics and tests first: accepted (phase 1). O11 the name and decimals testids: stated in D1. O12 the lessons file: written. O13 the smoke gate: pre-delivery runs it on Chrome. Per-row `aria-busy` (Opus's reading of D2): superseded by C2. |

**Decision ledger.** D2 is the one point where the legs differed: Opus accepted `aria-busy` on each row; Codex showed that `aria-busy` makes no live region, so the arrival of the values would go unannounced where the spinner's `role="status"` had one. The status wrapper wins on that argument, follows the house's `TransactionAwaitingCard` precedent and moves nothing. Unresolved: none. Open for the owner: OA-1.

## Seeds

```
/goal Phases 1-2 and the pre-delivery gate of implementations-plan/token-skeleton-1/plan.md marked ✓, each reported passing in the transcript; the Codex loop converged (a resumed pass with no new material finding, quoted); one PR against dev, opened after that, with the close-out commits on it; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/token-skeleton-1 forward per its plan.md: read plan.md and lessons/ first; run the next pending phase and its gate; then the pre-delivery gate, the Codex loop, Delivery, the close-out; never merge; stop and report when the PR is green.
```
