# Lessons

## Bun & deps

- When one `bun run --parallel` leg fails, Bun SIGINTs the rest (exit 130): blame the leg that printed `Exited with code N` (1.4.2, 2026-10). [Evidence](archive/isolated-linker-store/plan.md#exit-130)

## CI & gates

- Root `test` (so `audit:vue`) runs only `apps/extension`'s vitest config, in jsdom, without the packages' node-only tests; CI adds `test:all`, `test:release`, `test:ci-gating`. [Evidence](archive/harden-security-prerelease/plan.md#root-test)
- `vue-tsc` skips an SFC whose script lacks `lang="ts"` (most of the extension's), so a bad prop there passes `typecheck:all` (3.3.10, 2026-10). [Evidence](archive/storage-migration-backup/plan.md#vue-tsc)
- Vue unit tests (3.5.42, VTU 2.4.11, 2026-10): only `vue`/`vue-router` auto-import; stub `@nulo/design`'s recursing `Button`; a 2nd `mount` strips the 1st's stubs. [Evidence](archive/ux-feedback/plan.md#vue-tests)
- A check that accepts a wrong state passes broken code: pair a never-happens test with a success control; match a captured identity exactly (whole `textContent`: `innerText` follows `text-transform`); stub only what production returns. [Evidence](archive/connect-window/plan.md#controls), [more](archive/harden-dedupe/plan.md#success-control)
- CodeQL's ReDoS query fails a PR on any regex it reaches, a test's or a helper's too: never put a free-form group beside `\s*`; split on the delimiter (2026-10). [Evidence](archive/forms-and-contacts/lessons/phase-3.md)

## Git & GitHub

- A PR lane builds `head.sha` with the merge ref's workflows, so a later `dev` fix is absent until you merge `dev`; a PR that conflicts with `dev` gets no run at all. [Evidence](archive/dedup-ledger/plan.md#merge-ref), [more](archive/connect-split-1/lessons/phase-3.md)
- `git diff -M`'s R100 is not byte identity (compare blob ids and modes), and a pathspec splits a move across it into a delete and an add. [Evidence](archive/plans-scaffolding/plan.md#renames)

## Extension runtime

- A popup RPC fails 60 s after it began, the worker's Ready wait included, unless its client sets `requestTimeoutMs` (a proof outlasts it, so a send that lands reads as failed); a dropped port replays nothing: read config via `useConfigRead`. [Evidence](archive/e2e-reliability-fixes/plan.md#rpc-60s), [more](archive/account-session-life/lessons/phase-4.md), [more](archive/wallet-followups/lessons/phase-4.md)
- `PopupManager` keeps hidden popups mounted: gate setup on `show` or `v-if`. A profile switch or unlock change elsewhere reboots open pages in place, unsetting `appStore.network` first: reset held secrets. [Evidence](archive/home-holdings-pin/plan.md#popup-mounts), [more](archive/passkey-unlock-1/lessons/phase-A4.md), [more](archive/chaos-5/lessons/phase-1.md)
- A `<script setup>` local shadows a same-name prop in the template, `:label` shorthand included: never name a local after a prop (Vue 3.5.42, 2026-10). [Evidence](archive/send-picker-1/lessons/phase-1.md)
- A closing extension window runs no Vue teardown: await what it owes, bounded, as `endAndClose` does; a person's close leaves the page only a best-effort `beforeunload`. [Evidence](archive/fee-estimate-cancel-1/plan.md)
- `EventHandler.invoke` drops an async handler's promise: awaiting it waits for nothing, and a rejection escapes. [Evidence](archive/backup-restore-corruption-fix/plan.md#async-events)
- A typed error survives only hops that name it (`walletErrorFromPayload`, `classifyOperationCatch`, `toWalletResponseError`); `viaPxe` flattens the rest to `Error`. [Evidence](archive/harden-security-prerelease/plan.md#typed-errors)
- `getAll()` skips undecodable rows and a sealed root's unopened ones, so a purge, dedupe or max+1 id misses them: key off `getKeys()`. Gate a row on its reader's fields, not its writer schema; zod strips unknown keys, so a legacy variant forbids newer ones (zod 4.6.7, 2026-10). [Evidence](archive/backup-restore-security-hardening/plan.md#hidden-rows), [more](archive/passkey-unlock-1/lessons/phase-A1.md), [more](archive/passkey-unlock-1/plan.md#decision-ledger)
- Lifting a display gate (a hidden zero, a skipped row) shows the malformed stored values it hid: parse what newly renders (`utils/token-amount.ts`). [Evidence](archive/send-picker-1/lessons/phase-4.md)
- A flex item's automatic minimum width is its min-content, so a long data word needs `overflow-wrap: anywhere` (`break-word` leaves it). [Evidence](archive/wrap-1/plan.md#decisions)
- The local network's chain id is 0, so a truthiness guard on `chainId` skips every network e2e's chain: test `chainId === undefined`. [Evidence](archive/ux-owner-picks/plan.md#chain-zero)
- Classify a dApp call by address, selector and arguments, never its name; validate both sides before comparing normalised keys. [Evidence](archive/dapp-preexisting-fee/plan.md#classify), [more](archive/grant-check-address-case/plan.md#normalise)
- A MAC binds only what it names: key it on the storage key (a stored `id` moves with its row); refuse on failure, never self-heal. [Evidence](archive/mac-identity-binding/plan.md#mac-scope)
- Firefox lays out in 1/60 px, and a page's `storage.local` read from its own `onChanged` listener can return the old value (153.0.4, 2026-10): use `newValue`. [Evidence](archive/type-roles/plan.md#lessons), [more](archive/onboarding-3/lessons/phase-4.md)
- Code paused across an await checks its `ActiveSession` or pick, never a re-keyed id or a counter, and the live state after its last await. [Evidence](archive/dapp-dispatch-hold/plan.md#mechanics-that-are-not-obvious), [more](archive/docs-1/lessons/phase-5.md), [more](archive/lock-ux-1/lessons/phase-5.md)
- A `Lock` watchdog handoff admits a successor but never stops the displaced holder, which keeps writing. [Evidence](archive/incoming-transfers/decisions.md#decision-ledger)
- A C1 hook's `dispose()` must be terminal: a run fence that only drops answers in flight lets a continuation released after unmount start a new call. [Evidence](archive/incoming-transfers/lessons/phase-3.md)

## Aztec

- Blocks above the proven tip can be pruned and a symbolic tag can name another fork per call: pin reads to one block hash; reconcile records above the tip. [Evidence](archive/incoming-public-transfers/plan.md#pruning)
- An address binds its original class: check artifacts against it; the PXE reports that class, a call runs the node's current one (`node.getContract`). [Evidence](archive/security-fixes-1/lessons/phase-6.md), [more](archive/tokens-and-balances/lessons/phase-3.md)
- The node client retries a failed POST but not a 4xx refusal, so a refused retry can hide a send that landed (6.0.0, 2026-10). [Evidence](archive/failed-send-check/plan.md#node-retries)
- Half of field elements are no Aztec address and `0x${"a".repeat(64)}` exceeds the modulus: check fixtures with `isValidAztecAddress`. `schemas.Fr.safeParse` throws on `""` or `"abc"` (6.0.0, 2026-10). [Evidence](archive/hd-behaviour-alignment/plan.md#fixture-addresses), [more](archive/dapp-ingress-grants/lessons/phase-3.md)
- PXE `getNotes` syncs first and swallows a failed sync, so it can answer from a stale anchor: trust a read only when the synced block hash before and after it is the node's tip (6.0.0, 2026-10). [Evidence](archive/incoming-transfers/lessons/phase-3.md)

## Agent tooling

- Agent Bash (zsh 5.9, 2026-10): `set -e` ignores the left of `&&`, a pipe returns its last stage's status, `$FILES` stays one word: test each exit code. [Evidence](archive/stable-release/plan.md#agent-shell), [more](archive/lessons-budget-1/recon.md)
- `pgrep -f` matches its own `zsh -c` wrapper and any agent prompt naming the pattern: anchor it (`^(bun|node) .*vitest`) and signal your launcher's pgid, never `$$`/`$PPID`; a signal-killed Node child's `exitCode` is null: wait on `signalCode`. [Evidence](archive/harden-findings-remediation/plan.md#pgrep), [more](archive/code-followups-2/lessons/phase-2.md)
- Take a red/green proof's old copy from the base SHA, never `HEAD`; rerun an environmental-looking red on base first; grep a green run for a suspect log line. [Evidence](archive/firefox-first-class-spike/plan.md#base-copy), [more](archive/code-followups-1/plan.md#outcome)
