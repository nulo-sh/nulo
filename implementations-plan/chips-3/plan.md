---
plan: chips-3
tier: light
status: approved by the panel (Codex final verdict: approve); arc 1 in progress
issues: "#657 (closed; pages 117 and 118 reopened its row)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit, resumed
base: origin/dev at 0bfd2c088
trunk: dev
post_implementation_hardening: not scheduled
---

# chips-3: the direction chip becomes C2 at the C2S size

Decision pages 117 and 118 (signed 2026-11-06, 18:18 and 19:37 UTC) replace the direction chip of the Home and History rows with C2 at C2S. **Arc 1** builds it on the rows the owner saw: the settled transfer row and the receipt row. It also answers the owner's token-symbol question with pictures. **Arc 2** builds the owner's answers to [OWNER-ASKS.md](OWNER-ASKS.md); nothing past this line plans it. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/` unless they name a package. The plan runs about 25 lines over the light target: the two audit rounds and the trust-boundary trace.

## Scope: the owner's picks, verbatim

- **P117-01, C2:** "C's glyph pair plus a small corner badge on the icon box, lower right (the status check holds the top right): ↗ for sent, ↙ for received, the swap glyph ⇄ for a move to the same account (the set has no ↔). Rows stay two lines; the box carries two badges and a pair inside 40 px." The owner's note: "I REALLY like C2 but when there are two glyphs, it looks like it's too close to the border of the rectangle. Can we generate one option like C2 but a tini-tiny smaller glyphs inside the rectangle?"
- **P118-01, C2S:** "Side glyphs 11 px, badge glyph 10 px (the badge 14 px with its ring): the ink sits 3.4 px from the border, double today's clearance, and the badge 6.4 px from the nearest glyph. The globe keeps its meridians distinct." The arrow stays 9 px.
- **P118-01's note:** "hey, I've just realize that we are also repeating "cUSDC" on the right side, when it's not necessary since it has the token name as a title for the row. Would it make sense to remove it? Or is there a case were it's needed?" OA-1 answers it; arc 1 builds nothing for it.

## Outcome & Quality Bar

- **For whom:** a person scanning Home or History for what moved, which way and between which sides; a screen-reader user who heard the chip's words before.
- **Excellent:** (1) the pair and the badge sit at the measured C2S sizes in both browsers and both themes, and the e2e proves the clearance the owner asked for; (2) a screen reader reads today's chip words once, and the glyphs add nothing to it; (3) a stored row cannot make the glyphs claim a move it did not record.
- **Good enough:** the arrow, the box, the status badge and every other field stay as they are; in-flight and failed rows keep their chip until OA-2 is answered.

## Assumptions

**Facts** (at 0bfd2c088; recon cites lines):
1. Four cards compose `TransactionCardLayout`. Settled, awaiting and terminal show a direction chip for a wallet transfer; the receipt shows its kind chip (`recon.md` § The direction today).
2. The owner's frames show settled transfers and a receipt only (`shots-p117d/options.md`, seeds). The prototype changed only `TransactionCard.vue` and `TransactionIncomingCard.vue` (`git show 1ab832867 --stat`).
3. The prototype parses the label to get the sides (`directionGlyphs`) and calls a settled transfer a move when `to` and `from` match, lowercased (`1ab832867`, `TransactionCard.vue:119-121`).
4. A stored transfer's `from`/`to` are checked only as strings and its `type` is passed through unchecked (`wallet/services/transaction/spec.ts:181-190`).
5. Network e2e finds a receipt by `tx-incoming-kind-chip`'s text (`network/incoming-public-transfers.test.ts:39-52`, `network/store-captures.test.ts:158`, `fixtures/auth.ts:360`).
6. The prototype's C2S code renders a dApp transfer's app chip alone, at the lone chip's 11 px (`a2df12b03`, `TransactionCard.vue:218`). The 10 px rule and its three OVERRIDES are scoped to the two-chip adjacency (`scripts/type-roles/exceptions.ts:36-38`).
7. `Icon` renders `role="img"` with no name (`packages/design/src/core/Icon.vue:35-46`).
8. `wrapTrailing` has one caller, the receipt (`TransactionIncomingCard.vue:62`).
9. **The lane brief's "Issue #657" is closed** (decided A on 2026-10-18). The PR names it and closes nothing.

**Inferences:**
- I1. The app chip's floor at 11 px is a whole "…" plus its border and padding, about 20 px (19.89 px measured in #657). Phase 2 measures it on both browsers.

**Asks:** OA-1 (the symbol) and OA-2 (in-flight and failed rows) in [OWNER-ASKS.md](OWNER-ASKS.md). Arc 1 depends on neither: it ships today's symbol and today's in-flight chip.

## Architecture & Implementation

- **One type, from the types:** `src/utils/row-direction.ts` exports `Side`, `RowWay` (`out | in | self`) and `RowDirection = { from: Side | null; to: Side; way: RowWay; label: string }`. `tx-enrichment.ts`'s `TRANSFER_TYPES` entries gain `from` and `to`. `transferDirection(type: unknown, toSelf)` returns a `RowDirection`, or null for a value that is not a number or string, or not an own key of the table. `received-display.ts` gains `receivedDirection(type)` beside `LABELS`. No label is parsed.
- **Layout:** `TransactionCardLayout` gains `direction: RowDirection | null`.
  - With a direction, the icon box draws [from 11 px][forward 9 px tertiary][to 11 px] with a 1 px gap. A second `.badge` sits at the lower right (`bottom: -6px`, 2 px ring) and holds `send`, `receive` or `swap` at 10 px, with `data-way`.
  - Both new glyph groups are `aria-hidden="true"`.
  - Without a direction, the box draws `icon` at 18 px as today.
  - Sizes are literals on `<Icon>`; no type role changes. `wrapTrailing`, `.title_row_wrap` and `.trailing` go with their one caller.
- **Settled card:** `direction = transferDirection(transfer.type, sameFieldAddress(transfer.from, transfer.to))` (`@nulo/wallet-bridge`). A malformed or missing address never makes a move. The direction chip goes.
  - `#secondary` opens with a visually hidden span holding `direction.label` under `activity-direction-chip`. The rule is `.visually_hidden` in `activity-card.module.css`.
  - A dApp transfer keeps its app chip in `.app_slot`, cut beside the title, at 11 px, with a 20 px floor. `.chips`, the 10 px rule and the three `TWO_CHIPS` OVERRIDES go.
  - Being a transfer still decides `oneLineTitle`, so an unknown stored type keeps its title whole. It shows no pair.
  - `data-tx-transfer-type` keeps today's text for the four known types.
- **Receipt:** the `receivedLabel` prop becomes `direction`, built by `buildIncomingCardProps`. The kind chip, its separator and its green go; its hidden span keeps `tx-incoming-kind-chip`, so the network e2e is untouched.
- **Awaiting and terminal cards: unchanged** (OA-2).
- **Alternatives not taken:**
  - The prototype's five props and its label parser: one typed prop cannot disagree with itself.
  - A layout-owned hidden span: it works too, but the two testids would need a prop.
  - `role="img"` with an `aria-label` on the box: it moves the testids the network e2e reads.
  - C2 on all four cards: held for the owner (Codex round 2).

## Security & Adversarial Considerations

- **Trust boundary:** the settled row reads a transfer's stored `type`, `from` and `to`; storage validates only that they are strings (Fact 4).
  - An unknown or prototype-named type gets no pair and no words, so stored text never becomes the row's direction.
  - Two equal malformed addresses never make a move.
  - Valid but false metadata, a transfer the wallet recorded wrongly, would draw wrongly. The badge shows the record and authenticates nothing; that is a display limit, unchanged by this plan.
- **The app chip** is dApp-chosen text: rendered escaped, capped at 96 px, cut with an ellipsis. It makes no identity claim, as today.
- **Leaks and supply chain:** no log line, no storage shape, no network call, no dependency change.

## UI impact

- **Home, History and the token page's activity list, light and dark, settled transfer and receipt rows:**
  - The direction chip and the receipt's kind chip leave the title row.
  - The icon box shows the pair and the corner badge at C2S, and these rows are two lines.
  - A dApp transfer's app chip is 11 px, as the signed prototype rendered it.
  - Sign-off: P117-01 and P118-01 above.
- **In-flight and failed rows:** unchanged; OA-2 shows them both ways.
- **Accessibility, under the owner's 2026-10-19 delegation:** the chip's words stay in the reading order as hidden text. The new glyphs are hidden from assistive tech. No Tab stop or focus ring moves.

## Phase 1: the direction type, the layout and two cards ✓

Change map: `src/utils/row-direction.ts` (new), `src/utils/tx-enrichment.ts`, `src/utils/received-display.ts`, `TransactionCardLayout.vue`, `TransactionCard.vue`, `TransactionIncomingCard.vue`, `activity-card.module.css`, `scripts/type-roles/exceptions.ts`, `tests/e2e/fixtures/type-roles.ts`.

Tests (colocated, updated in place):
- `tx-enrichment.test.ts`: the four types give their sides and words, by number and by name, `out` and `self`. 999, "bogus", undefined, null, {}, [1] and the prototype names give null.
- `received-display.test.ts`: each received type gives its sides, `in`, and its label; the builder passes it.
- `TransactionCardLayout.test.ts`: with a direction, the pair holds the right glyphs in order and is `aria-hidden`. The badge holds the way's glyph with `data-way`, and the status badge stays. A receipt pair draws two icons. Without one, the box draws `icon` alone and no `activity-way-badge` (the success control).
- `TransactionCard.test.ts`: the hidden span holds the label. No chip renders. A dApp transfer's app chip sits in `.app_slot`. A transfer to its own sender, in another hex case, is `self`; two equal empty addresses are `out`. An unknown type has no pair and a whole title.
- `TransactionIncomingCard.test.ts`: the hidden span keeps `tx-incoming-kind-chip`'s text, and no separator renders.

**Validation gate.**
- Run `bun run lint`, `bun run typecheck:all`, `bun run test` and `bun run test:all`.
- Run `bun run test:ci-gating`, because `scripts/` changes.
- Pass: every command exits 0.
- Layers: typecheck, lint, unit, component.

## Phase 2: the smoke e2e, both browsers ✓

- **`tests/e2e/rows.test.ts`:** the "rows sit 10px apart" test drops `readTwoChipRow`, `readReceiptChip`, `expectReceiptWrapped` and `expectReceiptFitsFromItsWidth`. It reads each direction row's icon box instead:
  - a two-glyph pair is 33 ± 0.5 px wide, its frames 2.5 ± 0.5 px inside the border on both sides;
  - the corner badge is 14 ± 0.5 px, its right and bottom 6 ± 0.5 px past the box;
  - the status badge is still top right;
  - `data-way` reads `out` on the one seed given an outside recipient, and `self` and `in` elsewhere.
  The large dApp transfer's app chip sits beside its title, cut at its cap. The dApp rows test reads the transfer's app chip at 11 px and its width between the 20 px floor and the 96 px cap, keeping every overlap check. Both titles change to say this.
- **`tests/e2e/fixtures/type-roles.ts`:** the `tx-incoming-kind-sep` entry goes with its element.
- **E2E budget:** no scenario is added. Two change their measurements: a real browser is the only layer that lays out SVG glyphs in the 40 px box, the failure the owner saw. Expect under 1 s per run. Measure `rows.test.ts` and `type-roles.test.ts` at base and at head on each browser.

**Validation gate.**
- Build the armed smoke dist for each browser (e2e-testing skill, § Build-armed tests).
- Then run, at retry 0: `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/type-roles.test.ts --retry=0`.
- Run it on Chrome, then with `NULO_E2E_BROWSER=firefox`.
- Pass: both green.
- Smoke launches claim their egress ports in `~/.agents/ports.md` themselves; no network suite file changes.
- **Measured** (base 0bfd2c088 → head, retry 0, this shared host): Chrome `rows` 63.9 s → 69.3 s, `type-roles` 95.7 s → 96.5 s; Firefox `rows` 122.7 s → 118.8 s, `type-roles` 152.6 s → 171.0 s. Every row measured pair 33 px, 2.5 px inside the border each side, badge 14 px mirroring the status badge, on both browsers and themes.

## Phase 3: captures and the two answers (no build)

- **PR captures.** On the armed Chrome build, shoot Home and History, light and dark: the four signed rows and a dApp transfer. A throwaway spec makes them and is never committed. The PNGs go to `implementations-plan/chips-3/screenshots/` for the PR body.
- **The two asks.** On a local throwaway branch that is never pushed, add `localStorage` switches.
  - **OA-1:** `a` drops the symbol where it equals the title; `b` does that and puts a kept symbol beside its amount. Shoot `p119-01-<today|a|b>-<nn>` with a send, a receipt, a self move, a dApp transfer, a dApp call and a mint.
  - **OA-2:** draw C2 on an in-flight and a failed transfer. Shoot `p119-02-<today|c2>-<nn>`.
  - Shoot every frame on Home and History, light and dark. Put the PNGs, a `captions.json` and an `options.md` under `~/.cache/nulo-backlog/chips-3/shots/`. Delete the branch afterwards.
- **Gate.** Pass: every frame exists in both themes, and `captions.json` names each one. `git status` shows only plan files.

## Decision ledger

- D1. Arc 1 takes C2 on the settled and receipt cards only; the in-flight and failed cards wait for OA-2 (Codex round 2, held).
- D2. Sides come from `TransferType` and `ReceivedType`, never the label, with an own-key guard.
- D3. One `direction` prop; the sizes are layout literals.
- D4. Hidden text keeps the chip words and both testids; the new glyphs are `aria-hidden`. This is an accessibility call under the 2026-10-19 delegation.
- D5. A dApp transfer's lone app chip keeps the slot, at 11 px with a 20 px floor; the 10 px rule retires (Codex round 2, withdrawn).
- D6. `wrapTrailing` and `tx-incoming-kind-sep` retire with their element.
- D7. A move is `sameFieldAddress(from, to)`; a malformed pair is never a move.

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high): conditional approve.
  - Accepted: the comparator and the type guard (Facts 3 and 4, D7, D2); F2 limited to current wallet-created records; F3 corrected; the glyphs `aria-hidden` (Fact 7); an `out` seed and `data-way`; the 11 px floor measured; the security wording.
  - Disputed: I1, all four cards take C2. Moved to round 2.
- **Codex round 2:** conditional approve.
  - Held: the in-flight and failed looks need the owner's explicit sign-off. Keeping their chip is existing behaviour. D1 and OA-2 adopt this.
  - Withdrawn: 11 px follows the signed prototype (Fact 6).
  - Condition: the plan matches the work. This revision does.
- **Final verdict (round 3, verification):** approve. "Arc 1 now matches the signed scope … No new material plan defect found."

## Delivery

- Arc 1: branch `worktree-chips-3`. Open one PR against `dev` with `gh pr create`, ready, no label. Title: `feat(activity): settled and received rows draw their direction in the icon box`.
- The body quotes P117-01 and P118-01 verbatim and holds the Phase 3 PR captures. It states the e2e wall-clock before and after, the D4 accessibility call and both open asks. It says "Refs #657"; there is no `Closes`.
- Arc 2 starts from `dev` after arc 1 merges, as p110-build-1 did. The plan's close-out ships with arc 2. If both answers keep today, the close-out ships alone.

## Post-implementation

The steps are [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 0bfd2c088. Specific to this plan:
- **Code review:** off.
- **Review loop:** one per arc, over `git diff origin/dev...HEAD`, after Phase 2's gate and before the PR. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh`. Stop after three rounds and surface what is left.
- **Opus review:** one Opus `general-purpose` review runs beside round 1.
- **Log:** record each round in `lessons/phase-1.md` and under Audit verdicts.
- **Before the PR:** run lint, typecheck, `test:all`, the Phase 2 e2e and `check:plans` once more, then `gh pr checks <n> --watch`.
- **Close-out and teardown:** with arc 2, per the standard's steps 4 and 5. The slug is `chips-3`; the trunk is `dev`.

## Seeds

- `/goal chips-3 arc 1: phases 1-3 ✓ in plan.md, each gate reported passing; Codex loop converged; PR open against dev and green.`
- `/loop 15m Drive implementations-plan/chips-3 per its plan.md; never merge.`
