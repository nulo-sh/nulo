---
plan: backup-contracts-1
tier: mid
status: arc 1 building (owner decision page 201: OA-1 A, OA-2 A, OA-3 A)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual review (Codex gpt-6.1-sol high + Opus Plan); one fresh final Codex pass; at most two in-process agents at once
base: origin/dev at 8ae2c06a4
trunk: dev
post_implementation_hardening: not scheduled
---

# backup-contracts-1: a full backup that stores each contract's code once per class

Recon and measurements: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Live log: [STATUS.md](STATUS.md).

The owner (2026-11-23, page 200) rejected three message-only answers to the backup's contract limit: "Seems like this are lazy solutions." This plan removes the cause: the `account-state` part stores one artifact per **registered contract**, so its size grows with the count of contracts. It plans the three steps the lane names, recommends one, and builds nothing until approval.

| Arc | Phases | What it does | Waits for |
|---|---|---|---|
| 1 | 1-4 | Format 2 of the part: each class's artifact once, debug info left out; reads every older file | approved (page 201) |
| 2 | 5 | Step 2: leave out the code of classes the wallet ships | not built (OA-1 = A) |
| — | — | Step 3 (fetch code at restore) is designed below, not planned as an arc | not built (OA-1 = A, OA-2 = A) |

## Outcome & Quality Bar

**For whom.** A person who holds tokens on two networks, has a few accounts, and uses a couple of apps. Today their full backup's `account-state` part is at 85-99% of what an import accepts (recon: the typical profile). The maintainer who reads `account-state/` next.

**What excellent looks like.**
- The part's size grows with the number of distinct contract classes, not instances: 32 tokens of the standard class measure under 2 million code units (today 58.8 million), and the typical profile under 6 million (today 35.8 to 41.7 million).
- Every backup that restores today restores the same contracts and senders after the change; an older build meeting a new file fails in a defined, bounded way (OA-3).
- No screen, copy or layout changes. No new store, lifecycle, permission, RPC method or setting.

**Good enough.** No e2e scenario is added: the format is proven at the unit layer with real artifacts and real class-id hashing, and by the existing network round trips whose fixtures edit the part.

## Assumptions

**Facts** (sources in [recon.md](recon.md)):
- F1. Each registered contract carries a full artifact: the shipped token weighs 1,835,882 code units, a Schnorr account 1,420,088. 23 tokens measure 42,253,280, over the import's cap of 41,943,040.
- F2. Many instances share one class (token instances differ only in salt, deployer, init and immutables hashes), and the PXE already stores artifacts per class.
- F3. The part is a `non-storage` backup slice. It passes the storage migrator verbatim. `aztec-version` is stamped and never read. An older build skips an object-shaped part in `remapNetworkIdByChain` and its normalizer returns one bounded violation.
- F4. The class id does not commit to `debugSymbols` or `fileMap`. The build already ships the token and the private FPC without them.
- F5. `PxeService.registerContract` writes the wallet's own copy of a class (the catalog, else a copy the PXE store already holds) over any supplied artifact (`packages/aztec-runtime/src/pxe/service.ts:454`); only the catalog copy is the wallet's own code, a stored copy came from an earlier registration.
- F6. The node cannot serve an artifact. Aztecscan serves one by class id only with a shared key; on 2026-11-11 it held none for any v6 class, and today's count is unknown (not read: it needs the key).
- F7. Restore result records echo each contract object with its artifact back over the SW → popup channel (`account-state/service.ts:485-501`).

**Inferences** (to challenge):
- I1. Leaving out debug info changes diagnostics only: `getFunctionDebugMetadata` (`stdlib/dest/abi/abi.js:258`) finds no source map in an empty `debugSymbols`, so a simulation error trace of a restored app contract loses its Noir source locations, and a public revert also loses the contract and function names `@aztec-labs/pxe` adds only with debug info (`error_enriching.js:67-79`; private and utility errors keep them); class id and bytecode are unchanged. The loss is permanent for that profile: the PXE keeps the first copy of a class and the seam prefers it, so a dApp that registers the full code later does not restore the locations. Whether a screen, a log export or a dApp-facing error shows them is unverified; OA-1 lets the owner keep debug info.
- I2. An older build meets a format-2 file mainly during store review lag (a Chrome export restored on an older Firefox build); unmeasured, and an older build can stay installed longer.
- I3. A real profile holds fewer than 10 distinct unshipped classes. This, and the "typical" and "heavy" profiles in recon, are hypotheses; nothing measures the population.
- I4. Restore time stays inside the 30 s per-network budget for 32 instances of one class, since only the class's first registration in a call carries the artifact (P3); not timed on a PXE.

**Asks** (in [OWNER-ASKS.md](OWNER-ASKS.md)), answered on decision page 201, signed 2026-11-24T12:25Z:
- OA-1 **A**: "Step 1 only. Each contract class's code is stored once per file, without its debug information."
- OA-3 **A**: "The new file holds one list of code for all networks. An older build restores accounts, tokens, contacts and settings, and refuses the contract part: View errors lists one record for it, reading "malformed account-state slice (not an array)". It sets no Restore again reminder."
- OA-2 **A**: "Never fetch."
- The owner's note on signing: "I'm a bit scared of this backup change. Please, let's test the options thoroughly." Arc 1 answers it with the evidence table in § Phases (E1-E8).

## Architecture & Implementation

### Format 2 of the part (step 1)

```ts
type AccountStateSliceV2 = {
  format: 2
  classes: Array<{ classId: string; artifact: ContractArtifact }>   // one entry per class id
  items: Array<{ networkId: string; chainId?: number; senders: BackupSender[]; contracts: Array<{ address: string; instance: ContractInstanceWithAddress }> }>
}
type AccountStateSlice = BackupAccountState[] /* format 1, every file written before */ | AccountStateSliceV2
```

- `classes` is an array, not an object keyed by class id, so a hostile key such as `__proto__` cannot reach a prototype. The decoder builds a `Map`; the first entry for a class id wins.
- A contract finds its code by `instance.currentContractClassId`, the id the export fetched it by. Registration still requires current = original and binds the artifact to the original class (`assertWireArtifactClassId`), so a wrong table entry fails only the entries that use it.
- **The one decoder.** `normalizeAccountStateSlice(raw)` reads format 1 exactly as today and format 2 into the same `NormalizedAccountStateItem`, whose contracts now carry `artifact?`: the class's one shared object, or none when the table lacks the class. Caps are unchanged and measured on the compact JSON as written, so format 2 never inflates before the check. It bounds the items first (8 networks × 32 contracts), collects the class ids they reference, and reads only those table entries: an unreferenced entry costs nothing, and malformed entries collapse into one violation. A table `classId` must be `0x` and 64 lowercase hex digits, the form `Fr.toString()` gives the instance's id. One `isAccountStateV2(raw)` check serves the decoder and the remap.
- **The one encoder.** `encodeAccountState(items)` dedupes artifacts by class id into format 2. Both the export and the import's per-network payload use it. If any class maps to more than one distinct artifact object anywhere in its input (a format-1 file with two instances of a class, or Retry over two networks each carrying its own copy), it returns the whole input as the format-1 array, so those entries travel and are checked one by one exactly as today. Object identity, not the file's format, decides: decoded format-2 items share one object per class and travel compact.
- **Export** (`AccountStateService.backup`): it collects instances per network as today. It fetches each class's artifact once per export, keyed by class id across networks, then leaves out debug info with a pure `withoutDebugInfo(artifact)` in the loaded form (each function's `debugSymbols: ""` and optional `debug` removed, the artifact's `fileMap: {}`). A real-artifact test proves the class id unchanged. The 80% log warning reads the encoded size and names the largest classes by artifact name, as today.
- **Import, per network.** `runImportChainSync` normalizes once, then sends each network `encodeAccountState([item])`: that network's instances plus only the classes they use. `restore()` accepts `AccountStateSlice` and normalizes it the same way. Every entry keeps its own instance checks (schema parse, current = original, address derivation in the seam); only the artifact's parse and class-id hash are memoized, per artifact object, so a format-1 file whose entries carry different artifacts under one class still has each one checked. `artifact-class-id.ts` gains `wireArtifactClassId(artifact)` (parse, hash, the fixed failure text), and `assertWireArtifactClassId` is composed from it. Within one call and per network (each network is its own PXE), only a class's first successful registration carries the artifact; later instances of that class on that network register with `{instance}` alone, which the seam already accepts (`service.ts:449`), so 32 instances cost one 1.8M transfer, parse and hash, not 32. Contracts with no artifact resolve through `pxeService.getContractArtifact` (the catalog, then the PXE store, class-id checked). An unresolved one fails with the existing `ContractNotRegisteredError("Contract artifact not found")`.
- **Results stop echoing code.** Restore result contracts carry `{address, restoreError?}` only, on every branch (registered, failed, skipped). The error collector reads only allowlisted fields (`utils/full-backup-helpers.ts:458-493`); Retry keeps its own inputs and Restore again rereads the file.
- **Retry sends the compact form.** The Retry path (`full-backup-restore.ts:889-896`) passes `ctx.retryable`, normalized items whose contracts share artifacts, back into `runImportChainSync`. It now passes `restorePayload(ctx.retryable)`, or the normalizer would serialize every shared artifact again: 32 instances measured 1,837,878 code units compact and 58,750,884 re-inflated. `restorePayload` encodes only when an artifact object serves two contracts or an entry has no code; a format-1 file's items, each with its own copy, go back as their array, which a class table would only grow (arc-1 review, Codex r1 finding 1: a format-1 part at the cap re-encoded to 41,943,142). Each per-network call uses it too.
- **`remapNetworkIdByChain`** remaps a format-2 part's `items` into a new part object (the input stays unmodified, as `useRestoreAgain.test.ts:196` pins), and dropped indexes refer to `items`.
- **Versioning.** The part carries its own `format` field. It is outside the persisted-storage framework: it is no `chrome.storage.local` key (`non-storage` in the backup registry), the migrator passes it verbatim, and no `baseline:storage` stamp applies. `aztec-version` stays unread: it names the Aztec line, not this encoding. A new build reads format 1 and 2. A build before this change meets format 2 as "malformed account-state slice (not an array)" for that part alone (OA-3).

### Step 2: no copy of code the wallet ships (arc 2, only on OA-1 = B)

- **Hole 1, an app's contract of a shipped kind with no token row.** It is closed by the design: the export leaves out the **artifact**, never the entry. Every instance stays in `items`, and restore resolves its class from the catalog with no token row involved. The arc-1 decoder and restore already handle an entry with no table artifact.
- **Hole 2, a restore on a build that ships different code.** A newer build gets the same guarantee as the address freeze. `RETAINED_SHIPPED_CLASS_IDS` in `packages/aztec-runtime/src/pxe/` is append-only: the aztec-standards Token, the private FPC, the sponsored FPC. A paired test hardcodes every entry and asserts each equals a catalog entry's computed class id. The export leaves out only those classes, so every later build can supply them. An entry leaves the list only on the owner's recorded decision. Retaining an id means retaining its artifact: an Aztec bump that replaces a catalog artifact must keep the old one compiled in and loadable by the new `stdlib`, which the membership test enforces. A build older than the file reads it only if it also knows every class the file left out: a pre-format-2 build cannot read format 2 at all (OA-3), and a format-2 build from before a later list entry fails those entries with "Contract artifact not found".
- **Out of the list: the account class.** Account regimes rotate, and an off-Mainnet rotation leaves old-regime accounts unusable by design. Retaining the old artifact would contradict that rule. After step 1 the account class costs one copy (1.42 million) per file.
- **Measured gain over step 1:** at most 3.36 million code units once per file (token 1.84 + sponsored FPC 0.91 + private FPC 0.62). For example, 32 tokens drop from 1,874,531 to 38,580, and the typical profile from 5.9 to 2.53 million (the heavy one 8.57 to 5.21, the mix 7.57 to 5.11; the account class stays in the file). **Not recommended now** (D6): step 1 already puts the cap out of reach, and step 2 adds a cross-build rule forever.

### Step 3: keep the address and class id, fetch the code at restore (not planned)

- **Integrity.** A fetched artifact is accepted only after `assertWireArtifactClassId` against the instance. The schema parse drops an `artifactHash` key, so the recompute cannot be skipped (probe, recon). A class id does not commit to the public functions' ABI, the function flags, `storageLayout`, error types or debug info, and possibly not to parameter names. A fetched copy can differ in those fields and still match. The wallet then decodes such a contract's public calls in approval windows from the fetched ABI. Today the same holds for code a dApp or a backup file supplies, and for a copy the PXE store holds (F5); those contracts show **Unverified**, with their self-name marked as unchecked (`components/composite/contract-chip.ts`). Authenticating that metadata would be a new trust contract, out of this plan.
- **Privacy.** Each fetch names a class id. That identifies the app, which a person reveals to Aztecscan with their IP address, and Aztecscan logs the request URL. Through Nulo's relay, Aztecscan sees only the relay, but the relay sees the same thing. Batching hides nothing: the classes are the person's set. Padding with decoys costs bandwidth (0.1 to 4 MB per artifact) and still leaks the union. Fetching every verified artifact whole would be tens to hundreds of MB.
- **Availability.** On 2026-11-11 every app class would have failed (no v6 artifacts, F6); today's coverage is unknown. Aztecscan down or the browser offline also fail. The fetch needs a host permission (CORS refused extension origins on 2026-11-11), the shared key in the extension, and a Settings → Privacy switch. What the person would see: entries listed on the import's errors screen, and a later "Restore again". All of it is new surface and owner-visible.
- **The node** serves the public bytecode, the artifact hash and the private functions root only (recon). It has no private or utility bytecode, no verification keys and no ABI. So it cannot replace the fetch.
- **Verdict.** After step 1 the code stays in the file at 0.14 to 1.7 million per unshipped class (stripped). The fetch would save that space at the cost of privacy, availability and permissions. **Not recommended** (D7).

### What is left (step 4)

- After arc 1, passing the cap needs about 22 distinct unshipped classes of MultiToken size, 41 of Vault size, or 279 of Escrow size, across all networks, beside the 2.74 million the shipped classes weigh as exported (P4's re-measure: the export strips the account class to 205,247 and the sponsored FPC to 77,705; recon counted 22, 40 and 265 beside 4.78 million, unstripped). Then the export and the restore behave as today: a log warning at 80%, and the import refuses the part with its existing record. This becomes **KL1**, a closed `known-limit` issue at close-out, reopened on a user report or a measured profile above half the cap.
- `maxSliceCodeUnits` stays at 40 MiB. Lowering it refuses format-1 files measured at 33.8 million. Raising it trips the 64 MiB file cap first.
- `maxContractsPerNetwork` (32) is a count bound on restore work, not a size bound. A person with more than 32 contracts on one network loses the entries past 32 at restore, as today. The token refresh re-registers shipped-class tokens. This becomes **KL2**, reopened on a user report.

### File-level change map (arc 1)

| File | Change |
|---|---|
| `apps/extension/src/wallet/services/account-state/spec.ts` | `AccountStateSliceV2`, `AccountStateSlice`; `BackupContract.artifact` optional in the normalized form |
| `.../account-state/normalize.ts` (+ test) | format-2 decoding into the same items; `encodeAccountState`; cap comment rewritten |
| `.../account-state/service.ts` (+ test) | export in format 2, one fetch per class, `withoutDebugInfo`; restore takes a slice, verifies once per class, resolves missing code, results without code |
| `packages/aztec-runtime/src/pxe/artifact-debug-info.ts` (+ test) | `withoutDebugInfo` for the loaded form; real-artifact class-id equality |
| `apps/extension/src/composables/importChainSync.ts` (+ test) | per-network payload through `encodeAccountState` |
| `apps/extension/src/utils/full-backup-helpers.ts` (+ test) | `remapNetworkIdByChain` reads a format-2 part |
| `apps/extension/src/composables/full-backup-restore.ts` (+ test) | Retry passes `encodeAccountState(ctx.retryable)`; the restore callback takes a slice |
| `packages/aztec-runtime/src/pxe/artifact-class-id.ts` (+ test), `pxe/index.ts` | `wireArtifactClassId`; `assertWireArtifactClassId` composed from it; the barrel exports it and `withoutDebugInfo` |
| `apps/extension/tests/e2e/helpers/backup-export.ts` (`keepChainAccountState`), `tests/e2e/network/{restore-again,backup-edited-local-network}.test.ts` | their file edits read and write a format-2 part, keeping its class table |
| `apps/extension/src/wallet/services/backup/README.md`, `ARCHITECTURE.md` §5, `CLAUDE.md` § Persisted-storage shape changes | the part's format and its versioning (CLAUDE.md now says `aztec-version` versions it; it becomes the part's own `format`) |

### Trade-offs and the competing outline

- **Outline B, cheapest first.** Ship step 2 alone in the array shape, with shipped-class entries carrying no artifact. No container change; an older build drops those entries as malformed and keeps the senders. Measured: tokens and sponsors leave, but accounts (1.42 million each per network) and app instances still scale per instance. The heavy profile stays near 33 million, 78% of the cap. Rejected: it treats the symptom for one kind of contract.
- **Per-network class tables in the array shape** (OA-3 C, Opus r1's preference for the owner to weigh). It keeps the container: no remap or e2e-helper change, and an older build keeps the senders, drops the contracts with a counted violation and arms its restore reminder. Its cost is one copy per class per network, permanent: typical 11,748,047 (28% of the cap) against 5,889,635, heavy 25,471,699 (61%) against 8,567,680, and with debug info kept the heavy profile passes the cap (46.3M). Not recommended: a permanent 2-3× size cost for a transitional older-build window, whose recovery under A is to update and import the file again.
- **A compat-epoch bump** (OA-3 B). Every older build refuses every new file, even one with no contracts. Not chosen.

## Security & Adversarial Considerations

- **Hostile backup file** (anyone can edit a plain file: its checksum is recomputable). New inputs:
  - the class table: a key that differs from its artifact's class, duplicates, a missing entry, unreferenced bulk, an `artifactHash` key, a prototype key;
  - format confusion (an object with both shapes, an unknown `format`).
  Invariants that cover them:
  - (a) a file artifact registers only after `assertWireArtifactClassId(instance, artifact)`, whose schema parse drops unknown keys;
  - (b) for a class the wallet ships, the PXE seam writes the wallet's own copy;
  - (c) caps apply to the bytes as written, before any decoding;
  - (d) the table is an array read into a `Map`;
  - (e) an object part with `format` other than 2 is one bounded violation;
  - (f) a failed class fails only its own entries, with the fixed text.
  One test per refused class (P1, P3).
- **Wrong or hostile artifact source** (step 3 only), and the residual for any supplied code: the class id leaves the public functions' ABI, function flags, `storageLayout` and error types unbound, and approval decoding reads them (`execution/contract-resolver.ts:61-72`, `tx-request-builder.ts:679`). The catalog copy wins for a shipped class; for any other class the file's metadata is as trusted as the dApp that first registered it, as today.
- **dApp that registers many contracts:** format 2 cuts the cost of every instance of a class already in the file to about 1.2 thousand code units; a distinct class still costs its stripped artifact once.
- **Logs:** the export's warning keeps artifact names only, never addresses (logging policy). No new log line names a contract.
- **Least privilege, supply chain, cryptography:** no permission, dependency or key changes. The hashing is upstream `getContractClassFromArtifact` (`@aztec-labs/stdlib` 6.0.0, exact-pinned).

## Decision ledger

| Id | Decision | Why | Alternatives rejected |
|---|---|---|---|
| D1 | Format 2: one artifact per class | removes the cause; measured 58.8M → 1.87M for 32 tokens | outline B; message-only options (owner) |
| D2 | Stored artifacts lose debug info | not in the class id; the build's posture; app classes shrink 2.3-8.5× | keep it (10 large app classes would pass the cap) |
| D3 | Own `format` field, object shape | explicit; one copy per class across networks; older builds fail one part, bounded | per-network tables (OA-3 C; Opus leaned to it as the owner's call); epoch bump; `aztec-version` (names the Aztec line) |
| D4 | Per-network payload is a one-network format-2 part | one decoder for file and RPC; never inflates | expand in the popup (re-inflates N copies per call) |
| D5 | Hash once per artifact object; send each class once per call | instance checks stay per entry; 32 instances cost one transfer and hash | memo by class id alone (skips a second, different format-1 artifact) |
| D6 | Step 2 designed, not recommended now | ≤3.36M gain once; adds a forever rule | ship now (OA-1 B) |
| D7 | Step 3 not recommended | no v6 artifacts on Aztecscan; privacy; permission | OA-1 C |
| D8 | Caps unchanged; KL1-KL2 filed | each needs conditions no measured profile meets | raise counts without a measured restore budget |
| D9 | Results drop the artifact | the response would carry N copies back (F7) | keep the echo |
| D10 | Owner, page 201 (2026-11-24T12:25Z): OA-1 A, OA-3 A, OA-2 A | "Step 1 only. Each contract class's code is stored once per file, without its debug information." / "The new file holds one list of code for all networks. An older build restores accounts, tokens, contacts and settings, and refuses the contract part: View errors lists one record for it, reading "malformed account-state slice (not an array)". It sets no Restore again reminder." / "Never fetch." | OA-1 B, C; OA-3 B, C; OA-2 B, C |

## Phases

Every gate also runs `bun run lint` and `bun run typecheck:all` from the worktree root. Unit commands run in `apps/extension` unless they name another directory.

### Arc 1

**P1. Decoder and encoder.** ✓ Add the format-2 types. Extend `normalizeAccountStateSlice`. Add `encodeAccountState`. Keep the format-1 path byte-for-byte.
- Tests (`normalize.test.ts`): format 2 decodes, and contracts of one class share one artifact object; format 1 decodes as before (the existing tests stay green, the control); one test each for an unknown `format`, `classes` not an array, a malformed class entry, and a table entry missing (entry kept, no artifact); a bulk of unreferenced table entries is never read (no parse, no hash); a `classId` not in `Fr.toString()` form misses (entry kept, no artifact); encode then decode round-trips; the cap is measured on format 2 as written.
- Gate: `bun --bun vitest run src/wallet/services/account-state/normalize.test.ts`. Pass: exit 0.

**P2. Export.** ✓ Add `withoutDebugInfo` in `packages/aztec-runtime/src/pxe/`. Make `backup()` return format 2, fetching each class once. Search the error renderers for a debug-trace consumer (I1) and record the answer in `lessons/phase-2.md`.
- Tests: the class id is equal before and after the strip on the shipped token and the Schnorr account (real hashing, node environment); two networks with 3 + 1 instances of class A and 1 of class B give 2 table entries, 5 instances and 2 artifact fetches; no stored artifact keeps debug info; the at-cap/over-cap pair (`service.test.ts:210-235`) is adapted to format 2.
- Gate: `bun --bun vitest run src/wallet/services/account-state` and, in `packages/aztec-runtime`, `bun --bun vitest run src/pxe/artifact-debug-info.test.ts`. Pass: exit 0.

**P3. Restore and import.** ✓ Make `restore()` take a slice, memoize each artifact's hash, resolve missing code, and return results without code. Change `runImportChainSync` to send per-network format-2 payloads, and Retry to send `encodeAccountState(ctx.retryable)`. Make `remapNetworkIdByChain` read format 2. Adapt `keepChainAccountState` and the two specs that rewrite the part.
- Tests: 3 instances of one class register with one hash (call count), the first call carrying the artifact and the other two `{instance}` alone, and the first failing means the next carries it; a table entry of the wrong class fails only its entries, with the fixed text, while another class registers (success control); a format-1 file with two different artifacts under one class checks each, through `runImportChainSync` and in both orders (valid first, invalid first), and again for a Retry over two networks each carrying one of the two; a two-network call sends class A's artifact on each network; a missing class resolves from the wallet's copy, else fails with "Contract artifact not found"; a format-1 file restores unchanged; the payload for one network holds only its classes; a network that fails then succeeds on Retry sends a payload under the cap (the regression: 32 instances); the result records carry no `artifact` on any branch; the remap moves format-2 items and reports dropped indexes.
- Gate: `bun --bun vitest run src/wallet/services/account-state src/composables/importChainSync.test.ts src/composables/useRestoreAgain.test.ts src/composables/useFullBackupImport.test.ts src/utils/full-backup-helpers.test.ts`, and in `packages/aztec-runtime`, `bun --bun vitest run src/pxe/artifact-class-id.test.ts`. Then, from the root, one `e2e:agent` run (per prover mode, as CLAUDE.md says) over every network spec that edits the part or imports `keepChainAccountState`, `crash-truth` or `handshake-import`: `git grep -l -E 'keepChainAccountState|crash-truth|handshake-import|"account-state"' -- apps/extension/tests/e2e/network` lists them (at `8ae2c06a4`: backup-migration-roundtrip, backup-restore-integrity, backup-import-stalled-network, backup-restore-sw-restart, backup-edited-local-network, restore-again, import-handshake-note, import-handshake-note-matrix, profile-reimport-matrix, hero-prices-unavailable, same-token-concurrent-sends; an opt-in spec runs only when armed by default). Then, in `apps/extension`: `bun run test:e2e -- tests/e2e/backup-roundtrip.test.ts tests/e2e/backup-migration.test.ts --retry=0`. Pass: every command exits 0. The round trip restores the same contract registrations as before. Record the account-state stage's duration from the round trip (`tests/e2e/helpers/import-stage-timing.ts`) in `lessons/phase-3.md`; I4's 32-instance timing stays a hypothesis unless measured.

**Evidence for the owner's note (E1-E8).** Each row is run and recorded with its command and outcome in `lessons/phase-3.md` and the PR body:
E1 a v1.3.0 file restores on head with the same (address, class id) set and senders, Chrome and Firefox, through the update harness; E2 the v1.3.0 build imports a head file and does exactly what OA-3 A says, then head restores the same file in full; E3 a head round trip on both browsers, two networks sharing a class; E4 the pinned backups under `stored-shapes/backups/` open, validate, migrate and read with nothing re-pinned; E5 the P1 and P3 refusal cases; E6 a network that fails then succeeds on Retry sends a payload under the cap, in a unit test and in the stalled-import spec; E7 the four headline sizes on real head exports; E8 the contract stage's time for 32 instances of one class on a real PXE, base and head. A spec that only produces evidence stays outside the repo.

**P4. Docs and the arc gate.** ✓ Update the backup README (the part's format and versioning), ARCHITECTURE.md §5 and the `normalize.ts` cap comment. Re-measure the four headline rows with the shipped code (the unit size test, 32 instances of one class) and write the numbers into this plan.
- Gate: `bun run test`, `bun run test:all`, and `bun run check:plans` after staging. Pass: exit 0, and 32 tokens measure under 2,000,000 code units.
- Measured (2026-11-24, the shipped `withoutDebugInfo` and `encodeAccountState` over real artifacts, the recon's shapes, read back through `normalizeAccountStateSlice` with every contract finding its code and no violation): 32 tokens 1,876,547 code units (4.5% of the cap; recon 58,787,153 before); mix 6,353,780 (15.1%; 22,400,000 before); typical 3,846,858 (9.2%; 35,786,391 before); heavy 6,529,099 (15.6%; 147,578,224 before). Each is below the recon's format-2 figure because the export also strips the account class (1,420,088 → 205,247) and the sponsored FPC (907,329 → 77,705). One class as exported: token 1,835,882, private FPC 616,857, Escrow 140,437, Vault 937,132, NFT 877,658, MultiToken 1,715,789.

### Arc 2 (only on OA-1 = B)

**P5. Leave out shipped classes.** Add `RETAINED_SHIPPED_CLASS_IDS` and its append-only, catalog-membership test. Make the export leave those classes' artifacts out of `classes`.
- Tests: an app-registered instance of a retained class with no token row stays in `items` and restores from the catalog (hole 1); every retained id resolves in the catalog, and the list equals its hardcoded copy (hole 2); a non-retained class keeps its artifact (control).
- Gate: the P3 unit and e2e commands, plus `bun run test:all`. Pass: exit 0.

## UI impact

None. No surface changes in arc 1 or arc 2. A restore of an edited file can show the existing "Contract artifact not found" text on the errors screen, which today shows other registration errors in the same row. Step 3 would add a Settings → Privacy switch and new errors; it is not planned.

## Delivery

- One PR on `dev` (arc 2 is not built). Arc 1: branch `backup-contracts-1-a1`. Its first commit cherry-picks this plan's commit from `worktree-backup-contracts-1`. PR `feat(backup): store each contract class's code once in a full backup` (68 characters).
- Arc 2 is not built (OA-1 = A), so the close-out rides on arc 1's PR as its final commits: the Outcome block, the known limits, the lessons pass, `STATUS.md` deleted, then `git mv` into `archive/` in its own commit with the index line moved.
- No issue exists for this work. The PR body cites the owner's page-200 note and page-201 picks and carry no `Closes` line. Each body: what changed and why, the measured sizes before and after, the validation runs, "No visible change."
- No label at creation. Add `e2e:extension-network` afterwards only if the path filter skips the network lane.
- Parallelism: arc 2 depends on arc 1's decoder. There is one lane.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) as read at `8ae2c06a4`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc at its boundary: Codex `gpt-6.1-sol` at `high` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`), resumed with each fix diff, hard stop at three rounds. Each prompt carries the arc map ("arc N of 2; arc 2 leaves shipped classes out of `classes`") and the standard's two rules verbatim. One Opus 5.5 diff review (`Agent`, `general-purpose`, `model: opus`) runs beside round 1. Log every round in `lessons/phase-N.md` and under Plan review. After the last arc, one fresh Codex session over the net diff from `8ae2c06a4` asks for cross-arc issues.
- Step 3: `gh stack submit --auto`, then `gh pr edit` per body, then `gh pr checks <n> --watch`.
- Step 4, close-out: the Outcome block. File KL1-KL2 as closed `known-limit` issues (dedupe first). Run the lessons pass. `git mv` into `archive/` in its own commit, and move the index line. First merge `origin/dev` and read `index.md` and `lessons.md`.
- Step 5, teardown after the close-out merges: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/backup-contracts-1/plan.md`, then `agent-worktree done backup-contracts-1 --merged`. The orchestrator notices the merge; a session resumed here runs the check first.
- Failure policy: three failures on one step stop that arc and report.

## Plan review

- **Codex r1** (`gpt-6.1-sol`, high): conditional approve, conditions: compact retries, per-entry checks kept, bounded table work, compatibility claims corrected. All ten findings accepted:
  1. A class-id-only memo would skip a second, different format-1 artifact of the same class: hashing is now memoized per artifact object, instance checks stay per entry.
  2. An under-cap table of unreferenced entries: the decoder reads only referenced classes.
  3. Class ids leave approval metadata unbound, and a PXE-stored copy is no wallet code: F5 and the residual restated.
  4. The granted-app growth path was mislabelled: removed from this plan and handed to the orchestrator for private handling.
  5. Dated and unambiguous facts (F1, F6).
  6. I1-I3 narrowed; the strip names its fields.
  7. Readers older than a step-2 file: stated in step 2 and OA-1/OA-3.
  8. **High, demonstrated:** Retry re-inflated shared artifacts (1,837,878 → 58,750,884); Retry now encodes, with a regression test.
  9. The e2e helper `keepChainAccountState` and `useRestoreAgain.test.ts` joined the map and gates; D9 holds on every branch.
  10. Retention means artifacts: stated in step 2.
- **Opus r1** (Plan agent, Opus 5.5): conditional approve, conditions: Retry re-encodes; `keepChainAccountState` fixed and the gate widened; OA-3's recovery corrected and C priced; the strip also clears `functions[].debug`. Accepted: the same Retry finding as Codex 8 (Opus traced the further consequence: the retry recorder ignores violations, so the error rows and the Retry button vanish with nothing registered); the helper and gate; OA-3 A rewritten (an older build arms no reminder: `accountStateNetworkIds` reads `[]` from an object, `useFullBackupImport.ts:232`) and C priced from measurements; `debug` stripped; the memo per artifact object (as Codex 1); CLAUDE.md joins P4; each class sent once per call (I4); class-id form check, one shared format check, a remap that returns a new object; I1 notes the loss is permanent; F5's line. Its padding finding joined the item handed for private handling. Not taken: a 256-entry table cap (references-first decoding already bounds the work to the ≤256 referenced classes); switching the recommendation to C (disputed: D3, put to the owner as OA-3 with both costs).
- **Final Codex pass** (fresh `gpt-6.1-sol` session, high): conditional approve, conditions: keep format-1 checks through re-encoding; scope the class-send tracking to each network's PXE. Accepted: the encoder returns its whole input as format 1 when any class maps to more than one artifact object anywhere in it (resumed round: the first wording said "an item" and missed a Retry over two networks), tested through `runImportChainSync` and Retry in both orders; the once-per-class rule is per network, with a two-network test; the `pxe` barrel exports the two helpers; I4 stays a hypothesis and the round trip records the stage's timing. It confirmed D3's recommendation (moderate) and found no further consumer missing. Second resumed round: **approve**.
- **Arc 1 review r1** (Codex `gpt-6.1-sol`, high, fresh session): changes requested; all three findings accepted: a format-1 part re-encoded per network or on Retry could pass the cap it had met (now `restorePayload`, array unless code is shared); the strip's cost on a public revert understated (comment and I1 corrected); a test header. **Opus 5.5 diff review** beside it: approve; four comment and scope findings accepted (the remap reads format 2 under `account-state` only). **r2** (resumed): one finding accepted, repeated non-object artifacts counted as shared. **r3** (resumed): approve, no findings. Log: [lessons/phase-4.md](lessons/phase-4.md).

## Seeds

Not run: the orchestrator drives each arc.

```
/goal Every phase of the approved arcs in implementations-plan/backup-contracts-1/plan.md is marked ✓, each backed by its validation gate reported passing in the transcript; each arc's Codex loop converged (a resumed pass reporting no new material point, quoted); the stack's PRs exist against dev, opened after the loops; bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/backup-contracts-1 forward per its plan.md: read plan.md, STATUS.md and lessons/ first; take the next unmarked phase of an approved arc; run its gate; at an arc boundary run the Codex loop per the Post-implementation section, then open the arc's PR in the stack; never merge; stop and report after three failures on one step.
```
