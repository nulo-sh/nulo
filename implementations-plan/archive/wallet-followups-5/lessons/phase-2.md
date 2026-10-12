# Phase 2: a gone window closes quietly (#312)

## Step 1, K: the window closes through `closeCurrentWindow` in one Firefox run

One Explore agent (sonnet) read the six files, their fixtures and the page code; the line numbers below were re-read from the tree. File-scoped fixtures (`registeredExtension`, `dappConnectedExtension`, `localNetworkExtension`) close once per file; test-scoped ones (`registeredExtensionPerTest`, `dappConnectedExtensionPerTest`, `dappConnectedExtensionWithTransactionCap`) once per test. "Double" means the background also removes the window.

| file:line | step | window | double | per run |
|---|---|---|---|---|
| `fixtures/extension.ts` connect fixture → `approveVerify` | `dappConnectedExtension`, for `cap-request-reject` | verify | no | 1 |
| `cap-request-reject.test.ts:30` | `rejectCapabilities` | capabilities | yes | 1 |
| `connect-deny.test.ts:27` | `denyDiscover` | discover | yes | 1 |
| `connect-unserved-chain.test.ts:31` | the notice's close button, both tests | network-unavailable | yes | 2 |
| `connect-unserved-chain.test.ts:40` | `approveVerify`, both tests | verify | no | 2 |
| `connect-unserved-chain.test.ts:42` | `grantCapBundle` → `approveCapabilities`, both tests | capabilities | yes | 2 |
| `connect-one-window.test.ts:197` | `approveVerify` | verify | no | 1 |
| `connect-one-window.test.ts:211` | `rejectCapabilities` | capabilities | yes | 1 |
| `snack-placement.test.ts` three tests | `dappConnectedExtensionWithTransactionCap`: verify, capabilities Approve | verify / capabilities | no / yes | 3 / 3 |
| `snack-placement.test.ts:221` | `approveExecute` (via `:301` and `:322`) | execute | yes | 2 |
| `cap-window.test.ts` four Firefox tests | connect fixture → `approveVerify` | verify | no | 4 |
| `cap-window.test.ts:116` | `rejectCapabilities` via `rejectWindow` at `:175`, `:198`, `:268` (`:213` is skipped on Firefox) | capabilities | yes | 3 |
| `cap-window.test.ts:279`, `:286` | `approveCapabilities` | capabilities | yes | 2 |
| `cap-window.test.ts:111` | `rejectExecute` via `callIntentAsks` at `:289` | execute | yes | 1 |

K = 29 per Firefox run, 18 of them double removes (only those can print a lost race). N × K ≥ 20 holds from N = 1, so N is set by the base total reaching 3.

## Step 3, the red run on the base util

`cd apps/extension && bun --bun vitest run src/utils/close-current-window.test.ts`:

```
× a window another closer removed first closes quietly
AssertionError: expected [ Error: Invalid window ID: 7 ] to deeply equal []
Tests  1 failed | 4 passed (5)
```

Case 3's three setups pass on base by design (D3): they pin that an unconfirmed failure still rejects with the browser's own error.

## Step 2, the base runs (D12)

One Firefox run of the six files at base (the build carried only Phase 1's test, manifest and CLAUDE.md changes, so the extension equals 04137a0's): exit 0, 12 passed and 1 skipped (`cap-window.test.ts:203`, Chrome-only). Its stderr carried 4 lines:

```
JavaScript error: undefined, line 0: Error: Invalid window ID: 85
JavaScript error: undefined, line 0: Error: Invalid window ID: 77
JavaScript error: undefined, line 0: Error: Invalid window ID: 69
JavaScript error: undefined, line 0: Error: Invalid window ID: 95
```

N = 1: N × K = 29 ≥ 20 and the base total 4 ≥ 3. The head gets the same single run (Phase 3).

## Steps 4 and 5

`close-current-window.ts` as § Proposed architecture shows, with the rethrow of D-orch-2 in place of the dropped log line. The new file passes 5/5.

## Gate

`bun --bun vitest run src/utils/close-current-window.test.ts src/wallet/services/account/serialize-per-tuple.test.ts src/popup/auth-guard.test.ts src/composables/useDappApprovalWindow.test.ts src/popup/windows`: 40 files, 495 tests passed (every page test unchanged, the lastError `TypeError` pins included). `bun run lint` exit 0; `bun run typecheck:all` exit 0. Pass.
