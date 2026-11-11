# test-issues-1: phase 1 (#1763, the Senders sweep)

## Before the fix (scratch log, base test code, the Senders test only, Chrome, retry 0)

`[scratch] Senders: loading-state at sweep start: <bool>` logged right after `goAndSweep`'s ready wait.

| Run | Green | Wall-clock | load1 | `loading-state` at the sweep |
|---|---|---|---|---|
| 1 | yes | 58 s | 311 | true |
| 2 | yes | 50 s | 240 | false |
| 3 | yes | 54 s | 229 | true |
| 4 | yes | 51 s | 216 | false |
| 5 | yes | 53 s | 189 | false |

Two of five runs began the Senders sweep with `FETCHING SENDERS` on the page. They passed because the fetch did not end between the narrow check's two measurements; #1763's CI red is the run where it did.

## After the fix (whole file, retry 0, scratch log after the settle wait)

| Browser | Runs | Green | Wall-clock per run | load1 | Senders settle wait | `loading-state` at the sweep |
|---|---|---|---|---|---|---|
| Chrome | 5 | 5 | 128 to 160 s | 193 to 314 | 2 to 310 ms | 0 of 5 |
| Firefox | 5 | 5 | 189 to 262 s | 162 to 230 | 206 to 537 ms | 0 of 5 |

Every other `goAndSweep` target settled in 2 to 31 ms, so none of them waited on a list. The scratch line was removed before the commit.
