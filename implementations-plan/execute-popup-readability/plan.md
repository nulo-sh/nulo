---
plan: execute-popup-readability
tier: light (the lane brief's call; the panel of two still argues each decision)
status: planned (Codex approve); implementation waits on OWNER-ASKS R1
issues: "#508 (arc 1 closes it, after R1 is signed)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens; Codex resumes to verify
base: origin/dev at d59459ab
trunk: dev
post_implementation_hardening: not scheduled
---

# execute-popup-readability: a multi-call transaction the approval window can be read by

#508: a dApp transaction with several calls, or calls plus authorizations, renders as one flat list of labels, addresses and 32-byte values. This lane's first deliverable is the design call: [OWNER-ASKS.md](OWNER-ASKS.md) R1 (five options over one example plus a title rule; the planner recommends C with part 2 Yes). After the owner signs R1, one PR builds the signed answer. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** a person approving a dApp transaction in a 360 px window, who must tell what moves value and what only grants permission before pressing Confirm.
- **Excellent:** (1) at rest the window shows every wallet-read value movement, every authorization's line, and the warning of every call it cannot read; (2) every fact today's window shows is reachable within two presses, measured per row and field by one test over a wire-shaped fixture.
- **Good enough:** no new decoding or data source; no change to the fee block, Confirm or other operation kinds.

## Assumptions

**Facts** (verified at `d59459ab`; paths under `apps/extension/src/popup/windows/execute/`):
1. The body is `OperationCard.vue:191-283`: payload rows (`execute-op-payload-row` + `CallArguments`), then discovered authorizations (consumer, caller, function, a "Show details" each). The fee block starts at `op_divider` (line 285).
2. Every line an option needs exists as data: `CallSurface` (`call-surface.ts:30-35`) with its sender discriminant, `amountLabel` (symbol optional), `callName`, and `decodedAuthwits` by message hash (`index.vue:116-117`).
3. The vocabulary applies only on a registered token whose selector and ABI roles corroborate (`call-surface.ts:74-125`); a call hiding `msg_sender` falls through only when its sender must be inferred (no explicit `from`). `callName` gives the wallet's transfer label by name on any contract (`utils/tx-enrichment.ts:35,64`).
4. No smoke e2e opens the window. Three network files read its body: `tx-sendTx-multicall.test.ts:60` (row count), `type-roles-windows.test.ts` (`openExecute` waits for a visible decoded value; the sweep), `tx-transfer-row.test.ts:63-66,113-115` (transfer rows at rest).
5. The disclosure exists twice here with copied CSS (`CallArguments.vue:117-125`, `OperationCard.vue:261-270`). Decodes land after mount (`index.vue:285`), so every row starts `pending`.
6. No component test mounts a theme; theme safety is `src/design/theme-vars.test.ts` and `packages/design/src/theme-contrast.test.ts`. `scripts/type-roles/inventory.test.ts` (in `bun run test`) pins every `.vue` under the window (`surfaces.expected.json`) and every address site (`identifier-sites.expected.json`).

**Claims that did not hold** (the PR answers each on #508):
- The lane brief's "one smoke e2e scenario": smoke cannot reach the window (Fact 4); the proof moves to the three network files, with no scenario added.
- "Component tests … in both themes": a jsdom mount under a `theme` attribute asserts nothing (Fact 6); both themes are proven by the static guards and the PR's screenshots.
- #508's "Where": the call and authorization cards are in `popup/windows/execute/`, not `popup/components/modules/` or `components/composite/`; `useDappInteractionPayload` only loads the request.
- #347 (emoji hold) and #335 (app contract) are merged PRs: the window opens only after the person presses They match, and no option touches what either proves.

**Inferences:** the decision page renders R1's mockups from its legend; `tx-transfer-row.test.ts` (it holds the token) renders the wallet-read lines in a real browser.

**Asks:** R1 ([OWNER-ASKS.md](OWNER-ASKS.md)). Phases 2–3 start only after it is signed.

## Architecture & Implementation (for C with part 2 Yes; other answers below)

- **`call-surface.ts`** gains `actionLine(surface, accountAddress, amount)` and `authwitLine(a, surface, amount)`, where `amount` is the `AmountLabel` the card already computes with `amountLabel`. Each returns the sender discriminant (`account | explicit | none`, explicit compared case-insensitively with the account) and that label, so "base units" and "Caller: none" survive. Part 2 is a body-only `rowTitle(call, surface)` beside `callName`: the six transfer and mint labels only on a `transfer`/`mint` surface, every other label as `callName` gives it. The body's calls and `authwitFunction` use it; the `createAuthWit` card keeps `callName`.
- **`DetailsToggle.vue`** (new): a native `<button>`, chevron, `aria-expanded`, `aria-describedby` (its row's title), label and testid by prop. It replaces both copies (Fact 5) and serves the call and authorization rows.
- **Rows stay inline in `OperationCard.vue`.** Lines 214-279 become "Actions" and "Authorizations" sections. Today's `openAuthwits` Set becomes one open-set keyed `call:{j}` and `authwit:{messageHash}`; authorization rows are keyed by message hash, not index. A raw or pending row renders its warning, notice or "Reading arguments…" outside the toggled part and has no row toggle, so no open state is read once at mount.
- **Testids:** kept: `execute-op-payload-row` (each call's title line, at rest), `execute-op-discovered-authwits`, `execute-op-discovered-authwit`, `execute-discovered-authwit-toggle`, `execute-discovered-authwit-details`, `execute-discovered-consumer` (the "on" address), `execute-discovered-caller` (the line's caller), `execute-discovered-authwit-function`, every `data-*` attribute. New: `execute-op-call-line`, `execute-op-call-toggle`, `execute-op-call-details`, `execute-discovered-authwit-line`, and one per address in a line (`execute-op-line-from`, `-line-to`, `execute-discovered-line-from`, `-line-to`).
- **Inventory:** `DetailsToggle.vue` joins `surfaces.expected.json`; moved and new address sites update `identifier-sites.expected.json`, each with the state that renders it: action-line sites from `tx-transfer-row.test.ts`, the generic authorization line from the delegated flow in `type-roles-windows.test.ts`, the token form of the authorization line from the component test only (no network flow holds that token; no import is added).
- **Other answers' reach rule:** under A and E the opened body shows each authorization's details open, so an undecoded authorization's raw values stay within two presses.
- **Other answers:** A adds the summary list and one section fold over today's body; B the headers (a pure `groupConsecutive`) and authorization lines; D a two-row cut per value block; E a `Tabs` generalized from `AuthMethodTabs`. Only the signed answer's map is built; this section is revised in place before Phase 2.
- **Not taken:** rendering `DecodedCall.contract` (an app-chosen artifact name that can read "USDC"); a new value-moving predicate (`CallSurface.kind` is the wallet's reading); a `PayloadRow.vue` with a slot API (the inline set is smaller and has no frozen-open state).
- **Boundary with send-fees-ux (#503):** this lane edits `OperationCard.vue` above `op_divider`, never `index.vue`'s fee gates, `FeeSettingsCard`, or `authwitSurface`'s `isEmbeddedFeePayment` rule. Shared files both lanes may touch: `OperationCard.vue`'s `<style module>`, `identifier-sites.expected.json`, `type-roles-windows.test.ts`. The second PR to merge merges `origin/dev` first and reruns its gates.

## Security & Adversarial Considerations

- **Threat:** a dApp shapes names (`call.name`, ABI function and parameter names, Unicode lookalikes) and splits a value movement across a call and an authorization, so the person approves without seeing it. Approval fatigue is the failure, not a parse bug.
- **Rules:** R1's six rules bind every option. A line states an amount only from the wallet's vocabulary (Fact 3); an authorization line is never collapsed; an unreadable call is open; every dApp string passes `safeWire`/`wire`; every contract address stays beside its name. The limit is stated on the page: the vocabulary checks names and selectors, not contract code, and `safeWire` strips control and direction marks, not lookalike letters.
- **No execution change:** display only. The service worker runs the stored request; Confirm's gates and `approve()` are untouched. No dependency, crypto, permission or storage change.

## Phases

### Phase 1: shared fixture and the reachability test (no pixel)

- Assumes: Facts 1, 2 and 5; nothing visible changes.
- Add `execute-fixture.ts` (test-only): R1's example, wire-shaped (`0x` + 64-hex fields, the `FunctionCall.toJSON` shape, addresses checked with `isValidAztecAddress`); USDC decoded through the real `decodeCallForDisplay` and Token artifact (as `OperationCard.wire.test.ts` does); Hub and Vault given as the `DecodedCall` records the decoder returns. Beside it, a hand-written manifest: per row and field, the expected text.
- Add `OperationCard.facts.test.ts`: mount the card, press only `button[aria-expanded="false"]` breadth first, record each fact's depth within its own row (text or `title` attribute), and assert depth ≤ 2. Control: a stub card that drops one row's field fails the same check while the manifest stays fixed. A second fixture variant leaves auth 2 undecoded, so its raw values are counted too.
- **Gate:** `cd apps/extension && bun --bun vitest run src/popup/windows/execute` green; `bun run lint`; `bun run typecheck:all`. Pass: exit 0; the facts test green against today's card, its control red.

### Phase 2: the signed answer (C shown)

- Assumes: R1 signed (the map is revised first if the answer is not C); Facts 2, 3, 5 and 6.
- Build the map above; update only the `OperationCard.*.test.ts` assertions that read moved rows.
- Tests: in `call-surface.test.ts`, one case per line form (account, explicit, none sender; empty symbol; mint; pending, undecoded and two-argument authorizations) and part 2 (a decoded `transfer_public_to_public` on an unregistered token keeps its own name). `OperationCard.rows.test.ts` over the fixture: at rest both authorization lines and the unreadable warning show and call 1's values are absent until its toggle is pressed; mounted `pending`, then given raw (warning shows, no toggle) and decoded (closed); each toggle is a button with `aria-expanded` described by its title. The Phase 1 test stays green unchanged.
- **Gate:** `bun run audit:vue`; `bun run test:all`. Pass: exit 0, inventory green, `scripts/complexity-baseline/manifest.json` unchanged.

### Phase 3: real browsers and shots

- Assumes: Fact 4; the playground's buttons still open the window.
- `tx-sendTx-multicall.test.ts`: the three title lines are visible at rest. `type-roles-windows.test.ts`: `openExecute` waits for the call title, asserts it closed, presses each row toggle, then keeps today's decoded-value wait, before `payloadPastCard` and `stretchPayload`. `tx-transfer-row.test.ts`: assert the action line (amount, sender, recipient) at rest, then open the row and keep today's reads. In `type-roles-windows.test.ts`'s delegated flow, assert the authorization line and its caller at rest, before its details open, inside the containment and role checks. Failure mode: a role, overflow or missing line on the new rows in a real 400 px window, which jsdom cannot compute. No token import is added.
- Run each file at retry 0: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`, then again with `NULO_E2E_BROWSER=firefox`. Record each file's wall-clock on `d59459ab` and after, per browser, in `lessons/phase-3.md`. Capture the window light and dark on both browsers into `~/.cache/nulo-backlog/execute-popup-readability/`.
- **Gate:** the three files green on both browsers; `bun run test:ci-gating`; `bun run check:plans`. Pass: exit 0.

## Delivery

One arc, one PR against `dev`, opened only after Phase 3's gate and the Codex loop converge. Title: `feat(execute): read a multi-call transaction as rows and authorizations` (72). Body: R1's signed answer quoted, the shots (light and dark, Chrome and Firefox), the validation runs, each network file's wall-clock before and after per browser, `Closes #508`. The network filter covers `apps/extension/**`, so no label. Close-out (Outcome, lessons, archive move in its own commit) lands as the PR's final commits.

## Post-implementation

Execute `implementations-plan/README.md` § Post-implementation standard as it reads at `d59459ab`, with: step 1 absent (`code_review: off`); step 2 one loop over the net diff from `d59459ab` after Phase 3, Codex by `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds; step 5 `agent-worktree done execute-popup-readability --merged` once `implementations-plan/archive/execute-popup-readability/plan.md` is on `dev`. Merging is the orchestrator's.

## Audit verdicts and decision ledger

Round 1: Codex `conditional approve` (9 findings), Opus `conditional approve` (8). Each finding was checked against the tree; all were accepted.

| # | Finding (who) | Decided |
|---|---|---|
| D1 | C hides decoded values, burns and transfers on unadded tokens included (C1, O1) | C's Cost states it in full; B redrawn as the nothing-moves option; part 2 added (wallet labels only on read rows) |
| D2 | A, D, E broke rule 3; B drawn without lines; E misdescribed (C2, O5) | A and E keep the notice; D never cuts it; B gains the lines; the recommendation's wording fixed |
| D3 | Line lost "base units" and "Caller: none" (C3, O2) | the line carries the sender discriminant and `AmountLabel`; Fact 3 corrected |
| D4 | A once-read `defaultOpen` keeps a pending→raw row closed (C5, O3) | raw and pending content sit outside the toggle; transition test |
| D5 | Three network files and the inventory break (C6, O4) | Phase 3 names all three, the `openExecute` order, the inventory files |
| D6 | No browser run shows a wallet-read line (C7, O4) | `tx-transfer-row.test.ts` asserts it at rest; no token import added |
| D7 | Facts test oracle too weak (C8, O7) | per-row manifest, depth measured, fixed-manifest control |
| D8 | Mockup strings (C9, O6) | "FROM: Main", recipient as an address, no nonce row; Fact 2 lines |
| D9 | Structure (O7) | helpers in `call-surface.ts`, rows inline, no `PayloadRow.vue`; rows keyed by message hash |
| D10 | Overlap with #503 (O8) | shared files named in the boundary |

Round 2 (Codex resumed, verification): `conditional approve`, four new findings, all accepted.

| # | Finding | Decided |
|---|---|---|
| D11 | Part 2 through `callName` would retitle the `createAuthWit` card and drop "Claim Fee Juice" | body-only `rowTitle`; the six labels enumerated; other labels and cards unchanged |
| D12 | A and E put an undecoded authorization's raw values three presses deep | their opened body shows authorization details open; the facts test gains an undecoded variant |
| D13 | The line helpers had no token metadata for units | they take the `AmountLabel` the card computes |
| D14 | No browser run shows a discovered-authorization line | the delegated flow asserts it at rest; the token form stays component-only |

Round 3 (Codex resumed, verification of D11–D14): **`approve`**, no new material findings. Opus round 1's conditions are met by D1–D10.

## Seeds (draft; finalized after R1 and the orchestrator's approval)

- `/goal` Every phase of implementations-plan/execute-popup-readability/plan.md marked ✓, each backed by its gate's output in the transcript; `LESSONS_FILE=implementations-plan/execute-popup-readability/lessons/phase-N.md` printed per phase; `/code-review` not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against `dev` opened after it, with the close-out's archive-move commit shown by `git show --stat`; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/execute-popup-readability forward per its plan.md and the README's Post-implementation standard at `d59459ab`; never start Phase 2 before OWNER-ASKS R1 is signed; decide open questions with Codex, log each in lessons/.
