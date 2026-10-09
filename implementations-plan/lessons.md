# Lessons

Gotchas from closed plans, read before every task: one line each with evidence, under 8 KiB; dedupe, retire, date tool versions.

## Bun & deps

- An incremental `bun install` leaves a removed dependency on disk, so a leftover import passes locally and fails on CI: prove removals fresh (1.4.2). [Evidence](archive/vitest-vite8-dedupe/plan.md#fresh-install)
- Under the isolated linker, root `bunx <tool>` fetches npm `@latest`, past lockfile and age gate: use workspace scripts (1.4.2). [Evidence](archive/plans-scaffolding/plan.md#root-bunx)
- When one `bun run --parallel` leg fails, Bun SIGINTs the rest, so `audit:vue` can exit 130: blame the leg that printed `Exited with code N` (1.4.2). [Evidence](archive/isolated-linker-store/plan.md#exit-130)
- bb.js threw `std::bad_cast` in jsdom (use `// @vitest-environment node`; 5.2.0). [Evidence](archive/harden-security-prerelease/plan.md#jsdom-bbjs)

## CI & gates

- Root `test`/`audit:vue` run only `apps/extension` (with aztec-runtime's tests, in jsdom); CI adds `test:all`, `test:release`, `test:ci-gating`. [Evidence](archive/harden-security-prerelease/plan.md#root-test)
- `bun run lint` prints only Biome's first 20 diagnostics, so a new error can hide: rerun on changed files (2.5.13). [Evidence](archive/wallet-error-resilience/plan.md#lint-cap)
- `vue-tsc` skips an SFC whose script lacks `lang="ts"` (149 of the extension's 205), so a bad prop there passes `typecheck:all`. [Evidence](archive/storage-migration-backup/plan.md#vue-tsc)
- `auto-imports.d.ts` regenerates only under Vite and keeps a removed export's global: build before committing (unplugin-auto-import 21.1.0). [Evidence](archive/send-amount-exact/plan.md#auto-imports)
- Vue unit tests (3.5.41, VTU 2.4.11): only `vue`/`vue-router` auto-import; stub `@nulo/design`'s recursing `Button`; fake timers run a native event's first listener only; a second `mount` strips the first's stubs. [Evidence](archive/ux-feedback/plan.md#vue-tests)
- A check accepting a wrong state passes broken code: pair never-happens tests with a success control; match screenshot state exactly; stub only what production returns. [Evidence](archive/connect-window/plan.md#controls), [more](archive/harden-dedupe/plan.md#success-control)
- Timed tests (`e2e/config`) time out under parallel `test:all` load: rerun the file alone. [Evidence](archive/e2e-reliability-fixes/plan.md#timed-tests)

## Git & GitHub

- A `pull_request` run takes workflows from the merge ref but builds `head.sha`, so a later `dev` fix is absent: merge `dev` before debugging. [Evidence](archive/dedup-ledger/plan.md#merge-ref)
- A job needing a skipped job is skipped unless its `if` calls a status function; `always()` also runs after a cancel: use `always() && !cancelled()`. [Evidence](archive/release-pipeline-hardening/plan.md#always)
- A PR group's `cancel-in-progress` also cancels runs on an unchanged head (a label, a re-run), whose `always()` aggregator posts FAILURE beside the survivor's check, and a skipped aggregator passes a required check: cancel only on a push's first attempt, never skip an aggregator. [Evidence](archive/ci-gates/plan.md#how-github-judges-a-required-check-with-several-runs-of-one-name)
- `git diff -M`'s R100 is not byte identity (compare blob ids and modes), and a pathspec splits a move across it into a delete and an add. [Evidence](archive/plans-scaffolding/plan.md#renames)
- A `gh stack` runs the plans gate on every arc head, so an arc cannot link a later arc's file; after the squash merge, merging `dev` into the old head is add/add. [Evidence](archive/ux-feedback/plan.md#stack-gate), [more](archive/amount-honesty/plan.md#add-add)

## Extension runtime

- A popup-to-background call rejects after 60 s unless its client overrides `getRequestTimeoutMs`: one awaiting a proof fails while the send lands. [Evidence](archive/e2e-reliability-fixes/plan.md#rpc-60s)
- `PopupManager` mounts every popup at start, never unmounting: setup waits for `show` or sits behind `v-if`. [Evidence](archive/home-holdings-pin/plan.md#popup-mounts)
- `EventHandler.invoke` drops an async handler's promise: awaiting it waits for nothing, a rejection escapes, event-chained cleanup is fire-and-forget. [Evidence](archive/backup-restore-corruption-fix/plan.md#async-events)
- An awaited helper adds a microtask, breaking a one-tick span: keep it inline. [Evidence](archive/approval-scope-follow/plan.md#microtask)
- A typed error survives only hops that name it (`walletErrorFromPayload`, `classifyOperationCatch`, `toWalletResponseError`); `viaPxe` rethrows `Error`. [Evidence](archive/harden-security-prerelease/plan.md#typed-errors)
- EntityStorage's `getAll()` hides undecodable rows, so a purge, dedupe or max+1 id misses them: key off `getKeys()`. [Evidence](archive/backup-restore-security-hardening/plan.md#hidden-rows)
- The local network's chain id is 0, so a truthiness guard on `chainId` skips every network e2e's chain: test `chainId === undefined`. [Evidence](archive/ux-owner-picks/plan.md#chain-zero)
- An error message carries text the log redactor never sees (`JSON.parse` quotes its input): log a fixed category, never the message. [Evidence](archive/backup-log-hygiene/plan.md#error-text)
- Classify a dApp call by address, selector and arguments, never its name; validate both sides before comparing normalised keys. [Evidence](archive/dapp-preexisting-fee/plan.md#classify), [more](archive/grant-check-address-case/plan.md#normalise)
- bb.js never closes its CRS cache (idb-keyval's `keyval-store`) once a page loads the CRS: deleting it blocks. [Evidence](archive/hd-delete-after-prove/plan.md#crs-cache)
- A MAC binds only what it names, and a row's stored `id` moves with the row: anchor it on the storage key; on a MAC failure refuse, never self-heal. Likewise an address commits to the original class id, not `currentContractClassId`: check an artifact against the original. [Evidence](archive/mac-identity-binding/plan.md#mac-scope), [more](archive/security-fixes-1/lessons/phase-6.md)

## Aztec

- Aztec 5 mints a block only for a pending tx, so waiting N blocks or `.simulate()` hangs a quiet sandbox: send a real tx. [Evidence](archive/aztec-5.0-upgrade/plan.md#quiet-blocks)
- Blocks above the proven tip can be pruned and a symbolic tag can name another fork per call: pin reads to one block hash; reconcile records above the tip. [Evidence](archive/incoming-public-transfers/plan.md#pruning)
- The node client retries a failed POST but not a 4xx refusal, so a refused retry can hide a send that landed (6.0.0-rc.1). [Evidence](archive/failed-send-check/plan.md#node-retries)
- HandshakeRegistry (6.0.0-rc.1): a PXE sync of an account without its keys skips its handshakes for good (only a gated sandbox shows it); a pair's first send uses it for every token, and the PXE takes a note's index (per token, sender, recipient) at proving: two such sends in flight collide. [Evidence](archive/hd-import-handshake-loss/plan.md#handshake-cursor), [more](archive/hd-same-token-concurrent-sends/plan.md#note-index)
- Half of field elements are no Aztec address and `0x${"a".repeat(64)}` exceeds the modulus: check fixture addresses (`isValidAztecAddress`). [Evidence](archive/hd-behaviour-alignment/plan.md#fixture-addresses)

## Agent tooling

- Agent Bash (zsh 5.9): `set -e` ignores the left of `&&`, a pipe returns its last stage's status, `$FILES` stays one word: test each exit code. [Evidence](archive/stable-release/plan.md#agent-shell)
- `pgrep -f` matches the agent's `zsh -c` wrapper, so a teardown can kill itself: signal your launcher's pgid, never `$$`/`$PPID`. [Evidence](archive/harden-findings-remediation/plan.md#pgrep)
- Under Puppeteer mobile emulation, `innerWidth` grows to the content, so `scrollWidth > innerWidth` never flags a sideways scroll: compare against the viewport width you set (25.8). [Evidence](archive/landing-store-buttons/plan.md#mobile-emulation-width)
- Take a red/green proof's old copy from the base SHA, never `HEAD`; rerun an environmental-looking red on the base first. [Evidence](archive/firefox-first-class-spike/plan.md#base-copy), [more](archive/aztec-5.0.1-line/plan.md#rerun-base)
