# ui-followups-p18: recon

Two Sonnet explorers at `d59459ab` (origin/dev), read-only, plus the planner's own checks. Paths are repo-relative; `src/` means `apps/extension/src/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A text tone that clears AA | `--nulo-secondary` (`packages/design/src/base.css:87,166`), the tone #495 already uses for meta text | reuse-as-is |
| Contrast pins for the moved text | `theme-contrast.test.ts`: `--nulo-secondary` on `--nulo-surface` (`:42`, both themes), `--app-bg`, `--nulo-surface-low`, `--nulo-surface-high` (`:197-199`) | reuse-as-is: every moved rule sits on one of these four (table below) |
| A source guard for "no text in the outline tone" | `src/utils/a11y-css.test.ts:121` (a hand-listed `[path, selector]` table, seven rows); `SectionLabel.test.ts:34`; `apps/extension/scripts/type-roles/source-scan.ts` (`sourceFiles()` over `apps/extension/src` and `packages/design/src`, `parseSource()` hands each `<style>` block or `.css` file to postcss), used by `type-role-ban.test.ts` | adapt: one sweep with `sourceFiles` + `parseSource`, added to a11y-css's existing describe |
| The store captures | `tests/e2e/network/store-captures.test.ts` (opt-in `STORE_CAPTURES=1`, Chrome only, `:393`; writes `apps/extension/store/captures/` in place, `:59`, no redirect) | reuse-as-is |
| The store art | `apps/extension/scripts/store-art.ts` (Puppeteer renders `store/templates/*.html` over the captures; writes `store/*.png` in place) | reuse-as-is |
| An old/new image composite | none in the repo (searched `side-by-side`, `montage`, `Bun.Image`, `sharp`, `resvg`, `pngjs`, `canvas` in `scripts/`, `apps/extension/scripts`, tests); `store-icons.ts:4-5` notes `Bun.Image` cannot compose onto a larger canvas | build new, in scratch only: a one-off Puppeteer page in store-art's pattern, never committed |
| The #451 wording | `src/composables/useLockWallet.ts:26-41,109-113`, pinned by `useLockWallet.test.ts:408-430` (one import, two imports, one import beside one send) | reuse-as-is: no change |

## #363: the 30 outline text rules at HEAD

`git grep -n -E "^\s*color:\s*var\(--nulo-outline\)" -- apps packages` lists 30. They equal the shot branch for option C (`2d929086`, 38 rules at `0ac9e062`) minus the eight #495 moved. The background is the nearest opaque fill up the element's ancestors, row states included.

| Rule (file: selector) | Colours | Background |
|---|---|---|
| `src/components/PrestoStatusCard.vue`: `.step_num` | text | surface-low |
| `src/components/composite/IdentityStrip.vue`: `.identity_sep`, `.identity_brand` | "·", "NULO" | surface |
| `src/components/composite/ListStatusMessage.vue`: `.no_results` | text | app-bg; surface in the token picker |
| `src/components/composite/SearchField.vue`: `&::placeholder` | placeholder | surface |
| `src/components/composite/capabilities/DetailsTable.vue`: `.head`, `.fn_label` | text | app-bg |
| same: `.address .copy_glyph`, `.row .chevron` | **Material icons** | app-bg; surface-low on row hover |
| `src/components/composite/list-empty.module.css`: `.empty_sub` | text | app-bg |
| `src/popup/components/modules/general/RecentActivityView.vue`: `.stalled_line` | text | app-bg |
| `src/popup/components/modules/settings/connected-apps/DappSessionVerification.vue`: `.setting_sub` | text | app-bg |
| `src/popup/components/modules/settings/record-card.module.css`: `.kv_key` | text | app-bg; surface-low hover; surface-high pressed |
| `src/popup/components/modules/tx/TxDebugPanel.vue`: `.detail_value_aux` | "↩", "#n" | app-bg |
| `src/popup/components/modules/tx/TxFeeRow.vue`: `.detail_value_aux`, `.fee_grid_aux` | text | app-bg (`.fee_breakdown` has a border, no fill) |
| `src/popup/pages/detail-page.module.css`: `.empty_sub`, `.meta_sep`, `.detail_value_aux` | text, "·" | app-bg |
| `src/popup/pages/received/[id].vue`: `.detail_key_note`, `.detail_value_aux` | text | app-bg |
| `src/popup/pages/register.vue`: `.terms` | text | app-bg |
| `src/popup/pages/settings/connected-apps/index.vue`: `.empty_hint` | text | surface |
| `src/popup/pages/settings/developer/account-state/notes/index.vue`: `.location`, `.render_error_msg` | text | app-bg; surface-low hover; surface-high pressed |
| `src/popup/pages/settings/glossary.vue`: `.where` | text | app-bg |
| `src/popup/pages/tx/[id].vue`: `.detail_value_aux` | text | app-bg |
| `src/popup/windows/capabilities/AccountSelectRow.vue`: `&::placeholder` | placeholder | surface-low (the input's own fill) |
| `packages/design/src/ui/Input.vue`: `.base input::placeholder` | placeholder | the caller's: app-bg on pages, surface in popups |
| `packages/design/src/ui/LoadingState.vue`: `.sub` | text | app-bg; no caller passes `sub` today |

`--nulo-secondary` on `--nulo-surface-highest` is 4.09:1 (light) and 3.98:1 (dark), under AA. That tone paints only pressed settings rows, `JsonViewer`, `AuthProfilePill`, a `Button` variant and the tooltip bubble; none holds a moved rule, and the `Input` callers checked (`settings/lock.vue`, `ImportFullBackupForm.vue`, `EditNetworkPopup.vue`) sit beside their `SettingItem`, not inside it.

No other route gives text the outline tone: no alias token, no `fill`/`stroke`/`caret-color`/`-webkit-text-fill-color`, no utility class. `text-decoration-color` in `Header.vue:427` and `DottedTerm.vue:55` colours an underline (decoration). `notes/index.vue:26`'s `NOTE_BORDER_SHADES` feeds only `borderLeftColor` (`:224`). Story files use the token for borders only.

No component test or e2e reads the colour of these elements (jsdom applies no CSS modules; `tests/e2e/fixtures/type-roles.ts:149-153` reads face, size, tracking and case only). `tests/e2e/helpers/pointer-probes.ts:109-113`'s `tokenColor` exists for a computed-colour check.

## #364: the store images

- The captures stage a dark-theme sandbox wallet (`store-captures.test.ts:124-136`): "Testnet", USD Coin and Fee Juice, contact Alice, two receipts and a private send. Balances and the $1 quote are pinned; addresses and hashes are fresh per run, so a rerun never reproduces a signed image byte for byte.
- `store-art.ts` writes the promo tile and `screenshot-{1..5}`; `apps/extension/README.md:62` still says `screenshot-{1,2,3}`.
- No test, workflow or listing reads the images (searched `screenshot-[0-9]`, `promo-440`, `store/captures`, `store-art`, `sha256` repo-wide; `release.yml:806` uploads only `listing.md`). They do enter the source archive (`git archive`, `release.yml:797`; no `export-ignore`).
- The tool was last repaired by #351 (2026-10-13, `1cb8d8b4`) and was red on dev before that (`implementations-plan/archive/code-followups-2/plan.md:360`). It runs in no CI job.
- A PR touching only `apps/extension/store/*.png` trips every extension lane's path filter (`apps/extension/**`).

## Issue claims checked

- #363: holds. Page 18 C's text names the icons as staying (see plan Fact 2); the shot build moved them.
- #364: holds. The lane brief's flag name `CAPTURES_ENABLED` is the stale-network capture helper's (`tests/e2e/helpers/stale-network-capture.ts:10`); the store captures read `STORE_CAPTURES`.
- #451: the ask is answered. Page 17 P17-01 = A, "the wording as shipped", and the tree ships it.
- Lane brief "smoke e2e through `agent.sh`": `agent.sh` runs only the network config (`apps/extension/scripts/e2e/agent.sh:15`); smoke runs through `bun run test:e2e`, whose fixtures claim ports from the host registry (`tests/e2e/port-registry.ts`).
- Closed `known-limit` issues on outline contrast or the store captures: none (`gh issue list --state closed --label known-limit --search ...`).
