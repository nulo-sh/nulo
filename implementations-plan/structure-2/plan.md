---
plan: structure-2
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ 18d29f23
standard: implementations-plan/README.md § Post-implementation standard, read at 175d8268
---

# structure-2: four families shared once, the IncomingTransferService map, one binding fix, one removal

Four issues, three arcs, each one PR against `dev`, not stacked (D-orch-1). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, the #735 pick). Gate log: `STATUS.md`.

| Arc | Issues | PR lines | Released when |
|---|---|---|---|
| 1 | #735: settings rows (Privacy, Display, Lock), detail hero line, explorer name, hero observer | `Refs #735` | #735 carries the owner's recorded pick (OA-1) |
| 2 | #680 | `Closes #680` | dapp-boundary-3 arc 2 merges |
| 3 | #735: profile-flow notices, Developer plumbing; #730 | `Closes #735`, `Closes #730` | #743, test-infra-1 arc 3 and arc 1 merge; with OA-1 = C, #743 alone, and the PR carries `Closes #730` only |
| none | #750 | none | no split pays at HEAD (§ #750); the issue stays open for the decision page its body names |

Arc 1 runs on `worktree-structure-2`, which carries this plan. Arcs 2 and 3 do not depend on each other; each branches from `dev` at its release as `structure-2-a2` / `structure-2-a3`. At each arc's start, `git diff --name-only origin/dev...<branch>` of every running lane must miss the arc's files; a hit waits.

## Outcome & Quality Bar

- **For whom**: the next maintainer of these files, and the person using the wallet, who must see nothing change (arcs 1 and 3) and must never find a connected app on a profile that did not allow it (arc 2).
- **Excellent**:
  1. Each rule lives once: restyling a settings row, rewording a failure notice or the hero line, or fixing the hero observer is one edit.
  2. Nothing a person sees or a test asserts moves: every base test title passes on the head with its body unchanged, the rendered DOM differs only in hashed module class names and class-token order, and every migrated surface is pixel-identical in both themes and both browsers.
  3. The Allow binds its row to the profile it was given under and is refused before any id is allocated, proven by a composition test over the real session service that is red on the base.
  4. #730 leaves no orphan: no copy, ref, compiler option or CSP hash without a reader.
- **Good enough**: a row whose markup differs (Lock's auto-lock title with its tooltip; Developer's toggle loop, whose inner column carries `justify="center"`; Developer's two link rows) stays hand-written and shares the title size and the plumbing. Testid props exist because CLAUDE.md preserves each testid where it is.

## Assumptions

**Facts** (verified at `18d29f23`; recon has the evidence):
- F1 `useSettingUpdate` (#737) holds the write half, `useConfigRead` the read fence. Privacy's and Developer's `onSettingUpdate` and land bodies are byte-identical; Display's add one dust branch; Lock's differ.
- F2 `utils/toast-call-sites.test.ts` requires every `openToast` argument to be one object literal with a literal `kind` (or its approved ternary).
- F3 `row-title` is site-sized (`size: null`). `type-role-ban.reviewed.json` is `{}`. A standalone `.module.css` rule with a size and no `composes: type--<role> from global` is a `faceless` finding; `settings-row.module.css`'s `.row_name` shows the accepted form.
- F4 Vue's compiler drops the whitespace-only text around an interpolation (`<Text> {{ x }} </Text>` compiles to the interpolation alone; checked with `@vue/compiler-dom`), so Display's spaced templates render the same text as the tight ones.
- F5 #735's fee-valuation claim does not hold: both pages already call `feeDisplay(raw, prices.feeJuiceQuote.value?.usd)`.
- F6 `developer/account-state/contracts/index.vue`'s `.title_size` is 14px and About's is a page title: neither is a settings row.
- F7 Received's separator test `receivedTime && received.txHash` equals `receivedTime && (explorerUrl || txHash)`: `getTransactionExplorerUrl` returns a URL only for a 32-byte hex hash (`explorers.ts:53`); Tx's `explorerUrl` requires `tx.hash`.
- F8 #680 holds, in `wallet-sdk/discovery-flow.ts` rather than `background.ts` (recon § #680). A throw out of `persistAndApprove` reaches `rejectFailedDiscovery` (`:188-196`): the discovery is rejected and the reservation released, as `rejectThrottled` does.
- F9 #730's pieces are read only by `onboarding/pages/presto.vue`, which #743 deletes; `bannerStatus` has no reader today. `popup/pages/settings/proving.vue:31` passes `"settings"` to `copyFor`.
- F10 `addDappSession` is on the RPC `Methods`, but no extension page calls it, and the ports accept only same-extension senders (`packages/extension-messaging/src/core/sender-auth.ts:17-23`).

**Inferences** (both legs checked I1-I3 in Vue 3.5 and `packages/design/src/core/Flex.vue`; they hold):
- I1 A directive on a single-root component reaches its root element, so `v-settings-row` on the new row behaves as on today's `Flex`.
- I2 Attributes a page passes to the row (`align`, `gap`, `data-testid`) fall through to its root `Flex` as declared props; `Flex` orders its classes itself.
- I3 Developer's `justify="center"` is a layout no-op. Unused: that row stays hand-written.

**Asks**:
- A-1 → OA-1 (owner, through the orchestrator): #735 and #750 carry `enhancement`; no decision page records a pick, and #735's body says "Not work until the owner picks it". The spawn note says the lane is unblocked for #735; the record still has to exist. Arc 1 and arc 3's #735 part start once #735 carries it. #750 needs no pick for this lane: no code is planned.

## Architecture & Implementation

**Settings rows.** `components/ui/Settings/SettingControlRow.vue` (L2): root `<Flex justify="between">`, then `<Flex direction="column" gap="6">` with `<Text variant="row-title" color="primary">` and `<Text variant="caption" color="tertiary">`, then the default slot (the control). Props `title`, `description`, `titleTestid`, `descriptionTestid`; the caption keeps `variant="caption"`. The page passes `align`, `gap`, `data-testid` and `v-settings-row` on the component (I1, I2). The name keeps it apart from `SettingItem`, the navigation row, and from the `settingsRow()` registry lookup. The 13px size becomes `.control_title { composes: type--row-title from global; font-size: 13px; }` in `components/ui/Settings/settings-row.module.css` (F3). Each settings row title, the component's and every hand-written one (Lock L2, Developer V1-V3), is a `<Text color="primary">` whose local class composes `control_title`, with no `variant`, so the role class has one owner; `row_name` is the precedent (`ContactRow.vue:89-90`, `connected-apps/index.vue`). A title that kept `variant="row-title"` would carry `type--row-title` twice. Migrated: Privacy P1-P3, Display D1-D4, Lock L1.

**Settings plumbing.** `useSettingUpdate` also returns `onSettingUpdate(setting)` (apply when the row exists and the value moved) and `landSettings(stored, updatedSince)` (copy each stored value into its row unless updated since). Each adopting page orders its setup: row state, then `useSettingUpdate`, then `configService.onUpdate.add(...)` and `useConfigRead(...)`, so no handler is read before its `const` (today they are hoisted function declarations). Each page keeps its own `isLoading.value = false` and its read timing (`onMounted` or `onBeforeMount`). Privacy registers `onSettingUpdate` directly; Display's handler and land run the dust branch first, then these; Developer adopts both in arc 3; Lock stays (F1). The file exports `SETTING_UPDATE_FAILED`; each failure site keeps `openToast({ kind: "error", label: SETTING_UPDATE_FAILED })` (F2). Display's unused `.item` and `.item_icon` rules go.

**Detail pages.** `explorerDisplayName(id)` in `wallet/constants/explorers.ts` returns the explorer's name or `"explorer"`; the four copies call it; Privacy's "None" is a dropdown label and stays. `popup/components/modules/tx/DetailHeroMeta.vue`, shaped like `TxHashRow` beside it: props `time`, `explorerUrl`, `explorerName`, `hash` (the copy fallback; absent means none), `linkTestid`, `copyTestid`; emits `copy(hash)`. The separator shows when `time && (explorerUrl || hash)` (F7). The link keeps `target="_blank" rel="noopener noreferrer" @click.stop`. Its classes compose from `popup/pages/detail-page.module.css`; the pages drop their now-unused hero rules. Tx and Received keep their column wrapper; Journal passes no `hash`.

**Hero observer.** `composables/useHeroVisible(el: Ref<Element | null>): Ref<boolean>` (C0): starts `true`; on mount, observes `el` with `threshold: 0` and sets the newest entry's `isIntersecting` (a delivery batches changes oldest first); disconnects in `onScopeDispose` (CLAUDE.md's non-service carve-out; precedent `composables/snackInset.ts`). Activity and Settings drop their observer code and their `disconnect` calls.

**Profile-flow notices (arc 3).** `utils/profile-flow-notices.ts`: `createFailedNotice(isPasskey)` and `importFailedNotice()` return the `notificationStore.create` argument. Each shell's callback becomes `notificationStore.create(createFailedNotice(isPasskey))`; the composables' callback contracts stay.

**#680 (arc 2).** `addDappSession` takes a required sixth parameter, `expectedProfileId`. Right after the fence capture, outside its `try`, and before the expiry sweep and the id allocation, it throws `SessionEndedError` when `fence.profileId !== expectedProfileId`. An expected id can only narrow what a caller writes (F10). `persistAndApprove` passes `profileId` and keeps its own `getActiveProfile` check, whose comment is rewritten: the check refuses the common case before the write, and `addDappSession` binds the row. The new error propagates to `rejectFailedDiscovery` (F8): the dApp gets a rejected discovery and the standby window closes, as for any refused Allow.

**#730 (arc 3).** Delete `PrestoSurface` and `copyFor`'s surface parameter (`proving.vue` drops its `"settings"` argument; the settings copy is unchanged), `PERMISSION_BLOCKED_COPY.onboarding`, the long `connectedDetail`, `bannerStatus`, the `isCustomElement` option, the `style-src` hash (`style-src 'self'`), `manifest.test.ts`'s rendered-banner re-hash, and any carve-out or surface #743 leaves in `scripts/type-roles/`. Edit `store/listing.md:244` only if `grep -c innerHTML` over the built bundle's Presto chunk shows the banner gone.

**Trade-offs.**
- `SettingItem` for the control rows: rejected, a different look (padding, divider, label gap 4, 14px).
- Outline B, sharing only the size and plumbing: rejected; it leaves eight copies of the row markup, and plan A changes no markup beyond hashed class names, as B's `composes` would too.
- Layout props or a `#title` slot on the row: rejected; fallthrough carries layout, and a slot would have one caller.
- `useExplorerLinks(chainId)`: rejected; the URL gates differ on purpose, and the shared part is the name.
- Notices inside the composables: rejected; they take the surface as a callback on purpose.
- #680 through a worker-only method that takes a passed fence (outline B): rejected; a second entry point for one caller, where an expected id narrows the one that exists.
- Dropping `persistAndApprove`'s check: rejected; it would force the shared fake to re-implement the refusal for two existing tests.

## #750: the map at HEAD, and which split pays

`service.ts` is unchanged since the issue measured it, so its ranges hold. Every region shares the spine (service lock, epoch, deleter count, repository, `emit`).

| # | Region | Lines | Shares beyond the spine | Split now? |
|---|---|---|---|---|
| 1 | Prelude: types, floor helpers | 1-151 | none | no: pure, 63 changed lines |
| 2 | Shell, spine, `init` | 152-452 | owns the spine | no: it is what a split receives |
| 3 | Account and profile lifecycle | 453-558 | cursors (484), `classGateCache` (485), schedulers | no: 5 changed lines |
| 4 | Read API, fees, dust | 559-694 | `feeCache` | no: lock-free but small, 17 changed |
| 5 | Trust machine | 695-801 | deleter count read directly (746, 749) | no: the read is the spine |
| 6 | Scope wipes | 802-850 | `feeCache`, episodes, schedulers | no: 49 lines |
| 7 | Arrival state, floors | 851-975 | reader tips | no: 3 changed |
| 8 | Scheduler set | 976-1142 | six `hydrateSchedulers` callers; `watchedContracts` edited at 1364 | no: the seam is wide |
| 9 | Public tick, tips, health | 1143-1274 | `sharedTips`, `markScanned` serve the note tick | no: same seam as 8 |
| 10 | Token and transaction lifecycle | 1275-1435 | cursors (1338), schedulers, `isQuarantined` for both ticks | no |
| 11 | Note arm | 1436-1810 | hand-built fence (1691); owns `resolveReceiptTrust` (1756), which the public arm calls | no: densest on the spine |
| 12 | Visibility, prompt replay | 1811-1877 | `configService` | no: 0 changed |
| 13 | Public arm | 1878-2544 | one entry (1184); cursors and class gate written at 484-485 and 1339; owns `isOwnSend` and `emitUpdatedIfShown`, which the note arm calls | not yet (below) |
| 14 | Record builders, own-send sources | 2545-2650 | transaction and journal services | no: 1 changed |
| 15 | Module-tail helpers | 2651-2749 | none | no: pure |

**Verdict: no split pays at HEAD** (both legs agree). The public arm is the one candidate: 667 lines, one entry, 222 changed lines, mostly #420 and #248. It needs four spine callbacks, a reset and a forget call and the shared commit path, and it would have one caller. Its scenarios reach about five of its members by cast in `service.scenarios.test.ts`, which test-infra-1 arc 4 rewrites onto the real repository, so moving the arm first would repoint casts that suite is about to replace. No open issue or branch schedules an arm change. The split pays in the PR that schedules the next substantial public-arm change, after test-infra-1 arc 4: the arm class owns its cursors and `classGateCache`, takes the spine as callbacks, reaches the commit path through one `commitEvent` callback, and moves its scenarios intact. Arc 1 rewrites the one false comment the map found: `service.ts:1916` calls `persistCursorLocked` the sole cursor writer, but 484, 1338 and `clearScope` write cursors too.

## Arc 1 (after OA-1)

### Phase 1: the settings control row (#735)
1. Add `.control_title`, `SettingControlRow.vue` and `SettingControlRow.test.ts`.
2. Widen `useSettingUpdate` and extend its test.
3. Move Privacy P1-P3, Display D1-D4 and Lock L1 onto the row, in the setup order above. Lock L2's title composes `.control_title`. Display's and Lock's failure toasts use the label. Delete Display's `.item` rules.
Files: `components/ui/Settings/{SettingControlRow.vue,SettingControlRow.test.ts,settings-row.module.css}`, `composables/useSettingUpdate{,.test}.ts`, `popup/pages/settings/{privacy,display,lock}.vue`, the generated `src/types/{components.d.ts,auto-imports.d.ts,.eslintrc-auto-import.json}`.
Tests: the row, 5 cases: title and caption with their testids; no testid attribute when none is passed; the control slot; `align`, `gap` and `data-testid` reach the root; the directive reaches the root element. `useSettingUpdate`, 4 cases: `landSettings` copies a stored value, skips a key updated since, ignores a key with no row; `onSettingUpdate` applies a moved value, paired with its never-happens case for an unchanged one.

### Phase 2: the detail hero line and the explorer name (#735)
Files: `wallet/constants/explorers{,.test}.ts`, `popup/components/modules/tx/DetailHeroMeta{.vue,.test.ts}`, `popup/pages/{tx,received,journal}/[id].vue`, `popup/components/popups/IncomingTrustPopup.vue`, `popup/pages/detail-page.styles.test.ts`.
Tests: `explorerDisplayName`, 3 cases (known id, `null`, unknown id). `DetailHeroMeta`, 7 cases: time alone shows no separator; a link with a time; the copy fallback emits `copy` with the hash; no hash and no URL shows neither; testids land; the link opens a new tab with `noopener noreferrer`; a click on the link does not reach the parent. `detail-page.styles.test.ts`, 1 case: the component's hero classes compose from `detail-page.module.css` with no rule of their own.

### Phase 3: the hero observer (#735)
Files: `composables/useHeroVisible{,.test}.ts`, `popup/pages/activity.vue`, `popup/pages/settings/index.vue`, the generated types.
Tests: `useHeroVisible`, 10 cases (CLAUDE.md minimum): starts true; no element creates no observer; observes on mount with `threshold: 0`; a leaving entry sets false; a returning entry sets true; a batch reads its last entry, in both orders; disconnects on scope dispose; no update after dispose; one observer per mount.

### Phase 4: the #750 comment
Rewrite `incoming-transfer/service.ts:1916` to name the scan's cursor writes and the two lifecycle writers. No code change.

### Arc 1 validation gate
- **Fast, after each step**: `bun run lint && bun run typecheck:all && bun run test`, and `cd apps/extension && bun --bun vitest run <the phase's test files, by path>`. Pass: exit 0.
- **Test identity**: `cd apps/extension && bun --bun vitest list <every existing touched suite>` on the merge base and the head, and `git diff <merge-base> -- <those suites>`, read line by line. Pass: every base title is on the head; each added title is in this plan; an existing test line changes only for an edit this plan names (arc 2: `addDappSession` calls gain the expected id; arc 3: `copyFor` calls lose `"settings"`, the onboarding assertions and `bannerStatus` cases go while the settings assertions of the mixed case at `presto-ui-state.test.ts:144-152` stay). The PR body lists each changed existing line.
- **Arc end**: `bun run test:all`; `bun run audit:vue`; `bun run check:plans` after staging. Pass: exit 0.
- **Smoke, Chrome and Firefox**: build with `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<chrome|firefox>`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- <files> --retry=0` with `tests/e2e/{navigation,appearance,settings-routes,sw-resilience,security,fiat-display,received-fee-privacy,send-outcome-rows,rows,home-links,type-roles}.test.ts`. Pass: exit 0, no CSP violation; one rerun for a known flake, a fix for breakage.
- **Network, Chrome**: `cd <worktree> && NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-arrival.test.ts` (load1 under 150; the file is `@requires-proverless`). Pass: exit 0 at retry 0, no test skipped. `store-captures.test.ts` is left out: it skips unless `STORE_CAPTURES` is set, produces store art, and proves nothing the rendered-identity gate does not.
- **Rendered identity** (a scratch spec under `~/.cache/nulo-backlog/structure-2/`, never committed; the capture method of `archive/forms-and-contacts/lessons/phase-2.md`): two armed builds, base and head, per browser. Capture at 360×600, fonts loaded and animations off, in both themes: Privacy, Display, Lock, a confirmed Tx, a pending Tx, a Received with and without an explorer, a Journal detail, the trust prompt, and Activity and Settings at the top and scrolled past the hero. Dump each surface's `outerHTML`; normalise each `class` attribute to its sorted token set with hashed module tokens (`_<name>_<hash>`) dropped, and change nothing else. One control pair must differ. Pass: equal sha256 per pair, equal normalised DOM, the control differs. A differing pair becomes an `OWNER-ASKS.md` entry, and that surface ships nothing.
- **Layers**: lint, typecheck, unit, component, build, smoke e2e, network e2e.

## Arc 2 (after dapp-boundary-3 arc 2)

### Phase 5: bind the Allow's row (#680) ✓
1. Recheck the trace at the new base; stop and revise if the connect path moved.
2. Write the reproducer, `wallet-sdk/connect-profile-binding.composition.test.ts`: the background's real discovery path (`initWalletSdkHandler` over `fakeSdkServices`) with the REAL `DappSessionService` over `FakeBrowserApi` in place of the fake. Its `svc` ProfileService answers `getActiveProfile` with p1 and `captureExecutionFence` with p2: the order a switch queued between the two facade-lock turns produces (recon § #680 item 3). An Allow under p1 must write no row and reject the discovery. Run it on the base: it must be red, with a row under p2. `fakeSdkServices` gains a `dappSession` override if it has none (a test-only option).
3. Implement the parameter and the refusal; update each caller and stub recon § #680 item 7 lists (the stubs with fewer parameters still typecheck).
Files: `dapp-session/{service,spec}.ts`, `wallet-sdk/discovery-flow.ts`, `wallet-sdk/test-services.ts`, the new composition test, and the test call sites of `addDappSession`. No `background.*` file changes.
Tests: the reproducer, plus its success control (both answers p1: one row under p1, the discovery approved). `dapp-session/service.test.ts`, 3 cases: a fence naming another profile refuses with `SessionEndedError`, and a missing expected id refuses the same way, each with no storage key and no `onDappSessionAdded`; the matching id writes the row under it.
**Validation gate**: the fast layers; `bun run test:all`; network on Chrome, `connect-dapp`, `connect-deny`, `connect-one-window`, `connect-unserved-chain`, `connect-locked-queue`, `account-switch-live-session` (`e2e:agent` as above, with `NULO_E2E_RETRY=0`; the network config retries twice by default). Pass: exit 0 at retry 0; the reproducer red on the base and green on the head.

## Arc 3 (after #743, test-infra-1 arc 3 and arc 1)

Phases 6 and 7 use arc 1's `.control_title` and widened composable. Recheck at the base: each #730 piece still has no reader; each notice pair is byte-identical. If a release gate lags far behind the others, the orchestrator re-scopes the arc at release; the plan adds no fourth PR.

### Phase 6: profile-flow notices (#735)
Files: `utils/profile-flow-notices{,.test}.ts`, `onboarding/pages/{create,import}.vue`, `popup/pages/profile/new.vue`, `popup/pages/import.vue`. Tests: 3 cases pin each payload's exact copy (password create, passkey create, import).

### Phase 7: Developer plumbing (#735)
Developer's `onSettingUpdate` and land use the composable, in the setup order above; V1-V3 titles compose `.control_title`; the markup stays. Files: `popup/pages/settings/developer/index.vue`. Tests: the page suite, unchanged.

### Phase 8: Presto's onboarding leftovers (#730)
Files: `utils/presto-ui-state{,.test}.ts`, `popup/pages/settings/proving.vue`, `composables/usePrestoStatus{,.test}.ts`, `apps/extension/vite.config.ts`, `apps/extension/manifest/manifest.config.ts`, `src/manifest.test.ts`, and `scripts/type-roles/{exceptions.ts,surfaces.expected.json}` and `store/listing.md` if the recheck names them. Tests: a case that pins only deleted code goes with it, listed in the PR body; the pinned CSP string becomes `style-src 'self'`; the settings copy cases stay unchanged.

### Arc 3 validation gate
Arc 1's fast, test-identity (deletions only those listed for phase 8) and arc-end gates; `bun run test:release` and `bun run test:ci-gating`; the armed smoke on Chrome and Firefox for `viewers-csp`, `settings-proving`, `onboarding-tab`, `auth-flows`, `settings-routes`, `sw-resilience`, `type-roles`; the rendered identity of Developer and the four notices. Pass: exit 0 at retry 0, no CSP violation, equal pairs.

## Security & Adversarial Considerations

- **#680.** The race needs the person's own profile switch to land between two facade-lock turns, about three microtask hops apart, during an Allow; no trace shows a dApp or page that can cause it, and its exploitability is unknown. The fix narrows: the row is written only under the Allow's profile, or not at all. A forged `addDappSession` call needs a compromised extension page (F10), which already holds more; the new id can only refuse, and reveals nothing `getActiveProfile` does not.
- **A switch after the fence** writes the row under the Allow's profile, and establishment checks `approverProfileId` (`discovery-approval.ts:31-33`); unchanged here.
- **Arcs 1 and 3** move markup and copy. The explorer link keeps `target`, `rel` and `@click.stop`, and the URL builders keep their fixed bases and hash checks.
- **CSP.** Arc 3 narrows `style-src` to `'self'`; the armed smoke with `NULO_E2E_CSP_REPORT=1` on both browsers proves no surviving inline stylesheet.
- **Least privilege, crypto, supply chain.** No new dependency, permission, credential or cryptography; `@alejoamiras/presto-banners` stays at its pin.
- **Logging.** No new log line; a refused Allow logs `rejectFailedDiscovery`'s existing fixed line.

## UI impact

- Settings Privacy, Display and Lock (arc 1), Developer (arc 3): none. Same rows, copy, testids, order and pixels; only hashed module class names and class-token order move.
- Tx, Received and Journal detail, the incoming trust prompt (arc 1): none, pixel-proven.
- Activity and Settings heroes (arc 1): none, captured at the top and scrolled.
- The profile create and import failure notices (arc 3): none, the same copy.
- The connect window (arc 2): none; a refused Allow closes the window as any refused Allow does.
- Onboarding (arc 3): none; the removed copy has no screen after #743.
The lane brief's no-ask record says "none"; nothing here goes beyond it.

## Decision ledger

| Id | Decision | Rejected | Panel |
|---|---|---|---|
| D1 | Split #735 by collision: Privacy, Display, Lock, detail and hero in arc 1; notices and Developer in arc 3 | one arc after every lane merges | both agree |
| D2 | `SettingControlRow`, layout by fallthrough, title size composed in the shared row module | `SettingItem`; layout props; a title slot; outline B | Codex preferred B unless markup is preserved: it is (F4, Developer V1 left as is) |
| D3 | Widen `useSettingUpdate`, with an explicit setup order | a second composable | both agree; the order is Codex's |
| D4 | Share the toast label; each literal call stays | a shared toast object (fails F2) | both agree |
| D5 | `explorerDisplayName` plus `DetailHeroMeta`, testid props kept | `useExplorerLinks` | both agree |
| D6 | `useHeroVisible`, `onMounted` and `onScopeDispose` | page-owned disconnect | both agree |
| D7 | #750: no split; the map here; the issue open for the owner's page | the public-arm split now; a `known-limit` closure | both agree |
| D8 | #680: required `expectedProfileId`, `SessionEndedError` before allocation, the check kept, the error propagates | a passed fence; dropping the check; a new try/catch | both prefer A; keeping the check follows from Opus F1 |
| D9 | Identity: titles, unchanged bodies, normalised DOM and pixels | titles alone; DOM snapshots committed | both asked for more than titles |
| D10 | #735's enhancement gate goes to the owner (OA-1) | the lane launch as the record | both flagged it |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high): `reject` (enhancement authorization, incomplete gates, an arc-2 test collision). Opus 5.5 Plan: `conditional approve` (a real reproducer, the arc-2 collision, the owner asks, runnable gates, the type role). Dispositions (C = Codex, O = Opus):
- Accepted: C1/O3a the pick → OA-1 and the release gates. C2 F4 was false → F4 rewritten, no whitespace delta. C3/O3b markup → Developer V1 stays hand-written; only hashed class names move. C4 TDZ → the setup order. C5/O2 collision → the reproducer is a new composition file; no `background.*` edit. C6/O4 gates → armed builds, CSP flags, explicit files, `audit:vue`. C7 identity → hero captures, normalised DOM, `@click.stop` pinned. C8/O8 → `proving.vue` and the `listing.md` check named. C9 close-out → the rule in Post-implementation. C10/O11 → files and index line created. O1 reproducer → the real `DappSessionService`, the switch inside the fence answer. O5 → `.control_title` composes its role. O6 → unchanged bodies, pass rule rewritten. O7 → one `Closes` per issue. O10 → no try/catch. O12 → F10 and the Security wording. The security wording "a dApp cannot trigger" → the traced interleaving.
- Rejected: O3b's claim that Display loses edge spaces (F4: the compiler drops them). O9 removing the testid props (CLAUDE.md preserves testids where they are; one line in Outcome & Quality Bar). O13 citing #750's table instead of restating it (the lane brief requires the map in the plan).

**Round 2** (Codex, resumed): `conditional approve (with conditions: reconcile test identity, enforce retry-zero network runs, specify class normalization, and gate arc 3's shared-code dependency)`. All four accepted: the named mechanical test edits; `NULO_E2E_RETRY=0` on every network run (`vitest.e2e.network.config.ts:26` retries twice by default); `control_title` owns the role class, so no title carries `type--row-title` twice, and the DOM comparison uses sorted token sets; arc 3 waits for arc 1, and with OA-1 = C it carries #730 alone.

**Final pass** (fresh Codex session `01a14edf`): `conditional approve (with conditions: arm incoming-arrival correctly and require store-captures to execute before counting its gate as passed)`. Both verified (`incoming-arrival.test.ts:13`, `scripts/e2e/proverless-guard.sh:54-59`; `store-captures.test.ts:392`) and applied: `NULO_E2E_PROVERLESS=1` on the incoming-arrival run; store-captures removed from the gate. It found no security defect and judged plan A sound against outline B now that rendered identity is a release condition. Resumed on the two edits: `approve`.

**Arc 2, post-implementation** (diff `9470d4e9..structure-2-a2`). Codex round 1 (gpt-6.1-sol, high, session `01a14f10`): `clean`. Opus 5.5 diff review beside it: `approve`, four notes. Accepted: the `persistAndApprove` comment overclaimed (a switch after the fence capture is not refused; it is now scoped to the read-to-capture window); the reproducer now hands over a connect window, which the refusal closes and the success control keeps. Not acted on: an A→B→A switch during a queued admission binds the Allow to the window's profile, pre-existing and within the plan's definition, filed as known limit #771; a dedupe waiter released by the refusal can reconnect on the active profile's own row, the existing known limit #681. Codex round 2 (resumed): `clean`, both fixes verified, both notes out of scope.

## Delivery

- Arc 1: `refactor(ui): one settings control row, detail hero line and hero observer` (74 characters). Body: `Refs #735`, the #750 comment and where the map lives, the identity tables, each browser's smoke wall-clock (no e2e scenario added).
- Arc 2: `fix(connect): bind an allow's session row to the profile it was given under` (75). `Closes #680`.
- Arc 3: `refactor: profile-flow notices, developer rows, presto onboarding leftovers` (75). `Closes #735`, `Closes #730`.
- Open each PR without labels; add `e2e:extension-smoke` or `e2e:extension-network` only when the path filter would skip a suite the arc needs.
- At arc 1's PR, comment on #750 with the verdict and this plan's section; the issue stays open.
- Arcs 2 and 3 are disjoint and may run at once; arc 1's phases share pages and run in order.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `175d8268`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2 runs per arc after its gate, over the arc's diff from its merge base: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three rounds. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1. Every prompt carries the arc map: "arc N of 3; arc 1 the shared pieces, arc 2 the #680 binding, arc 3 the rest of #735 and #730". After the last arc, one fresh Codex session reviews the net diff of the three arcs for cross-arc issues.
- Step 3, per arc: one PR against `dev` (Delivery), then `gh pr checks <n> --watch`.
- Step 4, the close-out, goes on the arc PR still open once every other arc has merged (checked with `git log origin/dev`); never on a PR while another arc is unmerged. First merge `origin/dev` and read `index.md` and `lessons.md`. Then the Outcome block, the lessons pass, each issue's disposition (#750's comment stands), `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line moved, and `bun run check:plans` green after staging.
- Step 5, after that PR merges: `agent-worktree done structure-2 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/structure-2/plan.md` succeeds.

| Where open work lives | Home |
|---|---|
| Work inside an arc | this plan and its PR |
| A bug, gap or deferred refactor that outlives the plan | a GitHub issue with a `Record` link |
| A product call, or a wait outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft advisory, recorded here as "tracked privately" |
| A path needing unsupported conditions, or a consequence that does not matter | a closed `known-limit` issue |

## Seeds

`/goal` (recommended): `Arc <N> of implementations-plan/structure-2/plan.md is done: each phase of the arc is marked ✓ in plan.md, backed by its validation gate reported passing in the transcript (test identity, rendered identity for arcs 1 and 3, the reproducer red on the base and green on the head for arc 2); LESSONS_FILE=implementations-plan/structure-2/lessons/phase-N.md printed per phase; the Codex fix loop converged on the arc's diff, quoted; the arc's PR exists against dev, opened after the loop, with gh pr view output in the transcript; bun run test and bun run lint exit 0.`

`/loop 15m Drive arc <N> of implementations-plan/structure-2 forward per its plan.md (read it and lessons/ first; plan.md is the state). Pick the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. A phase is green only when its gate passes as written. After the arc's gate, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge; never start an unreleased arc.`
