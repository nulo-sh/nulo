# test-infra-1: phase 3 (window harness and keyboard contract)

## Counts (`bun --bun vitest run … --reporter=verbose`, titles sorted and diffed)

| suite | before | on the harness | after deletions |
|---|---|---|---|
| `popup/windows/capabilities/index.test.ts` | 36 | 36, titles equal | 33 |
| `popup/windows/discover/index.lifecycle.test.ts` | 16 | 16, titles equal | 13 |
| `popup/windows/execute/index.test.ts` | 49 | 49, titles equal | 46 |
| `popup/components/popups/ChangeAuthwitsRegistryPopup.test.ts` | 21 | 21, titles equal | 21 |
| `popup/components/popups/RevokeAuthwitsPopup.test.ts` | 25 | 25, titles equal but for the describe of its two own cases | 25 |

## Deletion table

Each deleted test re-pinned a shell contract. The shell suite (`composables/useDappApprovalWindow.test.ts`) pins it on the shell, and a kept test in the same window file asserts the window's own part.

| deleted, in each of the three suites | shell pin | kept window test |
|---|---|---|
| `A3: auth redirect short-circuits — pageAwaitingAuth set, no init, no beforeunload` | `:148` auth redirect | `A2`: the window's init (the profile fetch) is the one the shell gates |
| `A6: closeWindow(true) removes the beforeunload listener; closeWindow() keeps it; both close` | `:187` | `B8` (reject: `closeWindow(true)` detaches, then closes) and the overlay dismiss (`closeWindow()` keeps the listener): capabilities and discover `A6: overlay @dismiss…`, execute `D14` |
| `A7: no double-reject — a decided reject detaches the listener before the window unloads` | `:200` exact listener detached | `B8`: the window's reject goes through `closeWindow(true)` |

Kept, as planned: A1 and A5 (each window's own service lists), A2 and both A4 cases (the window's own init: the profile fetch, then the payload load), C12 (the window subscribes the guard to its own profile client), the A6 overlay dismiss, B8-B10 and every per-window test.

## Notes

- The harness shares one router whose route is `/windows/approval?requestId=req-route`; each window's file had its own window name in the path, which only the deleted A3 read.
- The clients are constructed with `new`, which an arrow cannot be. The window suites use `function` expressions under the `*.test.ts` override of `useArrowFunction`; the harness is not a test file, so it uses function declarations instead of a suppression.
- `resetWindowHarness` replaces the state object's refs and app store each test, as the suites' `afterEach` did; capabilities sets its `networks: []` in its own `beforeEach`, execute adds `chrome.runtime.getURL` in its own.
- Red run (scratch, restored, not committed): replacing each popup's `@keydown.enter="refuseRepeatEnter"` with an inert attribute fails 3 contract tests per popup (the repeat-only Enter and both composing Enters) and nothing else.
