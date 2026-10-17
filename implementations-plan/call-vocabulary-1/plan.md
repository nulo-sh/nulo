---
plan: call-vocabulary-1
tier: light
status: approved by the orchestrator 2026-10-17; arc 1 implementing
issues: "#514 #575 #516 (one arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet) plus the driver's read; Codex audit (gpt-6.1-sol, high) and an Opus Plan leg; final fresh Codex pass
base: origin/dev at 2c0df3b9
trunk: dev
post_implementation_hardening: not scheduled
---

# call-vocabulary-1: one name for a call across the wallet

Three owner picks, one arc, one PR against `dev` (no stack, D-orch-1): Activity and the detail pages take the approval window's words (#514, P40-02 = A); the grant card shows a token-movement label only on a call the wallet read as one (#575, P36-01 = A); `DetailsToggle` gains `aria-controls` and a reduced-motion rule, nothing visible (#516, P40-01 = B). The owner's tooltip note on #516 is the orchestrator's to carry; not built (CLAUDE.md § Tooltips also bars a warning in a tooltip). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/`, `scripts/` or `implementations-plan/`.

## Issue claims that did not hold

- **#516**: the two execute copies are already one component, `popup/windows/execute/DetailsToggle.vue`. Only the two accessibility gaps remain.
- **#514**: "Mint to:" is the approval window's label, not the detail page's. The window reads a call as a movement only on a registered token whose decode corroborates the selector, not by signature alone (recon table).
- **#575**: of the three rows, only the `add_public_authwit` `call` content is reachable today.

## Outcome & Quality Bar

For a person reading their history after approving dApp calls. Excellent means:

1. A settled call reads as the wallet can read it from the record: movement words and glyph only on its own send or on a listed token's vocabulary call whose class it recorded; any other call by its own name with the generic call glyph.
2. One title rule in one function serves the window body, the grant card, Activity and the detail page; a test fails if a surface goes back to name-only labels.

Good enough: in-flight rows keep their titles (OA-4); a read transfer keeps "Transfer" (OA-1); the record cannot prove what the window's selector check proved (K1).

## Assumptions

**Facts** (read at 2c0df3b9):
- F1. `getTxCategory`/`getTxTitle` have two callers, `TransactionCard.vue:44,102` and `popup/pages/tx/[id].vue:68,74`; both hold the profile and chain's tokens (`TransactionCard.vue:38`; `tx/[id].vue:82,153`).
- F2. On a fresh send only the wallet's own send writes `transfers` (`wallet/services/execution/transfer-executor.ts:458`). Backup restore writes a row's `calls` as the file has them (`wallet/services/transaction/service.ts:627-629`).
- F3. A recorded `encoded_call` carries the function the PXE instance's class artifact has at its selector; a `call` action (wallet-internal producers only) its named function (`tx-request-builder.ts:194-216`, `contract-resolver.ts:42-52`). The recorded class is the node's current class, else the PXE's (`:576-582`): two independent lookups, expected to agree for a contract that was never upgraded when the node answers consistently. The default-entrypoint path and the grant's registry row record no class (`:460-464`, `:568`).
- F4. `txAmount` already trusts a listed token, its recorded class and the name and arity to show a mint's amount (`utils/tx-amount.ts:29-53`).
- F5. `rowTitle` (`popup/windows/execute/call-surface.ts:144-148`) is the window's rule: a movement label only for a `transfer`/`mint` surface; a name that claims one otherwise reads `plainMethodName`; any other name `humanizeMethodName(name, contract)`.
- F6. `OperationCard.vue:148-157` builds one grant `CallSurface` per `add_public_authwit` action, in action order. `OperationActionRow` gets none (`:255`, and `:496` for the unreachable `simulate_transaction` card).
- F7. A received mint is always a public record (`utils/received-display.ts:31-36`).
- F8. `tx/[id].vue` and `received/[id].vue` have no `lang="ts"`, so `vue-tsc` does not check them (lessons.md, vue-tsc); their tests must.
- F9. Home and History load tokens with one RPC after the rows paint (`RecentActivityView.vue:171`, `composables/useScopedTokens.ts:31-56`); a failed load leaves the list empty.

**Inferences**:
- I1. The class pin plus name and arity is the strongest reading a record supports; it is weaker than the window's selector and ABI check (K1). The reading uses today's token list: a contract listed after a call, with the person's approval, reads as a token from then on.
- I2. Until tokens load, a row shows the unread name and the zap glyph, then the label and its glyph. That is the window's own wording for a call it has not read yet (`callSurface` returns `pending`, `rowTitle` prints the plain name), so P40-02 covers it; OA-3 offers the owner two ways to avoid the switch.

**Asks**: OA-1 to OA-4 in OWNER-ASKS.md, all non-blocking: each ships today's form.

## Architecture & Implementation

- **One title rule** in `utils/tx-enrichment.ts`: `callTitle(method, contract, read)` returns `humanizeMethodName(method, contract)` when `read`; otherwise `plainMethodName(method)` for a name with a `tokenMovementLabel`, else `humanizeMethodName(method, contract)`. `rowTitle` delegates; its tests stay.
- **The settled reading** in `utils/tx-amount.ts`, beside the gate it reuses: a module-private `pinnedListedToken(call, tokens)` (the listed token at `call.contract` whose class the call recorded), used by `txAmount`, and an exported `settledReading(call, tokens)`: `"transfer"` for a non-empty `transfers`, or for `findTransferSignature(method, args.length)` on a pinned listed token; `"mint"` for a `STANDARD_MINTS` name with two arguments on one; else `null`.
- **Activity and the detail page**: `getTxCategory(calls, tokens)` is `settledReading(primary, tokens) ?? "tx"`; `getTxTitle(calls, tokens)` is "Transfer" for a transfer reading (OA-1), else `callTitle(method, contract, reading === "mint")`. `tokens` is a required argument. The detail page imports both explicitly, titles each Calls row `callTitle(c.method, c.contract, settledReading(c, tokens) !== null)` and gives it `data-testid="tx-call-method"`. `received-display.ts` labels `minted` "Mint (public)" (F7).
- **Grant card**: `OperationCard` computes per action `read`: for the k-th `add_public_authwit`, `grantRows[k].surface.kind` is `"transfer"` or `"mint"`; every other action gets `false`. `OperationActionRow` takes `read?: boolean` and titles each method `callTitle(name, contract, read ?? false)`.
- **`DetailsToggle`**: a required `controls` prop; `aria-controls` names it only while open, as `CapabilityDisclosure` does. Each parent makes the id with `useId()` (per authwit `${id}-${k}`) and sets it on its panel. `@media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }`.
- **Not taken**: (B) the signature-only fix, which titles any contract's `mint_to_private` "Mint (private)", the mislabel #575 removes; (C) recording the selector or the window's reading on each call, which is new persisted state for the K1 gap alone (D1).

## Security & Adversarial Considerations

- **Threat**: a dApp names a call on its own contract after a token function so the history dresses it as a movement. After the change a movement word needs a token the person listed, by their own add or a `registerToken` they approved, and a call that recorded that token's class (F3). Without one, the name shows as the contract spells it.
- **K1, known limit**: the record lacks evidence the window used, so a call it showed plain can settle as a movement: a listed custom token whose function shares a vocabulary name and arity but not its signature; or, on any listed token, a two-argument transfer that hides its msg_sender (`call-surface.ts:79-85`; the builder keeps the flag for execution, `tx-request-builder.ts:627-640`, not on the record, `:211-216`), which settles as "Transfer" with the send glyph, as it reads today. Consequence: a history label after the approval, on evidence `txAmount` already trusts for amounts. Filed as a closed `known-limit` issue at close-out; reopens when a record carries enough to corroborate the call as the window did (its selector alone does not: the window also checks ABI roles, value kinds and the sender), or on a report.
- **Backup import**: a hostile backup chooses `calls`, `transfers` and `classId` (F2). It can title a row anything today; the reading trusts those fields no more.
- **Inputs**: names reach `callTitle` bounded by `safeWire` in the window; recorded names are bounded by `wireTitle` on dApp paths, `action.method` is wallet-internal, restored names are unbounded and render as text. No new string reaches a log. No crypto, privilege or dependency change.

## UI impact

- **P40-02 = A** ("One vocabulary: Activity and the detail pages take the approval window's words (Transfer Ownership; Mint (private) or Mint (public) everywhere a mint is named; Minted retires; field labels keep the plain noun)"):
  - Activity row (Home, History): an unread call reads its own name with the zap glyph ("Transfer" + send arrow becomes "Transfer Ownership" + zap); a listed mint reads "Mint (private)" or "Mint (public)" (was "Mint"), faucet glyph kept.
  - Detail page: the header as the row; the Calls box gives an unread call its own name ("Transfer In Private" off a listed token; was "Transfer (private)").
  - Received page and its row: the chip reads "Mint (public)" (was "Minted"). "Mint amount", "Mint to:" and From "Mint" unchanged.
  - Same words as the window: `claim` and `claim_and_end_setup` off the Fee Juice contract read "Claim" and "Claim And End Setup" (were "Claim Fee Juice"); on Fee Juice unchanged.
  - Until tokens load, a listed mint or a dApp's read transfer shows the unread form first, the window's words for a call not yet read (I2); OA-3 asks whether to avoid the switch.
- **P36-01 = A** ("The same rule on the grant card: a token-movement label only on a call the wallet read as one; otherwise the call's own name, Transfer In Public"): the grant line names an unread `transfer_in_public` "Transfer In Public"; a registered token's corroborated grant keeps "Transfer (public)". As in the window body, a `claim` grant off the Fee Juice contract reads "Claim" (was "Claim Fee Juice"). The unreachable `simulate_transaction` card's rows take the same rule.
- **P40-01 = B**: nothing visible.
- **OA-1 to OA-4**, answered by the orchestrator (2026-10-17, D-orch: "ship-now form; the owner sees it on a decision page with the arc's screenshots"): a read transfer keeps "Transfer"; `mint_to_commitment` reads "Mint To Commitment"; the authorization, simulate and utility cards keep their labels; the token-load switch ships; in-flight rows keep their titles.
- PR body: every ship-now wording quoted; light and dark screenshots, before (dev) and after, of Activity, the detail page, the received row and the approval window (as #678: PNGs under `apps/extension/pr-screens/` in one commit, linked by its SHA, deleted in the next); the picks quoted by id and text; the measured length of the I2 switch on Home.

## Phases

### Phase 1: #514, the settled reading and one title rule ✓
- Change map: `utils/tx-enrichment.ts`, `utils/tx-amount.ts`, `popup/windows/execute/call-surface.ts`, `popup/components/modules/activity/TransactionCard.vue`, `popup/pages/tx/[id].vue`, `utils/received-display.ts` (label, header comment), `components/composite/activity/TransactionIncomingCard.vue:30` (comment), and `types/auto-imports.d.ts` and `types/.eslintrc-auto-import.json` as the build regenerates them.
- Tests: `tx-enrichment.test.ts` replaces the prefix describes (`:140-175`) with one table: own send → transfer/"Transfer"; vocabulary transfer on a pinned listed token → transfer/"Transfer"; the same call with no `classId`, with another class, unlisted, or with a wrong arity → tx and its plain name; `transfer_ownership` → tx/"Transfer Ownership"; pinned listed `mint_to_private`/`mint_to_public` → mint and their labels; `mint_to_commitment` → mint/"Mint To Commitment"; `claim` off Fee Juice → "Claim", on Fee Juice → "Claim Fee Juice"; no calls → tx/"Transaction" (kept from the old table). `TransactionCard.test.ts`: `transfer_ownership` passes `icon` "zap" (never "send") to `TransactionCardLayout` beside a listed mint passing "faucet" with "Mint (private)". `tx/[id].test.ts`: a mint's header and `tx-call-method`; an unread movement name plain; one deferred `getTokens` showing the plain title before it resolves and the label after. `received-display.test.ts:61` → "Mint (public)". `call-surface.test.ts` unchanged.
- **Validation gate**: `bun run lint`, `bun run typecheck:all`, `cd apps/extension && bun --bun vitest run src/utils src/popup/components/modules/activity src/popup/pages/tx src/popup/windows/execute/call-surface.test.ts`; all exit 0.

### Phase 2: #575, the grant card ✓
- Change map: `popup/windows/execute/OperationActionRow.vue` (`read` prop, `callTitle` with the contract; its two comments quoted by `scripts/type-roles/identifier-sites.expected.json` kept verbatim), `popup/windows/execute/OperationCard.vue` (per-action `read`, one binding).
- Tests: `OperationCard.authwit.test.ts` decodes a wire-shaped grant; its unregistered case (`tokens: []`) gains "Transfer In Public", never "Transfer (public)", and its registered case is the success control. One case with two grants, one on a registered token and one not, proves each line takes its own grant's reading. `OperationCard.test.ts:73-87` pinned the name-only label; it becomes "Transfer In Public".
- **Validation gate**: lint, typecheck:all, `cd apps/extension && bun --bun vitest run src/popup/windows/execute`; exit 0.

### Phase 3: #516, `DetailsToggle` accessibility ✓
- Change map: `DetailsToggle.vue`, `CallArguments.vue:133-140`, `OperationCard.vue:279-286,333-339`.
- Tests: in the tests that open each toggle (`OperationCard.summary`, `.fallback`, `.discovered` with two authwits), `aria-controls` names that toggle's own panel while open and is absent while closed; `utils/a11y-css.test.ts` pins `.chevron`'s `transition: none` under reduced motion.
- **Validation gate**: `bun run audit:vue`, `bun run test:all`; then the armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`) and the smoke files over the changed screens: `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/type-roles.test.ts tests/e2e/send-outcome-rows.test.ts tests/e2e/navigation.test.ts --retry=0`. No e2e file changes; no Firefox twin (no fixture, focus, window or activation change). The PR's smoke lanes run the rest.

## Delivery

- One PR from `worktree-call-vocabulary-1` against `dev`, after the local gates and the Codex loop; merge `origin/dev` first and read `index.md`/`lessons.md`. Title (81 characters): `fix(activity): one vocabulary for a call; the grant card labels only what it read`; body ends `Closes #514 #575 #516`.
- Open without labels; add `e2e:extension-smoke` only if its path filter skips the smoke lane.
- The close-out is the PR's final commits (README § Post-implementation standard, step 4): K1 a closed `known-limit` issue; an asked surface the owner has not decided by then (OA-2, OA-4) an `owner-decision` issue.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard, read at 2c0df3b9. Specific to this plan: step 1 absent (`code_review: off`); step 2 once over the whole diff after phase 3, `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Log rounds in `lessons/phase-1.md` and Audit verdicts. Teardown: `agent-worktree done call-vocabulary-1 --merged` once `implementations-plan/archive/call-vocabulary-1/plan.md` is on `origin/dev`.

## Decision ledger

| # | Question | Codex | Opus | Decision and reason |
|---|---|---|---|---|
| D1 | What "read as one" means on a settled record | reject: the class pin is not the window's corroboration | sound; stricter than the window on class | **A** plus K1 (Codex resume: K1 proportionate). Parity needs the window's whole corroboration on every record (selector, ABI roles, value kinds, sender), new persisted state for the missing corroboration K1 describes, which changes only a post-approval label. |
| D2 | A read transfer's title | coherent | sound | **"Transfer" kept**; the label is OA-1. |
| D3 | `mint_to_commitment` on a listed token | coherent | an ask | **Mint category, titled "Mint To Commitment"**, today's glyph and amount; the words are OA-1(b). |
| D4 | The grant reading's interface | fine | fine | **A `read` boolean**: the row needs one fact. |
| D5 | In-flight (journal) titles | fine as deferred | not a known limit: supported, every call | **Unchanged, OA-4**: reading them needs the primary call's contract, class and arity on the journal record, persisted state. |
| D6 | `aria-controls` | fine | fine | **Parent-owned id via a required prop**; the panels stay where they are. |

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high, session 01a14b46): reject. Accepted: F3 and F2 narrowed; `claim_and_end_setup` listed; I2 reworded with a deferred-load test; controls for missing class, wrong arity, two grants, the `icon` prop, two authwits; the armed smoke build and `audit:vue`. Argued: finding 1, as D1 and K1. **Resume**: conditional approve; K1 accepted as proportionate. Accepted: D1 and K1 no longer say a selector gives parity; F3 says the two class lookups are independent; OA-3 reframed (the switch is the window's pending wording, covered by P40-02; the ask offers alternatives); the registry row cited at `:568`. Considered and not taken: movement words only on known standard Token classes, which drops custom-token coverage, a product change.
- **Final fresh Codex pass** (new session 01a14b58): conditional approve, two document fixes, both applied: K1 also covers a hidden-sender transfer, which the record cannot tell apart; OA-4's option B must record the call's arity too. Empty-call cases kept in the new test table. Resumed: D1 still limited K1 to custom tokens; fixed. Resumed again: **approve** ("no remaining finding").
- **Opus Plan leg**: conditional approve. Accepted: the listing needs the person's approval (Security); today's-list note (I1); the input-bound wording; the load flip in UI impact (OA-3); the createAuthWit card in OA-2; the commitment mint as OA-1(b); D5 as OA-4, not a known limit; the `read` expression made exact; `pinnedListedToken` private; regenerated auto-import files and explicit imports; the comment at `TransactionIncomingCard.vue:30`. Not taken: an OWNER-ASKS entry for the #516 tooltip note (the orchestrator carries it).

## Seeds

Orchestrator-owned: no ELI5; the seeds are not run.

```
/goal implementations-plan/call-vocabulary-1/plan.md: phases 1-3 green in STATUS.md, the Codex loop converged (a resumed pass with no new material finding quoted), the PR open against dev with Closes #514 #575 #516, `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/call-vocabulary-1: read plan.md and STATUS.md; run the next unticked step and its gate; consult Codex on any decision; never change what a person sees beyond the plan's UI impact; stop after the PR's checks report.
```
