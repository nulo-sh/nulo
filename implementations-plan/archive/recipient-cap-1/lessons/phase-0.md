# recipient-cap-1, phase 0: planning

## Probe runs (scratch, never committed)

`~/.cache/nulo-backlog/recipient-cap-1/tools/_probe-recipient.test.ts`, copied into `apps/extension/tests/e2e/` for each run and removed after; `run-arm.sh <arm>` applies the arm's patch, builds the armed Chrome smoke build, reverts the patch, runs the probe at retry 0. The smoke runner claims its egress ports through `~/.agents/ports.md`; `agent.sh` runs only the network config, so it cannot run a smoke file.

| Run | Start (Z) | Build | Probe | Note |
|---|---|---|---|---|
| today | 15:23:40 | 18 s | 38 s, pass | rows 1,001 / 5,001 every sample |
| A | 15:25:08 | 9 s | 31 s, pass | 50 rows; line "Keep typing to narrow 951 more matches." / "4,951" |
| B, try 1 | 15:25:48 | 13 s | 74 s, **fail** | the probe waited for 8 rows; the window draws 7 at the top (3 in view + 4 overscan), so it never settled; a probe bug, not the arm's |
| B, try 2 | 15:28:17 | 10 s | 32 s, pass | threshold 5; 7 rows, `aria-setsize` 1,001 / 5,001 |
| C | 15:27:15 | 11 s | 32 s, pass | 50 rows, no line |
| floor (today, 10 and 50 contacts) | 15:45:17 | 14 s | 35 s, pass | rows 11 / 51; load1 161-174 (other leads' runs) |

Samples (ms, in order): today 1,000: 289 250 267 251 232; 5,000: 1205 1154 1125 1169 1269. A: 86 60 61 63 60; 74 80 64 62 79. B: 79 57 111 61 65; 83 67 68 58 72. C: 75 65 69 74 63; 82 88 64 77 72.
Floor: 10: 71 83 61 67 56; 50: 74 65 58 88 59.

The probe's `minRows` became `Math.min(CAP, n + 1)` (A, C) and `Math.min(5, n + 1)` (B) before the floor run, so a count under the cap cannot hang it as B's first try did.

## Consults

- **Recon**: two Explore agents (sonnet): a reuse sweep (virtualization, capped lists, comboboxes, type roles, limits) and the test/e2e surface (unit cases, smoke specs, seeding, theme, popup size, `agent.sh`, configs). Findings and search trails in `recon.md`; the planner checked every cited line.
- **Codex r1** (gpt-6.1-sol, high, session `01a1643e`): *conditional approve*, recommends B. Its in-memory reproduction of the reachability limit (50 contacts "Account 1 NN" before the account "Account 1"; every prefix and the full name match all 51; only the address finds it) is I1. Other points: a status region mounted empty (W3C ARIA22), a real-engine overflow check, probe readiness and totals, the full smoke gate, a cap-boundary identity test, Z1 committed into both plans, unsupported claims removed.
- **Opus r1** (Plan agent): *conditional approve*, recommends A. Found the fade wait that a wrapper would empty (`send-keyboard.test.ts:131-136`), the house live-region rule (`FeeSettingsCard.vue:397,423`), the late-load highlight past the cap, the substring limit with an exact-match ask, "no set order" (random contact ids), three test gaps and a missing floor control.
- **Decision on the split** (D1): A with exact matches first (O5) as the recommendation; B named as the owner's alternative when nothing may change. Codex r2 asked to name a path A-with-O5 fails that B does not.
- **Codex r2** (resumed): *conditional approve*: initials must not join the promoted group (its reproduction: 50 "Alice LongNN" hide "Al"), the cap-alone claims qualified (O5 reorders at any count and moves Enter's default), Phase 0 needs both the record and the trimmed sibling plan. All accepted.
- **Codex r3** (resumed): *approve*.
