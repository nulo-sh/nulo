---
plan: execute-popup-readability
tier: light (the lane brief's call; the panel of two still argues each decision)
status: arc 1 in progress (R1 signed 2026-10-16: A, part 2 Yes)
issues: "#508 (arc 1 closes it)"
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

**Asks:** R1 ([OWNER-ASKS.md](OWNER-ASKS.md)), signed 2026-10-16: option A, part 2 Yes (#508 `## Decision`). The owner's note there (descriptions for contracts beyond the token standard) is a later blueprint, out of this arc.

## Architecture & Implementation (option A with part 2 Yes, as signed)

R1's answer (#508 `## Decision`, decision page 20, 2026-10-16): **A**, part 2 **Yes**. The map below replaces the one drawn for C; the target is the rendered `o-508-a` mockup the owner signed (roles and spacing from its HTML source).

- **`SendTxSummary.vue`** (new, execute-local, presentational): "What this does" (`SectionLabel`, no count) as an `<ol>` of every call in order: number (`data`, secondary), title (`data`) " on " contract (`AddressDisplay`), then per surface: a wallet-read transfer `"{amount} {unit} from {sender} to {recipient}"` (sender `this account`, or the explicit address through `AddressDisplay`; no sender: `"{amount} {unit} to {recipient}. Caller: none"`), a mint `"{amount} {unit} to {recipient}"`, a decoded call `"Named by the app."` (`caption`), a pending call "Reading arguments…", a raw call the warning and notice. Then "Authorizations" with its count as a `<ul>`: `"Lets {caller} move {amount} {unit} from {sender} to {recipient}"` on a wallet-read transfer, otherwise `"Lets {caller} call {function} on {consumer}"`. "Checking authorizations…" sits here at rest (it is a status, not a value row). Units through the existing `amountLabel`; "base units" when it gives no symbol.
- **`call-surface.ts`** gains `rowTitle(call, surface)` (part 2: a name `tokenMovementLabel` maps to one of the six labels gets that label only on a `transfer`/`mint` surface, its own title-cased name otherwise; every other name as `callName` gives it), `authwitTitle(selector, consumer, surface)` (today's `authwitFunction` under `rowTitle`) and `authwitLine(surface, fn)` (`move` only for a transfer with an explicit sender). `tx-enrichment.ts` splits its label table so `tokenMovementLabel` and `plainMethodName` (today's fallback) are exported; `humanizeMethodName` is unchanged. The body's call titles and the discovered authorization's "Function:" use `rowTitle`/`authwitTitle`; the `createAuthWit` and simulate cards keep theirs.
- **`OperationCard.vue`** (`aztec_sendTx` only, above `op_divider`): the summary, then one `DetailsToggle` "Show all details" / "Hide all details", then, when open, today's body unchanged (Payload rows with `CallArguments`, the discovered authorizations block) with each authorization's details open by default (`closedAuthwits` replaces `openAuthwits`). `send_transaction` and every other kind are untouched.
- **`DetailsToggle.vue`** (new): today's toggle markup (native `<button>`, chevron, `aria-expanded`, `label` prop, testid by attribute). It replaces the two copies (Fact 5) and serves the new toggle. **`UnreadableArgsNotice.vue`** (new): the warning and notice, shared by `CallArguments` and the summary, so the copy lives once.
- **Testids:** every body testid kept, on the body. New: `execute-op-summary-calls`, `execute-op-summary-call` (`data-call-index`, `data-intent-kind`), `execute-op-summary-call-title`, `execute-op-summary-call-to`, `execute-op-call-line`, `execute-op-line-amount`, `execute-op-line-from`, `execute-op-line-to`, `execute-op-call-named`, `execute-op-summary-args-pending`, `execute-op-summary-unverified-warning`, `execute-op-summary-authwits`, `execute-discovered-authwit-line` (`data-message-hash`, `data-line-kind`), `execute-discovered-line-caller`, `-line-amount`, `-line-from`, `-line-to`, `-line-function`, `-line-consumer`, `execute-op-details-toggle`, `execute-op-details`; `data-call-index` on each body call. `execute-op-authwits-pending` moves with its line.
- **Inventory:** the three new `.vue` join `surfaces.expected.json`; the body's moved sites and the summary's new ones update `identifier-sites.expected.json`, each with the state that renders it (the summary's contract and the authorization line from the swept states in `type-roles-windows.test.ts`; the wallet-read call line from `tx-transfer-row.test.ts`; the token form of the authorization line component-only, no import added).
- **Not taken:** rendering `DecodedCall.contract`; a new value-moving predicate; collapsing an authorization; a summary line built from a dApp name.
- **Boundary with send-fees-ux (#503):** unchanged: this lane edits `OperationCard.vue` above `op_divider`, never `index.vue`'s fee gates, `FeeSettingsCard`, or `authwitSurface`'s `isEmbeddedFeePayment` rule. Shared files: `OperationCard.vue`'s `<style module>`, `identifier-sites.expected.json`, `type-roles-windows.test.ts`. The second PR to merge merges `origin/dev` first and reruns its gates.

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

### Phase 2: the signed answer (A, part 2 Yes)

- Assumes: R1 signed (A); Facts 2, 3, 5 and 6.
- Build the map above. The existing `OperationCard.*.test.ts` files read today's body, so each mount helper that reads a `aztec_sendTx` body presses `execute-op-details-toggle` first; no assertion is loosened.
- Tests: `call-surface.test.ts`: `rowTitle` (a decoded `transfer_public_to_public` on an unregistered token keeps its own name; a wallet-read one keeps its label; a non-token label such as "Shield" unchanged), `authwitTitle`, `authwitLine` (move only with an explicit sender; a mint and a decoded call read as `call`). `tx-enrichment.test.ts`: the six labels and nothing else answer `tokenMovementLabel`. `OperationCard.summary.test.ts` over the fixture: at rest every call's title, contract and line (transfer with the explicit sender by name, "Named by the app.", the unreadable warning and notice) and both authorization lines show, the body is absent and the toggle reads "Show all details" with `aria-expanded="false"`; one press shows the body with each authorization's details open; sender `account`, `none` and empty-symbol forms; a call mounted `pending`, then given raw (warning shows), then decoded; "Checking authorizations…" at rest while pending. The Phase 1 test stays green unchanged.
- **Gate:** `bun run audit:vue`; `bun run test:all`. Pass: exit 0, inventory green, `scripts/complexity-baseline/manifest.json` unchanged.

### Phase 3: real browsers and shots

- Assumes: Fact 4; the playground's buttons still open the window.
- `tx-sendTx-multicall.test.ts`: the summary lists `c.calls` items at rest. `type-roles-windows.test.ts`: `openExecute` for a send waits for the summary, asserts the body closed, presses "Show all details", then keeps today's `ready` wait; the containment check also covers the summary items and `stretchPayload` stretches their title and contract. The delegated flow sweeps the authorization line and its caller at rest, then opens the body (details open by default, no per-row press); the raw flow opens the body before the raw toggle. `tx-transfer-row.test.ts`: assert the wallet-read line (amount, sender, recipient) at rest, then open the body and keep today's reads. Failure mode: a role, overflow or missing line on the new rows in a real 400 px window, which jsdom cannot compute. No token import is added.
- Run each file at retry 0 with load1 below 150: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`, then again with `NULO_E2E_BROWSER=firefox`. Record each file's wall-clock before and after, per browser, in `lessons/phase-3.md`. Capture the window light and dark on both browsers into `~/.cache/nulo-backlog/execute-popup-readability/`.
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

Implementation (2026-10-16), after R1 was signed:

| # | Decision | Why |
|---|---|---|
| D15 | The map is redrawn for A: the summary in a new `SendTxSummary.vue`, `DetailsToggle.vue` for the three toggles, `UnreadableArgsNotice.vue` for the warning shared by the summary and `CallArguments`; C's `actionLine` is dropped (the summary reads the `CallSurface` it already has) | A signed; the summary is a block of its own, testable alone; one copy of the toggle and of the unreadable-call copy |
| D16 | "Checking authorizations…" renders at rest in the summary, not behind the toggle | a status, not a value row; hiding it would leave the authorizations slot silent at rest while they are being found (rule 2) |

## Seeds (draft; finalized after R1 and the orchestrator's approval)

- `/goal` Every phase of implementations-plan/execute-popup-readability/plan.md marked ✓, each backed by its gate's output in the transcript; `LESSONS_FILE=implementations-plan/execute-popup-readability/lessons/phase-N.md` printed per phase; `/code-review` not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against `dev` opened after it, with the close-out's archive-move commit shown by `git show --stat`; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/execute-popup-readability forward per its plan.md and the README's Post-implementation standard at `d59459ab`; never start Phase 2 before OWNER-ASKS R1 is signed; decide open questions with Codex, log each in lessons/.
