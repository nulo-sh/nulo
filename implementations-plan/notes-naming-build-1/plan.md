---
plan: notes-naming-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 0dc22a9c5
status: in progress
---

# notes-naming-build-1: "Token (AIP-20)" for the listed tokens' notes, and the protocol contract chip

The owner's 2026-11-17 list asked to rename the token notes' "Wonderland Token" and to name the protocol contract behind "Claim Fee Juice on 0x0…03". Lane notes-naming-1 rendered the options; decision page 161 was signed on 2026-11-17 at 15:45 UTC (dev `0dc22a9c5`). The two picks, verbatim, are the sign-off and the whole visible budget:

> **P161-01 = T3** (14:42 UTC), no note. "The listed tokens' notes: Wonderland Token (today), Token Standards (T1), AIP-20 (T2) or Token (AIP-20) (T3)". The page: "Token (AIP-20): the contract's own name with the standard beside it, like the table's other entries (Aztec Token, Private FPC). 166 px, fits with 15 px to spare (Token (AZIP-20) would need 174 and also fit). Claims nothing about other AIP-20 classes."

> **P161-03 = P1**, note: "P1 but without the 'Protocol' chip." (15:45 UTC). "The protocol contract behind a Fee Juice claim: a bare address (today), the approval window's chip with a Protocol badge (P1), plain text "Fee Juice (protocol contract)" (P2), or no contract line with the address moved into Details (P3)". The page: "The approval window's chip: "Fee Juice" with the solid seal, then an info badge "Protocol"; the chip's press reads "Fee Juice", "Nulo knows this contract. Knowing it isn't a promise that it's safe.", "It's part of the Aztec protocol, at the same address on every network.", then the address. 60 px row (+2). Built with the protocol reading in the shared contract reader, the approval window's step line gets the same chip, so the "Unknown contract" press goes too."

The note removes the "Protocol" badge only. P161-02 (custom notes) is not in this lane. One arc, one PR against `dev`, closing no issue. It changes what users see, so the orchestrator lands it on the owner's approve of its captures. Prototypes: T3 `49ff0d551`, P1 `c1a017b35` (local, read by hash). Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md) (none).

Proportion (lane brief): no plan audit round, no Opus; one Codex pass over this plan and the net diff after the gates.

**Claims that did not hold, or needed a correction.** (1) The P1 prototype drew the chip outside the reader (`protocolChipOf` called by the page); the build puts the reading in `readContract`, as the pick says. (2) A second consumer of `readContract` exists: the approval window's app-paid fee row seals any `nulo` reading that is not a token (`OperationCard.vue` `feeSealed`), so a dApp naming 0x…03 as its fee payer would gain the seal; D4 keeps the row as it is. (3) `note-schemas.test.ts` hashes no class ids (bb.js faults under jsdom), so the name pin uses `note-schema-reset.test.ts`'s mocked-hasher pattern (D6).

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | `ContractReading` gains `{ level: "nulo"; source: "protocol"; name: string }`. `readProtocolContract(address)` in `utils/contract-level.ts` returns it for 0x01, 0x02 and 0x03, else `undefined`; `readContract` calls it right after the flag check, beside the two pinned fee contracts. | A protocol address is a protocol constant (`@aztec-labs/constants` 6.0.0: `CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS` 1, `CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS` 2, `FEE_JUICE_ADDRESS` 3; `protocolContractNames` lists exactly these three), so it needs neither the list nor a chain, as the pins do; a signed flag still outranks it once the list answers, as it outranks the pins. The match is the lower-cased canonical 66-character string, so any other spelling (`0x3`, a derived protocol address) reads as before. One exported function keeps the detail page, which holds no list reader, on the same source. |
| D2 | `contractChipOf` draws `protocol` as `chip(name, false, "nulo", { mark: null, title: name, lines: [KNOWN, PROTOCOL], address })`, `PROTOCOL` = "It's part of the Aztec protocol, at the same address on every network." No badge. | The pick's press, word for word; the owner's note drops the badge. The accessible name reads "Fee Juice, Nulo verified", as the pinned fee contracts' do. |
| D3 | The names live in a new `utils/protocol-contracts.ts`: Fee Juice from `feeJuiceAddress` and `feeJuiceName` (`wallet/utils/fee-juice.ts`), the registries as "Contract class registry" and "Contract instance registry". | The brief names this file or `known-contracts.ts`. That one is the permission window's per-profile table under `wallet/services` (FPC pins, verified seeded defaults); the reader would then depend on profile state for three constants. Reusing `feeJuiceName` keeps one spelling of "Fee Juice". |
| D4 | `feeSealed` in `OperationCard.vue` seals only `source === "fpc" \|\| source === "sponsor"`. | The row's rule is "only for a fee contract Nulo pins" (its comment). With D1, a hostile dApp naming 0x…03 as `feePayer` (classified `fpc`) would seal the row: a dApp-controlled input raising a mark on the app. Not in the pick, so the row stays as it is; a never-happens test pins it. |
| D5 | The detail page's call row: for a protocol contract, `<span data-testid="tx-call-contract">` wraps `ContractChip` (label testid `tx-call-contract-name`), built by `contractChipOf(readProtocolContract(c.contract), c.contract)`; every other call keeps the short address and its click-to-copy. No explorer link in the press. | The testid stays on the element that shows the contract. The page has no list reader and the pick changes only protocol rows, so it reads no list (a listed token's call row stays a bare address). The press carries the short address, as P1 was drawn; its row's click-to-copy goes with the bare address, for these three constants only. |
| D6 | `note-schemas.ts`: the aztec-standards Token entry reads "Token (AIP-20)". The catalog key `wonderlandToken` and the `@wonderland-token-artifact` alias stay; the slot test's title is renamed. The pin: `note-schemas.test.ts` mocks the class-id hasher with an id derived from each artifact's name and storage fields, loads the real schema map and reads the entry under the aztec-standards artifact's id. | Spelling AIP-20 (upstream's). The key is internal and shared with known-artifacts and the vite alias; renaming it moves three files for no visible change. Deriving the mock id from the artifact binds the name to the class, not to load order. |
| D7 | Accessibility (the owner's 2026-10-19 delegation): a protocol call row on the detail page gains one Tab stop, the chip's native button with its 2 px focus ring, Escape and the press's focus hand-off. | The chip is the shared component, the same stop it is in the approval window; the bare address it replaces was not focusable. |
| D8 | No e2e scenario added. | Every point is unit- or component-provable (a reading, a model, a rendered row); no spec selects a protocol contract's row today. |

## UI impact

The sign-offs are **P161-01 = T3** and **P161-03 = P1 without the Protocol badge**, quoted above.

- **Notes page** (Settings → Developer → Account state → Notes): a note of the aztec-standards Token class (every listed token: Test USDC, USDT, EURC, GBPC) reads "UintNote · Token (AIP-20)", no longer cut at 400 px. Searching "wonderland" finds nothing.
- **Transaction detail, Calls**: a call on 0x…01, 0x…02 or 0x…03 shows the chip "Fee Juice", "Contract class registry" or "Contract instance registry" with the solid seal in place of the short address; the press as quoted. Other calls unchanged.
- **Approval and raised-fee windows**: every chip that reads 0x…01 to 0x…03 (a step's "on" contract, a transfer's parties, an authorization's consumer and caller) reads the same chip; their "Unknown contract" press ("Nulo hasn't checked this contract.") goes.
- Unchanged: the fee row's seal (D4), the permission window's "Nulo knows" list, every other chip's level, every "Claim Fee Juice" title.

## Security & Adversarial Considerations

- **What the change trusts.** Three addresses read "Nulo verified" from the address alone. Attacker: a dApp that writes calls, fee payers and authorizations. It cannot place its own code at 0x…01 to 0x…03: those addresses are fixed by the protocol and no deployment derives them; any other spelling fails closed to `none` (D1). A real call on Fee Juice wears the seal truthfully; the press still says knowing is no promise of safety.
- **Boundary kept.** Nothing a dApp sends (a name, a contract's self-declared name) reaches a protocol chip: the label is the table's. The fee row cannot be sealed by naming a protocol address (D4).
- No storage, message, permission, secret or log change; `snapshot.json` untouched.

## Assumptions

- F1. The registries' names are the render lane's wording (NOTES § N3), named in the lane brief and in the orchestrator's addendum to contracts-build-1; they ship and the PR body lists them for the decision page.
- **Asks:** none.

## Phase 1: the build, its tests, the captures and the PR

Branch `notes-naming-build-1-a1` off `origin/dev` carrying this plan's commit.

**Change map** (paths under `apps/extension/src` unless rooted)
1. `packages/aztec-runtime/src/pxe/note-schemas.ts`: the string (D6).
2. `utils/protocol-contracts.ts` (new, D3); `utils/contract-level.ts` (D1); `components/composite/contract-chip.ts` (D2).
3. `popup/pages/tx/[id].vue` (D5); `popup/windows/execute/OperationCard.vue` (D4).
4. Tests: `wallet/services/note/note-schemas.test.ts` (the pin; title); `utils/contract-level.test.ts` (0x01 to 0x03 before the list answers, on any chain and none, upper case; a flag outranks; 0x…04 and `0x3` read `none`); `components/composite/ContractChip.test.ts` (the protocol chip: label, level, seal, accessible name, press title, lines, address, no mark); `popup/pages/tx/[id].test.ts` (a claim row's chip under `tx-call-contract`, `tx-call-method` "Claim Fee Juice"; the other call's short address as control); `popup/windows/execute/SendTxSummary.test.ts` (a wire-shaped claim call on 0x…03: the "on" chip reads "Fee Juice", sealed, its press without "Unknown contract"); `popup/windows/execute/OperationCard.fee.test.ts` (a fee payer at 0x…03 draws no seal; the pinned ones still do). The "Claim Fee Juice" pins stay untouched.
5. Scratch, never committed: notes-naming-1's fixture and capture spec (`1c217efa3`), plus a capture-only claim entry for the execute fixture, on the armed smoke build, light and dark, 400 px, into `~/.cache/nulo-backlog/notes-naming-build-1/shots/` with `captions.json`: `nnb1-token-before`, `nnb1-token-after`, `nnb1-claim-before`, `nnb1-claim-after`, `nnb1-claim-press`, `nnb1-window-after`.

**Gate** (retry 0, once, in order, from the root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging. Then the specs the change reaches, Chrome: smoke `tests/e2e/execute-steps.test.ts` (chips and presses) through the smoke harness; network in one `e2e:agent` run: `type-roles-windows.test.ts` (`note-contract`, chip roles), `fee-sponsor-funding.test.ts` (the fee seal), `tx-transfer-row.test.ts` and `tx-sendTx-default.test.ts` (an unlisted token's chip reads `none`). No fixture or helper changes, so no Firefox. Pass: every command exits 0, and the new cases fail on the base code.

Then the one Codex pass (gpt-6.1-sol, high, read-only) over this plan and `git diff origin/dev...HEAD`, with the standard's two verbatim rules, asked: can the protocol reading ever mark a non-protocol address; does the seal without a badge misread anywhere the chip appears; was any "Claim Fee Juice" pin loosened. A second round only if it does not approve. Then push and open the PR ready without labels. Title (88 characters): `fix(notes): "Token (AIP-20)" for listed tokens' notes, and the Fee Juice chip on a claim`. Body: `## Sign-off (decision page 161)` with both picks verbatim, the change and why, the D7 accessibility call, the gates with outcomes, `nnb1-token-after` and `nnb1-claim-after` embedded from `pr-captures/notes-naming-build-1/` (committed, then removed in the next commit). No `Closes`, no `Part of`. Then `gh pr checks --watch` once.

## Delivery and post-implementation

One arc, one PR. The Post-implementation standard (`implementations-plan/README.md` at `0dc22a9c5`) applies with its bounded-work clause. The close-out (Outcome, archive move, index line) goes in this PR's final commits after merging `origin/dev`. The orchestrator lands the PR and tears down the worktree.

## Seeds

- `/goal`: Ship P161-01 = T3 and P161-03 = P1 without the badge as this plan says; PR open, ready, checks green, close-out committed.
- `/loop`: check the PR's checks; on red, read the failure, fix at the cause or rerun one known flake, and stop when green.

## Audit verdicts

- Plan audit: none (the lane brief's proportion).
