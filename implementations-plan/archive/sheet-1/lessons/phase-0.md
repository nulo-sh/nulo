# sheet-1, phase 0 (planning)

- 2026-10-17: recon by three Sonnet Explore agents (popup inventory, retirement map, reuse sweep) and a fourth on the confirm openers' positions. Facts re-read by the planner; two cited lines corrected (`service.ts:69-70`, `base.css:120,134`).
- The harness's `.tr-e .card` and `.scrim-light .card` rules set `box-shadow` at one specificity, so page 33 never drew the ledge and the light line together (OA-1).
- `snackbar.test.ts:219` takes the card's content as `children[1]`, the slot behind the handle zone; removing the handle moves it to `children[0]`.
- S1 found by tracing what moves when the card loses `flex: 10`: Export full backup's Download Backup sits where a content-height Confirm's "Download anyway" lands.
- 2026-10-17 14:35Z, audit round 1, Codex (`gpt-6.1-sol`, high, read-only, session `01a14a43`): `reject`; seven findings, all accepted (plan § Audit verdicts). It agreed A wins D1, D2 and D4 over outline B, and the storage retirement.
- 2026-10-17 14:54Z, audit round 1, Opus Plan agent: `conditional approve`; nine findings, eight accepted, one moot (plan § Audit verdicts). Its D4 point holds: `slide` runs on `var(--bezier)`, `slideopacity` on `ease`.
- 2026-10-17 14:56-15:02Z, a throwaway smoke probe (`tests/e2e/_probe-sheet1-geometry.test.ts`, deleted, never committed), Chrome, 360×600, retry 0, the armed build at `1b93cbfa`.
  - An injected `<style>` is refused by the extension's CSP and fails the run; set the setting off through the Display toggle (a DOM `click()` on `[data-toggle-active]`), not by CSS.
  - The fixture is file-scoped: accounts created in one test persist into the next.
  - Setting on (today): every card top 54. One account: "New account" 270-314, Create 213-253 at rest. A back-to-back double-click (`count: 2`) created an account: the second `mousedown`/`click` had `detail` 2 on `new-account-submit`, which the 40 px rise held under y 292. With 60, 120 and 200 ms between presses, none was created.
  - Setting off and animations off (this arc's hit-testing): Accounts top 315, "New account" 531-575. New account top 333, Create 492-532. No gap (0, 60, 120, 200 ms) created an account; the second press hit the hint text below Create. Receive's card top 56: a double-click on Home's Receive lands on its QR code, both ways.
  - Read then as: S1 after this arc reduces to the passkey Export Confirm. Superseded by the second probe below.
- 2026-10-17 15:12Z: a probe run started at load1 300 (host rule: under 150) because `uptime` and the run were chained without a gate; it failed on the probe's own navigation within 18 s. Every later run waits on `/proc/loadavg` below 150 before it starts.
- 2026-10-17 15:10Z, final pass, Codex (`gpt-6.1-sol`, high, read-only, fresh session `01a14a67`): `reject`; three findings, all accepted (plan § Audit verdicts).
- 2026-10-17 15:15Z, second probe (`tests/e2e/_probe-sheet1-contacts.test.ts`, deleted), Chrome, ten contacts, load1 149 at start.
  - Today: the Confirm's "Yes, delete contact" at 220-260. A delete icon scrolled to y 240: a back-to-back double-click deleted nothing (the second press lands before the Confirm renders). A double-click with 120 ms between presses deleted the contact.
  - Content height: the answer at 536-576, the icon scrolled to y 556, the same two results.
  - S1 therefore predates this arc. The arc moves the exposed rows from the list's upper middle to its bottom edge.
- 2026-10-17 15:18Z, final pass resumed (session `01a14a67`), verify round: `approve`.

## Implementation, Phase 0: base, captures, "before" shots

- 2026-10-17 15:22Z: merged `origin/dev` 13d5f8d0 (#650, #655) before starting. `index.md` conflicted: dev had archived icons-d2-1's row; kept the removal and this plan's row. No dependency file moved, so no install.
- S1 filed as #656 (`ux`, then `owner-decision`), in the five-section issue format of `implementations-plan/README.md` § Where open work lives.
- `settings-display` is captured in the `/popup/settings/appearance` → `/popup/settings/display` redirect case of `settings-routes.test.ts`: the search case outlines a row, which would differ before and after.
- `shotSend` names the popup's own theme `<name>.png` (light, the headless default) and the flipped one `<name>-dark.png`; the stale captures write `<name>.<theme>.png`, copied in under the first scheme.
- The capture run: 8 smoke files (34 tests, 5:07) and `network/send-amount-exact` (45 s) green at retry 0.
