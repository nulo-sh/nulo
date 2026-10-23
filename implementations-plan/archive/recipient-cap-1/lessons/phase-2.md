# recipient-cap-1, phase 2: full gates

All at retry 0; Chrome and Firefox runs build the armed smoke build (`VITE_NULO_E2E_MIGRATION_FIXTURE`, `_TOKEN_SEEDS`, `_TOKEN_SEEDS_CONFIRM`, `_CSP_REPORT`) and run with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`. "Before" builds and runs the base's `RecipientField.vue`, `recipient-search.ts` and `send-keyboard.test.ts` (`2c0c30d98`).

| Gate | Head | Outcome |
|---|---|---|
| `bun run audit:vue` | `b99ea0937` | pass (147 s) |
| `bun run test:all` | `b99ea0937`, again at `4279e458c` | pass (extension 917 files) |
| Chrome smoke, whole suite | `b99ea0937` | pass: 61 files, 9 skipped, 272 tests, 1,874 s at load1 33-110 |
| Chrome `send-keyboard` + `type-roles` | `4279e458c` | pass |
| Firefox `send-keyboard` + `type-roles` | `b99ea0937`, again at `4279e458c` | pass |

## Durations (s, the file's own time)

| Browser | File | Before | After (`b99ea0937`) | After (`4279e458c`) | CI median (shard record) |
|---|---|---|---|---|---|
| Chrome | `send-keyboard` | 47.6 (scenario 8.4) | 46.7 (scenario 7.9) | 35.9 (scenario 6.5) | 40 |
| Chrome | `type-roles` | n/a | 105.6 (in the whole suite) | 96.2 | 60 |
| Firefox | `send-keyboard` | 69.2 (scenario 12.3) | 62.0 (scenario 11.3) | 75.5 (scenario 17.2) | 64 |
| Firefox | `type-roles` | 159.4 | 173.2 | 159.8 | 104 |

The added segment (D7) is inside the noise of one run at this host's load: estimated +4 s per browser, measured -1 s on both browsers' like-for-like pairs. The suite wall-clock per browser therefore moves by the segment alone: Chrome 1,591 s and Firefox 2,195 s in the shard record before, the same within a few seconds after; the whole Chrome suite measured 1,874 s locally at a higher load than CI's.

## Final probe (one session, `4279e458c`)

| Build | Contacts | Samples (ms) | Median | Range |
|---|---|---|---|---|
| today | 50 | 73 63 60 65 93 | 65 | 60-93 |
| today | 5,000 | 1603 1791 1804 1857 1228 | 1,791 | 1,228-1,857 |
| pick | 1,000 | 81 81 96 63 67 | 81 | 63-96 |
| pick | 5,000 | 72 59 65 78 78 | 72 | 59-78 |

The pick's 5,000-contact median sits inside today's 50-contact range again with the keyed rows. Shots: `screenshots/capped-{light,dark}.png` (this head, 1,000 contacts, "c" typed) beside `screenshots/today-{light,dark}.png` (phase 0's today build, same seed).
