# Arc 1b: implementation log

## Start (2026-10-10)

- Arc 1 merged into `dev` as ed59711 (#246, squash). Arc 1b branches from `origin/dev` as `backup-import-export-arc-1b` (D-orch-4); the orchestrator kept the patch (A1, D-orch-3).

## Phase 1b.1 (#148, in-repo half)

- `bun patch @aztec-labs/pxe@6.0.0-rc.1` leaves an editable copy at the ROOT `node_modules/@aztec-labs/pxe`, which the isolated linker never had; after `bun patch --commit` it stays behind. Removed it and re-ran `bun install --frozen-lockfile --force`. The patched package lands in its own cache entry (`…_patch_hash=…`); the unpatched cache entry other worktrees hardlink from was checked unchanged.
- `bun.lock` gains one `patchedDependencies` line; no package resolution moves.
- The heal test imports `PXE` from `@aztec-labs/pxe/client/bundle`, the entry `chain-runtime.ts` constructs from, and calls the shipped `registerAccount` and `getRegisteredAccounts` through `Reflect.apply` on fake stores that keep upstream's address-store semantics (write when absent, `false` on an equal entry, throw on a conflicting one). No `@nulo/resolve-asset` import was needed for the behaviour; the source pin reads `dest/pxe.js` through it, since Bun's runtime reprints the loaded module without comments.
- **By-hand check (the heal test fails with the patch reverted).** Replaced the installed `dest/pxe.js` with a copy carrying upstream's `return accountCompleteAddress;` (written beside it and moved over the hardlink, so no cache inode changed), ran `bun --bun vitest run src/pxe/register-account-heal.test.ts` in `packages/aztec-runtime`: 4 failed, 1 passed. The heal case (`expected undefined to be { …(2) }`), the failed-then-retried case (`expected [] to deeply equal [ Array(1) ]`), the both-stored control (the address write never ran, so no `false`), and the source pin failed; the nothing-stored case passed both ways. `bun install --frozen-lockfile --force` restored the patched copy: 5/5. Repeated on the final test (byte-equal fake, after the review): the same four fail, 5/5 once restored.
- The pxe `OVERRIDES` record moved out of the shared Aztec record into its own entry, so the modified-file sentence prints on `@aztec-labs/pxe`'s notice only; the four licence fields are one shared constant, so a bump still moves one `reviewedVersion` (D-arc1b-2).
- Deviation (D-arc1b-1): the tree names the patches in three docs the plan's change map does not list. `apps/extension/store/listing.md`'s reviewer notes ("Modifications to third-party code, stated exactly", sent to AMO with every version) and `store/SOURCE-BUILD.md` named only the two noir patches, and `UPDATE.md`'s re-check list too. All three now name the pxe patch; the reviewer notes stay under AMO's cap (2950 → 2981 code points after the review rewording; `store-listing.test.ts` 8/8).

## Network gate (2026-10-10)

- Run 1, the plan's command as written (no `NULO_E2E_PROVERLESS`), retry 0, Chrome: `profile-reimport-matrix` 3/3; `import-handshake-note` failed after 246 s with "no projection of the receiver parked on the gate; is the build proverless-armed?". The file carries `@requires-proverless`: its projection gate is compiled into proverless builds only. Not the patch.
- Why the runner did not refuse it: `agent.sh`'s proverless guard greps `@requires-proverless` over every pass-through argument, so `--retry=0` reaches grep as an option; grep exits 2 with no output, `|| true` swallows it, and the guard passes. Any run that passes a vitest flag skips the guard. Reported to the orchestrator for the e2e harness lane, not fixed here.
- Run 2: `NULO_E2E_PROVERLESS=1` on `import-handshake-note` alone, retry 0, Chrome.
  Result at c38b5e9: 2/2 (the agent-runner contract case and the handshake row, 93 s). `profile-reimport-matrix` ran at ddd6958; nothing the bundle contains changed between the two heads (the later commits touch the heal test and docs).

## Decisions (moved from plan.md at the arc 3 revision, 2026-10-14)

| # | Decision | Alternatives | Panel | Why |
|---|---|---|---|---|
| D-arc1b-1 | The pxe patch is also named in `store/listing.md`'s reviewer notes, `store/SOURCE-BUILD.md` and `UPDATE.md` | leave the store docs to a later release PR | found in the tree (not in the change map) | The reviewer notes go to AMO with every version as the exact list of third-party modifications; leaving them at two patches would misstate the next submission. The noir line is reworded to fit AMO's 3,000-code-point cap (2981). |
| D-arc1b-2 | `@aztec-labs/pxe` gets its own `OVERRIDES` record; the licence fields are one constant shared with the Aztec record | append the sentence to the shared Aztec note | — | The note prints on every package the record names; a shared note would tell eighteen packages that `dest/pxe.js` is modified. One constant keeps one `reviewedVersion` per bump. |
| D-arc1b-3 | The network gate runs `import-handshake-note` on a proverless build (`NULO_E2E_PROVERLESS=1`) and `profile-reimport-matrix` on the default build | one run of both files, as the gate was written | found by the gate | The handshake file's projection gate is compiled into proverless builds only (`@requires-proverless`); run 1 without the flag timed out waiting for it. `agent.sh`'s marker guard did not refuse that run because `--retry=0` reaches its grep as an option (reported to the orchestrator for the e2e harness lane). |

## Review findings (moved from plan.md at the arc 3 revision)


- **Codex round 1 (gpt-6.1-sol, high, read-only; session 01a1233a-8127-7d43-a0df-835364508533): approve with fixes, no High or Medium.** It checked that only the address write is reached by the removed return, that equal registrations converge and a conflicting entry now rejects instead of passing silently, that neither `getRegisteredAccounts` nor the scope guard relies on the early return, that the test runs the installed patched module and the source pin catches a dropped key, the notices split, the store docs and the lockfile.
- **Opus 5.5 diff review (alongside round 1): approve with fixes, three Lows.**

| # | Source | Sev | Finding | Disposition |
|---|---|---|---|---|
| B1-1 | Codex | Low | The fake store treats entries as equal by object identity and the key store returns one object; upstream compares bytes and derives a fresh complete address per call | Accepted: byte comparison, a fresh object per `addAccount`; the both-stored control asserts the same stored entry survives. The suggested conflicting-bytes case is rejected: it would test the fake's throw, not upstream or the patch. |
| B1-2 | Codex | Low | The test header repeats the test names and the retirement steps the skill holds | Accepted: three lines. |
| B1-3 | Opus | Low | The reviewer notes' "which alters no JavaScript or WASM" read as attached to the web build, beside a clause where JavaScript is altered | Accepted: "(no JavaScript or WASM changes)" on the noir clause; the pxe clause says the `return` becomes a comment (2981 code points). |
| B1-4 | Opus | Low | The skill's re-apply step misses the root `node_modules/@aztec-labs/pxe` copy `bun patch` leaves under the isolated linker | Accepted: one clause in the skill line. |
| B1-5 | Opus | Low | The committed header overstated the fake's fidelity while the fix was uncommitted | Accepted: resolved by B1-1. |

Rejected: only B1-1's extra conflicting-bytes case, with the reason above.

- **Codex round 2 (resumed session): clean.** No new material findings on the fix diff. The loop converged in two rounds.
