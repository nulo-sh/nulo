---
plan: testers-fixes-3
tier: light
status: planned, awaiting approval
issues: "#629 (closes); #583 OA-1 (refs: #583 closed with #633)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) with resumes; one Opus Plan leg
base: origin/dev at f695dea4
trunk: dev
post_implementation_hardening: not scheduled
---

# testers-fixes-3: the two-chip row on one line, the journal App row

One arc, one PR against `dev`: `Closes #629`, `Refs #583`. It ships the two picks signed on page 34: P34-08 D (the two-chip row) and P34-09 A (the journal App row). One case the drawing did not show is an owner ask with a "what ships now" form (OA-1). Recon and measurements: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Claims that did not hold

- The decision's "SHI with an ellipsis" and the brief's "SHIEL…": with today's roles at 360 px and 2.5 USDC, Chrome gives the app chip 33 px, one letter and "…" (Firefox 41 px, "SHI…"). From about $25 Chrome shows "…" alone; from about $1,000 of any priced token the drawn rule covers the amount (recon § Measurement). D ships; OA-1 asks what gives past that point.
- The brief's "the row is 62 px": true in Chrome for a priced row up to a seven-digit dollar figure (Firefox 64 px). An unpriced row is 52 px; an eight-digit dollar figure makes 73 px under the ship-now form.
- The brief's "the 42-character host #633's tests use": #633 used the 43-character `staging-nemi-interface.nemi-e65.workers.dev`. The 42-character `verylongsubdomainwithoutbreaks.example.com` is #629's. Each is used where it applies.
- #629's "23 px past the box's border": the scratch page reads 10 px, without the detail scroller's stable gutter. The direction holds; Phase 2's red proof measures it in the extension.

## Outcome & Quality Bar

For a person who reads their activity after using dApps, and opens a dApp operation that failed. Excellent: (1) a dApp-started transfer reads on one line with its symbol and direction whole while the line has room, and up to a nine-digit dollar figure it never covers its amount or widens the page; (2) the journal page's App row reads exactly as the transaction page's, from one shared rule. Send, receive and single-chip rows do not change by a pixel. Good enough: where D has no room, the row takes OA-1's ship-now form.

## Architecture & Implementation

- **The two-chip row (P34-08 D)**, in `TransactionCard.vue` only (recon F1). The two-chip branch becomes:
  ```
  .chips      one line: display flex; align-items center; gap 6px; min-width 0
    .chip       the card's own direction chip, unchanged; data-testid="activity-direction-chip"
    .app_slot   display flex; flex: 1 1 0; min-width: 19px
      .app_chip   data-testid="activity-app-chip"; `.app_slot > .app_chip { flex-shrink: 1 }`
  ```
  The slot's flex basis is 0, so it takes only the room left after the symbol and the whole direction chip, and the chip inside sizes to its name up to the 96 px cap (its `overflow: hidden` already makes its automatic minimum 0). The direction chip's basis is its whole width, so it shrinks (breaking inside itself, the rule every send row has) only once the slot is at its floor: a zero-basis item takes no share of the shrink (CSS Flexbox §9.7). `.chips` needs `min-width: 0` to shrink below its content, and `align-items: center` keeps the slot from stretching beside a broken direction chip. The floor is the chip's border, padding and one "…" at today's `type--tag` (18.8 px in Chrome, 18.5 in Firefox), so the chip never draws empty; a why-comment sits on it. The override has two classes, so it beats the shared `.chip`'s `flex-shrink: 0` whatever order the sheets load in, and every other row keeps "never below its cap" (`activity-card.module.css:22` stays as written). The direction chip's testid goes on every settled-card branch; it changes nothing a person sees.
- **The journal App row (P34-09 A).** `.app_key` and `.app_value` move verbatim, with their comments, from `tx/[id].vue:455-468` into `detail-page.module.css`, where they compose the shared `detail_key` and `detail_value_mono` (`tx/[id].vue:449-452` keeps a local `detail_value_mono` with the same body; it stays). In both pages each becomes a single `composes: … from "../detail-page.module.css";`. `journal/[id].vue:298` becomes `<Flex v-if="originChip" wide justify="between" align="start" gap="16">`; the label takes `app_key` and `data-testid="journal-detail-app-label"`, the value `app_value` (testid `journal-detail-origin` kept). Each Details box gains a testid (`tx-detail-box`, `journal-detail-box`), so the e2e finds the box without walking the DOM.
- **Comments and titles that become false** are rewritten: `TransactionCard.vue:233` ("the app wraps under"), `rows.test.ts:553` (`DAPP_NAME`: "the title line wraps"), the test titles at `rows.test.ts:790` and `TransactionCard.test.ts:148`.
- **Decision ledger.**
  - D1, a zero-basis slot. Rejected: the drawing's `min-width: 0` on the chip (from about $1,000 it draws an empty chip and covers the amount); shrink weights such as `flex-shrink: 1000` (weights share the shrink, so the direction chip breaks on any shrink); a grid or `fit-content` (cannot hug the name and keep the 96 px cap without the same extra element); a container query (a breakpoint for one row).
  - D2, the floor is "…" alone, 19 px. One letter (27-29 px) breaks the direction chip from about $25; 20 px already breaks it at $100 in Chrome (19.4 px left). The px value depends on `type--tag`: Phase 1's test checks the floor holds a whole "…" in the chip's own font, so a role change fails it instead of drawing a clipped chip. Which part gives past the floor is OA-1.
  - D3, shared rules, not a component (Codex and Opus agree). The App row is a label and a value; the details rows are inline `<Flex>` rows, and `TxHashRow` is a component only because it carries copy and link behaviour. The three Flex attributes repeat; the look is one copy, pinned.
  - D4, no change to the awaiting and terminal cards (they show one chip) or to `activity-card.module.css`.

## Security & Adversarial Considerations

- **Threat:** a dApp controls `tx.origin.name` and `op.subtitle` (64 code points on the session path). Its capability here is layout. Text renders through Vue interpolation, with no `v-html`; the sanitizers do not change. Its name's length cannot move the direction chip: the slot's basis is 0 whatever the name.
- **The row's name:** from about $25 the row shows "…" and not the dApp's name; the details page shows it. The name is the dApp's own claim, not a verified origin, in the row and on the page. Bidi controls could choose which one glyph sits beside "…": cosmetic, possible at today's cap too. Approval windows are untouched.
- **Layout abuse:** no name or host can widen Home or cover the amount up to a nine-digit dollar figure (Phase 1, both browsers). Past about $1B the two-chip row runs out of room before a send row does: a known limit filed at close-out (path: at 123.45M the chips end exactly at the 10 px gap; one more dollar group adds about 26 px). A symbol up to 32 characters can widen the page: known limit #625. The journal value breaks anywhere, so a host cannot widen the page.
- Least privilege, cryptography, supply chain: no change (no dependency, no permission, no crypto).

## Assumptions

- **Facts:** recon F1–F6 and § Measurement (Chrome 152 and Firefox 153).
- **Inferences:** I1, the extension lays the row out as the scratch page does in both browsers; Phase 1's red proof and both-browser runs check it. I2, type-scale-1 may change role sizes before this PR opens: the fixtures are chosen well inside their regimes (the drawn row about 14 px of slack, the large row about 20 px short), and Phase 3 re-reads the logged widths after merging `dev`; a fixture that leaves its regime changes its amount, never its assertion.
- **Asks:** OA-1 (ships A).

## UI impact

- The two-chip row on Home, History and a token page, P34-08 D: "One line, the app chip smaller in this row only: SHI with an ellipsis; 62 px." Past the drawn room, OA-1 A ships. Send, receive and single-chip rows unchanged.
- The journal details App row, P34-09 A: "Same as the transaction page: label left, value right-aligned in mono, breaking at any character; the row grows."

## Phases

### Phase 1: the two-chip row on one line (#583 OA-1, P34-08 D) ✓

Files: `TransactionCard.vue`, `TransactionCard.test.ts`, `tests/e2e/rows.test.ts`. Assumes: F1, F3, I1, I2.

Tests:
- Component: replace `TransactionCard.test.ts:149-154`. With the 43-character host, the group holds the direction chip (`activity-direction-chip`) and then a slot holding `activity-app-chip`. A send row has the direction chip and no slot.
- e2e, the dApp scenario (`rows.test.ts:790`), its `LONG_HOST` transfer kept at 2.5 USDC (the drawn regime, priced or not: 33 px priced, 37 px unpriced). `readDappRows` reads the direction chip by its testid; `below` compares the app chip with the direction chip where there is one, otherwise with `activity-title`, so the call row's check keeps its meaning. Assert the transfer row: the symbol uncut; the direction chip on one line; the app chip on its line, cut, at least 19 and under 96 px. Every other assertion stays, the transaction page's App check included.
- e2e, the priced rows scenario (`rows.test.ts:661`): it already holds the drawn "Shielded Payroll Portal" row. Add one two-chip transfer at about 12,345.67 of `scope.token` (base units from its decimals), and read 5 rows. Its existing checks then cover the new row: no escape, no intrusion into the amount column, no title cut, on three surfaces in both themes. Add: its direction chip spans two lines; its app chip is cut, at its floor (19 px ± 0.5), and at least as wide as a whole "…" in the chip's own font. Measure the "…" with a clone of the chip that holds "…", out of flow and sized by its content (`position: absolute; visibility: hidden; width: max-content; max-width: none`), and remove it before reading the row. Add a `shotSend` on Home.
- Runtime: no new scenario; one seeded row and one read. Estimate +3 s per browser; record the measured time.
- Red proof: run the new assertions on the base first (A puts the chip below; the large row's chip is 96 px).

Validation gate:
1. `bun run lint`, `bun run typecheck:all` and `bun run test` exit 0.
2. Build armed: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`.
3. With load1 < 150: `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/rows.test.ts --retry=0` passes.
4. Repeat 2 and 3 with `build:firefox` and `NULO_E2E_BROWSER=firefox`.

### Phase 2: the journal App row (#629, P34-09 A) ✓

Files: `detail-page.module.css`, `tx/[id].vue`, `journal/[id].vue`, `detail-page.styles.test.ts`, `journal/[id].test.ts`, `tests/e2e/rows.test.ts`. Assumes: F4, F5; jsdom applies no module CSS, so only the styles test and the browser read the rule.

Tests:
- Styles: in both pages `.app_key` and `.app_value` are exactly the one `composes` line; this guards against a second copy.
- Component (`journal/[id].test.ts`): a `dapp_execute` record whose subtitle is the 42-character host renders it whole in `journal-detail-origin`, with the `app_value` class, beside `journal-detail-app-label` with `app_key`. This proves the template binds the shared rules.
- e2e, the dApp scenario: give `NAMED_RECORD` the 42-character host (its row still proves the 96 px cap). After the transaction page, open `#/popup/journal/<NAMED_RECORD>`. Read its App value with the transaction page's checks, lifted into one helper both pages call with their testids (value, label, box): two lines; flush with the box's inner edge (± 0.5 px); the first line filled to within a glyph; at least 15.5 px after the label. Add a `shotSend` on `journal-detail-origin`.
- Runtime: one more page visit, estimate +2 s per browser. Red proof on the base: the value is one line and runs past the box.

Validation gate: Phase 1's gate, both browsers.

### Phase 3: merge, evidence, full gates

1. `git fetch origin dev` and merge it (type-scale-1 may have landed). Rerun Phase 1 and 2's tests. From the logged widths, confirm each fixture is still inside its regime by at least 4 px, in both browsers.
2. Run both scenarios with `NULO_E2E_SHOT_DIR` on Chrome: the drawn row, the large row, the journal App row, both themes.
3. `bun run audit:vue`, `bun run test:all` and `bun run --cwd apps/extension build-storybook` exit 0. Then rebuild armed and run the full smoke suite at `--retry=0` on Chrome and Firefox while load1 < 150, recording each wall-clock.

## Delivery

One arc on `worktree-testers-fixes-3`, no stack. `gh pr create --base dev --title "fix(activity): a dApp transfer's chips on one line; the journal App row breaks anywhere"` (87 characters). The body quotes P34-08 D and P34-09 A with their ids, shows the screenshots in both themes, names OA-1 and its shipped form, lists the validation runs and each browser's smoke wall-clock (dev's last CI run and this PR's), and ends with `Closes #629` and `Refs #583`. Open it with no label; the path filters cover `apps/extension/**`. The close-out lands as the PR's final commits.

## Post-implementation

Standard: `implementations-plan/README.md` § Post-implementation standard at f695dea4. Plan-specific values:

- Loop: single-arc, over the net diff from f695dea4, after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh`. Stop after three rounds with material findings. `code_review: off`.
- Every Codex prompt adds: "a change to what a person sees beyond the two quoted picks and OA-1's shipped form is out of scope; report it, do not fix it".
- Close-out: the Outcome; `STATUS.md` deleted; the archive move in its own commit; `bun run check:plans` green. File, deduplicated first: the closed `known-limit` issue for a two-chip row past about $1B (Security); what the loop leaves open; OA-1 as an `owner-decision` issue if unanswered.
- Teardown after the merge: `agent-worktree done testers-fixes-3 --merged`.

## Panel verdicts

| Round | Codex (gpt-6.1-sol, high, session 01a1497a) | Opus Plan leg |
|---|---|---|
| 1 | conditional approve, 5 findings | conditional approve, 9 findings and 6 fact corrections |
| 2 (resume) | conditional approve: fixes verified, both rejections hold; one gap (the fit check alone accepts a wider floor), accepted | — |
| 3 (resume) | **approve**: both conditions verified, no remaining finding | — |

Round 1 accepted:
- Measurement and wording (Codex F1, F2; Opus facts): the amount column is as wide as its widest line, and the amounts are examples (recon F2); the slot column re-measured at 19 px in both browsers; the threshold is dollars, not USDC; OA-1's option A drawn as the build draws it (no dot between the chips, the app chip centred); A-vs-B stated as a trade-off, with what B would cost; `tx/[id].vue` keeps a local `detail_value_mono`.
- The transaction page's App check would lose its long host if the transfer were re-seeded (Codex F4, Opus E2, demonstrated): the `LONG_HOST` transfer stays at 2.5 and proves the drawn regime.
- The large row's premise fails where the list has no price, on nightly and release artifacts (Opus E3, from arithmetic): it moves to the priced `:661` scenario, whose `settledRows` already waits for every dollar figure (this also settles Codex F5 there).
- The fixtures and the floor depend on today's sizes (Codex F3, Opus E4): the floor test checks a whole "…" fits in the chip's own font, and Phase 3 re-reads each fixture's regime after merging `dev`.
- `below` against the direction chip turns the call row's check vacuous (Opus E1, demonstrated): it falls back to the title.
- Outcome (1) overclaimed (Opus E5): bounded to a nine-digit dollar figure; the $1B case becomes a known limit at close-out.
- Comments and titles that become false, the redundant `min-width: 0`, a testid for each Details box instead of a parent walk, the grid's rejection reason (Opus E6-E8, Codex 3a).
- Round 2: the large row asserts the 19 px floor as well as the fit of a whole "…", measured with an unconstrained, out-of-flow clone (a 29 px floor would otherwise pass).
- Proportion (Opus E9): the verbatim pin of the shared rules and the `type-roles` run in the phase gates are dropped (Phase 3's full smoke run covers it).

Round 1 rejected:
- Codex F5 for the dApp scenario (wait for both dollar figures): its drawn-regime checks hold priced or not (33 px priced, 37 px unpriced), and a wait for a dollar figure would hang where the list has no price.
- Opus E9's drop of the journal component test: it is the unit-layer proof that the template binds the shared rules, which the lane brief asks for; only its control case is dropped. Opus E4's canvas `measureText`: a hidden clone of the chip reads the same font without relying on canvas letter-spacing support.

## Seeds

```
/goal Phases 1-3 of implementations-plan/testers-fixes-3/plan.md are marked ✓, each backed by its validation gate passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged with a resumed pass reporting no new material findings, quoted; the PR to dev exists, created after convergence, with Closes #629, Refs #583 and the close-out commits (git show --stat of the archive move in the transcript); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/testers-fixes-3 forward per its plan.md and the README § Post-implementation standard at f695dea4. Each firing: read plan.md and lessons/; if the plan is archived on origin/dev, run agent-worktree done testers-fixes-3 --merged and stop. Otherwise take the next unchecked step, run its gate, mark ✓ only on a green gate, log consults in lessons/. Change nothing a person sees beyond the two quoted picks and OA-1's shipped form; an open question goes to Codex, a visual one to OWNER-ASKS.md. Never merge.
```
