---
plan: home-onboarding-2
tier: light
status: approved; arc 1 in progress
issues: "#156 (arc 1); #132 (no arc: shipped by #348)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit round trip (gpt-6.1-sol, high); one Opus Plan lens
base: origin/dev at dfdf4c31
trunk: dev
post_implementation_hardening: not scheduled
---

# home-onboarding-2: the Firefox Presto permission row (#156)

On Firefox, while Nulo lacks its loopback host permission, the onboarding Presto step and Settings → Proving show the signed permission row in place of the Presto content. The Firefox manifest also lists the two loopback origins as optional. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope and sign-off

- **#156, arc 1.** One PR against `dev`, `Closes #156`.
- **#132, no arc (D1).** #348 (`19629fdb`) removed `.section_header` (8 px bottom padding, hairline rule) from both of `RecentActivityView.vue`'s header uses. It closed #132 on 2026-10-13. HEAD keeps that result (`:847`, `:925`), and page 18's option A reads "This is what #348 shipped". The lane brief's `Closes #132` does not hold.
- **Out:** #170, #181, #352, Chrome onboarding, and Chrome's site-access controls.
- **UI impact, onboarding Presto step and Settings → Proving on Firefox (P18-03, option A):** "The permission row (a warning banner with the line "Firefox needs your permission for Nulo to reach Presto." and an "Allow" button with the usual focus ring) stands in place of the Presto content while the permission is missing, so one instruction shows at a time. On the onboarding step the Get Presto pitch and the status card are hidden, Continue is unavailable and Skip shows. On Settings → Proving the status card, "Get Presto" and the detail rows are hidden; the closing note stays. Once allowed (here or in Firefox's add-on settings), the page is exactly today's and checks Presto at once." The signed photos are of `shot/156-a` (`2d7981a0`), and its markup is the row's spec (D3).
- **UI impact, the Firefox manifest (P16-04, option B, in #156's Decision):** "The Firefox manifest gains the optional host permission whatever the probe shows." No screen changes. P16-04's record told the owner that option A meant "nothing new on the AMO listing", so B accepts a listing change.
- **Not waited on:** P18-04, the owner's Mac check of the toolbar panel under Firefox's prompt (Delivery).

## Outcome & Quality Bar

**For whom.** A Firefox user who has switched off all three of Nulo's site toggles in about:addons. They meet the row in the onboarding tab or in Settings → Proving.

1. The row shows only on Firefox, only while the two loopback origins are missing, and it alone replaces the Presto content. Chrome, and Firefox with the grant, see today's pages with today's testids.
2. Allow asks the browser from the click. A grant from Allow, from another Nulo page or from about:addons brings back today's page and one Presto check at once. A refusal leaves the row. A page that mounts without the grant sends no probe until a grant (KL-1 names the exceptions).

**Good enough.** No Chrome step, and no own window for the toolbar panel (P18-04). Focus after a grant follows OA-1's "what ships now".

## Assumptions

**Facts**
- F1. #156's impact claim, "Proving falls back or fails silently", does not hold on Firefox 153.0.4.
  - In the probe of 2026-10-13, a withheld permission blocked no request to a CORS-answering loopback server.
  - What the withheld permission costs is Presto's minimal `/health` body until Presto approves Nulo, so Proving's version rows read "—" ([probe](../archive/home-onboarding-chrome/lessons/phase-2.md)).
  - The owner signed pages 16 and 18 on 2026-10-15, after that record. Page 16 B reads "whatever the probe shows". The arc ships the signed text.
- F2. Firefox 153.0.4 merges `optional_host_permissions` with an MV3 manifest's origins into one optional set (`Extension.sys.mjs:1357-1384`). The install grant is unchanged (`:1338-1346`). So P16-04 B grants nothing new at run time.
- F3. Facts about `permissions.request` (probe; `schemas/permissions.json:110` and `ext-permissions.js` in Firefox's `omni.ja`):
  - `request` is `requireUserInput: true` whatever the prompt pref says.
  - It grants an origin that only `host_permissions` declares.
  - With `extensions.webextOptionalPermissionPrompts=false`, a hit-tested click's request resolves `true` with no doorhanger.
  - `onAdded` and `onRemoved` fire from `change-permissions` in every extension context.
- F4. To withhold the grant, remove `https://127.0.0.1/*`, `http://127.0.0.1/*` and `*://*/*` (the content script's all-sites pattern covers loopback).
- F5. presto-core 1.2.1's `checkStatus` joins an in-flight probe even when forced (`presto-client.js:55-74`). `usePrestoCheck.start()` probes only when `prestoReached` is set. Today it can dispatch that probe after `dispose()` if its config read resolves late (Codex R1-2).
- F6. `Banner`'s own action button has no focus ring. The design `Button` draws the 2 px solid accent ring.
- F7. Test-only Firefox prefs ride a `LaunchOptions` field and stay out of `FIREFOX_LAUNCH_PREFS` (the `egress` precedent, `firefox.ts:261-305`). A browser difference lives on `BrowserDriver` (`FIREFOX.md:9`).
- F8. No production code calls `chrome.permissions`. `store-listing.test.ts:34` reads `permissions` and `host_permissions` only.

**Inferences**
- I1. On Firefox, until the first `contains` read lands, the page shows today's first frame (`detecting`: the pitch on onboarding, "Get Presto" on Settings, no Skip). When the permission is missing, the row then replaces it. The read is one parent-process call.
- I2. `web-ext@10.6.0 lint` reports no new error for an origin in both lists (Phase 2 checks).

**Asks:** OA-1 in OWNER-ASKS (focus after a grant). The arc ships its "what ships now".

## Architecture & Implementation

- **`src/composables/usePrestoHostPermission.ts` (new).** `usePrestoHostPermission({ onFirstAllowed, onGranted }) → { missing: Readonly<Ref<boolean>>, request(): void, dispose(): void }`. It calls `chrome.*` directly, as `usePinnedTokens` does. Pages pass `onFirstAllowed: start` and `onGranted: check` (D2).
  - Origins: the `getManifest().host_permissions` entries with scheme `http`/`https` and host exactly `PRESTO_HOST` (D4).
  - On Chrome (`!isFirefox()`), or with no such origin: call `onFirstAllowed` synchronously. Do nothing else.
  - On Firefox, the internal status is `pending`, `unknown`, `missing` or `granted`; `missing` is true only for `missing`.
    - Subscribe to `onAdded` and `onRemoved` before the first `contains` read. Each event re-reads. A `createRunFence` fence keeps an older read from landing over a newer one.
    - The first read: `true` sets `granted` and calls `onFirstAllowed`; `false` sets `missing`. A throw logs at `debug`, sets `unknown` and calls `onFirstAllowed`: today's page, as if the row did not exist.
    - A later read: `true` from any status but `granted` sets `granted` and calls `onGranted` (Codex R2-2); `false` sets `missing`; a throw keeps the status (Codex R1-3).
  - `request()` calls `chrome.permissions.request({ origins })` synchronously from the click. A refusal or a throw logs `console.debug("<fixed message>", { error })`. It does not re-read: every grant, Allow's included, arrives through `onAdded` (D5).
  - `dispose()` sets `disposed`, invalidates the fence and removes both listeners. Each continuation returns when `disposed` is set, so no state lands and no callback runs after it.
- **`usePrestoCheck.ts`:** `start()` returns after its config read when `dispose()` has run (F5; lessons.md "A C1 hook's `dispose()` must be terminal"). Nothing else changes.
- **`src/components/PrestoPermissionRow.vue` (new, cross-shell, beside `PrestoStatusCard.vue`).** It uses `shot/156-a`'s markup:
  - `<Banner variant="warning" direction="vertical">` holding `<Text>` with the signed line.
  - A `div` with an 8 px top margin, holding the design `Button variant="primary" size="small"` "Allow".
  - It emits `allow`. Testids: `presto-permission-row` and `presto-permission-allow`.
- **`onboarding/pages/presto.vue`.**
  - Remove `void start()` from `onBeforeMount`; the composable calls it.
  - Put the row after the hero while `missing`.
  - Pitch: `v-show="isPitch && !missing"`. Status section: `v-if="!missing"`. The note also needs `!missing`.
  - `canContinue` needs `!missing`. Skip shows when `missing || !isProbing`. `v-snack-footer` gets `canContinue || missing || !isProbing`.
- **`popup/pages/settings/proving.vue`.** The same wiring. The row comes first. Gate the card and both `ItemsContainer`s on `!missing`. The closing note stays.
- **Teardown order:** disconnect the service clients, then call `dispose()`, then `permission.dispose()`.
- **`manifest/manifest.firefox.config.ts`.** Add `optional_host_permissions: ["https://127.0.0.1/*", "http://127.0.0.1/*"]` with one comment line that states F2. `manifest.config.ts` does not change (chain-endpoints edits it).
- **Pins.** The Firefox block of `src/manifest.test.ts` pins the two optional origins exactly, `host_permissions` equal to the shared list, and no `optional_permissions`. `scripts/store-listing.test.ts` also loops over `optional_host_permissions`.
- **E2E harness.**
  - Add `LaunchOptions.grantPermissionRequests?: true`.
  - Firefox: an exported `permissionRequestPrefs` joins `capabilities()` only when the option is set.
  - Chrome: ignore the option, with a doc line that says why.
  - `launchExtension` passes the option on, guarded or plain.
  - Add `FIREFOX_ONLY.permissionRequest` and a `FIREFOX.md` row.
  - Move `gotoPrestoStep` to a helper, since it now has two users.
- **Spec `tests/e2e/presto-host-permission.test.ts` (Firefox, fresh install; estimated 30 s).** No layer below a real Firefox proves these facts: `contains` after the removals, event delivery across pages, the click counting as user input, and the ring in real layout.
  1. Open the Presto step with the grant, stubbing health with `interceptHealth`.
  2. Withhold the grant from the scratch page and assert `contains` is false. Assert the row appears (`onRemoved`), the pitch and the card are hidden, Skip shows and Continue is absent.
  3. Tab to Allow and assert the ring. Click it with `pointerClick`.
  4. Assert the row leaves (`onAdded`) and the card reaches the stubbed state with no Retry click. Assert no console or page errors.

## Security & Adversarial Considerations

- **Least privilege.** The request names only the manifest's exact-host loopback entries. Firefox also refuses undeclared origins. The optional list grants nothing new (F2). Chrome's manifest stays pinned with nothing optional (`manifest.test.ts:78-81`).
- **Consent.** The request runs only from a click (F3). Firefox's doorhanger is the consent. The test pref exists only in a test launch option, pinned out of `FIREFOX_LAUNCH_PREFS`. Extension pages expose no web-accessible resource, and content scripts cannot call `permissions`.
- **Trust.** A grant changes only how Firefox treats requests to `127.0.0.1` (permission instead of CORS). Presto's per-origin approval and HTTPS-only proving (`presto/client.ts:17`) do not change. No dApp, storage or backup input crosses this change. Logs carry a fixed message with `{ error }`.

**Known limit KL-1** (filed at close-out as a closed `known-limit` issue).
- Path (Codex R2-1, reproduced with the SDK): a startup probe leaves without the grant, and a grant lands before it settles, so the forced check joins it. Two ways in:
  - A person revokes during a granted page's startup (its config read, or the SDK's startup retry), then grants again.
  - A first `contains` read throws while the grant is missing, so `start()` runs; one grant follows.
- Consequence: Proving's version rows read "—" until the next visit or Retry. Proving is unaffected.
- Conditions: two toggles by hand, or a failed read and one grant, inside one startup's life (2 s per attempt, `presto-transport.js:7`).
- Fix not taken: holding the forced check until the earlier probe settles adds a coordination protocol.
- Reopen on a report of "—" rows after a grant, or a presto-core change to its single-flight probe.

## Phases

Size: about 205 lines against the light target of 150. The ledger, the audit verdicts of a split panel and KL-1 (about 45 lines) are the record, so they stay.

### Phase 1: the permission read and the row (#156) ✓
1. Build the composable with at least 10 tests (CLAUDE.md § composables). Each never-happens case has a success control. The cases:
   - Chrome: no API call and no listener; `onFirstAllowed` runs once.
   - A manifest with `https://passkey.nulo.sh/` and `*://*/*`: the request names only the two loopback origins. No loopback entry: no API call.
   - The first read `true`: `onFirstAllowed` once and no `onGranted`. The first read `false`: neither runs. Then `onAdded` with `true`: `onGranted` once.
   - A first read that throws, then `onAdded` with `true`: `onGranted` once.
   - `onRemoved` turns granted into missing. An older read never lands over a newer one.
   - A first read that throws: today's page and `onFirstAllowed`. A later read that throws keeps `missing`.
   - `request` is called synchronously from the click; a refusal or a throw keeps `missing` and does not reject.
   - `dispose`: listeners removed; a read or a `request` answer released after it lands nothing and calls nothing.
2. `usePrestoCheck.test.ts`: a config read released after `dispose()` dispatches no probe, with today's success case as the control.
3. Build the row and `PrestoPermissionRow.test.ts`: the exact line, the testids, and one `allow` per click.
4. Wire `presto.vue` and extend `presto.test.ts` (mock the composable). While `missing`: the row shows, the pitch is hidden but mounted, the card and the note are absent, Skip shows and the footer reads `true`. Allow calls `request`. The page hands `start` and `check` to the composable.
5. Wire `proving.vue` and add `proving.test.ts`: today's page while not missing; the row, with the card, Get Presto and Details hidden and the note kept, while missing.

**Gate.** `bun run lint && bun run typecheck:all && bun run test`. Pass: exit 0, and the existing `presto.test.ts` case passes unchanged. Layers: lint, typecheck, unit, component.

### Phase 2: the Firefox manifest's optional host permission (P16-04 B)
1. Before the edit, run `bun run --cwd apps/extension build:firefox && bunx web-ext@10.6.0 lint --source-dir apps/extension/dist/firefox --self-hosted` and keep the output.
2. Edit the config and the two pins. Run the same build and lint again.

**Gate.** `bun run lint && bun run test`, and step 2. Pass: exit 0, no lint error, and no warning that step 1 lacks (a reviewed one is recorded in `lessons/phase-2.md`). Layers: lint, unit, build.

### Phase 3: Firefox e2e and shots
1. Add the harness option and its pin in `scripts/e2e/firefox-driver.test.ts`: the pref set, absent from `FIREFOX_LAUNCH_PREFS`, and `capabilities()` unchanged without the option. Add the `FIREFOX_ONLY` reason, the `FIREFOX.md` row and the helper move.
2. Write the spec. Run it on a build of the base pages: it must fail at the row. Run it on the head build: it must pass.
3. Capture both pages in both themes, and Allow's focus frame, on Firefox into `screenshots/`. Compare them with the signed `o-156-a-*` shots.

**Gate.** `bun run test`. Build the armed smoke dist per browser (`FIREFOX.md:5`). Then, all at `--retry=0`:
- The whole smoke suite on both browsers, because `fixtures/browser/**` changed and the suite includes the new spec.
- One network file per browser through `agent.sh`: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/networks.test.ts`, then with `NULO_E2E_BROWSER=firefox`. Smoke claims its own egress ports from the registry.

Pass: exit 0; the spec is red on the base pages and green on the head; its runtime is recorded. Layers: unit, smoke e2e on both browsers, network e2e.

### Arc gate (before the Codex loop)
`bun run audit:vue`, `bun run test:all`, `bun run test:ci-gating`, `bun run --cwd apps/extension build:firefox`, and `bun run check:plans` after staging.

## Delivery

- One PR against `dev`, with no stack (D-orch-1), opened after the arc gate and the Codex loop.
- Title (79 characters): `feat(presto): ask Firefox for Presto's loopback permission in place of the step`.
- The body has what the README standard asks for, plus:
  - Both UI quotes and the Firefox shots.
  - #348's header after-shots, for #132.
  - `Closes #156`.
  - The P18-04 line: "The owner's Mac check is still open. If the toolbar panel closes under the prompt, Firefox's source suggests the prompt stays on the window's tab and the grant still lands (unverified on a Mac). At worst the row is there next time, and about:addons (or the onboarding tab while onboarding) grants it. A row that opens its own window first would be a new ask."

## Post-implementation

Execute [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard), read at `dfdf4c31`. Specific to this plan:
- Single arc: the loop runs once, over the net diff from the merge base with `dev`, after the arc gate. Codex runs it: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh`. Hard stop at three rounds.
- The close-out is this PR's final commits, after merging `origin/dev`.
- Teardown: `agent-worktree done home-onboarding-2 --merged`, once `FETCH_HEAD:implementations-plan/archive/home-onboarding-2/plan.md` exists on `dev`. Arm one background wait after the wrap-up report.
- No merge and no `--admin`.

## Decision ledger

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | #132: no code, no test | HEAD already ships option A; a test of an absent class proves nothing a review would miss | A pin test; `Closes #132` |
| D2 | The permission composable calls `start()` once the grant is known (`onFirstAllowed`), and `check()` on each grant (`onGranted`). `usePrestoCheck` keeps its design. | A page that mounts without the grant sends no probe, so its post-grant forced check cannot join a pre-grant probe (F5, Codex R1-1). The probe policy stays where it is. Residual: KL-1. | Probing at mount, as a known limit (Opus): it breaks "checks Presto at once" in a narrow window. An `access` option inside `usePrestoCheck` (archived D9, Codex R1-1's fix): it grows that state machine for what two callbacks do. |
| D3 | One `PrestoPermissionRow`, with the signed shot's markup | One home for the signed line, the testids and the ringed control | Inline in both pages (`shot/156-a`) |
| D4 | Origins from `getManifest()`, exact host | The request can never exceed the manifest | A constant beside `PRESTO_HOST` |
| D5 | Grants arrive only through `onAdded`. The e2e grants with a real click under a launch-time pref. | One path for every grant, which the click then proves (Opus 4). The pref keeps user input required (F3). | A re-read after `request()`; a privileged grant; answering the doorhanger from chrome scope |
| D6 | E2E on the onboarding step of a fresh install; Settings by component test | The stand-in node needs the loopback grant (recon); the browser facts do not depend on the page | Both pages in the e2e |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high): conditional approve. Accepted: R1-1, by a different fix (D2); R1-2, for the composable and `usePrestoCheck.start()`; R1-3; R1-4 (I1 reworded, both read orders tested); R1-5 (OA-1 reworded, N-1 folded into F1); R1-6 (date, size). Detail in [lessons/phase-0.md](lessons/phase-0.md).
- **Opus lens:** conditional approve.
  - Accepted: 3 (the shot as spec), 4 (event path tested, no re-read), 5 (dispose flag, first-read rule, filter tests, ≥10 cases), 6 (I1), 8 (P18-04 line), 9 (lint before and after), 10 (F3), 11 (cuts), 12.
  - Rejected 2 (keep the mount probe as a known limit): D2 removes the cause at the cost of two callbacks.
  - Rejected 7 (an AMO note): the owner chose B knowing A meant "nothing new on the AMO listing".
- **Codex r2** (resume): conditional approve. R2-1 (a revoke and re-grant inside a startup probe's life): accepted as KL-1, the alternative Codex named, since the fix is a coordination protocol for a cosmetic residual. R2-2 (a grant after a failed first read was lost): fixed with the `unknown` status. The other accepted fixes verified, with no Chrome or footer regression.
- **Codex r3** (resume): **approve**, no new material finding. One Low, applied: KL-1 now names the failed-read variant, and Outcome item 2 says "a page that mounts without the grant".

## Seeds (written, not run)

```
/goal Phases 1-3 of implementations-plan/home-onboarding-2/plan.md marked ✓ with each gate reported passing and LESSONS_FILE=implementations-plan/home-onboarding-2/lessons/phase-N.md printed; the arc gate green; the Codex loop converged (a resumed gpt-6.1-sol pass reporting no new material finding, quoted); one PR against dev with "Closes #156", opened after the loop; the archive move shown with git show --stat; bun run test and bun run lint exit 0.
```
```
/loop 15m Drive implementations-plan/home-onboarding-2 per its plan.md: read plan.md and lessons/ first; take the next unchecked phase and run its gate; at the arc gate run the Codex loop per Post-implementation; then Delivery and the close-out; settle open questions with Codex (gpt-6.1-sol, high), never by waiting; no merge, no --admin.
```
