---
plan: switch-names-1
tier: light (thinned: no plan audit round, no Opus leg; one Codex pass over the plan and the net diff)
status: planned
issues: "closes #1733"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon inline (nine sites, read by hand); Codex gpt-6.1-sol high, read-only
base: origin/dev at b22893f42
trunk: dev
post_implementation_hardening: not scheduled
---

# switch-names-1: every switch is named by the words beside it

Most `Toggle`s render `role="switch"` with no accessible name, so a screen reader says "switch, off" and nothing else (#1733). Each one gets the name a sighted person already reads beside it: no visible change, no new words.

**UI impact:** none. ARIA wiring only, an accessibility call under the owner's 2026-10-19 delegation; the visible budget is the lane brief's "no visible change and no new words", landed on the orchestrator's standing policy of 2026-11-18. The type-role sweep (`tests/e2e/type-roles.test.ts`) on both browsers is the proof nothing a person sees moved.

## The sites (verified at b22893f42)

The issue's claim holds: seven of the nine `<Toggle` tags under `apps/extension/src` carry no name.

| Site | Name today | After |
|---|---|---|
| `popup/pages/settings/display.vue:197` (v-for: side panel, network name, animations) | none | `aria-labelledby` = its `SettingControlRow` title |
| `popup/pages/settings/display.vue:212` (incoming transfers) | none | same |
| `popup/pages/settings/privacy.vue:93` (fiat values), `:154` (privacy mode) | none | same |
| `popup/pages/settings/lock.vue:228` (strict security) | none | same |
| `popup/pages/settings/connected-apps/index.vue:195` (every site) | `aria-label` = the row title string | same as above (D4) |
| `popup/pages/settings/developer/index.vue:132` (v-for: developer mode, debug mode) | none | `aria-labelledby` = its own title `Text` |
| `components/ConfirmPopup.vue:83` (a confirm's optional toggle) | none | `aria-labelledby` = its label `Text` |
| `components/composite/capabilities/PermissionRow.vue:60` | `aria-label` = `switchLabel` | unchanged (D5) |

`SettingControlRow` draws its title as sibling text with no id; `Toggle` (`packages/design/src/ui/Toggle.vue`) declares no `aria-*` prop, so both attributes fall through to its `role="switch"` root.

## Decision ledger

- **D1, how a settings row names its switch.** `SettingControlRow` gives its title an id (`useId()`) and hands it to its slot (`v-slot="{ titleId }"`); each switch binds `:aria-labelledby="titleId"`. The issue's other option, `aria-label` with the title string, rejected: a second copy of the words that a later copy change can leave behind. A slot prop is the standard Vue channel; the row cannot reach into its slot without one.
- **D2, the developer page** draws its rows inline, not through `SettingControlRow`. One `useId()` base plus the setting key gives each title `Text` an id the switch references. Moving those rows onto `SettingControlRow` rejected here: a markup refactor in a lane that may change nothing visible.
- **D3, ConfirmPopup** gives its label `Text` a `useId()` id. Its optional description is not wired as `aria-describedby`: the lane names switches and adds nothing a screen reader did not already reach by reading on.
- **D4, connected apps** moves from `aria-label` (a copy of the title) to D1's `aria-labelledby`, so every `SettingControlRow` switch is named one way and follows its title.
- **D5, PermissionRow** is already named by its `switchLabel` prop, documented as "the switch's accessible name" and deliberately distinct from the row's title. Changing what it announces is outside "each unnamed switch"; left as is.
- **D6, the name tests.** `expectOwnedRows` (`apps/extension/tests/helpers/settings-rows.ts`) already checks every registry row of the display, privacy, lock, developer and connected-apps pages; it gains one rule: every `Toggle` inside an owned row resolves, through `aria-labelledby` (to an element inside that same row) or `aria-label`, to exactly the row's registry title. A small resolver, `apps/extension/tests/helpers/accessible-name.ts`, reads the name as AccName steps 2B/2C do (each `aria-labelledby` id's text content, joined by a space; else `aria-label`). `SettingControlRow.test.ts` and `ConfirmPopup.test.ts` add one test each. A never-happens control: the resolver returns the empty string for an unnamed switch, so a row whose switch loses its wiring fails the page test.
- **D7, the scan** (`apps/extension/src/utils/switch-name.scan.test.ts`) parses every SFC under `apps/extension/src` but tests and stories through the shared reader (`apps/extension/scripts/type-roles/source-scan.ts`). A `Toggle` tag (any case) must carry a non-empty static `aria-label` or `aria-labelledby`, or a `v-bind` with that static argument whose expression is not an empty literal, `undefined` or `null`; a `v-bind="object"` spread alone does not count. It also refuses an import of `Toggle` in a non-test, non-story source, so an aliased tag or a render function cannot hide one (the resolver auto-imports every template's `Toggle` today). Success control: it finds at least the nine tags above. One synthetic case per refused class. Limit, stated in its header: it cannot see whether an `aria-labelledby` id exists; D6's tests do.

## Assumptions

- **Ask (none for the owner).** The names are the existing visible strings; nothing here needs a product call. `OWNER-ASKS.md` says none.

## Security & adversarial considerations

No trust boundary moves. Every name is text already on screen: registry titles (`apps/extension/src/utils/settings-search.ts`) and the confirm's label, which only in-wallet callers of `requestConfirm` set; no dApp-supplied string reaches a switch name. No stored shape, permission, message or dependency changes. `useId()` ids are per-app-instance counters, unique within a page; no id is persisted or sent.

## Phase 1: name every switch, pin it, scan for the gap

**Change map** (paths under `apps/extension/`):

- `src/components/ui/Settings/SettingControlRow.vue`: `titleId = useId()` on the title `Text`, passed to the default slot.
- `src/popup/pages/settings/{display,privacy,lock}.vue`, `connected-apps/index.vue`: `v-slot="{ titleId }"` on each switch row, `:aria-labelledby="titleId"` on its `Toggle` (connected apps drops its `aria-label`).
- `src/popup/pages/settings/developer/index.vue`: an id per row title, referenced by its `Toggle`.
- `src/components/ConfirmPopup.vue`: an id on the label `Text`, referenced by the `Toggle`.
- `tests/helpers/accessible-name.ts` (new), `tests/helpers/settings-rows.ts` (D6's rule).
- `src/components/ui/Settings/SettingControlRow.test.ts`, `src/components/ConfirmPopup.test.ts`: one name test each; `src/popup/pages/settings/connected-apps/index.test.ts`: its `aria-label` pin becomes a resolved-name pin; `src/popup/pages/settings/privacy.test.ts`: its local `Toggle` stub gets a name so D6 finds it.
- `src/utils/switch-name.scan.test.ts` (new).

**Validation gate** (retry 0, in order, once):

1. `bun run lint`; `bun run typecheck:all` (root).
2. From `apps/extension`: `bun --bun vitest run` on every touched test file above plus `src/popup/pages/settings/display.test.ts`, `lock.test.ts`, `developer/index.test.ts`, `src/utils/switch-name.scan.test.ts`. Red/green proof: the scan and D6 run red on the base's sources (switch names reverted), green after.
3. `bun run check:plans` after staging.
4. Smoke, from `apps/extension`, on the armed build (`global-setup-smoke.ts`'s `ARMED_BUILD`), Chrome then Firefox (`NULO_E2E_BROWSER=firefox`), `NULO_E2E_RETRY=0`, through `bun run test:e2e -- <files>`: the specs that read these switches by testid or through the fixtures that do (`fixtures/auth.ts` `optOutOfStrictMode`, `fixtures/settings.ts` `setDeveloperMode`/`setDebugMode`): `appearance`, `fiat-display`, `firefox-sidebar`, `contacts`, `received-fee-privacy`, `navigation`, `sw-resilience`, `settings-routes`, `extension-restart`, `rows`, `settings-crud`, plus `type-roles`. Pass: every file green; counts per run go in the PR body.

No e2e scenario is added, so no suite wall-clock is measured.

## Post-implementation (single arc, bounded work)

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at b22893f42, bounded-work form: ONE Codex pass (`gpt-6.1-sol`, high, read-only) over this plan and the net diff, with the standard's two verbatim rules and adversarial ask, plus the lane's questions: does every switch now carry exactly the words beside it, and can the scan test be fooled. A second round only if the first finds something material. No Opus leg, no `/code-review`.

## Delivery

Branch `switch-names-1-a1` off origin/dev carrying the plan commit; one PR against `dev` with `gh pr create`, opened ready after the gates and the Codex pass, no label at creation. Title: `fix(a11y): every switch is named by the words beside it` (55 characters). Body: each site and how it is named, one sentence that nothing visible changed (the type-role sweep is the proof), the gates with counts, the Codex verdict, the accessibility call under the 2026-10-19 delegation, `Closes #1733`. The close-out (Outcome, `git mv` into `archive/`, index lines) is the same PR's final commits. Never merged here: the orchestrator lands it.

## Seeds (not run)

- `/goal` Every `Toggle` under `apps/extension/src` is named by the words beside it, pinned by `expectOwnedRows` and `switch-name.scan.test.ts`; PR closing #1733 open and green.
- `/loop` Babysit the `switch-names-1-a1` PR's checks: a known flake gets one rerun, real breakage a fix and a targeted re-verify; stop at green.

## Audit verdicts

Pending: the post-implementation Codex pass.
