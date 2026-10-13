# Arc 2 log (phases 2.1 to 2.3)

## Phase 2.1: Firefox's loopback permission, probed (#156), 2026-10-13

Firefox 153.0.4 (the locked Puppeteer's), smoke launch (egress guard on, loopback direct), the arc's base `19629fdb`. Two scratch smoke files, run once each on Firefox and once on Chrome, then deleted; nothing committed. The stub is a claimed loopback listener (`listenClaimed`) on a drawn port, since the host permission covers every port.

Firefox prefs as launched: `extensions.webextOptionalPermissionPrompts: true`, `network.lna.enabled: true`, `network.lna.blocking: true`, `extensions.originControls.grantByDefault: true`.

| Reading | Firefox | Chrome |
|---|---|---|
| Default install, `getAll().origins` | `passkey.nulo.sh`, both loopback origins, `*://*/*` | the same |
| Default install, `contains(loopback)` | true | true |
| Withheld (`permissions.remove` of both loopback origins and `*://*/*`): `remove` | resolves true; `getAll` keeps only `passkey.nulo.sh`; `contains` false | not run (Chrome is not in scope) |
| Withheld: GET `/health` from an extension page | 200 | — |
| Withheld: the onboarding step's check (no Presto on 59833/59834) | `offline`, as with the permission | `offline` (default) |
| Privileged grant (`ExtensionPermissions.add` through `chromeScript`) | `contains` true again | — |
| `permissions.request` with no user input | rejects: "permissions.request may only be called from a user input handler" | — |
| `permissions.request` from a hit-tested click, prompts on | pending; doorhanger `addon-webext-permissions` shown; accepting it resolves `true`, `contains` true | — |
| The same, `webextOptionalPermissionPrompts=false` | resolves `true` with no doorhanger; `contains` true | — |
| `navigator.permissions.query({ name: "loopback-network" })` | `prompt` in every state; `local-network-access` throws `TypeError` | `prompt` for both |

The second file separated the network outcome from the permission. The stub answers like Presto's `CorsLayer` (any origin; `GET`, `POST`; `content-type` and `x-aztec-version`; presto repo `packages/presto/core/src/server.rs:383-393`), with two controls: `/nocors` sends no CORS headers, and `/strict/*` omits `x-aztec-version` from its preflight answer.

| Request | Firefox, granted | Firefox, withheld | Chrome, granted |
|---|---|---|---|
| Page: GET `/health` | 200, no `Origin` sent | 200, `Origin: moz-extension://…` | 200, no `Origin` |
| Page and background: GET `/nocors` (control) | 200 | rejected, `NetworkError` | 200 |
| Page and background: POST `/prove` with the SDK's two headers | 200, no preflight | 200 after an `OPTIONS` preflight | 200, no preflight |
| Page and background: POST `/strict/prove` (control) | 200 | rejected, `NetworkError` | 200 |

Answers:
- **I1 proven.** Firefox accepts `permissions.request` for an origin listed only in `host_permissions`: it shows its doorhanger and grants it. No `optional_host_permissions` is needed.
- **I2 proven.** With `extensions.webextOptionalPermissionPrompts=false` the request from a hit-tested pointer click is granted with no doorhanger; with prompts on, the same request without user input is refused while the click's opens the doorhanger, so the click counts as user input.
- **I3 refuted.** With the loopback origins and all-sites access withheld, Firefox does not refuse an extension page's or the background's request to `127.0.0.1`: Local Network Access does not gate the extension's origin, and the request runs in CORS mode, which the controls prove (both rejected only while the permission is withheld). Presto's CORS admits every request the SDK sends (`presto-core` 1.2.1 sends `content-type` and `x-aztec-version` on `/prove`, nothing extra on `/health`).
- **Chrome's default install holds the permission**, so the close-out files no Chrome issue.

**Stop rule fires: #156 ships nothing.** `contains` is false and the stub is still reachable, so the step would ask for nothing the wallet needs. #156's impact ("proving falls back or fails silently") does not hold on Firefox 153. What a withheld permission does change: GET `/health` then carries the extension's `Origin`, so Presto serves its minimal body until that origin is approved (`health_is_detailed`, `server.rs:413-440`), the tier any approved-on-first-prove caller sees; `/prove` carries the `Origin` in both states, so Presto's per-origin approval runs either way. #156 stays open with a comment naming this record.
