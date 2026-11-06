---
plan: token-digits-1
tier: mid
status: approved by the panel (final fresh Codex pass approve); arc 1 next
issues: "#1702"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit + Opus Plan leg in parallel; final fresh Codex pass
base: origin/dev at 002b76fc7
trunk: dev
post_implementation_hardening: not scheduled
---

# token-digits-1: one tiered digits rule for list amounts; split lines never read 0

One arc, one PR against `dev`, `Closes #1702`. List amounts (token rows, the Send picker, activity rows, the arrival chip, send toasts and the token page's split lines) get one precision rule, truncated, ahead of today's width cut. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Paths are under `apps/extension/` unless they start with `implementations-plan/` or name a package.

## Scope

| Surface | Today (10 or 8 characters, cut) | After |
|---|---|---|
| Token rows on Home and Holdings, Send's picker (`TokenCard`): total and split | `1,234.5678`, `28.439501`, `0.00039203` | `1,234.56`, `28.43`, `0.000392`; each side at the total's decimals |
| Token page split lines (`BalanceView`) | each side cut alone | as the token row's split |
| Activity rows on Home, History and the token page (settled, received, in-flight, terminal journal) | `28.43950` | `28.43` |
| Arrival chip, "Received" snack, "Transaction submitted" and "Sending … to …" toasts | `28.43950`; full form `1,234,567.890123` | `28.43`; full form `1,234,567.89` |
| Token page hero, the tx / journal / received heroes, Send's corner, field, Max and review, the execute window, Fee Juice, every fiat line | — | unchanged |

Out: the detail heroes (P116-13 C, not picked); any padding (`1,000` stays `1,000`); a dust floor other than today's.

## Outcome & Quality Bar

- **For whom:** a person scanning Home, Holdings, History or the Send picker on a 360 px popup, and comparing a row to the token page.
- **Excellent:** (1) every list amount reads the rule's digits and never more than the person holds, so a figure typed into Send never meets "More than your balance"; (2) a row's split and the token page's split read the same strings for the same balances, and a non-zero side never reads `0`; (3) the rule lives in one place, so no surface can drift, and the callers census names each surface's tier; (4) Max and the Send field keep every digit.
- **Good enough:** no visual change beyond the digits; no new e2e scenario where unit and component tables prove the strings.

## Assumptions

**Facts** (verified at 002b76fc7)
1. `balanceFormatted` truncates, trims trailing zeros, cuts to `length`, folds a whole part longer than `length` to K/M/B/T and floors dust at `<0.0…1` (`src/utils/amount.ts:98-137`); `compactCut` reads the whole part from the units, so truncating the fraction first moves no tier (:69-87).
2. The list-tier calls are the 12 recon lists ([recon.md § Call sites](recon.md#call-sites-non-test-and-the-surface-each-draws)); the detail heroes use `DETAIL_AMOUNT_LENGTH`, named apart from `ROW_AMOUNT_LENGTH` (`src/popup/pages/detail-page.ts:5-7`).
3. `TokenCard` cuts the total and each side alone, at one width (10, `{ compact: true }`; P93-57 as built, `TokenCard.vue:51-70`), so `999.999` all public reads `999.999` on its line and `0.0005` + `999.9985` read whole (`TokenCard.test.ts:386-403`); `BalanceView`'s split cuts each side alone at a literal 10 (`BalanceView.vue:73-80`). No side shares the total's decimal count today: that is what P116-13 B adds.
4. The callers census counts `balanceFormatted` calls per file and refuses any option but `{ compact: true }` (`src/utils/amount.callers.test.ts`).
5. `formatSnackAmount` prints the 8-character form while it keeps every whole digit, otherwise the uncapped full amount (`src/utils/snack-amount.ts:11-16`); it feeds the chip, the "Received" snack, "Transaction submitted" and "Sending … to …" (recon).
6. A terminal journal row hands its stored string to `BigInt`, which reads hex; a BUG PIN holds that (`src/utils/journal-state.test.ts:383-389`, known limit #1593).
7. `scripts/e2e/agent.sh` runs only the network config (`:16,265`); a smoke file goes through `bun run test:e2e`, whose global setup starts no sandbox, and each smoke launch claims its own egress-guard ports in `~/.agents/ports.md` (`tests/e2e/fixtures/egress-guard.ts:182`).
8. No smoke or network e2e asserts an amount string the rule changes; the one string that moves is `rows.test.ts`'s receipt (`28439501`, 6 dec: `+28.43950` → `+28.43`), whose width the receipt-chip wrap check depends on (`rows.test.ts:698-770,813-819`). Every network string is a whole number (`1,000`, `1,250`, `950`, `50`, `1010`, `+7`, `+9`, `+10`, `1` to `100`, and the token page's split in `receive-unregistered.test.ts:65,121-122` and `update-in-place.test.ts:401-402`); the rule trims zeros, so none moves ([recon.md § E2E](recon.md#e2e)).

**Inferences**
- I1. Reseeding the receipt to `1234567891` (`+1,234.56` today and under the rule) keeps the wrap check's premise: the row amount is mono (`.type--amount-row`, `packages/design/src/utilities.css:185-191`), so nine characters are as wide as `+28.43950`, and the fiat line grows (`≈ $1,234.57`), which only widens the amount column. The browser run proves it: the wrap assertions run on all three surfaces in both themes (`rows.test.ts:845-847`), and the fit-from-its-width check runs once, on History in the light theme (`:860`, `:749-770`). Every assertion stays as it is.
- I2. `incoming-arrival.test.ts`'s hostile chip (a 10^38 raw amount) is a whole number, so its full form is unchanged.

**Asks:** none open. Three readings of the picks (D3, D4, D5) were challenged by both legs as owner asks; the ledger settles each from the picks' own words, and § Audit verdicts records the dispute.

## Decision ledger

The owner's picks, verbatim (decision page 116, signed 2026-11-06 at 17:04 UTC); they are the sign-offs this plan, its `UI impact` lines and the PR body quote:
- **P116-12, A:** "A tiered list rule: at 1 and above, max(2, 4 − whole digits) decimals (1.234, 12.34, 123.45, 1,234.56, 12,345.67); below 1, four significant digits (0.000392); never more than the token's decimals; truncate, then today's width cut, compact K/M/B/T and floor. Keeps stablecoin cents and drops the trailing-zero artefact (28.43950 reads 28.43). Sits between Uniswap's and MetaMask's list rules."
- **P116-13, B:** "A plus the token page's split lines, which share the rows' layout. P93-57 kept (the sides use the total's decimals) with one addition: a non-zero side that truncates to nothing reads '<0.01' at the total's decimals, never '0'." Its option A, which B extends, reads on the page: "Lists only: the token rows, the picker, the activity rows, the chip and the toasts. The token page's split lines and the detail heroes stay as today."

Decisions:
- **D1. The rule is two new functions beside the primitives, never a branch inside them.** `formatListAmount` truncates to the rule's decimals and hands the bigint to `balanceFormatted(…, { compact: true })`; `formatListSplit` formats a total and its sides. Not taken: an option on `balanceFormatted` (the detail heroes, the token hero and the census share it, and it sits near the complexity budget); a decimal count passed by each caller (the rule would live in twelve places). Outline B (an option on `balanceFormatted`, the split rule in each component) was audited beside this one; both legs chose A.
- **D2. The rule's decimal count** for a positive amount `u` of a token with `d` decimals: at 1 and above, `max(2, 4 − whole digits)`; below 1, the leading zeros after the point plus 4; then `min(…, d)`. Truncation: `u − u mod 10^(d − places)`. Zero and a negative stored value (only an outside writer stores one, #1593) go to `balanceFormatted` untouched, so their output is today's.
- **D3. "The total's decimals" is the rule's count for the total**, not the digits left after trailing zeros are trimmed. Two reasons in the picks' own words: "truncates to nothing" names the truncation step, which P116-12 A sets at the rule's count; and only this reading gives the pick's own `<0.01` in the commonest case, a round total with dust on one side (`1,000.003` = `1,000` + `0.003` reads `1,000`, `1,000`, `<0.01`; the displayed reading, 0 decimals, would print `<1`). So `999.999` from `0.0005` + `999.9985` reads `999.99`, `<0.01`, `999.99`; `1.5004` reads `1.5` with a `0.0004` side at `<0.001`. A zero side reads `0`. Codex R1 asked for an owner ask and withdrew it on this argument (§ Audit verdicts).
- **D4. The side's floor never outgrows the row.** The floor shows `min(places, length − 2)` decimals, the same bound as `balanceFormatted`'s own hint: P116-12 A applies "today's width cut … and floor" after truncation, and today's floor at 10 characters is `<0.00000001`. It only binds below a total of 0.0001, whose own figure the same cut already holds to 8 decimals (`0.000001234` reads `0.00000123`, a dust side `<0.00000001`).
- **D5. The snack's full form takes the rule too**, then today's choice between the 8-character form and the full one: P116-13 A puts "the chip and the toasts" under the rule, P116-12 A orders it "truncate, then today's width cut", and the snack's full form is its width cut (it is how the snack avoids K/M/B/T). Exempting it would print six decimals where the rule allows two on a surface the pick names. `1,234,567.890123` reads `1,234,567.89`; whole digits are never cut. Codex R1 asked for an owner ask and withdrew it (§ Audit verdicts).
- **D6. The census pins each surface's tier.** It counts `formatListAmount` and `formatListSplit` calls beside `balanceFormatted`'s, file by file, so a new list amount fails until someone records it, and the detail heroes cannot slide into the list tier unseen. Opus R1 would drop the column (a moved call already changes a `balanceFormatted` count); kept with Codex R1, because a new surface calling the list helper would otherwise pass unseen, and which surfaces follow the rule is exactly what P116-13 decided.
- **D7. Tests.** One table per new function in `amount.test.ts` (the page's sample balances, each tier boundary, the token-decimals cap, K/M/B/T at 8 and 10, the floor, de-DE and fr-FR, a stored string equal to its bigint; `null`, `undefined` and `""` read `0` before any `BigInt`; a negative stored string reads as `balanceFormatted` reads it); `TokenCard`'s two pinned cases move to the rule (the `<0.01` side among them) and `BalanceView` gains the `<0.01` case; `journal-state` proves an in-flight and a terminal row of one send agree; `snack-amount`'s table gains the rule's rows. No new e2e scenario: no browser behaviour is in question, and the component tables read the rendered strings.
- **D8. E2E.** `rows.test.ts`'s receipt is reseeded from `28439501` to `1234567891` (one of the page's sample balances, reading `+1,234.56` before and after), so the wrap check tests what it was written for (I1); no other e2e string moves (Fact 8). Captures of Home, Holdings, Send's picker and a token page with the three sample balances, light and dark, Chrome, come from an uncommitted spec (seeding as `token-list.test.ts:161-205` does, `shotSend` with `NULO_E2E_SHOT_DIR`), run once for the PR body.

## Architecture & Implementation

**Where.** `src/utils/amount.ts` gains, after `balanceFormatted`:

```ts
/** Truncated, never rounded up, to max(2, 4 − whole digits) decimals at 1 and above or four significant digits below 1, never more than `decimals`; then cut to `length` as `balanceFormatted` compacts. */
export const formatListAmount = (units: bigint | string | null | undefined, decimals: number, length?: number): string
/** The total by `formatListAmount`, each side truncated to the total's decimals; a non-zero side that truncates to nothing reads `<0.0…1` at them, never `0`. */
export const formatListSplit = (privateUnits: bigint, publicUnits: bigint, decimals: number, length: number): { total: string; private: string; public: string }
```

Both call one internal `cutTo(u, decimals, places, length)`: truncate; a positive `u` that truncates to 0 returns the floor at `min(places, length − 2)`; otherwise `balanceFormatted(truncated, decimals, length, { compact: true }).value`. `listDecimals(u, decimals)` is internal too. A string goes through `BigInt` as `balanceFormatted` reads it (Fact 6). Each function stays far under the complexity budget; no suppression.

**Callers.** `formatListAmount(x, d, ROW_AMOUNT_LENGTH)` replaces `balanceFormatted(x, d, ROW_AMOUNT_LENGTH, { compact: true }).value` in `TransactionCard.vue:131`, `TransactionIncomingCard.vue:43`, `RecentActivityView.vue:202`, `journal-state.ts:80,461`. `snack-amount.ts` takes `formatListAmount` for both forms. `TokenCard.vue` computes one `formatListSplit(privateRaw, publicRaw, decimals, FIGURE_WIDTH)` (the dash for a malformed row stays); `BalanceView.vue` computes one `formatListSplit(…, 10)` from `heroSides` (the dash stays). The hero, `hero-fit.ts` and the three detail pages keep `balanceFormatted`.

**File map.** Modified: `src/utils/amount.ts`, `amount.test.ts`, `amount.callers.test.ts`, `snack-amount.ts`, `snack-amount.test.ts`, `journal-state.ts`, `journal-state.test.ts`, `TokenCard.vue`, `TokenCard.test.ts`, `BalanceView.vue`, `BalanceView.test.ts`, `TransactionCard.vue`, `TransactionIncomingCard.vue`, `RecentActivityView.vue`, `tests/e2e/rows.test.ts`, `src/popup/pages/detail-page.ts` (its comment), `src/types/auto-imports.d.ts` (regenerated: `vite.config.ts` auto-imports every `src/utils/` export). Added: none in `src/`. Comments rewritten where they state the old rule: `TokenCard.vue:51-52`, `snack-amount.ts:6-9`, `amount.callers.test.ts:7-14`, and `detail-page.ts:5-6` ("the hero and the row agree today" stops being true).

**Trade-offs.** A shared width constant for `TokenCard` and `BalanceView` (10 in both) was considered and left: the split helper takes the width, and nothing else reads it.

## UI impact

Each line quotes the pick that signs it (Decision ledger); captures light and dark, Chrome, in the PR body.
1. **Home and Holdings token rows, Send's token picker** (`token-amount`, `token-split`). P116-12 A and P116-13 A, "the token rows, the picker". Before `1,234.5678` / `28.439501` / `0.00039203`; after `1,234.56` / `28.43` / `0.000392`; the split follows (P93-57), a non-zero side that truncates to nothing reads `<0.01` at the total's decimals (P116-13 B).
2. **Activity rows on Home, History and the token page.** P116-13 A, "the activity rows". `+28.43950` → `+28.43`; an 8-character row still cuts after the rule, per "then today's width cut": `12,345.678901` reads `12,345.6`, and `10,000.05` reads `+10,000.0`, today and after (the cut's own trailing zero; the PR body names it).
3. **Arrival chip, "Received" snack, "Transaction submitted", "Sending … to …".** P116-13 A, "the chip and the toasts". `28.43950` → `28.43`; a full form keeps every whole digit at the rule's decimals (`1,234,567.89`).
4. **Token page split lines.** P116-13 B. Read as the row's split for the same balances.
5. **Unchanged, by the picks:** the token page hero, the tx, journal and received heroes ("the detail heroes stay as today"), Send, the execute window, Fee Juice, every fiat line.

## Security & Adversarial Considerations

- **Threat model:** display only. The inputs are stored rows (balances, journal and incoming `amountRaw`, token decimals) an outside writer or a hostile contract could shape. Every caller keeps its gate (`knownDecimals` caps decimals at 77, `parseRawBalance`, `parseSide`, `isValidDecimals`) before the new function; a string still reaches `BigInt` exactly where it did, so a malformed value throws or renders as today (#1593's pin holds).
- **Truncation contract:** a list figure is never above the balance; the floor says "less than", which a non-zero side is. Max and the Send field keep the raw balance, so no figure on a list feeds a send.
- **Cost and bounds:** the helper stringifies the units once more, as `formatBaseUnits` already does on the same input; it adds no bound and removes none. Incoming and terminal journal rows reach `BigInt` without `parseSide`'s 80-character cap today (`TransactionIncomingCard.vue:43`, `journal-state.ts:461`), and stay so: changing what those rows refuse is a different change (#1593's contract).
- **Least privilege, crypto, supply chain, logging, storage:** no change; no dependency, no log line, no `chrome.storage.local` key.

## Phase 1: the rule ✓

- Add `formatListAmount`, `formatListSplit` and their internal helpers to `src/utils/amount.ts`.
- **Tests** in `src/utils/amount.test.ts`, two `test.each` tables (computed by a scratch run of the design, verified by the implementation):
  - `formatListAmount` at 10 and at 8 (and uncapped where the snack uses it): `1234.567891` (6 dec) `1,234.56`; `0.00039203438152` (18) `0.000392`; `28.439501` (6) `28.43`; `0.99996` `0.9999`; `1` `1`; `9.9999` `9.999`; `10` `10`; `999.999` (6) `999.99`; `1000` `1,000`; `12345.678901` (6) `12,345.67` / `12,345.6`; `0.1` (6) `0.1`; `1.5` (2 dec) `1.5`; `1234` (0 dec) `1,234`; `12345678.9` `12,345,678` / `12.34M`; `123456789` `123.45M`; `2^128 − 1` (0 dec) `>999T`; `1e-18` `<0.00000001` / `<0.000001`; `0` `0`; the same `1234.567891` as a decimal string; `null`, `undefined`, `""` → `0`; `"-5"` → `balanceFormatted`'s own output (D2's bypass); de-DE `1.234,56` and fr-FR `1 234,56` through `useSeparators`, and a de-DE floor `<0,01` on the split (the floor's separator is new code).
  - `formatListSplit` at 10: `0.0005` + `999.9985` (6) → `999.99`, `<0.01`, `999.99`; `0` + `999.999` → `999.99`, `0`, `999.99` (a zero side is `0`: the control); `1000` + `250` → `1,250`, `1,000`, `250`; `1.5` + `0.0004` (18) → `1.5`, `1.5`, `<0.001`; `0.00039203438152` + `1e-12` (18) → `0.000392`, `0.000392`, `<0.0000001`; `0.000001234` + `1e-12` → `0.00000123`, `0.00000123`, `<0.00000001` (D4).
- Extend `amount.callers.test.ts` (D6): `[compact, plain, list]` per file, read by the same `callsTo` scanner; two scanner controls show a `formatListAmount` and a `formatListSplit` call counted as list. Phase 1 adds `utils/amount.ts` (its own compact call) to the map, so the census stays green; Phase 2 moves the rest. The census proves which tier a file calls, not its arguments: the rendered-string tests carry the behaviour.
- **Validation gate**
  - `bun run lint`, `bun run typecheck:all`: exit 0.
  - From `apps/extension`: `bun --bun vitest run src/utils/amount.test.ts src/utils/amount.callers.test.ts --retry=0`: green.

## Phase 2: the callers ✓

- Move the twelve calls (Architecture § Callers); rewrite the comments the file map names.
- **Tests:**
  - `TokenCard.test.ts`: the 999.999 case reads `999.99` and sides `0` / `999.99`; the 0.0005 + 999.9985 case reads `999.99`, `<0.01`, `999.99` (titles say what they prove). The sample balances stay in the unit tables: the two cases prove the wiring.
  - `BalanceView.test.ts`: the token page's split for 0.0005 + 999.9985 reads `<0.01` / `999.99`; `1,000` / `250` stays (control).
  - `snack-amount.test.ts`: `1,234,567.890123` becomes `1,234,567.89`; add `28.439501` → `28.43` and `0.00039203438152` → `0.000392`.
  - `journal-state.test.ts`: one transfer of `28439501` (6 dec) reads `28.43` in flight (`journalCardAmount`) and terminal (`buildJournalTerminalCardProps`).
  - `amount.callers.test.ts`: the map after the move: `utils/amount.ts`, `hero-fit.ts`, `tx/[id].vue`, `journal/[id].vue`, `received/[id].vue` on `balanceFormatted`; the seven list files on `formatList*`.
- **Validation gate**
  - While editing, from `apps/extension`: `bun --bun vitest run src/utils src/popup/components/modules src/components/composite/activity src/composables --retry=0`: green.
  - Once, at the end, from the repo root: `bun run audit:vue` (typecheck:all ∥ test ∥ lint, then build), `bun run --cwd apps/extension test:components`, `bun run test:all`: exit 0.
  - Red at the base: the new `TokenCard`, `BalanceView`, `snack-amount` and `journal-state` cases fail with the base's sources (`git show 002b76fc7:<path>`), each on the digits.

## Phase 3: e2e and captures ✓

- Reseed `tests/e2e/rows.test.ts`'s receipt to `1234567891` and its comment to `+1,234.56` (D8).
- **Validation gate** (smoke through `bun run test:e2e`, Fact 7; no network file changes, CI runs the network lanes)
  - Chrome, from `apps/extension`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e tests/e2e/rows.test.ts tests/e2e/send-outcome-rows.test.ts tests/e2e/token-list.test.ts --retry=0`: pass; the receipt is wrapped at 360 px and fits from its computed width on History (light), and every other assertion of the file holds as written.
  - Firefox: the same with `build:firefox` and `NULO_E2E_BROWSER=firefox`: pass.
  - Captures, Chrome build: a spec and a config under `~/.cache/nulo-backlog/token-digits-1/`, never in the repo. The config spreads `apps/extension/vitest.e2e.config.ts` (imported by absolute path) with `root` at `apps/extension` and `include`/`dir` on the scratch spec (a probe ran a spec from there); the spec imports only `vitest` and the repo's fixtures by absolute path. Run with `NULO_E2E_SHOT_DIR`: Home, Holdings, Send's picker and the token page show the `After` column of § Scope, light and dark.
  - `bun run check:plans` after staging: exit 0.

## Delivery

One arc, one PR, no stack: branch `token-digits-1-a1` off `origin/dev`, carrying the plan commit. Title (≤ 92): `fix(tokens): list amounts follow one tiered digits rule; split lines never read 0`. Body: the picks quoted, the before/after table, the captures, the validation runs, `Closes #1702`. Opened ready, no label at creation, only after the review loop converges. The close-out is the PR's final commits. No added e2e scenario, so no wall-clock line; the reseed changes one value.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 002b76fc7, with these values:
- **Review loop:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, over the arc's diff after Phase 3; one Opus `general-purpose` review beside the first round; hard stop at three rounds, then report.
- **Delivery:** `gh pr create --base dev`; `gh pr checks <n> --watch` to the end.
- **Close-out:** the PR's final commits; merge `origin/dev` first and read `index.md` and `lessons.md`.
- **Teardown:** after the merge, `agent-worktree done token-digits-1 --merged`.
- **Approval boundaries:** any string beyond the `UI impact` lines is a new owner ask; a finding that adds state, a lifecycle, a protocol, a recovery policy or a public contract stops for approval.

## Audit verdicts

**Round 1** (2026-11-06; both legs saw outlines A and B, the recon and the four asks; consult log in [lessons/phase-0.md](lessons/phase-0.md)).
- **Codex (gpt-6.1-sol, high): reject.** Blocking: (1) D3 and D5 settle visible strings without the owner; (5) gates not runnable (`test:components` exists only in `apps/extension`; a capture spec outside `tests/e2e/` is not discovered; `audit:vue` missing). Also: (2) Fact 3 misdescribed today's split; (3) the "~100 digits" bound is false for incoming and terminal journal strings; (4) I1's coverage overstated (the fit check runs once, History, light); (6) the census proves routing, not arguments, so add recognition controls; (7) repeated suite runs; compatibility rows for `null`/`""`/negative.
- **Opus 5.5 (Plan): conditional approve.** Conditions: D3, D4 and D5 as owner asks with their strings; the Phase 2 gate runnable with `audit:vue`; the stale comments named. Also: the census red between phases (`amount.ts`'s own call); `auto-imports.d.ts` regenerates; drop D6's list column; 12 calls, not 13; two more network split reads; I1 holds on the mono role; a de-DE floor row and a negative row; drop the extra `TokenCard` sample case; name the width cut's own trailing zero (`+10,000.0`).
- **Accepted:** every factual fix; the gates (targeted runs, then `audit:vue`, `test:components`, `test:all` once; census in Phase 1's gate); the bound rewritten as "none added, none removed"; I1's real coverage with the browser run as proof; census controls; the table rows; the comments, `auto-imports.d.ts` and the trailing-zero line.
- **Changed differently:** the capture spec stays under `~/.cache` (the lane's scratch rule), run through a scratch config that spreads the smoke config; a probe proved discovery there.
- **Rejected:** dropping D6's column (reason in D6).
- **Disputed, then settled:** D3, D4, D5 as owner asks. Argued back with the picks' words and counterexamples (the displayed reading prints `<1` for the pick's own `<0.01` case and `9` for a `9.5` side under `10`). **Codex, resumed: approve**; it withdrew both blockers ("the rule-count interpretation follows the signed composition"; exempting the snack's full form "would create an unstated exception"), confidence high, and judged D4 no product policy. Codex's two lows (stale counts; a redundant `test:components` run) folded, except that `test:components` stays: the lane brief names it.
- **Opus, resumed with the same argument:** withdrew its D3-D5 condition ("the picks settle all three"); its other conditions were already folded.

**Final fresh Codex pass** (new session, the consolidated plan and ledger): **approve.** No misstated fact; I1 holds pending the browser gate, which the plan already makes the proof; no adversarial finding the change introduces (the malformed-string path to `BigInt` stays as it is, acknowledged); representative strings re-checked against the real formatter (`12,345,678` / `12.34M`, `10,000.0`, `<0.001`, `<0.0000001`, `<0.00000001`).

**Arc 1 review loop, round 1** (2026-11-06; the diff 5b7680d26..cf91270bb; consult log in [lessons/phase-1.md](lessons/phase-1.md)).
- **Codex (gpt-6.1-sol, high): clean.** Nits: the snack's "four significant digits" case passed on the base cut too (`0.000392` both ways); `formatListSplit`'s doc said a side "never shows fewer" decimals, which trimming contradicts; `listDecimals`' comment restated its name.
- **Opus 5.5 (general-purpose): clean.** Nits: the same doc and snack control; the floor's `repeat` throws below width 3 (no caller passes one: needs unsupported conditions, not fixed); the Phase 3 gate still owed its Firefox run and the plans gate.
- **Accepted:** the snack case moved to `0.0039203438152` (base `0.003920`, now `0.00392`, red at the base); the doc rewritten; the comment deleted.

**Arc 1 review loop, round 2** (resumed, the diff cf91270bb..df8e9d46b): **Codex clean.** Every fix verified, no regression; one test-title wording nit applied. The loop converged.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1-3 of implementations-plan/token-digits-1/plan.md ✓, each gate passing in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); PR to `dev` open with `Closes #1702`; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/token-digits-1 forward per its plan: reality check, next phase, its gate, the review loop, the PR, the close-out; never idle.
