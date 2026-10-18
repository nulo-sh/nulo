---
plan: p46-ui-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev 9470d4e9
---

# p46-ui-1 — four signed picks from decision page 46

Build the owner's four page-46 picks, as signed, in one PR against `dev`: a Pending chip on an unproven grant's row (#698), and three fixes for lines the 13 px scale broke (#653, #652, #651). [recon.md](recon.md) holds the reuse map and the tests that pin each site.

## Outcome & Quality Bar

- **For whom**: a person on a 360 px popup who compares addresses, reads the network name on every page, and revokes a grant soon after making it.
- **Excellent**: each surface matches its signed picture, measured. Each wrap or cut it fixes is caught by an e2e measurement, because the layout gate cannot see a wrap (recon). The chip clears on its own when the grant is proven, with the page still open.
- **Good enough**: no new e2e scenario. The measurements go into tests that already render each state.

## Assumptions

Facts:
- F1. `CallArguments` gets `full` only for the grant's arguments (`popup/windows/execute/OperationCard.vue:280`). So `.full .row` is exactly "the window's full arguments".
- F2. `reconcileAuthwits(…, "mined")` writes `pending: false` and emits nothing (`wallet/services/auth-registry/service.ts:290-293`). The page listens to added and deleted only. Without a new event, a chip would stay until the page remounts.
- F3. `useEntityCrud` splices raw service rows (`composables/useEntityCrud.ts:105-140`), and `decorateAuthwit` runs only in the page's `fetch`. So a row from an event has no `kindName`: its title reads "Custom Authwit", and `authwitMatchesSearch` throws on it (`authwit-helpers.ts:63`).
- F4. The header keeps 10 px through one compound rule (`components/Header.vue:461-467`) and three `OVERRIDES`. `.network_chip` is `min-height: calc(1lh + 14px)` with padding `6px 10px`; `.lock_chip` is `height: 26px`.
- F5. Manage accounts keeps 11 px through `.desc_line:has(.addr_head)` and one `OVERRIDES` entry. `account-import-export.test.ts:70-75` reaches the line as `badge.parentElement`.
- F6. `TokenCard.vue` caps `.fiat` (figure and name) at 160 px. Only the priced figure carries `.fiat_figure`.
- F7. The layout gate (`tests/e2e/fixtures/type-roles.ts:510-527`) fails only on a horizontal overflow or a clip without an ellipsis. All four defects pass it today.
- F8. None of the touched files changed between `18d29f23` (the page's pictures) and `9470d4e9`.

Inferences:
- I1. At 11 px with 6 px padding, no network name is newly cut. #649's scan found TESTNET the only new cut with 10 px padding, and more room cannot cut more.
- I2. A 66-character value takes two lines in the 400 px window in Firefox too; its second line holds about 28 of 38 characters. Phase 3's Firefox run proves it.
- I3. `≈ $123,456,789,012,345.68` takes two lines at 190 px in both browsers. Phase 3 proves it.
- I4. Plausible but unverified: a confirm event that reaches the page before an older `getAuthwits` snapshot is overwritten by it (`useEntityCrud.ts:94`), as for every incremental event today. The chip then stays until the next visit; a revoke on that row still proceeds. The unverified step is that ordering through the real storage and ordered port. `mode: "resync"` would close it but flashes "FETCHING AUTHWITS" over the list on every event (`useEntityCrud.ts:89`, `authwits/index.vue:179`). Disposition: a closed `known-limit` issue at close-out; reopen on a user report, a reproduction through the real transport, or code evidence of that ordering.

Asks: none open. The details the picks leave open are the lead's calls, in the ledger (D4, D5, D7, D9). None changes how a screen reads beyond its signed picture.

## Architecture & Implementation

Each phase is one issue, with its change map, tests and gate. Paths are under `apps/extension/` unless they say otherwise. Every smoke run, and every check that a new assertion fails on the base, first rebuilds the armed build for its browser: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`. It then runs with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`. Smoke loads `dist/<browser>` as it finds it.

### Phase 1 — #698 Pending chip ✓

- `src/wallet/services/auth-registry/spec.ts`: add `onAuthwitUpdated: Authwit` to `Events`. It fires when a pending grant is proven and carries the row with `pending: false`.
- `src/wallet/services/auth-registry/service.ts` and `client.ts`: add the `EventHandler`. In `reconcileAuthwits`, for `"mined"`, emit the confirmed row after its `set`.
- `src/popup/pages/settings/developer/account-state/authwits/index.vue`: pass `updated: authwitsService.onAuthwitUpdated`. Return raw rows from `fetch`. Decorate in `filteredAuthwits` (`sortAuthwits(authwits.value.map(decorateAuthwit))`), so an event row keeps its title (F3).
- `src/popup/components/modules/settings/authwits/authwit-helpers.ts`: add `pending?: boolean` to `RawAuthwit`.
- `AuthwitCard.vue`: when `authwit.pending`, draw `<span data-testid="authwit-pending-chip">Pending</span>` right after the kind. It composes `chip` from `src/components/composite/activity/activity-card.module.css`. The kind and the chip sit in a `.title` wrapper (`display: inline-flex; align-items: center; gap: 8px; min-width: 0`), as drawn: `.type`'s `flex: 1` would otherwise push the chip against Revoke. The kind keeps its ellipsis, and Revoke stays at the row's end, unchanged. `RowTarget`'s `labelledby` lists the title's id, then the chip's id, so the row's name reads "Call Pending".
- Tests:
  - `service.test.ts`: `"mined"` emits `onAuthwitUpdated` once, with `pending: false`. `"dropped"` emits `onAuthwitDeleted` and no update.
  - `AuthwitCard.test.ts`: a pending row shows the chip, is named "Call Pending", and keeps Revoke enabled. The existing confirmed fixture shows no chip. Pin `.title`'s declarations.
  - New `authwits/index.test.ts`, shaped like `senders/index.test.ts`: a pending row renders its chip, and an `onAuthwitUpdated` event clears it in place with the title still "Call". A row from `onAuthwitAdded`, then a search term that misses its kind, filters without a throw (today it throws).
  - `tests/e2e/helpers/authwit-seeds.ts`: seed one row `pending: true` with a `txHash`, so the type-role sweep reads the chip (role values, laid-out) at no extra runtime.
- **Gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/auth-registry src/popup/components/modules/settings/authwits src/popup/pages/settings/developer/account-state/authwits`. Pass: exit 0, and every new test fails when its line of the change is reverted.

### Phase 2 — #651 header chips at 11 px

- `src/components/Header.vue`: delete the 10 px compound rule and its comment. Set `.network_chip` padding to `6px` (8 px of room, picture `p46-651-b1`). `.lock_chip` composes `type--label-section` and takes `min-height: calc(1lh + 14px)` in place of `height: 26px`, so both chips are 28 px tall and stay in step with their type (D5).
- `scripts/type-roles/exceptions.ts`: delete the three header `OVERRIDES`, `HEADER`, `HEADER_CHIPS` and `HEADER_CHIP_SCOPE`.
- Tests:
  - `src/components/header-layout.test.ts`: pin padding `6px`, and pin the lock chip's `composes` and `min-height` beside the network chip's.
  - `tests/e2e/appearance.test.ts`: in the existing chip test, at 360 px, assert that `network-name` is not cut (`scrollWidth <= clientWidth`) and that `header-lock` is as tall as `network-button`.
- **Gate**: lint, typecheck; `cd apps/extension && bun --bun vitest run src/components src/utils/type-role-ban.test.ts`; `bun run test:e2e -- tests/e2e/appearance.test.ts --retry=0`, also with `NULO_E2E_BROWSER=firefox`. Pass: all green, and the cut assertion fails on the base's 10 px padding at 11 px.

### Phase 3 — #653 three 13 px wraps

- First, before any edit: shoot the grant on a registered token (structured rows, which `.full .row` also stacks) with the scratch window spec, as its "before" picture.
- `src/popup/windows/execute/CallArguments.vue`: replace `.full .row > :first-child { flex-shrink: 0; max-width: 50% }` with `.full .row { flex-direction: column; gap: 2px }` and `.full .row > :last-child { text-align: left }`. Each key then sits above its value (picture `p46-653-exec-b`).
- `src/components/composite/send/AmountCard.vue`: the meta row takes `wrap="wrap"`, and `send-amount-fiat-label` takes `white-space: nowrap`. "≈" stays with its figure, and the balance and Max wrap below (`p46-653-send-b`). Fiat mode cannot wrap: its meta span is `flex: 1` with a zero basis (`.conversion_fit`), so `fitDerived` reads the same room.
- `src/popup/components/modules/general/TokenCard.vue`: `.fiat_figure` takes `max-width: 190px`, and `overflow-wrap: anywhere` in place of `break-word`, so the wider cap never raises the column's min-content floor (D10). A name and a symbol keep 160 px (`p46-653-token-b`).
- Tests:
  - Update the pins: `OperationCard.long-strings.test.ts:132` and `TokenCard.test.ts:364`.
  - e2e: `tests/e2e/network/type-roles-windows.test.ts`, grant state: each decoded value's top is at least one line below its `execute-grant-decoded-param` row's top, and each 66-character value takes at most two lines. `tests/e2e/type-roles.test.ts`: the seeded `$123,456,789,012,345.68` row figure takes at most two lines at 360 px.
  - e2e: `tests/e2e/network/send-amount-exact.test.ts` already renders the signed Send state (token mode, `1,235,567.12…` after Max, a seeded quote). After its balance check, at rest: the label reads "≈ $…" on one text line, the balance and Max sit below it, and nothing overlaps or leaves the card. Its USD-mode geometry checks guard fiat mode's fit.
  - Every line count uses text-line rectangles from a `Range`, and requires the expected non-empty text first.
- **Gate**: lint, typecheck; `cd apps/extension && bun --bun vitest run src/popup/windows/execute src/components/composite/send src/popup/components/modules/general`; `bun run test:e2e -- tests/e2e/type-roles.test.ts --retry=0`; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts tests/e2e/network/send-amount-exact.test.ts tests/e2e/network/authwit-lifecycle.test.ts`. Run each e2e command again under `NULO_E2E_BROWSER=firefox`. Pass: all green.

### Phase 4 — #652 Manage accounts on two lines

- `src/popup/pages/settings/accounts/index.vue`: an imported row's description has two lines. The first is `<Text variant="meta" color="tertiary" data-testid="account-imported-badge">imported</Text>`, as a block. The second is the address line (`manage-accounts-address`), with its head and tail only. Delete the " · " separator, the 11 px rule and the stale template comment. Write one sentence on the single-truncation invariant.
- `scripts/type-roles/exceptions.ts`: delete the accounts `OVERRIDES` entry and `ACCOUNTS` once it is unused. `identifier-sites.expected.json` stays unchanged, because the nesting is kept.
- The head span takes `data-testid="manage-accounts-address-head"` (e2e selects by testid only).
- Tests, in `tests/e2e/account-import-export.test.ts`: reach the line through the imported row's `manage-accounts-address`, and keep the four clip checks and the tail length. Add two checks: the marker's bottom is at or above the line's top, and the head shows at least the tail's width (today it shows 1 px).
- **Gate**: lint, typecheck, `bun run test`; `cd apps/extension && bun run test:e2e -- tests/e2e/account-import-export.test.ts --retry=0`, also on Firefox. Pass: all green, and the head check fails on the base.

### Phase 5 — pictures, measurements, full gate

- Pictures: copy the page's scratch specs (`~/.cache/nulo-backlog/shots-p46/specs/`) into the tree for the run only, drop their mock CSS, and shoot the six signed states. They are `p46-698-b`, `p46-651-b1`, `p46-652-c` and `p46-653-{exec,send,token}-b`, plus the registered-token grant, each in light and dark. The popup is 360 px wide and the window 400 px, its real width. Then delete the specs. The "before" pictures are the page's `-a` pictures (F8). Commit both sets under `implementations-plan/p46-ui-1/screenshots/`, and link them from the PR body by commit SHA.
- Measurements for the PR body, read in the same run, each before and after: TESTNET's width against its box; each chip's size (the lock chip goes from 26 to 28 px, which the page said B needs); the gap from the kind to the Pending chip; the imported row's head width and row height; each grant value's lines and the card height; the Send card height; the token row's lines and height.
- **Gate**: `bun run audit:vue`, `bun run test:all`, `bun run check:plans`. Then the touched e2e files on both browsers, with each browser's wall-clock for them before and after. Pass: all green. `git status` shows no scratch spec.

## Decision ledger

- D1. A live clear needs an update event (F2). The first choice is a new `onAuthwitUpdated`. Other options were rejected. Re-emitting `onAuthwitAdded` misnames a transition. A page refetch on transaction updates couples the page to another service. A clear only on remount draws a wrong chip for minutes.
- D2. Decorate at render, not in `fetch` (F3). This is local, and it also stops the search from throwing on an event row.
- D3. Compose the activity `.chip`; it is the drawn style. A local copy would duplicate seven declarations.
- D4. #651: the padding form, not the icon-only lock. The page's reasoning chose it ("keeps the LOCK word").
- D5. The lock chip's height follows through the same `1lh` rule, not `align-self: stretch` (which collapses when the network chip is absent) and not a fixed 28 px (which drifts from the type).
- D6. #653 window: use `.full .row`, the grant's full arguments (F1). Structured, decoded and raw rows read alike there; no other site changes.
- D7. Send's meta row wraps in both modes. Fiat mode's zero-basis span never breaks a line, so a token-mode-only branch adds code for no change (Opus; first draft had the branch). Values sit left under their key, and the token cap covers the figure only, as drawn.
- D8. Tests: one measurement in an existing e2e per site, plus the updated static pins. No new scenario.
- D9. The chip joins the row's accessible name. A screen reader then hears what the eye sees.
- D10. One known limit, a closed `known-limit` issue at close-out: I4. The 190 px cap alone would raise the token row's left-column floor by up to 30 px, since `break-word` does not lower min-content; a figure over about $100T with both balance sides large could then push the balance column past a 360 px row (plausible but unverified; the parser takes 80 digits a side). `overflow-wrap: anywhere` closes it locally and draws the signed state unchanged (Opus's alternative; Codex's classification).

## Security & Adversarial Considerations

- The new event carries the same row `onAuthwitAdded` already broadcasts. The page's `accept` filters it to the shown scope. Nothing is logged.
- The rendered values are dApp-supplied (grant arguments, authwit callers), but their rendering does not change, only the layout. Stacking makes an address read as two even halves. That helps a person compare it, where a two-character orphan was easiest to misread.
- "Pending" means not yet proven (`service.ts:181-185`); a grant in a proposed block may already work on chain. The PR body never calls a pending grant inactive.
- No dependency, permission, storage shape or crypto change. A dropped grant whose row stays pending (the accepted residual at `service.ts:170-178`) keeps its chip. That is the honest reading.

## UI impact (sign-off: decision page 46, signed 2026-10-18 12:34Z, quoted by id)

- Authwits list — P46-02 B, "A Pending chip until the grant is proven; Revoke stays enabled." Before `p46-698-a`, after `p46-698-b`.
- Execute window, Send amount card, Home and Holdings token row — P46-08 B, "Make room, site by site: key above value in the window, ≈ kept with its figure on Send, a 190 px cap on the token row." Pictures `p46-653-*-a` → `*-b`.
- Manage accounts — P46-09 C, "13 px on two lines: the marker on one line, the address on the next." `p46-652-a` → `-c`.
- Header, every page — P46-10 B, "11 px with room made: tighter padding on the network chip, or the lock chip as its icon alone." The padding form: `p46-651-a` → `-b1`.

No other screen changes. No new control, copy beyond "Pending", or dotted term.

## Delivery

One arc and one PR against `dev`, with no stack (D-orch-1). The branch is `p46-ui-1-a1`, off `origin/dev` and carrying this plan's commit. The PR title is `feat(ui): pending chip on grants, 11 px header chips, three 13 px wraps fixed`, 77 characters. The body quotes each pick by id and text, then gives the pictures, the measurements, the validation runs, each browser's e2e wall-clock, and `Closes #698`, `Closes #653`, `Closes #652` and `Closes #651`. Shared files (recon § Collisions): `TokenCard.vue` (wallet-bugs-2) and `Header.vue` (iface-line-1). Before opening the PR, merge `origin/dev`. If either lane has landed, retake that surface's picture. Phases are sequential: they share `exceptions.ts` and the e2e files.

## Post-implementation

Follow [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) as it reads at `9470d4e9`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2 runs once over the net diff from `9470d4e9`, after Phase 5: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh`. Hard stop after three rounds that still find material issues. Log each round in `lessons/phase-5.md` and in this plan's ledger.
- Steps 3 and 4: the single-arc form. The close-out is the PR's final commits. `gh pr checks <n> --watch` goes to the end.
- Step 5: the teardown is `agent-worktree done p46-ui-1 --merged`. It runs once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/p46-ui-1/plan.md` succeeds. The orchestrator merges.

## Audit verdicts

- Codex (gpt-6.1-sol, high), round 1: **conditional approve**. (1) `AmountCard.test.ts` stubs `Flex`, so a class check fails on correct code: superseded by D7, which drops that test. (2) Use `mode: "resync"` for the I4 race: rejected, since it flashes "FETCHING AUTHWITS" over the list on every event; Codex withdrew it. (3) Send had no browser measurement: accepted (`send-amount-exact.test.ts`). Round 2 (resume): **approve**.
- Opus 5.5 (Plan), round 1: **conditional approve**. Accepted: the `.title` wrapper and its pin and measurement (Medium); the Send measurement (Medium, as Codex 3); `HEADER` removed; the lock chip's 2 px stated in the PR body; testid-only e2e reads (row top, a head testid); armed rebuilds before smoke runs; unconditional wrap (D7); the search-after-add page test; I2 corrected; the registered-token grant pictured. The 190 px floor: fixed locally (D10). F1–F8 held.
- Codex, round 3 (resume, on the revision): **approve**; a non-blocking note that D10's overflow is plausible but unverified, not unsupported. Acted on: fixed locally with `overflow-wrap: anywhere`, per § Proportion.

## Seeds (draft; not run; `/goal` recommended, use one per session)

```
/goal All five phases of implementations-plan/p46-ui-1/plan.md are marked ✓, each with its gate output in the transcript; the Codex loop converged (quoted); the PR against dev exists with Closes #698 #653 #652 #651 and the plan archived in its final commits; bun run test and bun run lint exit 0.
/loop 15m Drive implementations-plan/p46-ui-1 forward per its plan.md: reality check, next phase, its gate, then the Post-implementation section; never merge.
```
