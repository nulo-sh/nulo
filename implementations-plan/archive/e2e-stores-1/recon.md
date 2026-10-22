# e2e-stores-1 — recon

Base: `origin/dev` at `5711a1bc3`. One Sonnet reuse sweep plus the planner's own reads of the harness and of the pinned Aztec install (`@aztec-labs/*` 6.0.0-rc.3 under the aztec-up versions dir). Paths are repo-relative unless named as an upstream package.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Per-run dir with a marker stamp | `apps/extension/tests/e2e/sandbox-ownership.ts:28` `plannedRunDir`, `:32-39` `createRunDir` (makes `<dir>/data` only, returns it) | adapt: also make `<dir>/tmp` |
| The node's spawn env | `apps/extension/tests/e2e/global-setup.ts:531-583` `spawnAztecNode`, spread `...process.env` then overrides | adapt: one `TMPDIR` key |
| Removing the run dir | teardown `global-setup.ts:862-867` (only when every service is `stopped`), `reapPriorRun`/`removeRunDir` `sandbox-ownership.ts:129-153`, `sweepOrphanDataDirs` `:259-284`, called by `reap.ts` | reuse as-is: all remove the dir recursively, so `<dir>/tmp` goes with it |
| A launch marker's processes | `apps/extension/tests/e2e/owned-processes.ts:159` `ownedProcesses(marker, read)` | reuse as-is |
| Reading `/proc/<pid>/fd` | `apps/extension/tests/e2e/boot-guard.ts:66-77` `socketInodes` (private; readdir + readlink, unreadable → `[]`) | adapt: extract the fd-target read so the store check and `socketInodes` share it |
| Unix-socket path budget | none (searched `sun_path`, `108`, `104 bytes`, `UNIX_PATH`, `socket path` over `apps scripts .github`) | see plan D4 |
| A test pinning the node's spawn env | none (no unit test reads `global-setup.ts` or a helper of it) | build new only where the plan needs it |
| Harness self-test home | `apps/extension/scripts/e2e/*.test.ts`, included by `apps/extension/vitest.config.ts` (`scripts/**/*.test.ts`), so `bun run test` runs them; `owned-processes.test.ts` already tests `sandbox-ownership.ts` with real marked `sleep` children (`spawnWith`, `:76-96`) and sets `NULO_E2E_DATA_ROOT` before import | reuse: add the cases there |
| `TMPDIR`/`TMP`/`TEMP` for any child | none (searched `TMPDIR|TMP\b|TEMP\b|tmpdir` over `apps scripts .github`) | build new (one key) |

## Upstream behaviour (6.0.0-rc.3, read in the pinned install)

- `@aztec-labs/aztec` `scripts/aztec.sh`: `start --local-network` exports polling env, starts its own `anvil` on `$ANVIL_PORT` (binds fail on ours), then `exec node …/dest/bin/index.js start …`: the node keeps the spawned pid and inherits our env.
- `src/cli/aztec_start_action.ts:33-45`: local-network mode hands `createLocalNetwork` only `l1Mnemonic`, `l1RpcUrls`, `testAccounts`; `--data-directory` is dropped.
- `src/local-network/local-network.ts:113` builds the node config from `getConfigEnvVars()`; its own comment says the local network runs "without a DATA_DIRECTORY", against ephemeral stores, by design.
- `@aztec-labs/kv-store` `src/lmdb-v2/factory.ts:59` falls to `openTmpStore` without a data directory; `:78` `mkdtemp(join(tmpdir(), name + '-'))`; the dir goes only on the store's own close.
- Other `os.tmpdir()` users in the node process: `@aztec-labs/world-state` `src/native/native_world_state.ts:113` (`aztec-world-state-*`), `@aztec-labs/ethereum` `src/deploy_aztec_l1_contracts.ts:288` (`.foundry-deploy-*`, removed on `process.on('exit')` only), `@aztec-labs/simulator` `src/public/cdb_ipc_server.ts:100` (`cdb-ts-<pid>-<threadId>-<n>.sock`, a Unix socket, created by `AvmSimulatorPool`, which `@aztec-labs/aztec-node` `src/factory.ts` uses).
- `@aztec-foundation/ipc-runtime` 6.0.0-rc.6 `src/spawned_backend.ts:88-98,251-265` (found by the audits): the world state (`IpcWorldState.spawn`, a separate `aztec-wsdb` child) and the AVM run as spawned backends that inherit the env and bind `<prefix>-<pid>-<threadId>-<n>.sock` and append `<…>.log` under `tmpdir()` (prefixes `wsdb`, `avm`, shorter than `cdb-ts`). `@aztec-labs/bb-prover` `src/verifier/batch_chonk_verifier.ts:127` makes a `bb-batch-*` FIFO dir there under real proofs.
- Node 24 `os.tmpdir()` returns `$TMPDIR` when set (checked: `TMPDIR=/nonexistent/x node -e 'console.log(require("os").tmpdir())'` prints `/nonexistent/x`).

## Host evidence (2026-10-22, read-only)

`ls /tmp`, grouped by name prefix: 2,892 `archiver-*`, 2,891 each of `p2p-*`, `p2p-archive-*`, `p2p-attestation-*`, `p2p-peers-*`, `signing-protection-*`, 2,887 each of `slasher-*`, `sentinel-*`, `l1-tx-utils-*`, 85 `aztec-world-state-*`, 91 `.foundry-deploy-*`, 36 `cdb-ts-*.sock`, 6,695 `wsdb-*.log`, 2,664 `avm-*.log`, 12 `wsdb-*.sock`, 13 `avm-*.sock`. Owners and liveness not checked. `/tmp` is on the root overlay (87% used).

## Collisions and neighbours

- The `sweepOrphanDataDirs` liveness test reads command lines and the marker stamp; `TMPDIR` is in the node's environ, not its command line, but `--data-directory <dir>/data` is, and the stamp check holds too: a live run's dir stays protected (`sandbox-ownership.ts:275-281`).
- `createRunDir`'s return value is the `--data-directory` argument; the change must keep that meaning.
- Docs that describe where a run writes: `apps/extension/tests/e2e/README.md:207` and the isolation table row at `:368`; `.claude/skills/e2e-testing/SKILL.md:97` (the data dir is on real disk, so RAM is not pinned) and `:211` (`NULO_E2E_DATA_ROOT`); `apps/extension/tests/e2e/lockfile.ts:36-43` and the `aztecDataDir` comment.
- CI (`.github/workflows/_extension-network-e2e.yml:111`, `ubuntu-latest`) sets no `NULO_E2E_DATA_ROOT`, no `TMPDIR` and runs no `e2e:reap`; runners are discarded, so CI is unaffected by the leak and gains only the check.
- Neighbouring leak, out of this lane's scope: `apps/extension/tests/e2e/helpers/import-drivers.ts:589` `writeBackupToTemp` makes `tmpdir()/nulo-e2e-backup-*` and never removes it (11,299 such dirs in this host's `/tmp`). Other `mkdtempSync(tmpdir())` sites in `tests/e2e/**` were listed, not read for cleanup. No issue owns this (`gh issue list --state all --search "nulo-e2e-backup OR temp dir e2e leak"`).
- Closed known limits: none in this area (`gh issue list --state closed --label known-limit --search "tmp OR tmpdir OR run dir OR data dir"` returned only #963, unrelated).
- Prior plans: `implementations-plan/archive/pxe-limits-1/lessons/phase-3.md` (the measurement behind #1041); `implementations-plan/archive/e2e-harness-gaps/plan.md` (the run dir directly under `E2E_DATA_ROOT`, prefix plus marker stamp, node writes `<dir>/data`).
