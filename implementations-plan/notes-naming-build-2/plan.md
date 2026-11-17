---
plan: notes-naming-build-2
tier: light (thinned: no plan audit round, no Opus leg; one Codex pass over this plan and the net diff)
status: planned
issues: none (closes no issue)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 33906a052
trunk: dev
post_implementation_hardening: not scheduled
---

# notes-naming-build-2: a custom note card names its contract through the chip

The owner asked on 2026-11-17 (P168-01): "Instead of constantly saying "The name NFT comes from the contract's code. Nulo hasn't checked it" -- why don't we use our verification tier system on the note's contract address? or note's address?". Lane notes-naming-3 rendered three answers; decision page 174 was signed on 2026-11-17 at 19:51 UTC (dev `28695db80`). The two picks, verbatim, are the sign-off and the whole visible budget:

> **P174-01 = L1** (19:51 UTC). "The custom note card's contract through Nulo's levels: the contract chip in the header (L1), the chip plus the code name (L2), or the caveat once per contract (L3)". Note: "Use the correct copy, without double-stating "Nulo hasn't checked this", the one we have already approve for unverified stuff please."

> **P174-02 = k1** (19:50 UTC), no note. "k1 = the known cards' table names stay as they are, the chip only on cards whose contract the reader can place".

The note means the chip's existing press carries the words (title "Unknown contract", then `uncheckedLines(selfName)` in `components/composite/contract-chip.ts`) and the card writes no caveat of its own. The prototype's press still stated "Nulo hasn't checked this contract." above the name sentence (its base predates #1837); #1837's approved copy says it once, one line, and dev's chip already carries it. No new copy anywhere. Prototype: L1 at `4370e5139` (local, read by hash). Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md) (none).

**Claims that did not hold.** (1) The brief's "before" frame is "dev: the caveat sentence"; no caveat ever shipped. On dev the service reads no artifact, so a custom note is "Custom Note", the 4+4 address, raw items, no name, no location; the before frame shows that. (2) The brief expects `type-roles-windows.test.ts:666` to need the 8+4 form. Under k1 it does not: the sandbox's pull token is the `noir-contracts.js` Token, whose notes match the table's "Aztec Token" entry (the sweep's `record-value` state needs that schema), and its fresh sandbox address is on no signed list, so the reader places nothing and the card keeps today's span. The wait stays; the identifier-site row moves only if its `branch` text moves (the generator decides).

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | `NoteService.readNotes` gains a `codeNames` flag that only `getNotes` sets. With it, a note no schema matched, whose class id resolved, takes `contractName` = `artifact.name`, `contractNameFromCode: true`, and `location` = the `storageLayout` key whose canonical slot equals the note's (none when no key does, as for a slot derived inside a `Map`). The artifact is read once per class per batch (a `Map<classId, Promise>` beside `classIdByContract`) through `pxeService.getContractArtifact`, best-effort: a failed read logs a warning and leaves the raw card, never a `renderError`. | `getNotesRaw` feeds the incoming-transfer poll, which reads neither field (notes-naming-2's grep), so the read is pure cost there. Resolution is local only (`artifact-registry.ts`: the compiled-in bundle, then this PXE, each class-id-verified), so no fetch leaves the device. Matched notes are untouched, so a table name always wins and a matched schema without a name stays `undefined`. |
| D2 | `spec.ts`: `Note.contractNameFromCode?: true`; `contractName`'s doc comment says both sources. | Without the mark the page cannot tell a table's name from a code-chosen one. |
| D3 | The page builds each card's chip inside `buildDisplayNote` (so a reader throw becomes the existing fallback card, which has no chip): `readContract(marks, appStore.network?.chainId, contract)` then `contractChipOf(reading, contract, { selfName })`, `selfName` = the code name only. **Custom card** (no schema, `note.type` unset): always the chip; the header prints the code name, through `sanitizeWireString(name, 64)`, only beside `nulo` or `scan` (L1). **Known card** (schema matched): its table name, and the chip only where the reader places the contract: `nulo`, `scan`, or a signed flag (k1); otherwise, and while pending, today's 4+4 span. **A card with `renderError`**: no chip, today's span. | L1 and k1 as signed. "Place" = the reader holds evidence about the address; a signed flag is such evidence, and on a known class it is the realistic case (a scam token deployed from a standard class). The chip carries the approved words, so the card writes no sentence (the note). The chip model is unchanged. |
| D4 | The location line renders through `sanitizeWireString(location, 64)`. | It is now code-supplied text from any contract a dApp registers; the chip caps a code name the same way. |
| D5 | Search reads what the card shows: type, the shown name, the location, and the address as shown (the chip's label where a chip shows, else the 4+4 span). A hidden code name is not searchable. | The owner's P176 deviation D6 (no code names in search on the Contracts page) is the precedent. The chip shows the 8+4 form or a list symbol, so a search for what a person sees must read the label. Codex weighs this in its pass. |
| D6 | `PriceServiceClient` + `useTokenFlags` (the network-free list read, no price fetch) are created in the page's service-client block; `onBeforeUnmount`: `noteService.disconnect()`, `priceService.disconnect()`, then `marks.dispose()`. | CLAUDE.md § Cleanup order (service before composable dispose), as the approval window does. |
| D7 | Accessibility (the owner's 2026-10-19 delegation): each chip is one more Tab stop, a native button with the 2 px ring, after the card's own `RowTarget`; its slot sits above the stretched target (`position: relative; z-index: 1`) and stops the click, so a press opens the chip's card and never the data viewer; Escape closes it, as on every Popover. No explorer link in the press. | The shared chip as the approval window has it; the bare span was not focusable. |
| D8 | No e2e scenario added; no e2e edit. | Every point is unit- or component-provable; no sandbox state holds a custom note or a listed address (claim 2). |

## UI impact

The sign-offs are **P174-01 = L1** with its note and **P174-02 = k1**, quoted above. Surface: Settings → Developer → Account state → Notes.

- A custom note card (no table entry) reads "Custom Note" with the chip in place of the bordered 4+4 address: an unknown contract shows the 8+4 short address, no seal; its press reads UNVERIFIED, "Unknown contract", then "The name NFT comes from the contract's code. Nulo hasn't checked it." (or "Nulo hasn't checked this contract." when no name was read) and the address. The location line ("private_nfts") appears under the header. A listed contract's chip reads its symbol with the list's mark and seal, and only then does the header add the code name ("Custom Note · Token").
- A known card keeps its table name ("UintNote · Token (AIP-20)"); on a listed, pinned or protocol address its address becomes that chip (USDT with mark and seal); elsewhere it stays the 4+4 span.
- No card shows a caveat sentence.

## Security & Adversarial Considerations

- **Attacker:** a dApp that registers a contract of its own and has it create notes for the account. It chooses the artifact's `name` and storage field names. The name never heads an unverified card and never enters search (D3, D5); it reaches the person only in the press, prefixed "The name … comes from the contract's code", capped and stripped of controls; the location is capped the same way (D4). It cannot raise a level: the reader reads only the signed list, the build's pins and the protocol constants.
- **Bound is not checked.** `artifact.name` is bound to the class id (the class-id verification in `artifact-registry.ts`), but its author chose it; that is why it heads only a vouched card.
- **Failure isolation:** an artifact read that fails leaves the raw card (D1); a reader throw becomes the fallback card (D3). The incoming-transfer poll does not pay for the read.
- No storage, message, permission, secret or log-content change; one new `logWarn` carries the class id and the error under named keys.

## Assumptions

- A1. k1's "place" includes a signed flag (D3); the PR body names it for the decision page.
- A2. A Private FPC note reads "UintNote · Private FPC" beside the pinned chip "Private Fee Juice" (the name the fee card gives it): two names on one card, by code trace, a consequence of k1 that no frame drew. It ships as k1 says; the PR body names it.
- **Asks:** none.

## Phase 1: the build, its tests, the captures and the PR

Branch `notes-naming-build-2-a1` off `origin/dev` carrying this plan's commit.

**Change map** (paths under `apps/extension/src`)
1. `wallet/services/note/service.ts` (D1), `wallet/services/note/spec.ts` (D2).
2. `popup/pages/settings/developer/account-state/notes/index.vue` (D3 to D7).
3. Tests: `wallet/services/note/service.test.ts`: an unmatched note with an artifact takes its name, mark and slot's field name; a slot with no layout entry takes the name but no location; one artifact read per class across notes; a failed read leaves the raw card (no name, no `renderError`); a matched schema keeps its table name and reads no artifact; `getNotesRaw` reads no artifact. `popup/pages/.../notes/index.test.ts`: an unverified custom card shows the chip (8+4 label, `data-level="none"`), "Custom Note" with no name, the location, and no caveat sentence; a listed custom card's chip reads the symbol with its mark and the header adds the code name; a known card keeps its table name with the span on an unlisted address and the chip on a listed one; a flagged known card shows the chip; a chip press opens the chip's panel and not the data viewer; search does not find a hidden code name and finds the chip's label; unmount disconnects the price client, then disposes.
4. `apps/extension/scripts/type-roles/identifier-sites.expected.json`, only as `inventory.test.ts` requires; the PR names the role each moved or new site takes.
5. Scratch, never committed: the notes-naming-3 fixture and capture spec copied onto a local capture branch (plus a `raw` kind for dev's real card), on the armed smoke build through the smoke harness, light and dark, 400 px, into `~/.cache/nulo-backlog/notes-naming-build-2/shots/` with `captions.json`: `nnb2-unverified-before` (origin/dev), `nnb2-unverified-after`, `nnb2-unverified-press`, `nnb2-listed-after`, `nnb2-known-after`.

**Gate** (retry 0, once, in order, from the root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging. Then one `e2e:agent` run of `tests/e2e/network/type-roles-windows.test.ts` on Chrome and one on Firefox (the only network spec that opens the notes page; `git grep` of `note-contract` and the route). Pass: every command exits 0, and each new case fails on the base code.

Then the one Codex pass (gpt-6.1-sol, high, read-only) over this plan and `git diff origin/dev...HEAD`, with the standard's two verbatim rules and its adversarial ask, asked: the reader's and the artifact read's failure isolation; the client lifecycle order; the search decision (D5); that no new copy exists; that k1's "place" (A1) is sound. A second round only if it does not approve. Then push and open the PR ready, without labels. Title (82 characters): `fix(notes): a custom note card names its contract through the chip, no caveat line`. Body: `## Sign-off (decision page 174)` with both picks and the note verbatim; the change and why; the D7 accessibility call; `## Deviations` (claims 1 and 2, A1, A2, the inventory roles); the gates with outcomes; `nnb2-unverified-before` and `nnb2-unverified-after` embedded from `pr-captures/notes-naming-build-2/` (committed, then removed in the next commit). No `Closes`. Then `gh pr checks --watch` once. The PR does not land on its own: the orchestrator reads the captures against the frames the owner picked.

## Delivery and post-implementation

One arc, one PR. The Post-implementation standard (`implementations-plan/README.md` at `33906a052`) applies with its bounded-work clause. The close-out (Outcome, archive move, index line) goes in this PR's final commits after merging `origin/dev`. The orchestrator lands the PR and tears down the worktree.

## Seeds

- `/goal`: Ship P174-01 = L1 and P174-02 = k1 as this plan says; PR open, ready, checks green, captures in place, close-out committed.
- `/loop`: check the PR's checks; on red, read the failure, fix at the cause or rerun one known flake, and stop when green.

## Audit verdicts

- Plan audit: none (the lane brief's proportion).
- Codex, one pass over this plan and the net diff: pending.
