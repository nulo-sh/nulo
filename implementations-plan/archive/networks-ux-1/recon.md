# networks-ux-1 recon

Base `origin/dev` at `843d27f75`. One Sonnet explorer ran the reuse sweep; the lead verified each load-bearing claim against the tree. `E` is `apps/extension`, `X` is `E/src`, `D` is `packages/design/src`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A row that is a link and holds its own button | `X/components/ui/RowTarget.vue` (a stretched `<a>` or `<button>`, controls as later siblings). `SettingItem` uses it only in click mode (`X/components/ui/Settings/SettingItem.vue:114`); link mode draws the whole row as the `<a>` (`:95-104`), so a button there would sit inside the link. Hand-built link rows with controls: `connected-apps/index.vue:137-173`, `ContactRow.vue:22-55`. | adapt `SettingItem` (D1) |
| The outlined button | `D/ui/Button.vue:300-310` `primary_outline`: transparent, 2px `--nulo-outline` border, `type--button-md`. Sizes: `mini` 26px with 10px side padding (`:225`), `micro` 20px, `small` 32px. `cta_outline` is a full-width CTA. No consumer uses `primary_outline` below `compact`. | reuse as is (D3) |
| Activation from a view | `X/composables/useNetworkActivation.ts:17-39`: the in-flight-send refusal, `activateNetworkGuarded`, the refusal and unconfirmed toasts; "Success feedback is the caller's". Five callers wire `managers.network.setActiveNetwork`/`getActiveNetwork`; only `[id].vue:124` toasts "Active network updated". | reuse as is (D2) |
| Name differing from visible text | `Header.vue:228-236` (`aria-label` "Manage networks (currently …)"), asserted with `.attributes("aria-label")` (`Header.test.ts:240-254`). | reuse the pattern |
| Enter and Space in a component test | `E/tests/helpers/press-key.ts` `pressOn(el, key)` simulates a focused button's activation through `sendEvent`. No shared Tab-order helper: `Popup.snackbar.test.ts:35-50` keeps a private one; DOM order is Tab order without positive `tabindex`. | reuse `pressOn`; build the stop list inline |
| An e2e host that walks the list | `E/tests/e2e/settings-crud.test.ts:11-29` "networks page lists the default networks" (file-scoped `registeredExtension`, starts on Alpha V6; Testnet and Local Network are inactive, `X/wallet/services/network/seeds.ts:44-66`). | extend (D5) |
| A hit-tested press and a probe | `E/tests/e2e/helpers/legal-drivers.ts:219` `pointerClick(page, testid, { last })` fails when something covers the centre; `E/tests/e2e/helpers/pointer-probes.ts:11` `coveredAt`. | reuse as is |
| Light and dark captures | `E/tests/e2e/fixtures/shots.ts` `shotSend(page, name, focusTestId)`: a no-op unless `NULO_E2E_SHOT_DIR` is set; saves both themes. PRs link captures committed under the plan's `screenshots/` at a SHA (#852, #779). | reuse as is |

## Constraints the design must keep

- Five e2e helpers press a row by dispatching a synthetic click on `[data-testid="network-row"][data-network-name=…]` (`E/tests/e2e/fixtures/networks.ts:93,144,163`, `restore-outcome.test.ts:130`, `stale-network.test.ts:62`, `stale-network-captures.test.ts:258`). The click must land on the element that navigates, so `network-row`, `data-network-id` and `data-network-name` stay on the row's link. `settings-crud.test.ts:42` presses the first row's centre with a real mouse.
- No e2e reads `network-active-badge` or `network-active-dot` today. The component test scopes them inside `[data-network-id]` (`networks/index.test.ts:85-92`).
- Only positioned boxes paint above an earlier `RowTarget`. In `SettingItem`: `.icon_wrapper` (`position: relative`, `:231-239`), rendered on every network row because the page always fills `#dot`. In `@nulo/design`: `Button` and `RowAction` (`position: relative`); `Icon`, `Flex`, `Text` and `Badge` are not positioned.
- Search trail for absences: `grep -rn "RowTarget\|data-row-target"`, `grep -rn "<template #right>"` over `X`; `grep primary_outline` over `X`, `E/tests`, `D`; `grep -rn "network-active-badge\|network-active-dot" E/tests`; `grep "Active network updated"` over `X`, `E/tests`.

## Open work

`gh issue list --state all --search "network list switch"`: only #1325. Closed known limits near the area (#904, #658, #476) concern arrivals and profile switches, not the list.
