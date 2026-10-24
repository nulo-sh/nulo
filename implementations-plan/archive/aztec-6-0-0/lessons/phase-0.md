# Phase 0: classification and planning

## Trial install (2026-10-23, reverted before the plan commit)

1. Pins to `6.0.0` in six workspaces, patch files and keys renamed, 44 excludes, `bun install`: exit 0, 45 Aztec-scope lock entries moved, no new Aztec name.
2. `R/account/` and `R/pxe/` under vitest: 11 files pass, `register-account-heal.test.ts` and `scope-registration.test.ts` fail at import with `BuildMessage: Expected ";" but found "txHash"`.
3. Cause: the renamed pxe patch's hunk header still said line 361. `dest/pxe.js` at 6.0.0 has `registerAccount`'s early return at 499. Bun 1.4.2 replaced line 364 (`if (!skipTxValidation) {` in `simulateTx`) with the patch's comment, with no context check. Proved by diffing the installed file against the `npm pack` tarball: one changed line, the wrong one.
4. Fix: drop the patch and its key, install the pristine file, `bun patch`, edit line 499, `bun patch --commit`, delete the root `node_modules/@aztec-labs`, `bun install --frozen-lockfile --force`. The installed file then differs from the tarball at line 499 only; `R/account/` + `R/pxe/` pass (49 files).
5. The noir patches: installed `package.json` against the tarball differs only in the intended `module` → `exports` lines.
6. Extension detectors: `protocol-fpcs.test.ts` (4 reds), `default-tokens.test.ts`, `layout-identity.test.ts` (2 `expectVersion` reds). Full `test:all`: 15 reds in `@nulo/extension` and `@nulo/resolve-asset`, every one a pin the bump moves (recon finding 6); every other package exits 0.

## Oracle-major probe

- `@aztec-labs/pxe` `dest/oracle_version.js`: rc.3 `32.2`, 6.0.0 `33.0`; `utility_execution_oracle.js:104-107` throws `Incompatible private environment version` on `major !== 33`; `PrivateExecutionOracle` extends that class.
- A scratch ACVM run (`executeProgram`, zero witness, a handler that stops at the first foreign call) of each artifact's `entrypoint`: the vendored `nulo-v6.1` file calls `aztec_misc_assertCompatibleOracleVersion(0x20, 0x2)`; `@aztec-labs/accounts@6.0.0`'s calls it with `(0x21, 0x0)`.
- Conclusion: every account of the bound regime fails its first private execution on 6.0.0. The KAT and the freeze tests cannot see it. OA-1.

## Live Testnet (block 731)

- SponsoredFPC `0x2d8fff82…69d3`: present, class `0x23339131…3335`, equal to the installed artifact's class.
- AuthRegistry `0x120bf1fe…5e83`: not found (#430). PrivateFPC `0x0516ebb4…6915`: not found, its normal state.

## Consults

- 2026-10-23, Codex (gpt-6.1-sol, high), fresh session `01a166da`, the dual audit: conditional approve, six findings. Verified each: the missing `@aztec-labs` attestations (`npm view … dist.attestations` empty), the opt-in replay (`update-replay.test.ts:426`) and its kept-addresses toast (`:402`), the backup path (`full-backup-restore.ts:302-332`), the imported-only Local Network. It reproduced the 32.2/33.0 split independently. Verdict folded into `plan.md` § Audit verdicts.
- 2026-10-23, Opus (Plan agent), fresh, the dual audit: conditional approve, nine findings. Verified each. One premise did not hold: rc.3 did bypass the labs scope (`archive/aztec-rc3/lessons/phase-1.md:17`, `AGE-GATE: bypass-all`), so its OA-3 became a non-blocking record (D10). Its `file_map` reading of the oracle constant (`aztec/src/oracle/version.nr`: 32) replaced the ACVM detector (D4).
- The replay recording's dApp session expires 2026-10-27T00:52:11Z (`v0.31.0.storage.json`, `nulo:core:dappSessions`).
- 2026-10-23, Codex (gpt-6.1-sol, high), fresh session `01a166f5`, the final pass: conditional approve (two findings on P4's update runs and the arrival suite), resumed round 2 conditional approve (the artifact-run flag, the rebuild order), resumed round 3 approve.
