---
plan: whats-new-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 0bfd2c088
---

## Outcome

- **Date:** 2026-11-06.
- **Status:** completed; delivered in #1724, whose merge closes the plan.
- **Shipped:** #1724. After an update to a new minor, Home shows one dismissible row, "Nulo X.Y.Z. See what changed", between the restore banner and Get started; a tap opens the version's changelog page and Dismiss hides it for good. Settings → About links the same page on every build (P117-08 A with D's About row). The device-wide marker `nulo:ui:whatsNewSeen` is an additive stored-shape stamp; the worker stamps it on install and update. Unit, component, smoke (Chrome and Firefox) and the update replay's first case cover it.
- **Dropped or rejected:** the smoke test's exact-URL check (D11), replaced by the component test, since the egress guard keeps hosts and `OpenedTab` exposes no URL; a TS `WhatsNewRow.vue` (D12), plain `<script setup>` instead.
- **Left as it is:** #1691 (the landing's changelog page) stays open with a comment: #1713 closes it, and the first stable carrying this row must ship after #1713 merges.
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none promoted. Both gotchas met here are already documented: a `dist/` that `audit:vue` or the update candidate rebuilt unarmed is refused by the smoke setup, which names the armed build command (`apps/extension/tests/e2e/README.md`), and the vue-tsc slot gotcha is a `lessons.md` line.
- **Seeds retired:** no `/goal` or `/loop` seed of this plan is live.

# whats-new-1: the wallet tells you it was updated

After an update to a new minor version, Home shows one dismissible row, "Nulo 1.3.0. See what changed", that opens the version's changelog page on a tap; Settings → About keeps a permanent "What's new in 1.3.0" row with the same link.

**Sign-off (page 117, P117-08, picked 2026-11-06 at 18:18 UTC):** "A dismissible Home row once per minor, 'Nulo 1.2.0. See what changed', with the open glyph and a close control, between the restore banner and the Get started card; plus the permanent About row of D." The prototype is branch `worktree-shots-p117a` (never merged); this lane rebuilds it from `dev` with tests.

## Outcome & Quality Bar

- **For whom:** a person who opens the toolbar popup after the browser updated Nulo in the background.
- **Excellent:** (1) the row appears once per minor and never for a patch, a prerelease or a fresh install, and it stays gone once dismissed, across reopens and profile deletion; (2) nothing reaches `nulo.sh` until the person taps, and the tap lands on the running stable's own page (`https://nulo.sh/changelog/vX.Y.Z/`).
- **Good enough:** a second window already open keeps showing a row dismissed in another until it reopens (D6).

## Assumptions

**Facts** (recon.md has the trail):
1. `onInstalled` is handled for `install` only (`apps/extension/src/wallet/index.ts:38`); nothing stores a last-seen version.
2. `__VERSION__` is the `package.json` version verbatim (`vite.shared.ts:54`); the manifest `version`, which `onInstalled` reports as `previousVersion`, is 4-part (`manifest/manifest.config.ts:13-19`).
3. A profile deletion removes only keys under `@`-terminated prefixes (`src/utils/profile-ui-keys.ts:35`); no backup slice holds a `nulo:ui:*` key; no in-product code wipes the device.
4. `SettingItem` with `to` + `external` is an `<a>`; with `@click` it is a stretched `RowTarget` button before `#right` (`SettingItem.vue:92-100`), so Tab goes row → `RowAction`.
5. The barriers and the Terms sheet overlay Home; the stale-network takeover and the network arrival unmount it (`src/popup/app.vue:669-702`), so a Home row follows all four and blocks none.
6. Issue claim that did not hold: #1691 is the landing page, closed by PR #1713, which builds `/changelog/vX.Y.Z/` and makes the landing build refuse release notes without their page. This lane says `Refs #1691`.
7. The smoke launch reports `install` on every start (`tests/e2e/FIREFOX.md`); a real update runs only in the opt-in in-place scenarios, whose probe already checks `reason: "update"` and `previousVersion` (`tests/e2e/fixtures/update/in-place.ts:172`) and which the release runbook runs before every promote.
8. Smoke does not build: it loads `apps/extension/dist/<browser>` (`tests/e2e/FIREFOX.md`), and the release's artifact smoke also runs prerelease builds, whose `version_name` is the rc string.

**Inferences:** (a) Chrome and Firefox fire `onInstalled` with `reason: "update"` and `previousVersion` on the first worker start after a store update, as their docs say and the in-place probe shows for a reinstall; if not, no row shows (fails closed). (b) The brief's "3-part version" of `1.3.0-rc.1` is `1.3.0`, so About's row on a prerelease names and links `1.3.0`.

**Asks:** none. The marker rule (which events write it) is the lane brief's; the copy, glyphs and placement are the sign-off's.

## Architecture & Implementation

- **`src/utils/whats-new.ts`** (new, pure, imported by the popup and the worker): `WHATS_NEW_SEEN_KEY = "nulo:ui:whatsNewSeen"`; `releaseCore(v)` → the leading `X.Y.Z` of `__VERSION__` (`1.3.0-rc.1` → `1.3.0`); `isStable(v)` (strict `^\d+\.\d+\.\d+$`); `changelogUrl(core)` → `https://nulo.sh/changelog/v${core}/`; `decodeSeen(raw)` → `"MAJOR.MINOR"` or `undefined`; `isWhatsNewDue(running, raw)` — running `isStable`, the marker decodes, and its (major, minor) is lower; `seenOnInstall(reason, previousVersion, running, raw)` → the minor to write: nothing when the marker decodes, the running minor on `install`, the first two parts of `previousVersion` on `update`, nothing otherwise.
- **`src/wallet/utils/whats-new-stamp.ts`** (new): takes the listener's `details` whole, reads the key from `chrome.storage.local`, writes `seenOnInstall(...)` when defined; catches its own failure (`console.debug` with `{ error }`), so a failed stamp only misses one notice. The existing top-level listener in `wallet/index.ts` calls it unawaited for every reason, then runs its `install` branch unchanged.
- **`src/popup/components/modules/general/WhatsNewRow.vue`** (new L4): reads the key once on mount through the facade; when due, renders the prototype's markup: `ItemsContainer` (`whats-new-row`) › click-mode `SettingItem` (`whats-new-open`, title `Nulo ${version}. See what changed`, `external`) with `#right` = `open` glyph + `RowAction` "Dismiss" (`whats-new-dismiss`, `close` glyph). Tap: `window.open(changelogUrl, "_blank", "noopener,noreferrer")`. Dismiss: hide, then `storageLocalSet` the running minor.
- **`general.vue`**: `<WhatsNewRow />` between `RestoreOutcomeBanner` and `GetStartedCard`. **`about.vue`**: under "Nulo Website", `SettingItem :to="changelogUrl(core)" external title="What's new in ${core}"` (`about-whats-new`), on every build.
- **Storage drill**, additive: registry entry `uiWhatsNewSeen` (`value(WHATS_NEW_SEEN_KEY)`, `structured`, `z.string().regex(/^\d+\.\d+$/)`, `read: decodeSeen`), `full` + `minimal` goldens, `bun run baseline:storage -- --additive "<reason>"` and its pin, `root-census.test.ts` `PLAINTEXT` line, `stored-shapes.writers.test.ts` tuple entry and count, `profile-chaos/checkers.ts` `device(...)` entry, `SECURITY.md` § Storage privacy names it.
- **Alternative not taken:** stamping from Home on first sight (no worker hook). Simpler, but every person updating from a build without the feature reads as a fresh install, so the first minor that carries the row would never show it.

### Decision ledger

| Id | Decision | Why |
|---|---|---|
| D1 | One device-wide `nulo:ui:whatsNewSeen` string `"MAJOR.MINOR"`, structured | the `nulo:ui:lastActiveProfile` model; no `@`, so profile deletion keeps it; no slice, so no backup carries it |
| D2 | Writers: the worker on install and update when the marker does not decode; Dismiss. A tap opens the page and leaves the row | the brief's rule names install and dismiss; the picked prototype behaves so. Monotonic: Dismiss writes only a minor higher than the stored one |
| D3 | Home's row needs a stable `X.Y.Z` build; About's row shows on every build, from the version's `X.Y.Z` core | "a prerelease never prompts" binds the notice; the brief builds the URL and About's title from the 3-part version and calls the row permanent (Codex r1 #7: hiding it would be a product call) |
| D4 | URL from `__VERSION__`, never the manifest; literal `https://nulo.sh` origin | the brief; `@nulo/legal`'s origin constant names the legal site, the wrong boundary for a release link |
| D5 | Click-mode row + `RowAction`, `window.open` with `noopener,noreferrer` | an anchor row cannot hold a button; the Get started precedent (`general.vue:120`) |
| D6 | Read once on mount, no `storage.onChanged` listener | the only cost is a second open window showing a dismissed row until it reopens |
| D7 | Accessibility (owner's 2026-10-19 delegation): Tab row → Dismiss in DOM order; `RowAction`'s 2 px accent ring; focus is not moved after Dismiss | house rules; the Get started Hide precedent also removes its control |
| D8 | `parseVersion` from `@nulo/legal` not reused | it accepts 2-part versions, which would build `/changelog/v1.2/` |
| D9 | Smoke reads the loaded build's `version_name` for its expectations; on a prerelease it asserts no Home row under a seeded marker | the release's artifact smoke runs rc builds (Codex r1 #3) |
| D10 | The new smoke test runs on the file's shared `registeredExtension`, after the first test; Dismiss returns the marker to its installed value | no second launch and registration for one key (Codex r1 #6) |
| D11 | Deviation: the smoke test proves a tap opens a tab and the guard then records `nulo.sh`; the exact URL is the component test's | the guard keeps hosts only, and `OpenedTab` exposes no URL (Firefox names the tab `about:blank`) |
| D12 | Deviation: `WhatsNewRow.vue` is a plain `<script setup>` | `vue-tsc` refuses a TS host's `#right` on the JS `SettingItem` (lessons.md, vue-tsc line) |

### UI impact

- **Home** (popup): before, the scroller starts with the banners then Get started; after, once per minor, a one-row card "Nulo X.Y.Z. See what changed" with the `open` glyph and a Dismiss `close` control sits between them. Signed P117-08 A (quoted above).
- **Settings → About**: before, "Nulo Website" alone in its card; after, "What's new in X.Y.Z" under it with the `open` glyph. Signed P117-08 (D's row).

## Security & Adversarial Considerations

- **Threat model:** a web page or dApp has no `chrome.storage`; the wallet's own content script never names the key, and Chrome limits the local area to trusted contexts (`src/wallet/utils/storage-access.ts`; Firefox has no such level). A hostile backup cannot carry the key (no slice). The only trust boundary is the stored marker, which is decoded strictly and only compared: no URL, markup or log line is built from it.
- **Privacy:** no request to `nulo.sh` without a tap (Privacy Policy § 5.5 holds as written); no prefetch or existence check of the page. The smoke test proves it: the egress guard's `nulo.sh` count does not move while the row shows, and moves on the tap. The marker is a UI preference under § 3's "Profile names and settings", as the other `nulo:ui:*` keys are, so the policy is unchanged.
- **Frontend:** the title interpolates a compile-time constant through Vue text; the tab opens with `noopener,noreferrer`; no new permission (`window.open` needs none).
- **Supply chain / crypto / least privilege:** no dependency, no cryptography, no CI token change.

## Phase 1: the marker and its rule ✓

- Add `src/utils/whats-new.ts` and `src/utils/whats-new.test.ts`. Cover: fresh install (writes the running minor, not due); same minor; patch bump (not due); minor and major bump (due, the success control); prerelease (not due; its core is `X.Y.Z`); a dismissed minor stays not due; update with no marker writes `previousVersion`'s minor from a 4-part string; update with a marker writes nothing; an undecodable marker is not due and is rewritten on the next install event; the key is outside every profile-deletion prefix; device reset (no key) is not due.
- Add `src/wallet/utils/whats-new-stamp.ts` with one test (a stub area: install writes the running minor, update writes `previousVersion`'s, a decodable marker is untouched, a rejected read resolves). Wire it into `wallet/index.ts`.
- Run the storage drill above.
- **Validation gate:** `bun run lint`, `bun run typecheck:all`, `cd apps/extension && bun --bun vitest run src/utils/whats-new src/wallet/utils/whats-new-stamp src/wallet/storage`, then `bun run test`. Pass: exit 0 each; the snapshot test passes with the new pin. Layers: lint, typecheck, unit.

## Phase 2: the Home row and the About row ✓

- Add `WhatsNewRow.vue` with `WhatsNewRow.test.ts` (real `SettingItem`, `RowAction`): absent marker renders nothing; due renders the exact title, `open` and `close` glyphs, the "Dismiss" name, the row's target before Dismiss in Tab order; a tap calls `window.open` with the URL and `noopener,noreferrer`; Dismiss hides and writes the running minor.
- Wire `general.vue`; add `WhatsNewRow` to `general.test.ts` STUBS. Add the About row and `src/popup/pages/settings/about.test.ts` (the row's href and title, placed after "Nulo Website").
- Smoke e2e, `tests/e2e/security-backup.test.ts`, expectations from the loaded build's `version_name` (D9): in the first test, after `waitForHomeReminders`, assert no `whats-new-row` and the marker equal to the running minor (a real `onInstalled(install)` dispatch landed, which no unit test can prove). One new test on the shared fixture (D10): read the guard's `nulo.sh` count, seed `"0.0"`, reload; on a prerelease assert no row, restore the marker and go to About; else the row sits before `get-started`, the count has not moved, Tab from its target focuses `whats-new-dismiss`, a tap opens a tab at the changelog URL and the count moves, Dismiss removes it and writes the running minor, a reload keeps it gone; About's `about-whats-new` href is the URL of the `X.Y.Z` core. Opt-in `shotSend` captures (light and dark: Home with the row, the Tab focus, About). Widen the `nulo.sh` reason in `egress-guard.ts`. Estimate 8 s per browser; measure the whole file before and after.
- Update replay, `tests/e2e/update-replay.test.ts`, first case: after the update, the marker equals the minor of the release it updated from (the release stores none, so only the `update` stamp can write it). Failure mode: a real update writes no marker, and the first minor that carries the row never shows it; only a real update dispatches `reason: "update"`.
- Release skill, § Release notes: one bullet. The wallet's Home and About rows open `nulo.sh/changelog/vX.Y.Z/` for the running stable, so the page must answer 200 before the store submission.
- **Validation gate:** `bun run audit:vue`, `bun run test:all`. Per browser (`chrome`, then `firefox`): build the armed smoke build, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- tests/e2e/security-backup.test.ts --retry=0` (the base's wall-clock first, from a base build). Then per browser, from a clean commit: at the repo root `bash apps/extension/scripts/e2e/build-update-candidate.sh <browser>` (writes `apps/extension/.e2e-state/update-candidate/<browser>`), then `cd apps/extension && NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_BROWSER=<browser> NULO_E2E_UPDATE_FROM=v1.2.0 NULO_E2E_UPDATE_TO="$PWD/.e2e-state/update-candidate/<browser>" bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0 -t "updates in place"`; rebuild the armed smoke build afterwards (the candidate script overwrites `dist/<browser>`). Captures with `NULO_E2E_SHOT_DIR` set. Pass: exit 0 each at retry 0; wall-clocks recorded. Layers: lint, typecheck, unit, component, smoke e2e and the update replay on both browsers.

## Delivery

- One arc, one PR into `dev` from branch `whats-new-1-a1` (off `origin/dev`, carrying this plan's commit). Plain `gh pr create`, no labels at creation; title ≤ 92 characters, e.g. `feat(home): a what's new row once per minor; about links the version's changelog`. Body: what and why, the UI impact with the captures, the accessibility calls (D7) as made under the owner's 2026-10-19 delegation, validation with wall-clocks, `Refs #1691`.
- **Dependency:** this PR may merge before #1713, but the first stable that carries it must ship after #1713 merges, so its page is live: the landing build then refuses release notes without their page, and the release-skill bullet checks the URL before the store submission.
- The close-out is this PR's final commits (README § Post-implementation standard, step 4).
- Parallelism: none; phase 2 builds on phase 1's module.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at `0bfd2c088`. Specific to this plan:

- No `/code-review` (`code_review: off`).
- Review loop once, over the net diff from `origin/dev`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` with each fix diff; hard stop at three rounds. One Opus 5.5 review of the same diff (`Agent`, `general-purpose`) runs beside round 1.
- Then the full gates on the final head, push, the PR, `gh pr checks <n> --watch`, the close-out commits (merge `origin/dev` first; Outcome; lessons; `git mv` into `archive/`; `bun run check:plans`), and stop. Merging is the owner's.
- Teardown after the merge: `agent-worktree done whats-new-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/whats-new-1/plan.md` succeeds.

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, new session): `conditional approve`. Seven findings, all accepted. #1 (medium, demonstrated coverage gap: no test sees a real update write the marker) → the update replay's assertion and an update case in the stamp test; Fact 7 corrected. #2 (medium, demonstrated: smoke runs whatever `dist/` holds) → the armed builds and `audit:vue` in the gate. #3 (medium, demonstrated: the artifact smoke of an rc would red the positive assertions) → D9. #4 (medium, coverage gap) → the egress count before and after the tap. #5 (low, plausible) → the stamp catches its own failure and is not awaited; a missed notice is the accepted cost, no retry. #6 (low) → D10. #7 (medium, ask) → D3 now follows the brief's 3-part rule for About on every build, so no owner ask remains.
- **Codex final** (fresh session): `conditional approve`, one condition (medium, demonstrated): the replay commands named the wrong candidate path and no browser → fixed (repo-root build, `cd apps/extension`, `NULO_E2E_BROWSER`). Notes folded: the egress baseline is read before the seeded reload; the prerelease branch restores the marker too.
- **Codex final, resumed:** `approve` ("No remaining conditions or new material findings.").
- **Diff loop r1** (gpt-6.1-sol, high, new session, the net diff from `dev` 4ae04b194): `findings`, one (low, demonstrated): the rule's header said a patch never prompts, but an undismissed notice stays due across a patch (D2 keeps the marker) → header rewritten, two restating comments dropped, the case added to the rule test. **r2** (resumed): `clean`.
- **Opus 5.5 diff review** (beside r1): `findings`, four, all accepted in 3722ba8f4: (1, demonstrated) the prerelease config writes an rc version into the extension's `package.json` on `dev`, which would red the row's component test → the row takes `version` as a prop defaulting to `__VERSION__`, the test pins a stable one and adds an rc mount; (2, plausible flake) the smoke test closed the tab before the guard saw its request → poll first; (3) the rc branch's null check names where the rule is proved; (4) the stamp's comment gave the wrong reason. **Codex r3** (resumed): `clean`.

## Seeds

- `/goal` Phases 1 and 2 of implementations-plan/whats-new-1/plan.md marked ✓, each gate reported passing in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); the PR open into dev with the close-out commits on top; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/whats-new-1 per its plan.md: reality check, next pending step, gates, the Codex loop, delivery, close-out; never merge.
