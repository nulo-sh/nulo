# e2e-followups-4 — phase 1 (reproduce and classify) log

## Phase 0 preflight (2026-10-12)

- Worktree path confirmed; `6488b1b` is an ancestor of `origin/dev` (dev HEAD `6488b1b`); #308 is `OPEN`.
- One JSON-RPC request (`aztec_getNodeInfo`) to the Testnet node from a scratch script: HTTP 200, the reply carries a `result`. The live node answers this host.
- Nightlies: the last three (10-09, 10-10, 10-11) are listed; the 10-12 run does not exist yet (00:02 UTC).

## Builds (2026-10-12)

- No `.env*` file in `apps/extension` or the root. Built in the plan's order with its full `env -u` lists: release Chrome and Firefox (copied to the scratch `release/` dirs), armed Chrome and Firefox (copied to `armed/`, left in `dist/`). Release dirs: none of `_build-extension.yml`'s test-only markers found. Armed dirs: `NULO_E2E_TOKEN_SEEDS_BUILD_STAMP` and `nulo:e2e:csp-violations` found, the price-map and proverless stamps absent. All four manifests carry the same `host_permissions` (loopback included) and CSP.

## Runs

The probe (P0 before the seed, P1 with the menu open, P2 after ArrowDown; local, never committed) on the plan's five cells, `taskset -c 0,1`, `--retry=0`, one run at a time, 00:04 to 00:23 UTC. Host load (1-minute average) per cell start: C2 38.6, C1 90.5, C3 85.9, F1 95.5, F2 101.4, on 192 cores; lane `wallet-followups-5` and another worktree's network run held ports on this host throughout. No attempt was replaced; no host fault.

| Cell | Slots | Red | Reds reproduced as defined | Runs with a discovered row by P2 | Discovered row listed before the seed | Seed first with a discovered row in the menu |
|---|---|---|---|---|---|---|
| C1 release build, artifact mode (the nightly) | 21 | 18 | 18 | 20 | 18 | 1 |
| C2 armed build, guarded (the PR lane) | 21 | 0 | — | 0 | 0 | 0 |
| C3 armed build, artifact mode | 21 | 16 | 16 | 21 | 16 | 3 |
| F1 Firefox release build, artifact mode | 1 | 1 | 1 | 1 | 1 | 0 |
| F2 Firefox armed build, guarded | 1 | 0 | — | 0 | 0 | 0 |

- Every red is at `send-keyboard.test.ts:134` with the nightly's message, focused row a discovered id. Each one meets the plan's definition in full (checked by a scratch verifier over every log): a stored row at the protocol sponsor address, `type` 1, the scope's profile and chain, not a seeded id, listed before `e2e-protocol-fpc-1` at P2.
- **P0 held no FPC row in any of the 65 runs**; every discovered row first appears at P1, so discovery stored its rows between P0 and the menu opening. That brackets the writes; it does not show that discovery had started by P0 (Home's gas read during `registerProfile` makes that likely, Fact 6), and it does not matter to Fix A, which holds the node before the profile exists.
- Every discovered row is at a protocol address with its own type: 84 sightings of type 1 at the sponsor address, 74 of type 2 at the PrivateFPC address. No other row in any cell.
- **I2 holds on Chrome**: in all 38 Chrome runs whose menu listed both sponsors, the order is the ids' byte order (the Firefox red too). The four greens with a discovered sponsor in the menu all have an id after `e2e-protocol-fpc-1` (`eb0a4861`, `e9526649`, `f9b5c98c`, `f9ccc4bf`); every red's id sorts before it. The three other greens with a discovered row (C1 slot 2, C3 slots 9 and 17) had it stored after the Send page's read, so the menu never listed it (Fact 8). C1 slot 11 had no discovered row by P2. The one Firefox red fits the same order (`82fbf670`); one sample cannot show Firefox's order.
- The nightly's own sample fits: `da2d6064` sorts before the seed. Its Firefox twin's green fits either the late write or a later-sorting id.
- C1 against C3: both reproduce (18 and 16 of 21). The difference in rate is not assigned a cause.
- Neighbours: the slot-0 whole-file runs of C1, C3 and F1 passed the other four tests (the `priced` ones included); no neighbour observation.
- The 10-12 nightly does not exist yet (read 00:23 UTC; scheduled after this phase). Not waited for (D-orch-5).

## Classification

- The plan's rules, in order: rule 1 matches first, on F1, a Firefox red of the fee-picker test (it meets the reproduced definition in full). Everything else falls under rule 2 (C1 and C3 reproduce; no non-seeded row in C2 or F2; no row at any other address).
- Per rule 1, consulted Codex with the tally (gpt-6.1-sol, high, read-only; session `01a12d7f`, account `alejo-icloud` through the environment's `CODEX_ACCOUNT=best`). Verdict: `same cause: proceed with Fix A`. The F1 red carries the same evidence as the Chrome reds; nothing in the tally names another writer or a Firefox-specific focus failure; the greens fit asynchronous discovery and random ids; the C1/C3 rate difference needs no second cause. It asked to narrow the P0 timing claim (done above) and stressed that `hits()` and `stub.requests()` prove some requests were redirected, not every one: the never-happens assertions and Phase 3 on the release build carry that. No further measurement before the fix.
- **Classification: I1 holds on both browsers.** The live Testnet node lets the wallet's own protocol-FPC discovery store a second Nulo sponsor beside the seed; the menu orders the two by id, and a random id that sorts before `e2e-protocol-fpc-1` takes the first ArrowDown. This is the lane brief's outcome 1 (the test assumes its seeded sponsor is the only one, which the picker does not promise) and not a product fault; Fix A follows. D-orch-2: no other cause, so the arc proceeds.
- Probe reverted: `git checkout -- apps/extension/tests/e2e/send-keyboard.test.ts`.

### Per attempt

| cell | slot | att | rc | tests | load | P0 rows | P1 menu (items) | P2 focused | non-seeded rows (id, sponsorAddr, type, when) | failure |
|---|---|---|---|---|---|---|---|---|---|---|
| C2 | 0 | 1 | 0 | 5 passed (5) | 51.77 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 1 | 1 | 0 | 1 passed , 4 skipped (5) | 38.60 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 2 | 1 | 0 | 1 passed , 4 skipped (5) | 35.77 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 3 | 1 | 0 | 1 passed , 4 skipped (5) | 34.92 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 4 | 1 | 0 | 1 passed , 4 skipped (5) | 40.71 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 5 | 1 | 0 | 1 passed , 4 skipped (5) | 40.27 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 6 | 1 | 0 | 1 passed , 4 skipped (5) | 41.59 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 7 | 1 | 0 | 1 passed , 4 skipped (5) | 43.64 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 8 | 1 | 0 | 1 passed , 4 skipped (5) | 74.36 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 9 | 1 | 0 | 1 passed , 4 skipped (5) | 73.40 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 10 | 1 | 0 | 1 passed , 4 skipped (5) | 67.75 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 11 | 1 | 0 | 1 passed , 4 skipped (5) | 63.42 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 12 | 1 | 0 | 1 passed , 4 skipped (5) | 80.81 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 13 | 1 | 0 | 1 passed , 4 skipped (5) | 76.81 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 14 | 1 | 0 | 1 passed , 4 skipped (5) | 80.70 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 15 | 1 | 0 | 1 passed , 4 skipped (5) | 86.97 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 16 | 1 | 0 | 1 passed , 4 skipped (5) | 88.39 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 17 | 1 | 0 | 1 passed , 4 skipped (5) | 84.79 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 18 | 1 | 0 | 1 passed , 4 skipped (5) | 76.98 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 19 | 1 | 0 | 1 passed , 4 skipped (5) | 79.19 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C2 | 20 | 1 | 0 | 1 passed , 4 skipped (5) | 85.54 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C1 | 0 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 90.47 | 0 | sponsored:90c3a8c0 > sponsored:e2e-protocol-fpc-1 | 90c3a8c0 | 0247bb12(addr 0x0b3bc795,t2,P1); 90c3a8c0(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '90c3a8c0' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 1 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 89.60 | 0 | sponsored:4eccfe37 > sponsored:e2e-protocol-fpc-1 | 4eccfe37 | 3b919417(addr 0x0b3bc795,t2,P1); 4eccfe37(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '4eccfe37' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 2 | 1 | 0 | 1 passed , 4 skipped (5) | 97.12 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | c4fd0016(sponsor,t1,P1) |  |
| C1 | 3 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 98.64 | 0 | sponsored:83cedeaf > sponsored:e2e-protocol-fpc-1 | 83cedeaf | 5fd1441b(addr 0x0b3bc795,t2,P1); 83cedeaf(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '83cedeaf' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 4 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 89.94 | 0 | sponsored:07c37968 > sponsored:e2e-protocol-fpc-1 | 07c37968 | 07c37968(sponsor,t1,P1); b860e85d(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '07c37968' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 5 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 86.17 | 0 | sponsored:4b53f2f7 > sponsored:e2e-protocol-fpc-1 | 4b53f2f7 | 4b53f2f7(sponsor,t1,P1); 639dc4d6(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '4b53f2f7' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 6 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 98.14 | 0 | sponsored:91a76cd3 > sponsored:e2e-protocol-fpc-1 | 91a76cd3 | 91a76cd3(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '91a76cd3' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 7 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 99.35 | 0 | sponsored:c960de50 > sponsored:e2e-protocol-fpc-1 | c960de50 | 0616fdaa(addr 0x0b3bc795,t2,P1); c960de50(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected 'c960de50' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 8 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 93.24 | 0 | sponsored:49353623 > sponsored:e2e-protocol-fpc-1 | 49353623 | 03c1844b(addr 0x0b3bc795,t2,P1); 49353623(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '49353623' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 9 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 92.38 | 0 | sponsored:6be7c2ab > sponsored:e2e-protocol-fpc-1 | 6be7c2ab | 4a1bcfb1(addr 0x0b3bc795,t2,P1); 6be7c2ab(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '6be7c2ab' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 10 | 1 | 0 | 1 passed , 4 skipped (5) | 94.01 | 0 | sponsored:e2e-protocol-fpc-1 > sponsored:eb0a4861 | e2e-protocol-fpc-1 | 17173f12(addr 0x0b3bc795,t2,P1); eb0a4861(sponsor,t1,P1) |  |
| C1 | 11 | 1 | 0 | 1 passed , 4 skipped (5) | 95.28 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
| C1 | 12 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 93.11 | 0 | sponsored:2f6c27aa > sponsored:e2e-protocol-fpc-1 | 2f6c27aa | 2f6c27aa(sponsor,t1,P1); ebb73b86(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '2f6c27aa' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 13 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 92.94 | 0 | sponsored:8dc4ee29 > sponsored:e2e-protocol-fpc-1 | 8dc4ee29 | 81fc40dc(addr 0x0b3bc795,t2,P1); 8dc4ee29(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '8dc4ee29' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 14 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 95.04 | 0 | sponsored:2c26d677 > sponsored:e2e-protocol-fpc-1 | 2c26d677 | 218be369(addr 0x0b3bc795,t2,P1); 2c26d677(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '2c26d677' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 15 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 88.04 | 0 | sponsored:0b955a47 > sponsored:e2e-protocol-fpc-1 | 0b955a47 | 0b955a47(sponsor,t1,P1); c0cd20b0(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '0b955a47' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 16 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 82.01 | 0 | sponsored:0f34bcbe > sponsored:e2e-protocol-fpc-1 | 0f34bcbe | 0f34bcbe(sponsor,t1,P1); 56bcd4f5(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '0f34bcbe' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 17 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 81.26 | 0 | sponsored:31c1eea0 > sponsored:e2e-protocol-fpc-1 | 31c1eea0 | 31c1eea0(sponsor,t1,P1); c2d2dd0d(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '31c1eea0' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 18 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 86.42 | 0 | sponsored:626eb041 > sponsored:e2e-protocol-fpc-1 | 626eb041 | 626eb041(sponsor,t1,P1); a1f79cc5(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '626eb041' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 19 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 83.65 | 0 | sponsored:72e72c98 > sponsored:e2e-protocol-fpc-1 | 72e72c98 | 1dc4465c(addr 0x0b3bc795,t2,P1); 72e72c98(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '72e72c98' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C1 | 20 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 82.57 | 0 | sponsored:5b0b1dd2 > sponsored:e2e-protocol-fpc-1 | 5b0b1dd2 | 5b0b1dd2(sponsor,t1,P1); 7948dd2c(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '5b0b1dd2' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 0 | 1 | 0 | 5 passed (5) | 85.90 | 0 | sponsored:e2e-protocol-fpc-1 > sponsored:e9526649 | e2e-protocol-fpc-1 | 74b50668(addr 0x0b3bc795,t2,P1); e9526649(sponsor,t1,P1) |  |
| C3 | 1 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 87.59 | 0 | sponsored:3ba2e4f9 > sponsored:e2e-protocol-fpc-1 | 3ba2e4f9 | 1058237a(addr 0x0b3bc795,t2,P1); 3ba2e4f9(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '3ba2e4f9' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 2 | 1 | 0 | 1 passed , 4 skipped (5) | 82.79 | 0 | sponsored:e2e-protocol-fpc-1 > sponsored:f9b5c98c | e2e-protocol-fpc-1 | 9eb7102a(addr 0x0b3bc795,t2,P1); f9b5c98c(sponsor,t1,P1) |  |
| C3 | 3 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 78.65 | 0 | sponsored:c0841530 > sponsored:e2e-protocol-fpc-1 | c0841530 | 91337c8a(addr 0x0b3bc795,t2,P1); c0841530(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected 'c0841530' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 4 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 74.77 | 0 | sponsored:ad1ebdd3 > sponsored:e2e-protocol-fpc-1 | ad1ebdd3 | ad1ebdd3(sponsor,t1,P1); e2e51ecd(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected 'ad1ebdd3' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 5 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 71.72 | 0 | sponsored:bd4754ac > sponsored:e2e-protocol-fpc-1 | bd4754ac | bd4754ac(sponsor,t1,P1); e7984493(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected 'bd4754ac' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 6 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 72.33 | 0 | sponsored:1ebeec22 > sponsored:e2e-protocol-fpc-1 | 1ebeec22 | 1ebeec22(sponsor,t1,P1); d9fc174c(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '1ebeec22' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 7 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 73.93 | 0 | sponsored:57d829cc > sponsored:e2e-protocol-fpc-1 | 57d829cc | 57d829cc(sponsor,t1,P1); d6939800(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '57d829cc' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 8 | 1 | 0 | 1 passed , 4 skipped (5) | 71.69 | 0 | sponsored:e2e-protocol-fpc-1 > sponsored:f9ccc4bf | e2e-protocol-fpc-1 | f9ccc4bf(sponsor,t1,P1) |  |
| C3 | 9 | 1 | 0 | 1 passed , 4 skipped (5) | 69.64 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | b711d695(sponsor,t1,P1) |  |
| C3 | 10 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 76.02 | 0 | sponsored:6e480e9c > sponsored:e2e-protocol-fpc-1 | 6e480e9c | 0e727635(addr 0x0b3bc795,t2,P1); 6e480e9c(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '6e480e9c' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 11 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 79.23 | 0 | sponsored:c1c4f197 > sponsored:e2e-protocol-fpc-1 | c1c4f197 | 1b88d839(addr 0x0b3bc795,t2,P1); c1c4f197(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected 'c1c4f197' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 12 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 75.59 | 0 | sponsored:b955fe73 > sponsored:e2e-protocol-fpc-1 | b955fe73 | 59956510(addr 0x0b3bc795,t2,P1); b955fe73(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected 'b955fe73' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 13 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 82.83 | 0 | sponsored:c0fd1e37 > sponsored:e2e-protocol-fpc-1 | c0fd1e37 | b393695e(addr 0x0b3bc795,t2,P1); c0fd1e37(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected 'c0fd1e37' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 14 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 80.86 | 0 | sponsored:adab1b12 > sponsored:e2e-protocol-fpc-1 | adab1b12 | 88d4ae12(addr 0x0b3bc795,t2,P1); adab1b12(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected 'adab1b12' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 15 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 77.91 | 0 | sponsored:56370c0a > sponsored:e2e-protocol-fpc-1 | 56370c0a | 56370c0a(sponsor,t1,P1); d6e7e63d(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '56370c0a' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 16 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 90.95 | 0 | sponsored:83758eeb > sponsored:e2e-protocol-fpc-1 | 83758eeb | 83758eeb(sponsor,t1,P1); a6b79fd9(addr 0x0b3bc795,t2,P1) | the focused row send-fee-method-sponsored: expected '83758eeb' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 17 | 1 | 0 | 1 passed , 4 skipped (5) | 93.65 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | b69b1be6(addr 0x0b3bc795,t2,P1); f681d8ab(sponsor,t1,P1) |  |
| C3 | 18 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 85.94 | 0 | sponsored:2c3f8640 > sponsored:e2e-protocol-fpc-1 | 2c3f8640 | 2c3f8640(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '2c3f8640' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 19 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 88.61 | 0 | sponsored:660b6ab7 > sponsored:e2e-protocol-fpc-1 | 660b6ab7 | 5d7154a8(addr 0x0b3bc795,t2,P1); 660b6ab7(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '660b6ab7' to be 'e2e-protocol-fpc-1' // Object.is equality |
| C3 | 20 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 92.44 | 0 | sponsored:b811ba50 > sponsored:e2e-protocol-fpc-1 | b811ba50 | 2cdec82d(addr 0x0b3bc795,t2,P1); b811ba50(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected 'b811ba50' to be 'e2e-protocol-fpc-1' // Object.is equality |
| F1 | 0 | 1 | 1 | 1 ⎯⎯⎯⎯⎯⎯⎯ | 95.49 | 0 | sponsored:82fbf670 > sponsored:e2e-protocol-fpc-1 | 82fbf670 | 1402a62b(addr 0x0b3bc795,t2,P1); 82fbf670(sponsor,t1,P1) | the focused row send-fee-method-sponsored: expected '82fbf670' to be 'e2e-protocol-fpc-1' // Object.is equality |
| F2 | 0 | 1 | 0 | 5 passed (5) | 101.38 | 0 | sponsored:e2e-protocol-fpc-1 | e2e-protocol-fpc-1 | none |  |
