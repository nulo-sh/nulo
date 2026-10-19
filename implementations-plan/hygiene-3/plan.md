---
plan: hygiene-3
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ 7eada4c6
standard: implementations-plan/README.md § Post-implementation standard, read at 7eada4c6
---

# hygiene-3: the rest of #735, the countdown Close on Button, the held-Escape flake

Three code-only issues in two arcs, each one PR against `dev`, not stacked (D-orch-1). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Gate log: `STATUS.md`.

| Arc | Issues | Branch | PR line |
|---|---|---|---|
| 1 | #735: the profile-flow notices, Developer's plumbing and titles | `hygiene-3-a1` off `origin/dev`, carrying this plan | `Closes #735` |
| 2 | #797 the held-Escape flake; #517 the countdown Close | `hygiene-3-a2` off `dev` once arc 1 merges | `Closes #797`, `Closes #517` |

The split follows the lane brief: OA-1 concerns arc 2's surface, so arc 1 runs at once and arc 2 is spawned separately.

## Outcome & Quality Bar

- **For whom**: the next maintainer of these files, and the person using the wallet, who must see nothing change.
- **Excellent**: (1) each rule lives once: a notice's copy, a settings row's title size or Developer's update handling, and the outline CTA's box are one edit each, and no `quality-status` run goes red on the held-Escape case again; (2) every surface is byte-identical in copy and pixel-identical in both themes, proven where a test can prove it.
- **Good enough**: rows whose markup differs stay hand-written (Developer's three, Lock's auto-lock title); About's heading and Contracts' 14px title keep their own rules.

## Assumptions

**Facts** (verified at `7eada4c6`; recon has the evidence):
- F1 #779 (`021bdc56`) shipped #735's row, toast label, Display's dead CSS, explorer name, hero line and observer. Left: four notice literals (two byte-identical pairs) and Developer's `onSettingUpdate`, land and three `.title_size` titles (`settings/developer/index.vue:105-122,142,161,185,233-235`).
- F2 No test pins a notice payload; the composable tests assert the callback only.
- F3 Developer's `onSettingUpdate` and land equal `useSettingUpdate`'s (`useSettingUpdate.ts:43-53`); its subscription at `:32` relies on hoisting.
- F4 `Text` adds a role class only with `variant` (`packages/design/src/core/Text.vue:37-38`); `.control_title` composes `type--row-title` at 13px; Lock's title (`lock.vue:259`) is the accepted form.
- F5 #797: Vue runs a later listener only when the event's stamp, set by the first Vue listener on its path, is after that listener's attach millisecond. The field's `<input>` has Input's own listener (`Input.vue:349`), so the root's (`SettingsSearch.vue:70`) is skipped when the dispatch shares the mount's millisecond. Measured: 141 of 400 back-to-back mounts dropped it, all at 0 ms, none at 1 ms or more; a frozen `Date.now` drops it every time. test-utils' `trigger` stamps `Date.now() + 1` for this guard.
- F6 #517's drifts hold: dotted ring, a filled `:active` that shows only without hover, a bezier fade. Button's root is `position: relative; overflow: hidden` and its default slot is a direct child (`Button.vue:138,150-153`), so the progress bar fits inside `Button`.
- F7 `seed.vue` is the only consumer of `SecretCountdownClose`. No open PR edits `SecretCountdownClose.vue`, `developer/index.vue` or `SettingsSearch*`; #743 edits `onboarding/pages/create.vue` next to `notifyCreateFailed`.

**Inferences**: I1 Developer's titles compute the same styles after the swap, as Lock's did in #779's pixel proof (checked by arc 1's capture). I2 A pixel-identical Close on `Button` needs the three overrides, and possibly more for the label's flex layout; the pixel proof finds them (arc 2).

**Asks**: A-1 → OA-1 (owner): the lane brief asks for Button's ring and press; the owner's page-37 record keeps the drifts as overrides. Ships now: the record. A-2 (orchestrator): structure-2's arc 3 still lists #735's Phases 6-7; this plan takes them, and that arc keeps #730 only.

**Claims that did not hold**: the brief's "settings-row composite, explorer-link helper, hero observer" shipped in #779, as an L2 row, so no new composite exists here; #735's six `.title_size` copies are one (F1, recon); the "raw `<button>` the overlay needs" (F6); #735's fee-valuation copy (structure-2 F5).

## Architecture & Implementation

**Notices.** `apps/extension/src/utils/profile-flow-notices.ts` exports `createFailedNotice(isPasskey: boolean): NotificationItem` and `importFailedNotice(): NotificationItem`, whose bodies are today's literals moved verbatim (`note: undefined` and the empty `onConfirm` kept). Each of the four callbacks becomes `notificationStore.create(createFailedNotice(isPasskey))` or `notificationStore.create(importFailedNotice())`. The composables' callback contracts stay: each shell owns its store.

**Developer.** Destructure `onSettingUpdate` and `landSettings` from `useSettingUpdate`; move `configService.onUpdate.add(onSettingUpdate)` and `useConfigRead(...)` below it, as Privacy does; `landDeveloperConfig` becomes `landSettings(stored, updatedSince); isLoading.value = false`; delete the page's copies and the comment the composable's TSDoc now states. The three titles drop `variant="row-title"` and `$style.title_size` for `.title { composes: control_title from "../../../../components/ui/Settings/settings-row.module.css"; }`. The markup stays (structure-2's approved shape, D2).

**#797.** The file's `key()` helper sends its keydown through test-utils' `trigger` (`new DOMWrapper(el).trigger("keydown", { key, ...init })`) keeps the event a capture-phase window listener receives, reads its `defaultPrevented` after the synchronous dispatch, fails when no event was taken, and removes the listener in `finally`; the return contract is unchanged. The `keys` describe's `beforeEach` pins `Date.now` to the value it reads then (`vi.spyOn(Date, "now").mockReturnValue(Date.now())`, before any mount, restored after each; a 0 would read as an unset stamp, a spy after mount would leave the attach time earlier) so every key case runs in its mount's millisecond: the base helper reds deterministically, and only a helper that reaches every listener passes. No product code changes; no real-browser failure is demonstrated.

**#517.** `SecretCountdownClose.vue` imports the extension's `Button` explicitly (`import Button from "@/components/ui/Button.vue"`, as `SettingItem.vue` imports `RowTarget`): vitest loads no component auto-import, so an unimported `<Button>` renders a native element and every case passes untested, and a globally registered `Button` resolves the base's own `<component :is="'button'">` to itself. It renders `<Button variant="cta_outline" :class="$style.countdown_cta" data-testid="close-btn" @click="emit('close')">` with the label span and the bar in the default slot. The local `.cta`/`.cta_outline` copy goes; the ghost link stays. The overrides sit under one doubled class, `.countdown_cta.countdown_cta` (0,2,0, and 0,3,0 with a pseudo-class): its `:active` and `:focus-visible` beat Button's base rules (0,2,0) in any stylesheet order and its `:active` loses to Button's hover (0,5,0), as today's press loses to hover; the bare doubled class beats `.wrapper` (0,1,0) for the fade but only ties a compound size rule, so a layout override is checked on its own. A one-sentence comment at the selector says why it is doubled. They hold `transition-timing-function: var(--bezier)`, `:focus-visible { outline-style: dotted }` and `:active { background: var(--txt-primary); color: var(--app-bg); transition: none }`, Any further difference the pixel proof finds is an `OWNER-ASKS.md` entry, never an implementation-time choice. The header comment loses its raw-button reason.

**Trade-offs.** A design-package CTA class composed onto a raw button: rejected, a new package export and a Button restyle for one caller. A fake clock advanced per key for #797: rejected, it models the same thing with more state and keeps the raw dispatch. Developer's toggle loop on `SettingControlRow`: rejected, it drops `justify="center"` and the owner approved "as planned". About's heading composing `.control_title`: rejected, it couples a page heading to the settings row's title.

## Arc 1 (#735)

### Phase 1: the profile-flow notices ✓
Files: `utils/profile-flow-notices{,.test}.ts`, `onboarding/pages/{create,import}.vue`, `popup/pages/profile/new.vue`, `popup/pages/import.vue`. Tests: 3 cases, each payload `toStrictEqual` to the literal copied from the base (`onConfirm: expect.any(Function)`): password create, passkey create, import.

### Phase 2: Developer's plumbing and titles ✓
Files: `popup/pages/settings/developer/index{.vue,.test.ts}`. Tests: 1 case, a worker update turning Developer Mode off shows it and writes both dependents, and the same update again writes nothing (the subscription is wired after the reorder).

### Arc 1 validation gate
- **Fast, after each step**: `bun run lint && bun run typecheck:all && bun run test`, then `cd apps/extension && bun --bun vitest run <the phase's test files>`. Pass: exit 0.
- **Test identity**: from `apps/extension`, `bun --bun vitest list` of every touched suite on the merge base and the head, then `git diff <merge-base> -- <those suites>` read line by line. Pass: every base title on the head; an existing line changes only for an edit this plan names (arc 2: `key()`'s body and the `keys` clock); the PR body lists each changed existing line.
- **Arc end**: `bun run test:all`, `bun run audit:vue`, `bun run check:plans` after staging. Pass: exit 0.
- **Smoke, Chrome**: the armed build (`tests/e2e/global-setup-smoke.ts:20`), then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/{settings-routes,navigation,sw-resilience,auth-flows,onboarding-tab}.test.ts --retry=0`. Pass: exit 0; one rerun for a known flake.
- **Rendered identity**: base and head armed Chrome builds; capture the Developer page at 360×600 with Developer Mode off and on, both themes, by structure-2's method (its plan, Arc 1 gate and D12; scripts under `~/.cache/nulo-backlog/structure-2/a1/`). Pass: equal sha256 and normalised DOM per pair; one control pair differs. A differing pair is an `OWNER-ASKS.md` entry and that surface ships nothing.
- **Layers**: lint, typecheck, unit, component, build, smoke e2e.

## Arc 2 (#797, #517), after arc 1 merges

### Phase 3: the held-Escape flake (#797)
Files: `popup/components/modules/settings/SettingsSearch.test.ts`. Proof: the frozen-clock describe on the base helper is red; on the new helper, 30 runs of the file are green. Name both in the PR body with the measurement above.

### Phase 4: the countdown Close on Button (#517)
Files: `components/composite/SecretCountdownClose{.vue,.test.ts}`. Tests: the 11 cases keep their titles and bodies and run through the real `Button`, with nothing registered for it in the test; 1 case proves the override class and Button's `cta_outline` land on the root `<button>`.

### Arc 2 validation gate
- Arc 1's fast, test-identity and arc-end gates.
- **Smoke, Chrome and Firefox** (focus): `keyboard-guards`, `security-backup`, `settings-routes`, `type-roles`, as above, then under `NULO_E2E_BROWSER=firefox`. Pass: exit 0 at retry 0.
- **Pixel proof** (#225's method, `implementations-plan/archive/forms-and-contacts/lessons/phase-2.md`): base and change armed builds, Chrome and Firefox, light and dark, each capture clipped to the composite's box plus 4px on every side (the 2px ring at its 2px offset; the words differ per profile), with the box's position and size equal on both builds, on the revealed recovery-phrase page: rest, hover, focus-visible, active by a held mouse, active by a held Space with the pointer away, auto-close off; the page's `Date.now` pinned to a fixed nonzero value by an init script before the reveal, with the reveal driven by clicks (`revealSeedPhrase` in `tests/e2e/fixtures/profiles.ts`; an Enter from the password field needs the page root's later listener, which the pinned clock skips), so the countdown label reads the same in every capture, and every animation paused at fixed `currentTime` values (`document.getAnimations()`). A base-against-base run must match first. Read the Close root's computed `transition`, `outline` (focused) and `background-color` (each state) on both builds: the fade curve is not in a settled capture. Pass: equal sha256 and equal computed values per pair; rest against focus-visible differs. A pair that differs and no override can match is an `OWNER-ASKS.md` entry with both captures, and #517 ships nothing visible.
- **OA-1's pictures**: a third Chrome build with the three overrides removed, focus-visible and held-Space in both themes, attached to OA-1 and the PR.

## Security & Adversarial Considerations

- No trust boundary moves: no dApp input, storage, message, permission, credential or dependency changes. The notices carry fixed copy; no new log line.
- The Close button keeps its `click` → `close` path and testid; moving it onto `Button` adds `tabindex="0"`, which changes no tab order on a `<button>`. The recovery-phrase page's auto-close and scrub are untouched.
- Supply chain: no new package; `@vue/test-utils` 2.4.11 is already pinned.

## UI impact

The lane brief's no-ask record is "UI impact: none". Settings › Developer, the profile create and import failure notices: none, byte- and pixel-identical. Settings › Backup › Recovery phrase, its Close: none, pixel-proven; dropping the drifts is OA-1, not shipped.

## Decision ledger

| Id | Decision | Rejected | Panel |
|---|---|---|---|
| D1 | Two arcs: #735, then #797 with #517 | one arc (OA-1 would hold #735 back) | the brief's split |
| D2 | Developer keeps its markup; titles compose `.control_title`; plumbing from the composable | the toggle loop on `SettingControlRow` | structure-2's approved shape |
| D3 | Notice builders return the store argument; shells call the store | the store call inside the composables | structure-2's shape |
| D4 | #797: `trigger` plus a clock pinned before mount, nonzero, over the `keys` cases | a fake clock per key; a manual `_vts` stamp (Vue's private field in the test); a `@keydown.capture` in the component (runs before Input's listener, breaks the `defaultPrevented` check); a wait for the clock | both agree |
| D5 | #517 on `Button`'s default slot, imported explicitly, three overrides under one doubled class | an exported CTA class (a package export and a Button restyle for one caller); dropping the drifts (OA-1) | both agree |
| D6 | Arc 1 deviation: the import builder is `passkeyImportFailedNotice`, not `importFailedNotice`: its copy names an authenticator and only the passkey import path calls it | a doc comment saying so | Opus arc 1 review |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a150de`): `conditional approve` (read cancellation after dispatch, deterministic captures, a stronger test-identity gate). Opus 5.5 Plan: `conditional approve` (name how the real `Button` mounts, fix the proof's inputs, list the fade in OA-1, pin the clock nonzero before mount). C = Codex, O = Opus. All accepted:
- C1 a capture-phase read precedes the cancel (Codex reproduced it) → keep the event, read after dispatch, fail when none.
- C2/O3 the label ticks and the words differ per profile → the page clock pinned before the reveal, captures clipped to the composite with its box compared, base against base first, computed transition, outline and background compared.
- C3 `vitest list` cannot see a body change → the suites' diff from the merge base, line by line.
- C4 the product claim overclaimed → "no product code changes; no real-browser failure demonstrated".
- O1 the specificity numbers → corrected, with a comment at the doubled selector.
- O2 vitest has no component auto-import: an unimported `<Button>` renders natively and the 11 cases pass untested, a global one recurses → the explicit import, nothing registered in the test.
- O4 a 0 stamp or a spy after mount leaves the base green → the value read in `beforeEach`, before any mount.
- O5 OA-1 left out the fade → a third line in OA-1; the override proven by its computed value.
- O6 `pressOn` dispatches raw too, no consequence traced → named in the close-out's lesson line, no code.

**Round 2** (Codex, resumed): `conditional approve (with conditions: expand the screenshot clip by the outline width plus its offset)`. Accepted: the clip grows to 4px on every side; the reveal is named click-driven, since under the pinned clock an Enter from the password field reaches only its first Vue listener. Codex verified the explicit `Button` import against CLAUDE.md and Biome, every gate command and file, and found no other defect.

**Round 3** (Codex, resumed, verification): `approve`, no remaining findings.

**Arc 1 post-implementation** (diff `c8aa0374..hygiene-3-a1`). Codex (gpt-6.1-sol, high, session `01a15107`) round 1: `findings: 1`, Low: both builders' doc comments named their callers → removed. Opus 5.5 diff review beside it: `changes requested`, no behaviour difference; one Low, the Developer case's second half could not fail (`updateSetting`'s own unchanged-value check absorbs a page regression) → removed; two nits → the passkey name (D6) and a dependent row's write named in `useSettingUpdate`'s TSDoc. Codex round 2 (resumed): `clean`.

## Delivery

- Arc 1: `refactor(ui): one pair of profile-flow notices; developer rows take the shared plumbing` (87 characters). `Closes #735`.
- Arc 2: `fix(test): send settings search keys past vue's listener guard; countdown close on button` (89). `Closes #797`, `Closes #517`.
- Open each PR without labels; add `e2e:extension-smoke` only if the path filter skipped smoke.
- #743 and arc 1 both edit `onboarding/pages/create.vue`: the second to land merges `dev` and keeps both changes.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `7eada4c6`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 per arc, after its gate, over the arc's diff from its merge base: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Arc map in every prompt: "arc N of 2; arc 1 the rest of #735, arc 2 the #797 test fix and the #517 Close".
- Step 3 per arc: one PR against `dev`, then `gh pr checks <n> --watch`.
- Step 4 on arc 2's PR once arc 1 has merged: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; the lessons pass (update the Vue-tests line: a native event reaches only its first Vue listener whenever the clock has not ticked since mount, not only under fake timers, and `tests/helpers/press-key.ts` dispatches raw too); `STATUS.md` deleted; `git mv` into `archive/` in its own commit; the index line moved; `bun run check:plans` green.
- Step 5 after that merge: `agent-worktree done hygiene-3 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/hygiene-3/plan.md` succeeds.

## Seeds

`/goal` (recommended): `Arc <N> of implementations-plan/hygiene-3/plan.md is done: each phase of the arc marked ✓ in plan.md, backed by its gate reported passing in the transcript (test identity; rendered identity for arc 1; the frozen-clock red on the base and the pixel proof for arc 2); LESSONS_FILE=implementations-plan/hygiene-3/lessons/phase-N.md printed per phase; the Codex loop converged on the arc's diff, quoted; the arc's PR exists against dev, opened after the loop; bun run test and bun run lint exit 0.`

`/loop 15m Drive arc <N> of implementations-plan/hygiene-3 per its plan.md (read it and lessons/ first; plan.md is the state). Take the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. After the arc's gate, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge.`
