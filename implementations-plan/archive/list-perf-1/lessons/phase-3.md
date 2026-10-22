# list-perf-1, phase 3: evidence and full gates

## Tooling

pxe-limits-1's scratch runner (`run-tree.sh`), its instruments (`instruments-final.patch`) and probes (`_pxl*.ts`, `_probe-ceilings.test.ts`), copied to `~/.cache/nulo-backlog/list-perf-1/` and re-pointed (namespace and recorded revision). Two `git archive` exports: base `de500244a` (origin/dev with #1027) and head `4bc435184`; they differ only in `Icon.vue`, `Icon.test.ts`, the ban test and plan files. The patch's offscreen-close hunk no longer applied (`closeOffscreen` gained a line on dev) and was re-applied by hand, identically in both trees. Smoke runs need the armed build (`global-setup-smoke.ts` names it); each export was built for Chrome and Firefox.

Pixel probe pitfalls: an injected `<style>` is refused by the popup's CSP (the smoke suite fails on the violation), so the freeze is a constructed stylesheet; the hovered icon's tooltip answers the first Escape; a "Contact is added" toast lives 2 s, so captures wait for no `snackbar`.

## Pixel sheets

40 pairs (Home, Holdings, Contacts with 5 contacts, the bottom bar, the hovered FPC copy icon; light and dark; DPR 1 and 2; Chrome and Firefox), 0 differing pixels in each; no mask was needed (a fixed phrase). The hovered icon computes `--txt-primary` in all 16 captures. Table and controls: [../screenshots/pixel-compare.md](../screenshots/pixel-compare.md). Probe wall-clock 30-38 s per run.

## A/B/A (Chrome, proverless, retry 0; `PXL_FAMILIES=contacts,activity PXL_COUNTS=1000,5000 PXL_CONTACTS_TXS=0`)

Open = hash change until every row is in the DOM plus two frames, median of 3 reps; every rep reached its full row count, `quiet` true, `timedOut` false. No offscreen closes or ready timeouts in any run.

| Run | Started (UTC) | Wall | Contacts 1,000 | Contacts 5,000 | Activity 1,000 | Activity 5,000 | load1 at the 5,000 cells |
|---|---|---|---|---|---|---|---|
| head 1 | 17:17 | 254 s | 1.14 s | 6.06 s | 2.28 s | 8.05 s | 121, 165 |
| base | 17:23 | 611 s | 2.04 s | 62.2 s | 1.75 s | 63.3 s | 125, 127 |
| head 2 | 17:33 | 234 s | 1.09 s | 4.80 s | 1.25 s | 5.38 s | 127, 122 |

Gate: in both head runs the 5,000-row opens are at most half of base (at most 13 %: 6.06 / 62.2 and 8.05 / 63.3). Base reps spread 44-66 s and 51-69 s, far from the bar, so no extra base run was taken. Head 1's activity at 1,000 rows (2.28 s, load1 158) is slower than base's (1.75 s, load1 119) while head 2's is 1.25 s: at 1,000 rows the activity difference sits inside this host's load noise; the bar is set at 5,000.

## Gates

- `bun run audit:vue` exit 0 (180 s) and `bun run test:all` exit 0 (177 s) at `4bc435184`; after the review fixes, `bun run lint && bun run typecheck:all && bun run test:all` exit 0 at `431378069` (305 s; extension 913 files passed, design 37).
- Smoke at retry 0, armed builds of this worktree, no e2e scenario added or changed: Chrome 61 files passed, 9 skipped (272 tests passed, 24 skipped), 2,006 s; Firefox 65 passed, 5 skipped (276 passed, 20 skipped), 3,010 s. `type-roles.test.ts` passed unchanged on both (102 s Chrome, 229 s Firefox). The product code under test is unchanged since `4bc435184`; the later commits touch unit tests only.
- After merging `origin/dev` (`6da033705`): `bun run lint` and `bun run check:plans` exit 0; `bun run test` failed twice at load1 ~170 on one test, `send-order.composition.test.ts` › "a silent-path record reads queued while it waits" (read `pending`, expected `queued`), then passed in full at load1 125. The file and the code it drives are byte-identical to dev's; 16 concurrent runs of it alone passed on head and on a dev export; a dev export's full run passed once at load1 165. A load-sensitive flake outside this arc, plausible but unverified as a race; not filed from here.
