---
plan: contracts-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 0dc22a9c5
status: planned
---

# contracts-build-1: the Contracts page as R24 (named rows, both ids, origin, a View on Aztecscan action)

Settings → Developer → Account state → Contracts lists what the profile's PXE holds on the chain as "Contract" over a short address. Decision page 162 was signed on 2026-11-17 at 15:42 UTC (dev `0dc22a9c5`), no note:

> **P162-01 = R24.** "The Contracts page: as today, removed (R1), a better developer list (R2), known contracts grouped by origin (R3), today's rows with a chip and an Aztecscan action (R4), a parsed detail per contract (R5), or R2 built together with R4 (R24)" = R24. "R2 built together with R4 (not drawn separately: read R2's rows with R4's action at the right): the named rows, both ids with copy, origin where the wallet can say it, search, and one "View on Aztecscan" action per row following the explorer setting, withheld where no page can exist; the page stays in Developer and its copy stops saying "your account". One RPC change, no new state."

R2 as drawn: the chip, then "Instance" and "Class" in mono with copy, then the origin ("Added with your token", "Your account", "Added by Nulo, for fees", "Built into every wallet", else "Origin not recorded"), search over names, code names and both ids. R4 as drawn: an icon-only "View on Aztecscan" action whose label is its tooltip, following the Block Explorer setting and the chain, withheld on the account and the PrivateFPC.

One arc, one PR against `dev`, closing no issue. It changes what users see, so it does not land on its own: the orchestrator lands it on the owner's approve of its captures. Prototypes: R2 `9a0872dd4`, R4 `7b1ff5e94` (fixture rows; nothing read the PXE). Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md) (none). Proportion (lane brief): no plan audit round, no Opus; one Codex pass over the plan and the net diff after the gates.

## The RPC

`getContracts(networkId): string[]` keeps its name, shape and body: `backup()` calls it in-process and the restore pins name it. A new method beside it:

```ts
type ContractRow = { address: string; classId?: string; builtIn: boolean; name?: string }
getContractRows(networkId: string): ContractRow[]
```

The service lists the PXE's addresses (`pxeService.getContracts`) and reads each instance with `getContractInstance(info, address, { pxeOnly: true })`, which runs under the PXE service's `withPxeRead` and returns before the node or known-bundle tail. `classId` is the instance's `originalContractClassId` (what the PXE stores; absent only if the PXE lists an address it holds no instance for). `builtIn` is `isPxeProvidedContract` (the set the backup already skips); `name` is the compiled-in name of the six built-ins, from a map beside that set in `pxe-provided.ts` whose test pins 0x1–0x3 to upstream's `ProtocolContractAddress`. All failures go through `viaPxe`, so the page's error state and its retry stay as today. No artifact read, no node call, no stored key.

## Origin, the chip and the action

Origin is copy, derived in the popup from evidence it already holds, first match wins:

1. `builtIn` → "Built into every wallet";
2. one of the profile's accounts (`appStore.accounts`) → "Your account";
3. the PrivateFPC or the sponsored FPC (`isPrivateFpc`, `isSponsoredFpc`; both registered by Nulo's protocol FPC discovery, `fpc/service.ts`) → "Added by Nulo, for fees";
4. one of the wallet's token rows on this chain (`tokenService.getTokens(profileId, chainId)`; resolving a token's interface registers its contract, `token/service.ts`) → "Added with your token";
5. else "Origin not recorded".

The chip is `contractChipAt` (`popup/windows/execute/contract-chips.ts`, as the approval and fee windows read it): the signed list's reader (`useTokenFlags`), the chain, the token rows, and the person's names (`nameBookOf(contacts, accounts)`), with each built-in's compiled-in name added where the book has none, so it reads by that name in the unverified (no seal) form. It is passed no explorer: the row action carries the link, and a chip press with its own link would show it on the rows the action withholds.

The action: `getContractExplorerUrl(appStore.network.chainId, appStore.defaultExplorer, address)` (null under None and off Testnet and Mainnet), withheld on the profile's accounts and the PrivateFPC; a `RowAction` link labelled `View on ${explorerDisplayName(...)}` inside a `Tooltip` showing that label.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | A new `getContractRows`, not a widened `getContracts`. | The brief keeps `getContracts` byte-for-byte for the backup. One method, one row type; no per-row RPC from the popup. |
| D2 | The instance read is `pxeOnly`, one call per address, concurrently. | The backup reads the same way, sequentially and with the node tail; the page needs only what the PXE stores. Concurrent readers share the profile barrier's read side. A batched PXE method would widen `@nulo/aztec-runtime`'s RPC surface for one page. |
| D3 | Origin is derived in the popup (`contracts/contract-rows.ts`, pure), not in the service. | It needs the token rows, the signed list's reader and the accounts, which the popup already reads; the service depends on the profile service alone, and adding three dependencies for a developer page couples its start order. The brief's "service method's unit test ... the origin derivation" becomes the helper's test plus the service's rows and `builtIn` test. Codex is asked. |
| D4 | "Added with your token" comes from token rows only, not from a signed-list match. | **Claim that did not hold.** The brief names "a signed-list token on the chain or the wallet's token rows". A listed token the PXE holds without a token row was registered by something else (a dApp's call), so "your token" would be wrong there; the chip still shows it Nulo verified. Codex is asked. |
| D5 | Built-in names travel in the RPC row and enter the chip through the name book; no level is touched. | The addendum: the shared reader decides the level; once a `protocol` reading lands for 0x1–0x3 it outranks the book (the book serves only an unverified chip). The six names are the frame's ("Contract Class Registry", "Contract Instance Registry", "Fee Juice", "Auth Registry", "Multi Call Entrypoint", "Handshake Registry"). |
| D6 | Search: lower-cased substring over the chip's label and title, the compiled-in name, the person's name for the address, the origin words and both full ids; trimmed; the field keeps `stripBidiAndZeroWidth`. | **Claim that did not hold.** "Code names" need an artifact read, which the brief forbids at render time; only the six compiled-in names are searchable as names. |
| D7 | The copy edit is the empty state's line: "Contracts known to this profile on this network will appear here." | **Claim that did not hold.** The page has no description; that line is its only copy saying "your account". The headline, title, route, Settings search entry and index row stay. |
| D8 | Rows, token rows and contacts are read together; a failed token or contact read counts as none. | A missing token row or name only lowers what a row claims ("Origin not recorded", a short address); a failed rows read shows today's error and retry. |
| D9 | Accessibility (the owner's 2026-10-19 delegation): each copy is a native `RowAction` button (24 px, the house focus ring) labelled "Copy contract address" / "Copy class id", no tooltip (none was drawn); Tab order is chip, copy instance, copy class, action. The toasts are the existing "Contract address is copied" and "Class id is copied". | House primitives over the prototype's bare buttons; no new copy. |
| D10 | E2E: no new scenario. `network/type-roles-windows.test.ts` re-anchors on `contract-row` and asserts no `contract-row-explorer` on the sandbox chain while rows show. | That spec already opens the page on the sandbox; the gating itself is proven in the component test, which jsdom can run for every chain and setting. |

## UI impact

The sign-off is **P162-01 = R24**, quoted above.

- **Settings → Developer → Account state → Contracts**: each row reads the contract chip, "Instance" and "Class" short ids in mono with a copy action each, and the origin line; at the right the "View on Aztecscan" action where the chain and setting give a page, not on the profile's accounts or the PrivateFPC. No "Contract" title, no zap icon, no `AddressDisplay`. The search placeholder reads "Search by name or address". The empty state's line is D7's.
- Nothing else: no grouping, no detail page, no app origin, no time, no seal the shared reader does not give, no stored key.

## Security & Adversarial Considerations

- The rows are the PXE's own store, read locally; a dApp can add rows (its `registerContract`, or a call that registers what it touches) but cannot name one: a chip names a contract only from the signed list, the two pinned fee contracts, the person's own names or the compiled-in set (`contract-chip.ts`'s rule). Origin words never come from a dApp.
- The explorer URL is built only from a 32-byte hex address (`getContractExplorerUrl`), opened `noopener noreferrer`; withholding is a display rule, not a security boundary.
- Which contracts a profile holds is a privacy signal: the new method logs nothing per row; `viaPxe` logs the cause only, as today. No log line gains an address.
- No stored shape, permission, message type or secret changes; `snapshot.json` is untouched.

## Phase 1: the RPC, the page, its tests, the captures and the PR

Branch `contracts-build-1-a1` off `origin/dev` carrying this plan's commit.

**Change map**
1. `apps/extension/src/wallet/services/account-state/pxe-provided.ts`: the six compiled-in names and `pxeProvidedName(address)`.
2. `.../account-state/spec.ts`, `service.ts`, `client.ts`: `ContractRow`, `getContractRows` (D1, D2), registered in `rpcMethods` and the passthroughs.
3. `apps/extension/src/popup/pages/settings/developer/account-state/contracts/contract-rows.ts` (new, pure): origin, the action's URL with its withholding, the search text.
4. `.../contracts/index.vue`: R24 (`lang="ts"`), the reads of D8, the chip context, the row, search, D7.
5. Tests: `service.test.ts` (rows with class ids, `builtIn` and names, `pxeOnly` reads, a PXE failure through `viaPxe`; `getContracts` untouched); `pxe-provided.test.ts` (names pinned to upstream); `contract-rows.test.ts` (each origin kind, first match wins; the action on Testnet and Mainnet with Aztecscan, none under None, on chain 0 or for an account or the PrivateFPC); `contracts/index.test.ts` (wire-shaped rows: chip, ids, origin, action present and absent, search by name and by class id, today's paste cases).
6. `apps/extension/scripts/type-roles/identifier-sites.expected.json`: the `AddressDisplay` site replaced by the new id sites; `tests/e2e/network/type-roles-windows.test.ts`: D10.
7. Scratch, never committed: a capture spec and a capture-only fixture patch for the Testnet stub, from contracts-page-1's kit, into `~/.cache/nulo-backlog/contracts-build-1/shots/` with `captions.json`: `cb1-list-before` (base build, sandbox), `cb1-list-after`, `cb1-list-testnet`, `cb1-row-withheld`, `cb1-explorer-none`, `cb1-search`, `cb1-tooltip`, 400 px, light and dark.

**Gate** (retry 0, once, in order, from the root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging. Then one network run, Chrome, default prover mode: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts tests/e2e/network/backup-restore-integrity.test.ts` (the second exports a backup through `getContracts`). No fixture or helper changes, so no Firefox run; no full suite. Pass: every command exits 0; the new unit cases fail on the base code.

Then the one Codex pass (gpt-6.1-sol, high, read-only) over this plan and `git diff origin/dev...HEAD`, with the standard's two verbatim rules, asked about: `getContracts` and the backup path unchanged in behaviour; the instance read staying PXE-local under the read lock; the action's gating (setting, chain, unpublished rows); whether any origin word can be wrong for a contract the wallet holds (D3, D4). A second round only if it does not approve. Then push and open the PR ready without labels. Title (80 characters): `feat(contracts): named rows with both ids, origin and a View on Aztecscan action`. The body carries the pick under `## Sign-off (decision page 162)`, the D9 accessibility call, the gates with outcomes, `cb1-list-before` and `cb1-list-after` embedded from `pr-captures/contracts-build-1/` (committed, then removed in the next commit), no `Closes` and no `Part of` line. Then `gh pr checks --watch` once.

## Delivery and post-implementation

One arc, one PR. The Post-implementation standard (`implementations-plan/README.md` at `0dc22a9c5`) applies with its bounded-work clause: one Codex pass, then targeted verification of material fixes. The close-out (Outcome, archive move, index line) goes in this PR's final commits after merging `origin/dev`. The orchestrator lands the PR and tears down the worktree.

## Seeds

- `/goal`: Ship P162-01 = R24 on the Contracts page as this plan says; PR open, ready, checks green, close-out committed.
- `/loop`: check the PR's checks; on red, read the failure, fix at the cause or rerun one known flake, and stop when green.

## Assumptions

- F1. The PXE lists only addresses it holds an instance for, so `classId` is present on every real row; the page omits the Class line otherwise.
- F2. `appStore.accounts` holds every account of the active profile on the active chain (set on each network switch, `popup/app.vue`), hidden or imported ones included: the PXE's own scope.
- **Asks:** none.

## Audit verdicts

- Plan audit: none (the lane brief's proportion).
