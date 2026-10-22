# pxe-limits-1, phase 3: sync, discovery, growth

Probe `_probe-pxe-sync` (scratch), Chrome unless named, proverless, local sandbox, one profile with one account and the fixture token. A *window* is one empty block (`aztecDebug_mineBlock`), then every PXE call until the wallet's next private scan tick and 2 s of quiet; it sums those calls' node requests and tags. *Cold direct* is a `note.getNotesRaw` issued right after a block, before any other caller; *warm* the same call right after it. Two windows and three cold/warm pairs per point. Host 188 cores, load1 beside each run.

## Notes axis (`p3-notes-chrome-5`, 2026-10-21 22:39-23:17Z, load1 133-203)

| Notes held | Tags per window | Node calls | Window | Cold direct (calls / tags) | Warm |
|---|---|---|---|---|---|
| 0 | 170 | 14-16 | 24.0-27.7 s | 775 ms (8 / 169) | 104 ms |
| 1 | 256 | 16-20 | 11.2-24.2 s | 622 ms (10 / 255) | 113 ms |
| 10 | 256 | 16-18 | 23.9-28.4 s | 626 ms (10 / 255) | 104 ms |
| 100 | 256-257 | 17-21 | 53.2-55.5 s | 571 ms (10 / 255) | 107 ms |

A window is mostly the wait for the 30 s scan tick; the tags barely move with the notes held (the first note adds one handshake's 86 tags, below; later notes add none up to 100, and 1,000 notes carry four), so H2's prediction holds on this axis. OPFS 7.7 → 8.0 MiB at 100 notes; process-tree PSS 764-867 MiB.

**The wallet's balance read grows with the notes held.** While the next 900 notes arrived (4 per tx, one block per tx; 100 to 1,000 held), the PXE run time of each balance `executeUtility` and of the scanner's `getNotes`, binned by notes held at the time (interpolated from the mint log):

| Notes held | Balance `executeUtility`: n, median, max (ms) | Scanner `getNotes`: n, median, max (ms) |
|---|---|---|
| 0-99 | 16, 99, 1,534 | 33, 588, 3,048 |
| 100-199 | 5, 600, 1,663 | 11, 2,041, 3,033 |
| 200-299 | 6, 969, 1,386 | 12, 1,993, 4,954 |
| 300-399 | 5, 1,731, 2,465 | 10, 1,818, 3,055 |
| 400-499 | 5, 3,251, 3,635 | 10, 1,884, 3,230 |
| 500-599 | 5, 4,394, 5,188 | 10, 2,159, 3,141 |
| 600-699 | 5, 8,139, 10,322 | 11, 2,023, 5,678 |
| 700-799 | 6, 7,957, 12,071 | 11, 2,276, 3,028 |
| 800-899 | 5, 11,212, 12,399 | 12, 2,252, 2,679 |
| 900-999 | 1, 10,532 | 0 |

Medians of an even count are the mean of the two middle values. The balance read grows superlinearly (700-799 sits just under 600-699), the scan stays near 2 s. Mechanism, traced in the installed code (6.0.0-rc.3), not counted: the Token's `balance_of_private` sums notes through `view_notes` in pages of 10 (`MAX_NOTES_PER_PAGE`), one `aztec_utl_getNotes` oracle call per page; the PXE answers each page by walking every note the contract holds in the note store, two SQLite reads per note through the OPFS worker, then filtering, sorting and slicing to the page (`@aztec-labs/pxe` `src/contract_function_simulator/oracle/utility_execution_oracle.ts:476-511`, `src/contract_function_simulator/pick_notes.ts:153-160`, `src/storage/note_store/note_store.ts:105-200`). One balance read is about N/10 full scans of the contract's notes: O(N²/10). The run ended with the profile auto-locked at 900 notes (the 30 min session TTL; the probe now sets an 8 h TTL), so the 1,000-note point is re-run with a quiet balance read at each point.

## Senders axis (`p3-senders-chrome`, 2026-10-21 23:18-23:32Z, load1 162-206)

| Senders | Tags per window | Node calls | Window | Cold direct (calls / tags) | Warm |
|---|---|---|---|---|---|
| 0 | 170 | 14-16 | 24.7-26.6 s | 830 ms (8 / 169) | 128 ms |
| 32 | 5,546 | 69-73 | 39.6-54.9 s | 5.1 s (62 / 5,545) | 62 ms |
| 128 | 21,674 | 230-237 | 30.2-36.6 s | 15.1 s (228 / 21,673) | 47 ms |
| 1,000 | 168,169 (the replacement document's first full sync, below) | 1,691 (1,683 private-log requests) | the scan's `getNotes` ran 70.8 s and 71.7 s | failed (below) | — |

Split by node method, every point here and on the accounts and tokens axes fits exactly: private-log tags = 84 × (watched tokens + 1) × scopes × (senders + own accounts) + scopes + 86 × handshakes, plus one public-log tag per watched token (two in a few windows, the spread in 5,546-5,547 and 21,674-21,675); the 1,000-sender tally is private-log tags only. The terms: one directional secret per (scope, sender or own account), own accounts added as implicit senders (`@aztec-labs/pxe` `src/logs/log_service.ts:232-271`); 84 indexes per fresh secret (`src/tagging/recipient_sync/sync_tagged_private_logs.ts:148-179`, `src/tagging/constants.ts:20`); one contract sync per watched token per block plus one for the handshake registry that a token's `sync_state` calls (`src/contract/contract_sync_service.ts:200-208`) (traced; the registry's sync is paid once per block, see the tokens axis). A handshake-backed sender adds two app-siloed secrets, 84 indexes plus a 2-tag constrained probe (`src/logs/log_service.ts:252-258`, `src/tagging/constants.ts:42`): the notes axis's 86-tag step at the first note. The first PXE call after a block costs 0.11-0.13 s per sender at this load. **The 128-sender cost: 21,674 tags and about 230 node requests per block, 15 s for the first call after it**, at load1 about 205 on this host. 128 is what dApps may add per chain (`DAPP_REGISTRATIONS_PER_CHAIN`); a restore adds at most 64 per network; the contacts import (512 rows per file) registers each row's sender with no total.

At 1,000 senders every block held the PXE write lock for about 71 s, so every other call waited that long (`getPublicTokenClassStatus` waited 70.8 s). 21 s after the second block's 71.7 s sync ended, the scanner's next 30 s tick sent a request and its 3 s offscreen health ping went unanswered (23:31:13.4 → 16.4, load1 137): the worker closed the document and created a new one, and the probe's next `getNotesRaw`, outstanding then, failed ("PXE request failed"); the new host's node tally shows one more full sync (1,691 node requests, 1,683 of them private-log requests, 168,169 tags). The records do not show what the document was doing when it did not answer.

## Tokens axis (`p3-tokens2-chrome`, 2026-10-22 06:09-06:17Z, load1 22-30)

| Watched tokens | Tags per window | Node calls | Cold direct (calls / tags) | Warm |
|---|---|---|---|---|
| 1 | 170, 170 | 18, 14 | 439 ms (8 / 169) | 109 ms |
| 4 | 425, 425 | 35, 35 | 408 ms (8 / 169) | 16 ms |
| 16 | 1,445, 1,445 | 119, 119 | 346 ms (8 / 169) | 48 ms |

Each extra watched token adds exactly 85 tags (one contract sync's 84 private-log indexes for the one own account, and one public-log tag) and 7 node requests per block; the handshake registry's sync stays one per block. Tokens multiply the sender term: by the formula, 16 tokens at 128 senders cost 184,229 tags a block (predicted, not run). The tokens are real token contracts deployed by the probe. The first run (`p3-tokens-chrome`) stopped after 1 token: Puppeteer's `browser.target()` threw "Browser target is not found" inside a drain; the drain now retries 3 times, and the re-run recorded no loss.

## Catch-up while locked (`p3-catchup-chrome`, 2026-10-21 23:42-00:09Z, load1 138-252)

The sandbox mines an empty block in 657-777 ms (p50 per 250, through `aztecDebug_mineBlock`), so 1,000 blocks take about 12 min and 10,000 about 2 h. During the run the node logged `Rollup__UnavailableTempC` reverts of `getCheckpoint` on its pending-checkpoint retries (75 lines while 1,100 blocks were mined); every block still landed.

- **100 empty blocks, locked:** unlock 737 ms, the anchor at the tip 1.7 s after unlock, a fresh balance at 3.3 s.
- **1,000 empty blocks, locked: one call catches up.** While the wallet is locked it makes no PXE call and runs no scan (none recorded from the lock to the unlock in either run). At unlock the first private scan syncs straight to the tip: one `getNotes` of 802 ms took the anchor from 107 to 1,107, against 967 ms for 100 blocks, so the catch-up does not grow with N. The first probe's freshness test (a balance row stamped after the unlock) never passed for a reason not established, and the stall watchdog ended it after 600 s of silence; the probe now takes a balance read after the last mined block as fresh and records the anchor at unlock.

Re-run with the fixed criterion (`p3-catchup2-chrome`, 2026-10-22 00:52Z-, load1 81-103):

- **1,000 empty blocks, locked:** unlock 651 ms; the unlock's scan synced 1,000 blocks in one 662 ms `getNotes`; the anchor read at the tip 1.3 s after the unlock began, the balance 2.0 s.
- **100 notes arrived while locked** (25 txs, one block each, finality advanced): the unlock's scan took 12.6 s in one `getNotes` (the notes' discovery), so the notes reached the wallet 14.4 s after the unlock and the balance 15.2 s; the probe's own anchor read queued behind it until 13.7 s. Notes that arrived while locked cost about 0.13 s each at unlock at this load (load1 about 89); empty blocks cost nothing per block.
- **Cold reopen after 1,000 empty blocks** (the browser closed while they were mined, relaunched on the same profile directory): relaunch 4.5 s, unlock 1.5 s, the anchor at the tip 6.9 s after the unlock began and the balance 8.1 s (load1 about 180), against 1.3 s and 2.0 s for the live worker. The records do not split the extra 5.6 s between the PXE's boot and the 1,000-block catch-up.

PXE-side node calls and tags over each whole test: 58 / 594 at 100 empty blocks and 58 / 594 at 1,000; 114 / 1,413 with 100 notes arrived; 39 + 31 / 258 + 258 for the cold reopen's two launches. H1 holds through 1,000 blocks: the node calls and tags to reach the tip do not grow with N (one scan call for 100 or 1,000), and notes that arrived meanwhile add their discovery (about 0.13 s each here). The foreign-transfer arm and the 10,000-block point follow below.

## Firefox subset (`p3-sub-firefox`, 2026-10-22 02:23-02:37Z, load1 35-66)

| Point | Tags per window | Node calls | Cold direct (calls / tags) | Warm |
|---|---|---|---|---|
| notes 0 | 170 | 14-16 | 484 ms (8 / 169) | 60 ms |
| notes 100 | 514-515 | 21-25 | 689 ms (13 / 513) | 79 ms |
| senders 0 | 170-172 | 14-20 | 459 ms (8 / 169) | 56 ms |
| senders 128 | 21,674-21,675 | 230-235 | 8.7 s (224 / 21,673) | 68 ms |

Catch-up after 100 empty blocks locked: unlock 628 ms, the anchor at the tip 2.2 s, a fresh balance 3.3 s (load1 45). The sender cost matches Chrome's tag for tag; the 100-note point carries 514 = 170 + 4 × 86 tags, four handshakes against Chrome's one, cause not traced.

## Catch-up with foreign traffic (`p3-foreign-chrome`, 2026-10-22 02:45-04:05Z, load1 14-116)

1,000 blocks mined while locked, each carrying one private transfer between two accounts the wallet does not hold: unlock 621 ms, the anchor at the tip 1.1 s after the unlock began, a fresh balance 1.75 s (load1 92). PXE-side node calls and tags over the whole test: 58 / 594, the same as the empty-block runs, so traffic the wallet holds no secret for adds nothing to its catch-up; H1 holds on this arm.

## 1,000 notes, quiet reads (`p3-notes1000-chrome`, 2026-10-22 04:07-04:32Z, load1 43-104)

1,000 notes minted (4 per tx, 250 txs) with the session TTL at 8 h, then one point at load1 53: tags per window 514 (170 + 4 × 86, four handshakes), 28-168 node calls, cold direct 1.32 s (22 / 513), warm 447 ms; the balance refresh's `executeUtility` ran 8.19 s (9.13 s wall). OPFS 10.7 MiB against 7.7 MiB empty: 3.1 KiB a note, against 3.0 KiB at the 100-note step (7.7 → 8.0 MiB). Process-tree PSS: 877 MiB in the one sample before the mints, 932-1,392 MiB during them, a quiet floor of 1,009 MiB in the 25 s after them, then 1,459 MiB during the point's calls.

**H3:** the OPFS half holds. The memory half is inconclusive: one step does not show a climb across steps, and the 0-100 steps above (764-867 MiB) sit within their run's noise.


## Growth to 10,000 blocks (`p3-growth-chrome`, 2026-10-22 04:39-06:08Z, load1 24-113)

10,000 empty blocks mined with the wallet locked, a public mint sampled every 1,000:

| Blocks | 0 | 1,000 | 5,000 | 10,000 |
|---|---|---|---|---|
| node process tree RSS | 944 MiB | 1,123 MiB | 1,708 MiB | 2,440 MiB |
| public mint round trip | 4.65 s | 4.31 s | 4.18 s | 4.23 s |
| `aztecDebug_mineBlock`, p50 of the last 250 | — | 494 ms | 529 ms | 581 ms |
| load1 | 103 | 81 | 75 | 98 |

`aztecDebug_mineBlock` rises 7.3 ms per 1,000 blocks (se 1.0, optimistic: the 40 medians follow load) after 1.25 ms per load1 (se 0.11): about 4.4 s more node path for a 60-block shard at 10,000 blocks, so **H7's growth half holds**. The RSS climbs about 150 MiB per 1,000 blocks, not attributed.

Catch-up after the 10,000 blocks: unlock 626 ms, the anchor at the tip 1.16 s, a fresh balance 1.58 s (load1 93), flat against 1,000. The whole test's PXE-side tally is 89 / 852 against 58 / 594 at 1,000, but it also covers a late token's import (registration, public read, the blocks of its deploy and mint) and the sampling mints, and the run does not attribute the difference: **H1 at 10,000 is inconclusive on calls and tags**, flat on times. The late token showed its public balance 1.78 s after import (load1 97); its transfer-history backfill (100-block windows from block 0) was not timed: 6 transfer-event reads are recorded, not the backfill's end.

The local network writes no byte to the harness's `--data-directory` (0 KiB throughout): in local-network mode the CLI never passes it on (`@aztec-labs/aztec` 6.0.0-rc.3 `src/cli/aztec_start_action.ts:33-45`), so every store opens under `os.tmpdir()` (`@aztec-labs/kv-store` 6.0.0-rc.3 `src/lmdb-v2/factory.ts:59,78`). Sampled from outside every 120 s, the 9 stores grew 15.6 → 52.0 MiB from about 1,500 to 9,750 blocks (the archiver 5.8 → 37.4 MiB); after the run's exit-0 teardown 8 of them, 37.3 MiB, were still there, and an age-filtered inventory of the host's `/tmp` found 17,397 such dirs of four of the nine kinds not modified for 30 min, 12.8 GiB, owners and liveness not checked. The `Rollup__UnavailableTempC` retries recurred (17 lines by 04:41Z); every block landed.
