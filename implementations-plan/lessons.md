# Lessons

## Bun & deps

- When one `bun run --parallel` leg fails, Bun SIGINTs the rest (exit 130): blame the leg that printed `Exited with code N` (1.4.2). [Evidence](archive/isolated-linker-store/plan.md#exit-130)

## CI & gates

- Root `test`/`audit:vue` run only `apps/extension` (with aztec-runtime's tests, in jsdom); CI adds `test:all`, `test:release`, `test:ci-gating`. [Evidence](archive/harden-security-prerelease/plan.md#root-test)
- `vue-tsc` skips an SFC whose script lacks `lang="ts"` (most of the extension's), so a bad prop there passes `typecheck:all`. [Evidence](archive/storage-migration-backup/plan.md#vue-tsc)
- Vue unit tests (3.5.41, VTU 2.4.11): only `vue`/`vue-router` auto-import; stub `@nulo/design`'s recursing `Button`; fake timers run a native event's first listener only; a second `mount` strips the first's stubs. [Evidence](archive/ux-feedback/plan.md#vue-tests)
- A check accepting a wrong state passes broken code: pair never-happens tests with a success control; match screenshot state exactly; stub only what production returns. [Evidence](archive/connect-window/plan.md#controls), [more](archive/harden-dedupe/plan.md#success-control)
- CodeQL's ReDoS query fails a PR on any regex it reaches, a test's or a helper's too: never put a free-form group beside `\s*`; split on the delimiter. [Evidence](archive/forms-and-contacts/lessons/phase-3.md)
- A change to when a window's Confirm enables reaches every e2e that presses it, refusals included (`authwit-lifecycle`, `scope-refusal`): run those before the PR. [Evidence](archive/harden-security-fixes-2/lessons/phase-6.md)

## Git & GitHub

- A `pull_request` run takes workflows from the merge ref but builds `head.sha`, so a later `dev` fix is absent: merge `dev` first. [Evidence](archive/dedup-ledger/plan.md#merge-ref)
- A job needing a skipped job is skipped unless its `if` calls a status function; `always()` also runs after a cancel: use `always() && !cancelled()`. [Evidence](archive/release-pipeline-hardening/plan.md#always)
- `git diff -M`'s R100 is not byte identity (compare blob ids and modes), and a pathspec splits a move across it into a delete and an add. [Evidence](archive/plans-scaffolding/plan.md#renames)
- A `gh stack` runs the plans gate on every arc head, so an arc cannot link a later arc's file; after the squash merge, merging `dev` into the old head is add/add. [Evidence](archive/ux-feedback/plan.md#stack-gate)
- Parallel arcs of one plan each took the next free decision id and collided at every merge: give each arc its own id range. [Evidence](archive/harden-security-fixes-2/plan.md#decision-ledger)

## Extension runtime

- A popup call waits for the worker's Ready and fails 60 s after it began unless its client sets `requestTimeoutMs`, so one awaiting a proof fails as the send lands; a dropped port replays nothing: read config via `useConfigRead`. [Evidence](archive/e2e-reliability-fixes/plan.md#rpc-60s)
- `PopupManager` mounts every popup at start for good: gate setup on `show` or `v-if`. A profile switch elsewhere updates open pages in place: reset held secrets on a profile-id change. [Evidence](archive/home-holdings-pin/plan.md#popup-mounts), [more](archive/security-ui-1/lessons/phase-2.md)
- `EventHandler.invoke` drops an async handler's promise: awaiting it waits for nothing, and a rejection escapes. [Evidence](archive/backup-restore-corruption-fix/plan.md#async-events)
- A typed error survives only hops that name it (`walletErrorFromPayload`, `classifyOperationCatch`, `toWalletResponseError`); `viaPxe` rethrows `Error`. [Evidence](archive/harden-security-prerelease/plan.md#typed-errors)
- EntityStorage's `getAll()` hides undecodable rows, so a purge, dedupe or max+1 id misses them: key off `getKeys()`. [Evidence](archive/backup-restore-security-hardening/plan.md#hidden-rows)
- The local network's chain id is 0, so a truthiness guard on `chainId` skips every network e2e's chain: test `chainId === undefined`. [Evidence](archive/ux-owner-picks/plan.md#chain-zero)
- An error message carries text the log redactor never sees (`JSON.parse` quotes its input): log a fixed category. [Evidence](archive/backup-log-hygiene/plan.md#error-text)
- Classify a dApp call by address, selector and arguments, never its name; validate both sides before comparing normalised keys. [Evidence](archive/dapp-preexisting-fee/plan.md#classify), [more](archive/grant-check-address-case/plan.md#normalise)
- A MAC binds only what it names: key it on the storage key (a stored `id` moves with its row); refuse on failure, never self-heal. An address binds its original class: check artifacts against it; the PXE reports that class, a call runs the node's current one (`node.getContract`). [Evidence](archive/mac-identity-binding/plan.md#mac-scope)
- CSS Modules refuse `composes` in `:global()`; `text-transform` changes `innerText`, not `textContent`; Firefox lays out in 1/60 px, and a page's `storage.local` read from its own `onChanged` listener can return the old value: use `newValue`. [Evidence](archive/type-roles/plan.md#lessons), [more](archive/onboarding-3/lessons/phase-4.md)
- A session id re-keys after its session ends: code paused across an await checks its own `ActiveSession` object, not the id, and re-checks the live session after its last await. [Evidence](archive/dapp-dispatch-hold/plan.md#mechanics-that-are-not-obvious), [more](archive/docs-1/lessons/phase-5.md)
- A `Lock` watchdog handoff admits a successor but never stops the displaced holder, which keeps writing: a current ticket proves no wipe ran only beside a count of deleters still running. [Evidence](archive/incoming-transfers/decisions.md#decision-ledger)
- A C1 hook's `dispose()` must be terminal: a run fence that only drops answers in flight lets a continuation released after unmount start a new call. [Evidence](archive/incoming-transfers/lessons/phase-3.md)

## Aztec

- 6.0.0-rc.3 split the line (`@aztec-foundation/*` toolchain rc.6, the bb.js pin Presto proves); the PXE refuses other oracle majors: run only rc.3 builds. [Evidence](archive/aztec-rc3/plan.md#phase-0-classification)
- Blocks above the proven tip can be pruned and a symbolic tag can name another fork per call: pin reads to one block hash; reconcile records above the tip. [Evidence](archive/incoming-public-transfers/plan.md#pruning)
- The node client retries a failed POST but not a 4xx refusal, so a refused retry can hide a send that landed (6.0.0-rc.1). [Evidence](archive/failed-send-check/plan.md#node-retries)
- HandshakeRegistry (6.0.0-rc.1): a pair's first send uses it for every token; the PXE takes a note's index (per token, sender, recipient) at proving: two such sends in flight collide. [Evidence](archive/hd-same-token-concurrent-sends/plan.md#note-index)
- Half of field elements are no Aztec address and `0x${"a".repeat(64)}` exceeds the modulus: check fixtures with `isValidAztecAddress`. `schemas.Fr.safeParse` throws on `""` or `"abc"` (6.0.0-rc.1). [Evidence](archive/hd-behaviour-alignment/plan.md#fixture-addresses), [more](archive/dapp-ingress-grants/lessons/phase-3.md)
- PXE `getNotes` syncs first and swallows a failed sync, so it can answer from a stale anchor: trust a read only when the synced block hash before and after it is the node's tip (6.0.0-rc.1). [Evidence](archive/incoming-transfers/lessons/phase-3.md), [more](archive/incoming-transfers/lessons/phase-2.md)

## Agent tooling

- Agent Bash (zsh 5.9): `set -e` ignores the left of `&&`, a pipe returns its last stage's status, `$FILES` stays one word: test each exit code. [Evidence](archive/stable-release/plan.md#agent-shell)
- `pgrep -f` matches its own `zsh -c` wrapper and any agent prompt naming the pattern: anchor it (`^(bun|node) .*vitest`); signal your launcher's pgid, not `$$`/`$PPID`; a signal-killed Node child's `exitCode` is null: wait on `signalCode`. [Evidence](archive/harden-findings-remediation/plan.md#pgrep)
- Take a red/green proof's old copy from the base SHA, never `HEAD`; rerun an environmental-looking red on base first; grep a green run for a suspect log line. [Evidence](archive/firefox-first-class-spike/plan.md#base-copy)
