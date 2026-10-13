# Phase 0: planning log

## Recon

- Three Sonnet Explore agents: a batched reuse sweep (seven capabilities), the dApp ingress map, the token purge and e2e map. Findings in `../recon.md`.
- Wire sizes measured by the planner: every artifact in `@aztec-labs/noir-contracts.js/artifacts` and `@aztec-foundation/aztec-standards/target` (44) loaded with `loadContractArtifact`, wrapped as an SDK `registerContract` call, serialized with `jsonStringify`, sized as AES-GCM base64. Largest: noir-contracts `Token`, 8,155,664 ciphertext characters.

## Claims that did not hold

- #345 and the lane brief ask for the standard invalid-request envelope before the decrypt. The call's `messageId` is inside the ciphertext, so no reply can be addressed before the decrypt.
- #336 and the lane brief: the issue names eight files, not six (two assert `consoleErrors` only, six `pageErrors` only).
- #262 cites `token/service.ts:200-216`; the purge is now at `:228-255`.
- #331 lists the Buffer shape; a 44-character base64 string also passes `schemas.AztecAddress`, and the lane brief's fix text (hand the parsed address on) and its test text (refused as INVALID_PARAMS before any window) describe two different fixes.

## Panel consults

### Round 1, Codex (gpt-6.1-sol, high, read-only; session 01a134ed)

Verdict: `reject (with blocking findings: incomplete address coverage, unproved purge ordering, bypassable message-size bound)`.

- D-345: (a) at the validator, 16 MiB as policy; the content must refuse extra properties (a small valid ciphertext beside a huge extra key is still forwarded and queued).
- D-331: keep the pass/fail design; `registerContract`'s instance schema (`ContractInstancePreimageSchema`) has no `address`, so the parse strips the field the scope checker reads; keep either-case `0x` hex (as `field-address.ts` does).
- D-262: a storage-only critical section across allocation-plus-write and the sweep's read-plus-delete; in-order `storage.local` is not a documented contract.
- D-332: approve.
- Also: the reader-path table missed four paths; the e2e list must be explicit (the `rg` of internal names finds no e2e file); the red/green recipe could lose implementation edits; qualify the size and UI claims.

### Round 1, Opus 5.5 lens (Plan agent)

Verdict: `conditional approve` (conditions: a #262 test that fails on base; close the `registerContract` address gap and complete the reader table; correct the hang claim, strict content, a measured success control; an e2e list by behaviour, run from the repo root).

- The planned #262 test could not fail on base: the parked remove is tracked, and every writer's admission drains it. The reachable race is a restore already inside the token lock (its compensate-deleted row frees an id that its next row reuses).
- A dropped secure message never times out on the page: `ExtensionWallet` has no per-call timeout and the wallet's PONGs keep it alive.
- D-262: same-turn re-read is sound and smallest (dissent from Codex). D-331b: exact spelling.

### Planner's calls after round 1

- D-262: the row-id lock (Codex), over the same-turn re-read (Opus): the in-order property is in neither Chrome's `storage` documentation nor the `MinimalStorageArea` contract; a destructive delete should be correct by exclusion.
- D-331b: exact spelling (Opus), over keeping upper-case hex (Codex): readers compare with `===`, so a second spelling gets a second answer.
- One related ingress question outside #345 was removed from the committed plan and recon and carried in the orchestrator report instead, in case it is a suspected exploitable weakness (A1).

### Final pass, Codex (gpt-6.1-sol, high; fresh session 01a13503)

Verdict: `approve`. Medium findings folded in: `wireInstance` needs `currentContractClassId` for the new supplementary parse; `service.test.ts:631` must reorder its awaits under the row-id lock (assertions unchanged); two e2e files need provisioning the local agent run lacks; keep the full 44-artifact scan (3.4 s measured). It confirmed the row-id lock over the same-turn re-read.
