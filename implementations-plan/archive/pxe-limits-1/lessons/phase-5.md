# pxe-limits-1, phase 5: the wallet's ceilings

"HEAD" here is the measured tree, `dev` at `e34f361ba` with the scratch instruments.

## Pure helpers on Bun (scratch bench, median ms of the production functions, load1 183-184)

| Rows | `orderTokenRows` | `isHiddenHolding` (all rows) | `matchRecipients` (one key) | `buildActivityRows` | Contacts sort |
|---|---|---|---|---|---|
| 10 | 0.14 | 0.02 | 0.07 | 0.01 | 0.06 |
| 100 | 3.3 | 0.08 | 0.46 | 0.04 | 2.2 |
| 1,000 | 59 | 1.4 | 2.2 | 0.17 | 33 |
| 5,000 | 209 | 5.3 | 8.9 | 0.49 | 183 |
| 10,000 | 407 | 10.7 | 22.9 | 0.87 | 382 |

Two helpers cross 100 ms between 1,000 and 5,000 rows on this host: the token order classifies each row and parses its balance inside every comparison, and the contacts sort calls `localeCompare` with options per comparison. Both are O(n log n) comparisons with a heavy comparator; precomputed keys and one cached `Intl.Collator` are the lever. Beside the browser numbers below (page opens of seconds) they stay small: no issue. `matchRecipients` takes 2.2 ms at 1,000 contacts and 8.9 ms at 5,000, under 1 % of the recipient field's keystroke below.

## Lists in the extension (`_probe-ceilings`, scratch), Chrome, proverless

Per family and count: seeding, a popup reload, five service reads (median, max), three page opens (the hash change from Home to the route until every expected row is in the DOM plus two frames, timed in the page), and the Send pickers for contacts (recipient field, one keystroke) and holdings (token picker open, one search keystroke). Contacts are seeded as legacy rows and sealed by a worker restart and unlock; activity as raw transaction rows; sessions through `addDappSession`; holdings as token rows with one balance row each, half of them zero so they fold.

Screen at 10 and 100 (`p5-ceil-screen2-chrome`, 2026-10-22 01:23-01:26Z, load1 165-200):

| Family, n | Read p50 / max | Page open p50 / max | Picker |
|---|---|---|---|
| contacts, 10 | 20 / 318 ms | 115 / 195 ms | recipient 68 ms |
| contacts, 100 | 24 / 42 ms | 227 / 403 ms | recipient 117 ms |
| contacts, 100, with 100 txs | 17 / 188 ms | 149 / 162 ms | recipient 96 ms |
| activity, 10 | 4 / 8 ms | 52 / 96 ms | — |
| activity, 100 | 18 / 19 ms | 119 / 342 ms | — |
| sessions, 10 | 13 / 199 ms | 94 / 146 ms | — |
| sessions, 100 | 36 / 38 ms | 217 / 396 ms | — |
| holdings, 10 (5 + 5 folded) | 10 / 19 ms | 81 / 104 ms | open 66, search 66 ms |
| holdings, 100 (50 + 50 folded) | 23 / 42 ms | 173 / 218 ms | open 133, search 75 ms |

Seal of 100 legacy contacts at unlock: 1.6 s; a session insert at 90-100 sessions: p50 39 ms. Every family is under 0.5 s at 100 rows.

Full run (`p5-ceil-chrome`, 2026-10-22 01:48-02:05Z, load1 27-177; each row's load1 beside it):

| Family, n | Read p50 / max | Page open p50 / max | Other | load1 |
|---|---|---|---|---|
| contacts, 10 | 3 / 7 ms | 172 / 249 ms | recipient picker 72 ms; seal 0.6 s | 142 |
| contacts, 100 | 21 / 34 ms | 178 / 840 ms | picker 97 ms; seal 5.4 s | 176 |
| contacts, 1,000 | 109 / 167 ms | **1.94 / 2.49 s** | picker 394 ms; seal 7.4 s | 177 |
| contacts, 5,000 | 403 / 510 ms | **29.7 / 47.3 s** | picker 1.42 s; seal 26.7 s | 104 |
| contacts, 5,000, with 5,000 txs | 248 / 290 ms | 24.8 / 44.2 s | picker 1.33 s | 63 |
| activity, 10 | 3 / 4 ms | 28 / 60 ms | — | 55 |
| activity, 100 | 21 / 25 ms | 127 / 329 ms | — | 51 |
| activity, 1,000 | 99 / 205 ms | **1.59 / 1.70 s** | — | 58 |
| activity, 5,000 | 410 / 457 ms | **33.9 / 38.7 s** | — | 35 |
| sessions, 10 | 4 / 7 ms | 67 / 74 ms | insert p50 8 ms | 43 |
| sessions, 100 | 18 / 21 ms | 102 / 121 ms | insert p50 14 ms | 41 |
| sessions, 1,000 | 140 / 179 ms | 943 / 981 ms | insert p50 91 ms; 900 inserts 88.9 s | 31 |
| holdings, 10 (5 + 5 folded) | 2 / 13 ms | 54 / 76 ms | picker 57 ms, search 42 ms; unlock 1.0 s | 29 |
| holdings, 100 (50 + 50) | 5 / 8 ms | 139 / 154 ms | picker 98 ms, search 60 ms; unlock 0.7 s | 27 |
| holdings, 1,000 (500 + 500) | 56 / 1,631 ms | 741 / 857 ms | fold 553 ms; picker 496 ms, search 141 ms; **unlock 19.8 s** | 31 |
| holdings, 5,000 | — | — | **the unlock did not return within the probe's 180 s cap** (red) | 122 |

Crossings: no service read reaches 1 s at any count (403-410 ms at 5,000), so the reads are not where the lists stop. Pages cross 1 s between 100 and 1,000 rows for contacts and activity and near 1,000 for sessions; holdings' page stays under 1 s at 1,000, but its unlock crosses 1 s between 100 and 1,000 tokens and does not finish in 3 min at 5,000. H5 is falsified only if a family's read stays flat while other families grow: here the local contacts read fell 403 → 248 ms when 5,000 transactions were added, but load1 fell 104 → 63 with it, so this run decides nothing; the CI and Firefox runs below decide it. The page opens, which H5 did not predict, grow superlinearly.

CI, the Chrome soak at 10 to 1,000 (run `39709645544`, three iterations on 4-core runners, load1 0.95-4.05; ranges are the spread of the three per-iteration medians):

| Family, n | Read p50 | Page open p50 | Other |
|---|---|---|---|
| contacts, 10 / 100 / 1,000 | 2-6 / 4-5 / 20-32 ms | 50-64 / 60-112 / 728-1,216 ms | recipient picker 51-65 / 54-64 / 139-267 ms; seal 0.4-0.6 / 4.4-4.7 / 4.6-4.9 s |
| contacts, 1,000, with 1,000 txs | 29-41 ms | 666-1,176 ms | picker 185-248 ms |
| activity, 10 / 100 / 1,000 | 2 / 4-8 / 47-69 ms | 29-38 / 99-138 / 991-1,677 ms | — |
| sessions, 10 / 100 / 1,000 | 2-4 / 8-15 / 93-140 ms | 50-58 / 66-95 / 599-972 ms | — |
| holdings, 10 / 100 / 1,000 (half folded) | 1-2 / 3-6 / 36-51 ms | 50-58 / 79-132 / 567-855 ms | token picker 58-62 / 58-71 / 361-623 ms; **unlock 0.8-1.0 / 0.6-0.8 / 13.7-20.2 s** |

The CI runner reproduces the local shape on an idle host: pages cross about 1 s at 1,000 rows for contacts and activity, reads stay under 150 ms, and the unlock with 1,000 watched tokens takes 13.7-20.2 s. **H5 holds:** the contacts read rises by 8-9 ms when 1,000 transactions are stored beside it, in 3 of 3 iterations (32 → 41, 20 → 29, 27 → 35 ms), and sessions are the steepest read on every host. The transactions cell always ran second, so the order is fixed, not balanced.

**What the 1,000-token unlock waits on.** Offsets from the unlock request:

| Run (load1) | 1,000 public scans start | Shared tips read returns | Class-status reads land | Unlock returns | Rows visible |
|---|---|---|---|---|---|
| local `p5-ceil-chrome` (31; start clock ±1 s) | +0.6 s | +10.0 s | +13.7 → 19.9 s | 19.8 s | 23.5 s |
| CI job 119597687659 (2.5) | +0.47 s | +9.0 s | +13.5 → 20.24 s | 20.23 s | 24.56 s |
| CI job 119599706054 (2.05) | +0.36 s | +5.9 s | +8.8 → 13.69 s | 13.67 s | 16.34 s |
| CI job 119601404742 (4.05) | +0.41 s | +7.1 s | +10.4 → 15.77 s | 15.67 s | 19.11 s |

Every watched token gets its own public scheduler and the hydrate installs all of them at once, each firing its first poll at once (`apps/extension/src/wallet/services/incoming-transfer/service.ts:1087-1090`, `:1118-1120`, `:1152`); the unlock returns within 0.1 s of the last of the 1,000 class-status reads in all three CI jobs, locally within the start clock's ±1 s (coincident timing; what the unlock waits on is not recorded). The probe seeds tokens at random addresses with no contract, so every note poll fails at its first PXE call (224-1,000 failed `getNotes` per run, none succeeded) and every public scan stops at its class gate; deployed tokens would add transfer-page reads (inferred).

**The `Icon` A/B.** `packages/design/src/core/Icon.vue:55` is the tree's only CSS `v-bind`, so every `Icon` runs `useCssVars`, whose post-flush watcher calls `document.querySelectorAll('[data-v-owner="<uid>"]')` at mount and on each update (`@vue/runtime-dom` 3.5.42 `dist/runtime-dom.esm-bundler.js:437-468`; traced). One `git archive` export of HEAD with the same instruments ran contacts and activity at 1,000 and 5,000 three times in a row, A/B/A: `Icon` with the hover colour as a custom property set through `:style` (scratch: two lines removed, two added), HEAD, the scratch change again.

| Cell (load1 38-61) | `Icon` without CSS `v-bind`, run 1 | HEAD | without, run 2 |
|---|---|---|---|
| contacts, 1,000: open p50 / read p50 | 0.72 s / 36 ms | 1.23 s / 44 ms | 0.94 s / 71 ms |
| contacts, 5,000 | 4.39 s / 268 ms | 21.0 s / 175 ms | 3.73 s / 173 ms |
| activity, 1,000 | 0.99 s / 76 ms | 1.58 s / 78 ms | 1.08 s / 114 ms |
| activity, 5,000 | 4.46 s / 402 ms | 40.8 s / 412 ms | 4.07 s / 363 ms |

Runs `p5-icon-novbind-1`, `p5-icon-vbind-1`, `p5-icon-novbind-2` (2026-10-22 03:00-03:14Z, beside the queue's foreign-transfer run). The CSS `v-bind` accounts for 79-82 % of the 5,000-contact open, 89-90 % of the 5,000-row activity open and 24-41 % at 1,000 (demonstrated). Without it the opens scale about linearly, 0.7-1.1 ms a row at both counts, and the 5,000-contact open still drew 3 unanswered health pings per run. The three runs shared the host with one other e2e run, and the HEAD run's 5,000-contact opens overlapped 4 document closes and 3 ready timeouts, so activity at 5,000 rows (no close in either arm) is the clean figure: 40.8 s against 4.1-4.5 s.

The recipient field's keystroke does not move with `Icon` (its rows carry `AccountAvatar` and two `Text`s, `apps/extension/src/popup/components/modules/send/RecipientField.vue:259-278`): 1.35-1.37 s without the CSS `v-bind` against 1.28 s at HEAD in the same export and 1.42 s in `p5-ceil-chrome`, at 5,000 contacts, so its cost is rendering a row per match with no cap (inferred).

The probe's first screen stalled: a lock and unlock in the same worker keeps each profile's row keys, so the contacts seal pass (which starts when the keys are derived) never ran and the probe waited. The probe now restarts the worker before the unlock; every wait is capped at 300 s and every step logs its start.

## The at-rest seal (#924) against its base

The same probe on a `git archive` export of #924's merge-base `90e4bcf90` with the same scratch instruments (`p5-base-ceil-chrome`, 2026-10-22 02:05-02:15Z, load1 89-114), contacts and sessions, against HEAD's run above (load1 31-177, so the HEAD figures carry more host noise):

| Family, n | Read p50, base → HEAD | Page open p50, base → HEAD | Other, base → HEAD |
|---|---|---|---|
| contacts, 10 | 2 → 3 ms | 76 → 172 ms | picker 68 → 72 ms |
| contacts, 100 | 6 → 21 ms | 137 → 178 ms | picker 65 → 97 ms |
| contacts, 1,000 | 26 → 109 ms | 1.72 → 1.94 s | picker 429 → 394 ms |
| contacts, 5,000 | 119 → 403 ms | 33.5 → 29.7 s | picker 2.17 → 1.42 s |
| sessions, 100 | 14 → 18 ms | 100 → 102 ms | insert p50 19 → 14 ms |
| sessions, 1,000 | 146 → 140 ms | 1.04 s → 943 ms | insert p50 115 → 91 ms |

HEAD's contacts reads ran at load1 186 and 203 against the base's 106 and 104, so the +83 ms at 1,000 and +284 ms at 5,000 are not attributable to the seal, and the page open does not show it under the `Icon` cost; sessions show no difference, read or insert. The sealing pass after an unlock (legacy rows converted in the background, after the session is published): Chrome locally 0.6 s at 10, 5.4 s at 100, 7.4 s at 1,000, 26.7 s at 5,000 (load1 142-177); CI 0.4-0.6 / 4.4-4.7 / 4.6-4.9 s at 10 / 100 / 1,000; Firefox locally 0.6 / 8.0 / 9.5 s (load1 66-88). It steps up by 4-7 s between 10 and 100 rows on every host, cause not traced. #924's own figures at 2,000 contacts: sealing 1.8-6.6 s on Chrome (9.8 s on CI Firefox), list load on Chrome 41-120 ms plaintext against 62-162 ms sealed.

## Firefox (`p5-ceil-firefox`, 2026-10-22 02:37-02:45Z, load1 66-88)

| Family, n | Read p50 / max | Page open p50 / max | Other |
|---|---|---|---|
| contacts, 10 / 100 / 1,000 | 7 / 16; 27 / 48; 90 / 137 ms | 78 / 101 ms; 161 / 273 ms; 1.51 / 1.54 s | recipient picker 62 / 111 / 537 ms; seal 0.6 / 8.0 / 9.5 s |
| contacts, 1,000, with 1,000 txs | 158 / 166 ms | 2.49 / 2.93 s | picker 587 ms |
| sessions, 10 / 100 / 1,000 | 14 / 26; 124 / 312; 590 / 735 ms | 68 / 96 ms; 243 / 261 ms; 2.45 / 2.96 s | — |

Firefox crosses 1 s at 1,000 rows for both families; its sessions read is 4 × Chrome's at 1,000 and its contacts read rises 90 → 158 ms with 1,000 transactions beside it, while load1 rose 66 → 82, so that pair is load-confounded.

