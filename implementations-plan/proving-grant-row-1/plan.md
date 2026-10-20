---
plan: proving-grant-row-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at f73ce69d6
issues: "#572"
---

# proving-grant-row-1: why the Firefox permission row did not follow the about:addons toggles (#572)

## Finding (demonstrated)

**The row is correct. The owner's check withheld only two of the three origins that cover loopback.** Firefox counts the content script's `*://*/*` match as a host permission. It shows that permission in about:addons as "Access your data for all websites". That toggle stayed on, so loopback stayed granted.

The reproduction was a headless Firefox 153.0.4 spec in the real toolbar panel, at retry 0. It clicked the about:addons toggles themselves, which is the owner's action (lessons/phase-0.md, runs 1 and 2):

| State | `getAll().origins` | `contains` for `https://127.0.0.1/*` and `http://127.0.0.1/*` (each, and as a pair) | Settings › Proving in the toolbar panel | The probe's `Origin` header |
|---|---|---|---|---|
| Install | passkey, both loopback, `*://*/*` | true | card (the base e2e; not read in the diagnostic) | — |
| Both `127.0.0.1` toggles off (the owner's check) | passkey, `*://*/*` | **true** | **card `idle`, no row** | none sent (no `prestoReached` flag) |
| "All websites" off too | passkey | false | **row** (through `onRemoved`) | a direct fetch carries `moz-extension://…` (CORS mode) |
| Both `127.0.0.1` toggles on again | passkey, both loopback | true | card; one check runs | none (host-permitted) |

- about:addons lists four origin toggles. Their `permission-key`s are `*://*/*`, `https://127.0.0.1/*`, `http://127.0.0.1/*` (the manifest patterns themselves) and `https://passkey.nulo.sh/*`. The issue's own steps said "all three of Nulo's site toggles" where four exist, which likely led to the two-toggle check (inference).
- In the panel, `isFirefox()` is true and the page is a `popup` view. `getManifest().host_permissions` carries both loopback entries, so the brief's suspects (a) do not hold: the manifest key, the pattern, a stale cache and `isFirefox()` are all right. The owner's build 0.31.0.889 is likely #889's (inference). #889 does not touch the composable or `isFirefox()`: it adds `sidebar_action` and sidebar helpers only.
- (b) does not hold either, in the narrow sense the owner already decided on. Without the grant a request leaves in CORS mode, with the extension's `Origin`. Presto then serves its minimal body until it approves that origin; proving still works, and the first prove's approval brings the detailed body back (archived evidence, `implementations-plan/archive/home-onboarding-chrome/lessons/phase-2.md`). With the grant the probe carries no `Origin`. So the grant buys the detailed body only until Presto approves Nulo; on the owner's profile, which had already proved, it bought almost nothing. The owner kept the row for that (`implementations-plan/archive/home-onboarding-2/plan.md`), and this evidence does not reopen it. That plan already recorded the three-pattern rule (F4 there); the owner's check missed the third.
- **Chrome**: the composable reads nothing off Firefox (`origins` is `[]`, `usePrestoHostPermission.ts:41`, unit case "Chrome probes at once"), so the row never shows. Chrome's `permissions.remove` refuses a required origin (`FIREFOX_ONLY.permissionRequest`). This lane makes no Chrome change.
- **The doorhanger question** (the issue's original subject; lessons/phase-0.md, run 3) was tested on Linux, headless, with prompts on. A click under `windowUtils.setHandlingUserInput` opened `addon-webext-permissions-notification`. The toolbar panel stayed open under it (read about 0.3, 1.3 and 3.8 s after the click). Accepting it granted both origins, and the panel's row gave way to the card. Not shown: macOS focus behaviour, a real OS click, and where focus goes after a real click. That part stays the owner's (OWNER-ASKS OA-1).

The issue's claim, "the row's condition does not follow the about:addons toggles", did not hold. The row follows the grant. Two of the toggles do not move the grant while "all websites" is on.

## Outcome & Quality Bar

- **For whom**: the maintainer, the next time a Firefox bump or a refactor touches the row's condition, and the owner, who re-runs the Mac check with the right toggles.
- **Excellent**: the e2e fails if the row ever shows while all-sites access still grants loopback, and also if Firefox stops counting `*://*/*` as covering loopback. FIREFOX.md says which about:addons toggles withhold loopback, so nobody repeats the owner's two-toggle check.
- **Good enough**: no product change and no new fixture. The doorhanger on a Mac stays a manual check.

## Architecture & Implementation (compact)

- **Reuse** (recon.md): extend the spec's local `withhold()` in place (recon §1). There is no about:addons or header-reading helper, and none is added (recon §2).
- **Critical flow**: remove the two loopback origins first, before Settings › Proving mounts. This is the owner's order. Assert that `getAll()` lost them (the removal took effect) and that `contains` still answers true (Firefox covers them with all-sites). Then open the page. The `data-status="idle"` wait is a temporal settle (never `readPage` alone: the card also renders while `pending`). `onFirstAllowed` starts it on three paths: the mount read landed as granted, the read failed into `unknown`, or there are no origins to read (`usePrestoHostPermission.ts:45-66`, `:95-96`; `proving.vue:28`). So "no row" is read after the composable has answered, never before, but idle alone does not prove "granted": the real `contains` assertion does. Next, remove `*://*/*`, the last covering origin, and the row must appear. That success control also rules out the other two paths: under `unknown` a later failed read keeps the page as it is (`:63`), and with no origins no listener exists. A single failed first read followed by good reads would still pass; the real `contains` assertion is what covers that case. The rest of the test stays as it is (Allow, the ring, the title focus, the key path).
- **Not taken**: (1) Drive about:addons in the committed spec. It is faithful, but it needs privileged DOM driving of Firefox's own UI for one caller, and that breaks on a Firefox UI change. The diagnostic showed that the toggles call exactly these patterns, so `permissions.remove` of the same patterns is the same act. (2) Assert the probe's `Origin` header. That needs new header-reading fixture code, and it guards only a Firefox change that would make the row useless. Recorded as evidence here, not pinned. (3) No e2e change, only docs. Rejected: no layer then proves the coverage semantics (recon §6: the unit test fakes `contains`).

## Security & Adversarial Considerations

- **Threat model**: a test-only and doc-only change. No runtime code, permission, manifest or storage change. No new trust boundary.
- **Permission boundary, stated rather than changed**: while "all websites" is on, a person who switches off only the `127.0.0.1` toggles still leaves Nulo's pages host-privileged on loopback. The grant changes the request mode (no `Origin`, no CORS check), never whether a request leaves (run 2's direct fetch). That is Firefox's model, and the content script needs all-sites. The FIREFOX.md line says "granted", never "reachable".
- **Diagnostics**: the privileged `chromeScript` probes ran only in uncommitted scratch specs (kept outside the repo). The committed spec uses extension APIs alone.
- **Least privilege, the existing coupling**: all-sites access gives Nulo's own pages host-privileged loopback access. So the two loopback toggles are not independent revocation controls. Withholding every covering origin only changes CORS privileges; a request still leaves, so it is no network firewall. Abusing this needs a compromise of extension code. No path shows that an ordinary dApp gets it. Separate loopback revocation that keeps dApp access would be an owner-approved permission design, outside this arc.
- **Supply chain, crypto**: N/A (no dependency, key or token).

## Assumptions

- **Facts**: F1 the table above (diag runs 1–2). F2 Firefox: `permissions.remove` of a pattern that is not granted resolves without error (the existing spec already removes `*://*/*` twice). F3 card `idle` means the mount read answered, as granted or as `unknown` (`usePrestoHostPermission.ts:47-67`, `usePrestoCheck.ts:31-41`). F4 the spec runs only on Firefox (`describe.skipIf(!isFirefox)`). F5 no other spec withholds loopback (recon §5). F6 Firefox base at f73ce69d6: the test takes 15.8 s, and the whole file run 36.1 s.
- **Inferences**: I1 on a Mac, the permission doorhanger is a Firefox panel in the same window, unlike the OS passkey prompt that closes the panel. That does not settle its focus effects, so the Linux result may not hold on a Mac (unverified; OA-1). I2 plausible, not observed: the owner's Mac had `prestoReached` set, which would explain why its card read "connected" at once.
- **Asks**: OA-1 (OWNER-ASKS.md) is the corrected Mac check. The arc does not depend on it.

## UI impact

None. No component, copy or route changes. No screenshot is needed (the brief asks for pictures only if the row changes).

## Phase 1 (arc 1): pin the owner's toggles in the e2e; document them ✓

Change map:
- `apps/extension/tests/e2e/presto-host-permission.test.ts`:
  - Change `withhold(extension, origins)` to remove `origins` and return `{ held: contains(LOOPBACK), origins: getAll().origins }`.
  - Before `navigateToSettings(page, "proving")`, call `withhold(extension, LOOPBACK)`. Expect `held === true`, `origins` without both loopback patterns, and `origins` with `*://*/*`.
  - Keep the idle-card wait and `readPage` → `{ row: false, card: true, get: true }`.
  - At the first withhold after that, remove `["*://*/*"]`. Expect `held === false`. The row appears, as before.
  - The key-path withhold removes `LOOPBACK` and expects `held === false`. At that point `*://*/*` is already withheld.
  - Header and the `WITHHELD` comment: "all-sites access covers loopback, so the two loopback toggles alone withhold nothing". Drop `WITHHELD` if it has no use left.
- `apps/extension/tests/e2e/FIREFOX.md` row 38: one sentence. about:addons lists `*://*/*` as "Access your data for all websites", beside one toggle per loopback origin. Switching off the two `127.0.0.1` toggles alone leaves loopback granted.
- `apps/extension/src/composables/usePrestoHostPermission.ts`: one comment at the `contains` call, and no behaviour change: `contains`, not the listed entries, because Firefox grants loopback through all-sites access too. It guards the likeliest regression.
- `apps/extension/src/manifest.test.ts:208`: the comment becomes "A person can withhold these, with all-sites access, in about:addons; …".
- No unit case: no behaviour changes, and the composable's fake `contains` cannot prove Firefox's coverage (recon §6).

E2E budget: no new scenario. The existing test gains one scratch-page evaluate before its first visit. It proves a distinct failure mode: the row shows, or `contains` answers false, while all-sites access still grants loopback. Only a real Firefox answers `contains`. Estimate: +1 s on Firefox, 0 on Chrome (skipped). Measure the file locally, and each browser's CI smoke suite envelope (the `e2e-testing` skill, § Runtime budget). "Before" is the latest successful `pr-extension-smoke-e2e.yml` and `pr-extension-smoke-e2e-firefox.yml` run on another PR. "After" is this PR's run.

Validation gate:
- Commands:
  - `bun run lint`
  - `bun run typecheck:all`
  - `bun run test`
  - The armed Firefox build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:firefox`)
  - `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_BROWSER=firefox bun run test:e2e -- tests/e2e/presto-host-permission.test.ts --retry=0`
  - `bun run check:plans` after staging.
- Pass criteria:
  - Every command exits 0.
  - The Firefox file passes at retry 0, two runs in a row.
  - A red/green proof of the test's sensitivity (production needs no fix). In a scratch edit, make the composable read the explicit entries: `getAll()` must list every origin, in place of `contains`. Rebuild, and the spec must go red after the loopback-only withhold, because the row shows in place of the idle card. The base spec from f73ce69d6 must stay green on that same mutated build: the old file cannot see the regression. Revert the edit, rebuild, and the spec is green.
  - Record the wall-clock before and after.
- Layers: lint, typecheck, unit, smoke e2e (Firefox). Chrome skips the file (F4).

## Delivery

- One arc, one PR, no stack (D-orch-1). Branch `proving-grant-row-1-a1` from this plan's commit, which is on `origin/dev` f73ce69d6, so the PR carries the plan.
- Title (90): `test(e2e): firefox all-sites access keeps loopback granted with both 127.0.0.1 toggles off`.
- Body: the finding table, the gates and their outcomes, each browser's suite wall-clock before and after, and `Closes #572`. On OA-1 (B), the body uses `Refs #572` instead, and #572 is closed as not planned with the `known-limit` label and its reopening condition: a Mac report of the panel closing under the prompt with the grant lost.
- The PR opens as a **draft** because OA-1 exists (lane brief). It must not merge before the owner's OA-1 result, or the owner's explicit acceptance (B), is recorded on #572. Then it leaves draft. Under (A) the merge closes #572. Under (B) #572 is already closed as not planned.
- No label: the smoke path filter covers `apps/extension/tests/e2e/**`. Check this with `gh pr checks`, and add `e2e:extension-smoke` only if the lane was skipped.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at f73ce69d6. What is specific to this plan:
- Step 1 is absent (`code_review: off`).
- Step 2 runs once, over the whole arc diff from f73ce69d6. Use `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`. Run one Opus `general-purpose` review alongside round 1. Hard stop at three rounds.
- Step 3: `gh pr create --draft`, then `gh pr checks <n> --watch` once.
- Step 4, the close-out: put it in the PR's final commits once OA-1 is answered. The orchestrator may say to put it in now. For OA-1 (A) with a pass: `Known limits: none`. For (B): #572 itself becomes that closed `known-limit` issue (Delivery), and the Outcome lists it. For (A) with a failure: record it on #572 and link a successor issue before the merge closes #572. Never leave it only in OWNER-ASKS.md.
- Step 5, teardown: `agent-worktree done proving-grant-row-1 --merged` after the merge.

## Audit verdicts

| Round | Reviewer | Verdict | Disposition |
|---|---|---|---|
| 1 | Codex gpt-6.1-sol high, session `01a15a1b-b313-7052-aa72-31b73c7dce8a` | CHANGES (1, 2, 4) | All accepted. (1) F3 is a temporal settle, not proof of "granted". (2) The OA-1 warning was too broad. (4) OA-1 had to tell "panel closed" from "grant lost". The minor points were accepted too (lessons/phase-0.md, consult 1). |
| 1 | Opus 5.5 Plan agent | CHANGES (7, all text) | All accepted. The fixes cover the boundary wording, the three `onFirstAllowed` paths, the narrow benefit of (b), the (B) disposition, the title length, the CI envelopes, the OA-1 order, the base spec on the mutated build, and one comment each in the composable and `manifest.test.ts`. None rejected (consult 2). |
| 2 | Codex, same session, resumed | **APPROVE** | Two wording nits were folded in: the paragraph on a failed first read, and the (B) close path. Codex rated the src comment proportionate, and (B) coherent with README § Where open work lives. |

Decision ledger:
- D1: the outcome is (c), with no product change (evidence: § Finding).
- D2: extend the existing scenario, not a new one.
- D3: about:addons is driven only by the diagnostic.
- D4: no `Origin` assertion is committed.
- D5: OA-1 is a check and is drafted.
- D6: on (B), #572 becomes the known limit.
Both reviewers agreed on every item.

## Seeds (not run; orchestrator-owned)

- `/goal Phase 1 of implementations-plan/proving-grant-row-1/plan.md is ✓ with its gate quoted, the Codex loop converged (a resumed pass reports no new material finding), and the draft PR exists (gh pr view output), with bun run test and bun run lint exit 0 in the transcript.`
- `/loop 15m Drive implementations-plan/proving-grant-row-1 forward: read plan.md and lessons/, run the next pending step's gate, decide with /codex at high (gpt-6.1-sol), never merge, stop when the draft PR is green.`
