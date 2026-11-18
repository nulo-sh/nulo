---
plan: connected-app-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 0dc22a9c5 (arc 1); dev at 8ff0e6489 (arc 2)
status: in progress
---

# connected-app-build-1: the connected app page and the Details table, built from the owner's picks

Two arcs, one PR each against `dev`; each changes what users see, so neither lands on its own: the orchestrator lands it on the owner's approve of its captures. No issue owns either arc (searched "connection check connected app emoji", "details table glyph transact", "connected app permissions", "Granted permissions"), so neither PR carries `Closes` or `Part of`. Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md). Over the light tier's 150 lines: two arcs, each a page.

- **Arc 1** (#1835, merged): decision page 163, signed 2026-11-17 at 15:37 UTC.
- **Arc 2** (this amendment): decision page 185, signed 2026-11-18 at 16:27 UTC at dev `6aaebe886`. Arc 1 archived the plan; arc 2 reopened it with a `git mv` back out of `archive/`, and its close-out moves it back.

## The owner's picks (the sign-off)

- **P163-02 = read**, note (2026-11-17 15:33 UTC): "Remove it completely. So "K3" but without "Connected after the emoji check"". The section goes and nothing replaces it.
- **P163-03 = E3**, no note (2026-11-17 15:35 UTC): "Two glyphs swapped where they misread: Transact gets the send arrow instead of the yes-mark's check, Details gets the magnifier instead of the info circle, in the head and in the rows above (the transaction and contract-details rows), so rows and columns keep sharing one glyph. 0 px."
- **P185-01 = D1**: "The table as the section: three rows for the kinds with no contract, then the pop-up's own Details table, open, every visible word the pop-up's except the head word Permissions; the chevron opens a contract's functions; the read-only grant becomes one Any contract row with the Details mark." With the owner's note: "Regarding D1: it feels that "contract" needs some margin-top? It's very stuck to the end of the table that's above it. Also, aren't we missing the chips / labels explaining what each icon is / means that we added to the capabilities pop-up?"
  - The first half is built (D12). The second is answered elsewhere: nothing was added to the pop-up (#1835 swapped two glyphs; the column words are spoken only), and words for the icons are the owner's separate decision on page 186. This arc adds no legend, no label and no chip.
- **P185-02 approved** (the default): the table's narrow drawing keyed on its container's width, shared with the pop-up, so a known contract's name shows whole on the page's 360 px body and the pop-up at 400 px is unchanged.
- Background, not a pick: the owner's page-163 note "Why not put the same permission table as the Capabilities Pop-up? Real question." and the question of 2026-11-18 "aren't permissions per/address?".

## Decision ledger

Arc 1 (D1 to D8, built and merged; the record is #1835 and the archived copy of this plan at its merge):

| ID | Decision |
|---|---|
| D1 | `[id].vue` loses `DappSessionVerification`, `hashToEmoji` and `verificationEmojis`; the component is deleted; nothing is added to the header. |
| D2 | No service, stored shape, glossary entry, verify-window code or not-connected line changes. |
| D3 | `DetailsTable.vue` `COLUMNS` and `permission-rows.ts`: Transact and the transaction row `check` → `send`, Details and the contract-details row `info` → `search`; the yes-mark stays `check`. |
| D4 | The page root carries `data-testid="connected-app-page"`; `connect-verify-mismatch`'s reconnect case anchors on it. |
| D5 to D8 | Unit and component tests only; two fixtures renamed; captures through `agent.sh` (a connected playground is a network fixture); no accessibility call. |

Arc 2:

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D9 | The page's "If you allow, it can" and "Granted permissions" sections become one section, `data-testid="connected-app-permissions"`, in their place: a `SectionLabel` reading "Permissions · {label}" (the tag the window prints after "Details ·": `any contract`, `N contracts`, `N contract classes`), or "Permissions" with no table; the kind rows; the table. | P185-01 = D1, from the render lane's `28e8795d7`, its render switch (`layout`) dropped. |
| D10 | Kind rows, the window's entries over the stored grant, in the window's row order: list accounts (`accounts.canGet`, `accountAddressRow`), act for you (`canCreateAuthWit`), address book (`data.addressBook`, flagged by `isBroadRequest` as the window's held fold flags it), and Nulo doesn't recognize (`unknownRow`, only while an unknown type is held). Each draws the window's glyph, title and line; none has a switch but act for you. | The pick's three rows; the unknown row stays because today's cards list an unknown type ("Unknown permission") and dropping it would hide a held grant. `heldRows` (`build-items.ts`) is private and also builds the per-contract rows the table now carries, so the page uses the four exported builders. Read through `isObjectLike`, since the page renders stored grants raw (#341, option A). |
| D11 | Act for you IS today's authorizations switch row, moved: same `PermissionRow`, testids (`connected-app-authorizations`, `connected-app-authorizations-toggle`, `cap-auth-term`), switch, line and write. Its old label "If you allow, it can" goes. | One permission drawn once; `openConnectedApp` waits for that switch. |
| D12 | The kind rows and the table sit in a column with a 24 px gap, the gap `SettingsPageShell` puts between the page's sections; the label keeps the section's 10 px. With no kind row the head sits 10 px under the label, as any section's content does. | The owner's P185-01 note: the head "Contract" read stuck to the rows' box at 10 px. 24 px is the page's own rhythm, the next step up from the 10 px a label keeps to its content. Rejected: a margin inside `DetailsTable`, whose window placement must not move. |
| D13 | `DetailsTable` gains `bare` (drawn open, no fold, no box) and `foot` (default `true`); the window passes neither. The page passes `bare` and `:foot="listsFunctionNames(table)"`, a pure helper in `details-table.ts`: true when a row's Simulate or Transact list holds a name other than "Any function". | The pick: "the footnote only when a row lists a function name". A `foot` default of `true` keeps the window's footnote (the render's Boolean-default slip hid it). |
| D14 | The table's narrow drawing keys on its own width: `.table` sits in a `.frame` that is an inline-size container `details-table`, and `@media (width < 359px)` becomes `@container details-table (width < 330px)`. 330 px is the 198 px the six marks, the chevron and their gaps take, plus 132 px for a name: "Sponsored fee payer", the longest name the wallet gives, measures 130.6 px at 13 px. | P185-02. Measured at the base: the window's table is 342 px wide at 400 px (wide drawing, unchanged) and the page's would be 312 px (narrow drawing, names whole on their own line). The window takes the narrow drawing below a 388 px viewport, where it took it below 359 px and cut that name between. Rejected: 320 px, a split between the two hosts with no reason in the content. |
| D15 | The names read: `DappInteractionService.getKnownContracts(sessionId)`, a worker RPC sharing one private builder with `requestCapabilities`; it refuses a session outside the active profile. The page asks for it alongside the session read and draws the section once it settles; a refusal is an empty list, so every contract lands under "Nulo doesn't know". | The names are computed only in the worker and only for the window (`dapp-interaction/service.ts`). That service already holds the FPC and token services; the dApp-session service holds neither. Waiting avoids a known contract flashing under "Nulo doesn't know". A worker RPC is not a Nulo-custom wallet-sdk RPC: `@nulo/wallet-sdk-schema-patch` is untouched (the owner's 2026-11-18 freeze). |
| D16 | Removed with the cards: `GrantedCapabilitiesList.vue`, `CapabilityDetailPanel.vue` (test, stories), `ScopePatternList.vue` (test), `ScopeAddress.vue` (test), `ScopeClassId.vue` (test), `getCapabilityLabel`, their `components.d.ts` lines and the two identifier-site entries of `ScopeAddress` and `ScopeClassId`. | Each had the cards as its only caller (`git grep`). The connected-apps list's `getSafeDisplay(...).shortLabel` summary is out of scope. |
| D17 | `type-roles-windows`' page leg drops its two card presses and the two card states; it opens the page table's first row and sweeps "a connected dApp (network)" with the table drawn. | The cards' states named sites in `ScopeAddress` and `ScopeClassId`, which leave. The table's address site is the window's entry; the page sweep's hex-outside-mono scan reads the page's. |
| D18 | Accessibility (the owner's 2026-10-19 delegation): the kind rows have no switch and no Tab stop; the table keeps the window's row targets, `aria-expanded` and spoken names; the head stays `aria-hidden`. | The window's own behaviour, unchanged. |

## UI impact

- **Settings → Connected apps → an app's page** (`[id].vue`). Before: "If you allow, it can" over the act-for-you switch row, then "Granted permissions N" over one closed card per grant type ("Account access", "Contract registration", …). After: "Permissions · any contract" (or the table's own tag; "Permissions" with no table), the kind rows, 24 px, then the window's Details table drawn open: the head "Contract" and its six glyphs, "Nulo knows", "Nulo doesn't know", "Contract classes", "Any contract" last, a chevron opening Simulate and Transact, and the footnote only when a row lists a function name. On the 360 px popup each name takes its own line above its marks. The read-only grant draws one Any contract row with the Details mark and no footnote, where a card read "Contract registration". Sign-off: P185-01 = D1 and its note, quoted above.
- **The capabilities window** (`DetailsTable.vue`): unchanged at 400 px; below a 388 px window the names take their own line (before: below 359 px). Sign-off: P185-02, quoted above.

## Security & Adversarial Considerations

- **The names read** returns the protocol contracts' addresses and the listed defaults this profile's seeding verified, for the session's chain: what the window already shows the same person. Names come only from `knownContracts`, never from the session or the app, so an app cannot dress its contract as "Sponsored fee payer" here either. Any extension page may call a worker RPC, as `getDappSession` already allows; the read refuses a session of another profile.
- **App-controlled strings** (function names, addresses, class ids, stored raw per #341's option A) reach the page through `buildDetailsTable` (which reads `unknown`) and `DetailsTable` (which strips control and bidi characters), as in the window.
- **No write is added.** The authorizations switch keeps its one write; no stored shape, permission, log line or dependency changes.

## Assumptions

**Facts** (checked at `8ff0e6489`): the recon's arc 2 section. **Asks:** none; P185-01's second half waits on page 186, outside this arc.

## Phase 3: arc 2, the build and its tests ✓

1. `apps/extension/src/wallet/services/dapp-interaction/{spec,service,client}.ts`: D15; `service.test.ts`: a known session answers the names, another profile's session is refused.
2. `apps/extension/src/popup/windows/capabilities/details-table.ts`: `listsFunctionNames` (D13); `details-table.test.ts`.
3. `apps/extension/src/components/composite/capabilities/DetailsTable.vue`: `bare`, `foot`, the frame and the container query (D13, D14); `DetailsTable.test.ts`.
4. `apps/extension/src/popup/pages/settings/connected-apps/[id].vue`: D9 to D12, D15; `[id].test.ts` with wire-shaped grants: the many-permission grant (three kind rows, the groups, the head, a chevron opening a contract's functions, the footnote), the read-only grant (one Any contract row with the Details mark, no footnote, no "Contract registration"), the names read (a known contract under Nulo knows, an unknown one under Nulo doesn't know, a refusal falling to Nulo doesn't know), the head's 24 px column, every client disconnected once.
5. D16's removals; D17's spec edit.

**Validation gate** (retry 0, one at a time): `bun run lint`; `bun run typecheck:all`; from `apps/extension`, `bun run test -- src/popup/pages/settings/connected-apps src/popup/components/modules/settings/connected-apps src/components/composite/capabilities src/popup/windows/capabilities src/wallet/services/dapp-interaction scripts/type-roles type-role-ban copy-dash-ban red-text-ban`; `bun run check:plans` after staging. Smoke, from `apps/extension`, `bun run test:e2e tests/e2e/type-roles.test.ts`, Chrome then `NULO_E2E_BROWSER=firefox`. Network, from the root, one invocation per browser: `bun run e2e:agent tests/e2e/network/connect-check-window.test.ts tests/e2e/network/connect-verify-mismatch.test.ts tests/e2e/network/type-roles-windows.test.ts tests/e2e/network/cap-window.test.ts tests/e2e/network/authwit-variants.test.ts` (`cap-window` reads the table, `authwit-variants` the switch). Pass: every command exits 0; any edited assertion is recorded here with its reason. No e2e scenario is added.

**Outcome.** At `530bf6a42`, retry 0: lint (red once on one formatting error in the new page test, formatted), typecheck:all and the targeted tests (25 files, 561 passed) green; `check:plans` green; smoke `type-roles.test.ts` Chrome 14 passed and 1 Firefox-only skip, Firefox 15 passed; network, one `e2e:agent` run per browser over the five specs, Chrome 19 passed, Firefox 18 passed and 1 Chrome-only skip. The review fix `a43cfdb89` reran lint, typecheck:all and the targeted tests (25 files, 562 passed); it changes behaviour only for a stored simulation holder that is not an object, which no e2e scenario carries. Edited assertions: `[id].test.ts`'s `line` helper reads the switch row's own line, since the list-accounts row now comes first; the "If you allow, it can" label checks became its absence.

## Phase 4: arc 2, captures, review and the PR ✓

1. Captures through the render lane's capture page (the real page under Vite over fake service clients, copied in uncommitted from `782858322` and removed after each run), 400 px at 2x, light and dark, into the lane's scratch `shots-a2/` with `captions.json`: before at `8ff0e6489` (`cab2-before`, `cab2-before-one`, `cab2-before-page`, `cab2-window-before`), after at the built head (`cab2-d1`, `cab2-d1-open`, `cab2-d1-one`, `cab2-d1-page`, `cab2-window`). The window frames mount the window's `DetailsTable` from `buildDetailsTable` in the window's chain of widths (a full-width wrapper, 16 px padding), not the whole window.
2. The before and after pairs committed under `pr-captures/connected-app-build-1/` in one commit, removed in the next.
3. Post-implementation, then the PR.

**Outcome.** Before at `8ff0e6489`, after at `530bf6a42` (`a43cfdb89` changes nothing these frames draw). The many-permission section measures 403 px before and 595 px after (the page 775 px and 967 px); the read-only grant 62 px and 106 px; the head stands 24 px under the kind rows. On the page the table is 312 px wide and draws narrow, every name whole; in the window it is 342 px wide and draws wide, and its frames are byte-identical before and after in both themes.

## Delivery

One PR from `connected-app-build-1-a2` (off `origin/dev`) to `dev`, opened ready, no label. Title: `feat(connected-apps): the app's permissions as the pop-up's per-contract table`. The body quotes P185-01 with its note and P185-02 under `## Sign-off (decision page 185)`, states the head's 24 px, lists the tests and the e2e counts per browser, the Codex verdict, and embeds the captures. No `Closes`, no `Part of`. Merging is the orchestrator's.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `8ff0e6489`, bounded work. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2: ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over the plan amendment and `origin/dev...HEAD`, with the arc map ("arc 2 of 2, then the close-out") and the two verbatim rules; the prompt in the lane's scratch dir. Fix what is material, rerun the gates the fixes touch, log the verdict. A second round only on a finding (`resume-codex.sh`; hard stop at three). No Opus review.
- Step 3: `gh pr create`, `gh pr ready`, `gh pr checks <n> --watch` (a known flake gets one rerun).
- Step 4, in the same PR's final commits: the Outcome, lessons, `STATUS.md` deleted, the `git mv` into `archive/` in its own commit, the index line to `archive/index.md`, after merging `origin/dev` in.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build connected-app-build-1 arc 2 per `implementations-plan/connected-app-build-1/plan.md`: Phase 3 green, captures, one Codex pass, PR open with captures; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

**Arc 1.** No plan audit round. Codex over the plan and the net diff (gpt-6.1-sol, high, read-only, `0dc22a9c5...0a6e270d1`), 2026-11-17: approve with one comment fix (`0904820c2`); round 2: approve. No dead state, copy or selector left; the verify flow unchanged; the two glyphs meet no competing meaning in the window.

**Arc 2.** No plan audit round (the bounded form). Codex over the plan amendment and `origin/dev...HEAD` (gpt-6.1-sol, high, read-only, at `530bf6a42`), 2026-11-18: approve with fixes, high confidence.
- R1-1, demonstrated, accepted (`a43cfdb89`): a stored `{ type: "simulation", utilities: null }`, which the session schema keeps, threw in `simulationRow` (`holder.scope` on `null`) once the page called `isBroadRequest`. A holder that is not an object now reads as any contract, as `isAnyContractScope` reads an unreadable scope; a page case with a listed-scope control is red on the old file and green after.
- R1-2, accepted (`a43cfdb89`): the container query's comment shortened, its arithmetic stated as "under 132 px".
- Found sound: the table waits for the names while the kind rows and the switch do not; a refused read falls to an empty list; no call after unmount; every client disconnected once; the switch's testids, write and rollback; the read's input and profile checks; both hosts stretch the table, so the container never takes its own width; no dangling reference after the removals; wire-shaped fixtures and paired controls; the e2e page leg still sweeps.

**Round 2** (resumed, `a43cfdb89`): approve, no new finding.
