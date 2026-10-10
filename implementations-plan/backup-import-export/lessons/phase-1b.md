# Arc 1b: implementation log

## Start (2026-10-10)

- Arc 1 merged into `dev` as ed59711 (#246, squash). Arc 1b branches from `origin/dev` as `backup-import-export-arc-1b` (D-orch-4); the orchestrator kept the patch (A1, D-orch-3).

## Phase 1b.1 (#148, in-repo half)

- `bun patch @aztec-labs/pxe@6.0.0-rc.1` leaves an editable copy at the ROOT `node_modules/@aztec-labs/pxe`, which the isolated linker never had; after `bun patch --commit` it stays behind. Removed it and re-ran `bun install --frozen-lockfile --force`. The patched package lands in its own cache entry (`…_patch_hash=…`); the unpatched cache entry other worktrees hardlink from was checked unchanged.
- `bun.lock` gains one `patchedDependencies` line; no package resolution moves.
- The heal test imports `PXE` from `@aztec-labs/pxe/client/bundle`, the entry `chain-runtime.ts` constructs from, and calls the shipped `registerAccount` and `getRegisteredAccounts` through `Reflect.apply` on fake stores that keep upstream's address-store semantics (write when absent, `false` on an equal entry, throw on a conflicting one). No `@nulo/resolve-asset` import was needed for the behaviour; the source pin reads `dest/pxe.js` through it, since Bun's runtime reprints the loaded module without comments.
- **By-hand check (the heal test fails with the patch reverted).** Replaced the installed `dest/pxe.js` with a copy carrying upstream's `return accountCompleteAddress;` (written beside it and moved over the hardlink, so no cache inode changed), ran `bun --bun vitest run src/pxe/register-account-heal.test.ts` in `packages/aztec-runtime`: 4 failed, 1 passed. The heal case (`expected undefined to be { …(2) }`), the failed-then-retried case (`expected [] to deeply equal [ Array(1) ]`), the both-stored control (the address write never ran, so no `false`), and the source pin failed; the nothing-stored case passed both ways. `bun install --frozen-lockfile --force` restored the patched copy: 5/5.
- The pxe `OVERRIDES` record moved out of the shared Aztec record into its own entry, so the modified-file sentence prints on `@aztec-labs/pxe`'s notice only; the four licence fields are one shared constant, so a bump still moves one `reviewedVersion` (D-arc1b-2).
- Deviation (D-arc1b-1): the tree names the patches in three docs the plan's change map does not list. `apps/extension/store/listing.md`'s reviewer notes ("Modifications to third-party code, stated exactly", sent to AMO with every version) and `store/SOURCE-BUILD.md` named only the two noir patches, and `UPDATE.md`'s re-check list too. All three now name the pxe patch; the reviewer notes stay under AMO's cap (2950 → 2981 code points after the review rewording; `store-listing.test.ts` 8/8).

## Network gate (2026-10-10)

- Run 1, the plan's command as written (no `NULO_E2E_PROVERLESS`), retry 0, Chrome: `profile-reimport-matrix` 3/3; `import-handshake-note` failed after 246 s with "no projection of the receiver parked on the gate; is the build proverless-armed?". The file carries `@requires-proverless`: its projection gate is compiled into proverless builds only. Not the patch.
- Why the runner did not refuse it: `agent.sh`'s proverless guard greps `@requires-proverless` over every pass-through argument, so `--retry=0` reaches grep as an option; grep exits 2 with no output, `|| true` swallows it, and the guard passes. Any run that passes a vitest flag skips the guard. Reported to the orchestrator for the e2e harness lane, not fixed here.
- Run 2: `NULO_E2E_PROVERLESS=1` on `import-handshake-note` alone, retry 0, Chrome.
  Result at c38b5e9: 2/2 (the agent-runner contract case and the handshake row, 93 s). `profile-reimport-matrix` ran at ddd6958; nothing the bundle contains changed between the two heads (the later commits touch the heal test and docs).
