# flake-1 phase 1: the base on Firefox 158.0

Base `9ce6bb0bd`, the armed smoke dist, `toolbar-panel.test.ts` at retry 0. A scratch patch timed the cancel half from the Node side (click round trip plus a 100 ms poll) and, for the forced runs, called `bringToFront(contactsWindow)` before the click. load1/5/15 read before each run.

| run | kind | result | cancel half | file wall-clock | load |
|---|---|---|---|---|---|
| 1 | normal | green | 266 ms | 142.31s | 117.59 102.78 96.41 |
| 2 | normal | green | 238 ms | 125.34s | 95.11 103.20 98.11 |
| 3 | normal | green | 229 ms | 119.87s | 71.39 93.35 95.25 |
| 4 | normal | green | 234 ms | 130.09s | 65.17 82.04 90.78 |
| 5 | normal | green | 226 ms | 119.03s | 72.26 80.39 89.11 |
| 6 | normal | green | 234 ms | 116.77s | 42.92 68.14 83.68 |
| 7 | normal | green | 228 ms | 112.25s | 23.56 50.97 75.03 |
| 8 | normal | green | 223 ms | 110.94s | 16.52 39.87 68.30 |
| 9 | normal | green | 225 ms | 129.31s | 19.08 33.16 62.54 |
| 10 | normal | green | 217 ms | 111.41s | 46.58 43.50 62.79 |
| 11 | forced | red | MISS after 10176 ms | 106.28s | 31.27 38.00 58.59 |
| 12 | forced | red | MISS after 10206 ms | 117.45s | 52.99 40.83 57.23 |
| 13 | forced | red | MISS after 10150 ms | 113.97s | 86.52 57.01 61.09 |

- Normal: 10 of 10 green; the cancel came 217-266 ms after the click; the file took 110.9-142.3 s.
- Forced focus: 3 of 3 missed with #1222's fingerprint, `last: {"type":"file","connected":true,"active":true}`. So the cause traced on 153.0.4 holds on 158.0: a focused window's native pick is never answered.
- Gate: passed (a forced run missed).
