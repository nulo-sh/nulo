---
plan: token-dash-1
tier: light (the lane brief's call; one Codex audit round-trip plus one Opus Plan lens, then a fresh Codex pass)
status: closed (arc 1 delivered in one PR against dev; the merge closes the plan)
issues: "#897 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens
base: origin/dev at 817cce9d
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-20.
- **Status:** closed. One arc, #930 against `dev` from `token-dash-1-a1`; the merge that lands it closes the plan.
- **Shipped:** #897 by P70-09 B. `safeWireOrDash` beside `safeWire` returns the empty-value "—" when nothing but whitespace survives the sanitizer's strip, judged before the length cap; the Register token card's Symbol and Name values use it. The network e2e's read-symbol check is exact (`toBe("TST")`). The tests landed with the change; four pictures in `screenshots/`.
- **Dispositions:** the brief's "never a second copy" of the dash did not hold (no shared dash exists); the inline literal stands (D2). The stored token's other surfaces stay as they are; OA-1 is #932 for the owner.
- **Known limits:** #931 (glyphs that draw nothing but are not whitespace still read blank).
- **Open items:** #932 (OA-1, `owner-decision`).
- **Lessons:** nothing new in `lessons.md` (8,133 of 8,192 bytes): the load timeouts of two static scans under `audit:vue` are recorded in `lessons/phase-2.md`.
- **Size:** about 140 lines against the light target of 150.
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# token-dash-1: the empty-value dash for a blank token name or symbol on the Register token card

One arc, one PR against `dev`, no stack, `Closes #897`. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, non-blocking). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** a person who approves an app's request to add a token, in the approval window, after the wallet has read the token's details from its contract.
- **Excellent:** a Name or Symbol row whose value is empty, or only whitespace once the wallet's sanitizer has run, shows "—" in the row's value role, so the row never reads as a screen that failed to draw. Every other value shows exactly as today.
- **Good enough:** the rows, their boxes, the address row, the error lines and Confirm stay as they are. The other surfaces that show a token after the add are unchanged (OA-1).

## Decision (owner, quoted) and UI impact

- **#897, P70-09 = B** (decision page 70, 2026-10-20): "The empty-value dash the wallet already uses for a missing value." #897's text: "The same rule would cover the symbol."
- **UI impact, Register token card, read:** before, a contract name of `""` or `"   "` shows "NAME:" with nothing beside it, and a blank symbol shows "SYMBOL:" with nothing. After, the value is "—", in the same `Text` (`name` role, primary colour, same testid). Every other value is unchanged. Sign-off: P70-09 B.
- **UI impact, everything else:** none. The loading bars, the Decimals row, the error lines, the Contract address row and Confirm stay.

## Assumptions

**Facts** (verified at 817cce9d):
1. The card renders `safeWire(tokenMetadata.symbol, 32)` and `safeWire(tokenMetadata.name, 64)` (`OperationCard.vue:473-482`); `safeWire` returns `""` for an absent value, else `sanitizeWireString` (`humanize.ts:44`), which strips control, format and variation-selector characters (`stripWireControl`, `capability-meta.ts:155-159`), caps the length with `…` and does not trim.
2. A contract's name and symbol reach the card through `decodeUtf8` (`token/functions/descriptors.ts:50`): one field's 32 bytes as UTF-8 with NULs removed, so a zero field is `""` and spaces survive. A field's first byte can be up to 0x30, so a read is at most 32 code points and never passes either cap (32, 64).
3. The wallet has no shared empty-value dash: 24 non-test code sites write the literal `"—"` inline (recon § Reuse map), in two forms: plain text (`TokenCard.vue:39`, `holdings.vue:103`) and an `aria-hidden` dash beside a hidden sentence (`SendReviewSheet.vue:165`, `FeeCostReadout.vue:75`). `copy-dash-ban.test.ts:52` passes a bare `"—"`.
4. Approve sends the raw read, never the card's text (`index.vue:444-452`), and the add compares a fresh re-read with it raw (`token/service.ts:493-501`). A display mapping in the card cannot change what is added or compared.
5. The only renderer of the preview is this card; the stored token's surfaces, and the in-flight import row's title (`token/service.ts:509`, `TokenImportRow.vue:32`), use their own code and never `safeWire` (recon § The read path).
6. Probe on Bun 1.4.2: after `stripWireControl`, `.trim()` empties `""`, spaces, tab and newline, U+200B, U+FEFF, U+00A0 and U+3000. It keeps the fillers and blanks U+034F, U+115F, U+1160, U+3164, U+FFA0 and U+2800, and a lone combining mark such as U+0301.
7. `unpackResult` is optional on `TokenFnDescriptor` (`token/functions/types.ts:66`); biome's `noNonNullAssertion` is off (`biome.json:38`), and no `noRestrictedImports` override covers `src/popup/windows/**`.

**Brief claims checked:** "find where [the dash] lives and reuse it; never a second copy" does not hold as written: no shared dash exists (Fact 3), so D2 decides. #897's trace holds (Facts 1-2). "List any other surface ... through the same path": none renders the preview (Fact 5); the others are listed in recon and OA-1.

**Inferences:**
- I1. JS whitespace (`trim()`, Unicode White_Space plus U+FEFF) is the owner's "only spaces". Glyphs that draw nothing but are not whitespace (Fact 6) stay as the contract wrote them: a known limit, filed at close-out (Security).
- I2. A `"—"` in the value `Text` keeps the row's box: one line of the same role as any short value. The pictures measure it (phase 2).

**Asks:** OA-1 (the stored token's other surfaces). What ships now: the card only.

## Architecture & Implementation

- **D1, the helper.** In `apps/extension/src/popup/windows/execute/humanize.ts`, beside `safeWire`: `safeWireOrDash(s: string | undefined, max: number): string` returns `"—"` when `stripWireControl(s ?? "").trim() === ""`, else `safeWire(s, max)`. The test runs before the cap, so a long run of spaces is blank too and never a lone `…`. Its TSDoc is one line: the contract it keeps. *Rejected:* testing `safeWire`'s output (a long blank would show `"   …"`); trimming the shown value (changes non-blank values, outside the pick); putting the rule in `sanitizeWireString` (shared by every wire string and every stored token row).
- **D2, the dash.** An inline `"—"` in the helper, the house idiom (Fact 3); the helper is the card's one copy. *Rejected:* a new `EMPTY_VALUE` constant used by one caller; Codex's C2, a constant in a shared utility used by the helper and one existing producer (a second idiom beside 23 literals, reached by editing an unrelated surface; Codex withdrew it); moving the 24 sites onto a constant (touches Home, Send, Holdings and Presto with nothing a person sees; outside the lane, and its absence breaks nothing).
- **D3, the card.** `OperationCard.vue`: the symbol value becomes `safeWireOrDash(tokenMetadata.symbol, 32)`, the name value `safeWireOrDash(tokenMetadata.name, 64)`; the import line adds the helper. Nothing else in the branch changes.
- **D4, accessibility** (the owner's 2026-10-19 delegation). The dash is plain text inside the existing status region, the plain form of Fact 3. A screen reader reads "Name:" and then the dash, or skips the dash at its default punctuation level; then the row sounds as it does today. *Rejected:* `aria-hidden` on the dash with no sentence (the row would read as a bare label); the `aria-hidden` dash beside a hidden sentence such as "No name" (new copy, an owner question).
- **D5, tests.** Unit tests of the helper and one component case (phase 1); no new e2e scenario, since the change is one template expression and the component test reads the rendered row. One e2e assertion tightens so it keeps its meaning (phase 1 step 4; the Opus review's V1 made it exact). *Rejected:* an e2e with an empty-name token (no sandbox token has one; it needs a scratch read override, as the pictures use, for nothing a component test misses).

## Phase 1: the helper, the card and their tests (#897) ✓

Assumptions: Facts 1-7, I1, I2.

1. Write the tests first. Run them on the base, and record the red in `lessons/phase-1.md`.
   - `humanize.test.ts`, `describe("safeWireOrDash")`. Add one local decoder: `getNameDescriptor.unpackResult!(0, [Fr.fromBuffer(field)]) as string`, where `field` is 32 bytes, byte 0 zero, the UTF-8 bytes next, zeros after. Write every non-ASCII input as a `\u` escape in the source.
   - Case 1, blank, through the decoder: a zero field, three spaces, tab and newline, U+200B, and U+00A0 with U+3000 each give `"—"`; `undefined` gives `"—"`.
   - Case 2, control, through the decoder: `"USDC"` gives `"USDC"`; U+200B before `USDC` gives `"USDC"`; `" A "` gives `" A "`.
   - Case 3, the cap, on raw strings (a field cannot hold them): `"W".repeat(70)` at 64 gives `safeWire`'s 64 `W` and `…`; 70 spaces give `"—"`.
   - `OperationCard.test.ts`, "a token add": add "an empty name and a blank symbol read as the empty-value dash". Mount with `{ name: <the decoder's output for a zero field>, symbol: <a space, then U+00A0>, decimals: 18 }` and the existing `0x` + 64-hex address. Assert the values read `"—"`, `"—"`, `"18"`, the name value keeps `variant="name"`, and the address row renders. The existing `TST`/`TestToken` case is the success control.
2. Add `safeWireOrDash` per D1 and D2; import `stripWireControl` from `@/wallet/services/dapp-session/capability-meta`.
3. Apply D3 in `apps/extension/src/popup/windows/execute/OperationCard.vue`.
4. In `apps/extension/tests/e2e/network/register-token.test.ts:66`, replace the length check with `expect(symbol).toBe("TST")`, the sandbox token's symbol (`tests/e2e/fixtures/aztec.ts:179`): a blank read now renders a dash, which the length check alone would pass.
**Gate.** `bun run lint && bun run typecheck:all && bun run test`. Pass: exit 0; the step 1 red shows the component case failing on the base card. Layers: lint, typecheck, unit, component.

## Phase 2: pictures, then the pre-delivery gate ✓

1. Pictures, Chrome, scratch only. The scratch files sit in `~/.cache/nulo-backlog/token-dash-1/`, written while planning and read by Codex; read them before running. Copy `zz-shots-897.test.ts` and `zz-shots-p65-lib.ts` into `apps/extension/tests/e2e/network/`. From the worktree root, run `python3 -I ~/.cache/nulo-backlog/token-dash-1/apply-hold.py "$PWD"`: it holds `prefetchTokenMetadata`'s read until the page sets `__p65Release`, and under `__p897Empty` returns name `""` and symbol of three spaces. At load1 < 150: `P65_SHOTS=$HOME/.cache/nulo-backlog/token-dash-1/shots NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/zz-shots-897.test.ts --retry=0`. The spec releases a first request with `__p897Empty`, asserts the values `—`, `—`, `18`, and takes `897-empty` (light and dark, 400×600 at scale 2). It rejects, releases a second request plain, asserts `TST`, `TestToken`, `18`, takes `897-normal`, asserts every row's and the address row's box equal the first capture's, and rejects.
2. Remove both files; `git restore apps/extension/src/popup/windows/execute/index.vue`. Commit the four PNGs under `implementations-plan/token-dash-1/screenshots/`; record the readings in `lessons/phase-2.md`.
3. Pre-delivery: `bun run audit:vue && bun run test:all`; at load1 < 150, `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/register-token.test.ts tests/e2e/network/type-roles-windows.test.ts --retry=0` on Chrome; the smoke suite on Chrome (CLAUDE.md asks it for a popup edit): `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build`, then `cd apps/extension && env -u EXTENSION_PATH -u NULO_E2E_ARTIFACT_RUN NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`; then `bun run check:plans` after staging.

**Gate.** Every run exits 0 at retry 0; `git diff --quiet 817cce9d -- apps/extension/src/popup/windows/execute/index.vue && test -z "$(git status --porcelain apps/extension/tests/e2e/network)"` exits 0. A red is a known flake (one rerun) or a fix, never a retry, timeout or skip. Firefox runs in CI: the change touches no fixture, focus, window, activation or WebAuthn. Layers: network e2e and smoke on Chrome.

## Security & Adversarial Considerations

- **Hostile token strings.** A token contract chooses its name and symbol; a dApp chooses only the address. The strings still pass through the sanitizer, render as text interpolation (no HTML), and sit above the Contract address row. The dash is a fixed glyph: a contract can make it show (by returning blank), and a contract can also return a literal `"—"` as its name, which looks the same. Either way the card says the contract gave no readable name, the address row stays, and the add's checks are unchanged.
- **Display is not identity, and not the add.** The helper maps text for display only; the raw read goes to approve and to the add's comparison (Fact 4).
- **Blank-looking glyphs** (the fillers and blanks of Fact 6, a lone combining mark): a hostile name of them still looks blank. Path: a contract returns U+3164 alone; `stripWireControl` keeps it; `trim()` keeps it; the row shows an invisible glyph. Consequence: the display #897 names, with the symbol and the address still on the card; the attacker gains no impersonation. Label: demonstrated (Fact 6); the consequence does not matter enough to widen the owner's "only spaces". Filed at close-out as a closed `known-limit` issue; reopens on a user report or a decision to treat such glyphs as blank on every token surface.
- **N/A:** cryptography, credentials, storage, logging (no log line), supply chain (no dependency).

## Delivery

Single arc on branch `token-dash-1-a1`, created from this plan's commit on `worktree-token-dash-1` (itself `origin/dev`). No PR before the pre-delivery gate passes and the Codex loop converges. `gh pr create --base dev`, not a draft, no labels (the path filter runs the e2e lanes for `apps/extension/**`). Title (76): `fix(execute): the token add card shows the empty-value dash for a blank name`. Body: the change and why; P70-09 B quoted by id and text, as the sign-off; the accessibility call (D4) as made under the owner's 2026-10-19 delegation; the other surfaces listed and OA-1 with what ships; the four pictures, light and dark; the validation runs with outcomes; no e2e scenario added, so no suite wall-clock moves; `Closes #897`; `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `gh pr checks <n> --watch`.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 817cce9d. Plan-specific values:

- Comments to the comment bar while coding; attempts in `lessons/phase-N.md`; `agent-worktree status token-dash-1 "phase N green: <next>"` at each gate. Three failures on one step: stop and reassess.
- Step 1 is absent (`code_review: off`).
- Step 2, once over the net diff from 817cce9d after the pre-delivery gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; later rounds `~/.claude/skills/codex/scripts/resume-codex.sh <session-id> <followup-file> <codex-dir> high`. Prompt: the diff, this plan, the adversarial ask and the standard's two rules verbatim. One Opus 5.5 `general-purpose` review of the same diff runs beside round 1. Hard stop at three rounds.
- Step 3, Delivery above. Step 4, close-out as the PR's final commits: the Outcome (with `Known limits:` naming the blank-glyph issue), `STATUS.md` deleted, the `git mv` into `archive/` in its own commit, the index line moved to `archive/index.md`. Step 5, teardown after the merge: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/token-dash-1/plan.md`, then `agent-worktree done token-dash-1 --merged`; the orchestrator notices the merge.

## Audit verdicts

| Leg | Verdict | Record |
|---|---|---|
| Codex gpt-6.1-sol high, session `01a158df-d15c-75c3-b9ce-8a75348c2d0b` | conditional approve (C1, C2), then on resume C2 withdrawn | C1 the decoder's fixture cannot reach the cap, and a field holds 32 bytes: accepted (Fact 2; case 3 on raw strings). C2 a shared constant for the dash, from the brief's "never a second copy": rejected on the D2 argument; Codex withdrew it. D4: the spoken dash qualified, accepted. On resume it checked the scratch scripts: both anchors match once at 817cce9d; three fixes to the spec (the callback type under `NonNullable`, no `skipIf`, exact expected values), all accepted. |
| Opus 5.5 Plan lens | conditional approve (O1-O7) | O1 the scratch files did not exist: written. O2 `unpackResult` is optional: the test's decoder uses `!` and `as string` (Fact 7). O3 `register-token.test.ts:66` would pass a dash: accepted (phase 1 step 4). O4 the in-flight import row's title: added to Fact 5 and OA-1. O5 the empty picture blanks the symbol too: accepted. O6 Facts 2, 3, 6 corrected (32 bytes; 24 sites and the second form; the whole glyph class). O7 the phase-0 log: written. D1, D2, D4, the gates and the imports confirmed. |
| Codex final fresh pass, session `01a158ed-40ee-7ac1-9d6a-d4aadb97e703` | **approve**, no finding | D1-D5 and the ledger re-weighed on their merits; every gate script exists; both scratch files typecheck in the e2e context; the anchors match the tree. |
| Codex gpt-6.1-sol high, review round 1 over the arc's diff, session `01a158fc-07e0-70f0-a7b9-fd97f0643846` | **approve**, no finding | |
| Opus 5.5 general-purpose review of the same diff | approve, V1 (small), V2 (no change) | V1 the e2e's `length > 0` and `not.toBe("—")` still passed a wrong symbol: fixed, `toBe("TST")` (c5c9b9641). V2 a non-blank value is stripped twice: at most 32 code points, no change. |
| Codex, review round 2 (resume) over c5c9b9641 | **approve**, no regression | Loop converged. |

**Deviations (arc 1).** The review loop ran beside the pre-delivery gate's rerun, once the code diff was final; a red there would have restarted it. The first `audit:vue` red was two static scans past vitest's 5 s default under host load, rerun once (`lessons/phase-2.md`).

**Decision ledger.** D2 is the one point where the legs differed. Codex first held to the brief's letter (no second copy of the dash) and proposed a constant in a shared utility with two users. Against it: no option meets the letter short of moving all 24 sites; a two-user constant beside 23 literals makes a second idiom by editing an unrelated surface; a one-character glyph carries no logic to drift, and the dash ban already polices its use. Codex withdrew C2, so the inline literal stands. Unresolved: none. Open for the owner: OA-1 (non-blocking).

## Seeds

```
/goal Phases 1-2 of implementations-plan/token-dash-1/plan.md marked ✓, each gate reported passing in the transcript; the Codex loop converged (a resumed pass with no new material finding, quoted); one PR against dev, opened after that, with the close-out commits on it; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/token-dash-1 forward per its plan.md: read plan.md and lessons/ first; run the next pending phase and its gate; then the Codex loop, Delivery, the close-out; never merge; stop and report when the PR is green.
```
