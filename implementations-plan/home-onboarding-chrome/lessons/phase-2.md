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

**Stop rule fires: #156 ships nothing.** `contains` is false and the stub is still reachable, so the step would ask for nothing the wallet needs. #156's impact ("proving falls back or fails silently") does not hold on Firefox 153. What a withheld permission does change: GET `/health` then carries the extension's `Origin`, so Presto serves its minimal body until that origin is approved (`health_is_detailed`, `server.rs:413-440`), the tier any approved-on-first-prove caller sees; `/prove` carries the `Origin` in both states, so Presto's per-origin approval runs either way. The close-out comments on #156, which stays open, naming this record.

**Codex consult on the stop** (gpt-6.1-sol, high, read-only; session `01a13540-9de3-7201-b482-80ffeaa54e52`): `STOP-RULE: agree`, with a narrower rationale, accepted. (1) Before Presto approves Nulo's origin, a withheld permission costs diagnostics, not proving: the minimal `/health` body reads as `available` with no download indication, Settings → Proving shows "—" for both version rows (`presto-ui-state.ts:249`), and a failed HTTPS probe's HTTP diagnostic can only say `presto-reachable`. Presto's approval, which the first prove asks for in both states, restores the detailed body. (2) No automation-only bypass found: Firefox 153.0.4's LNA gate (`nsHttpTransaction.cpp`) has no headless or Marionette exception, and neither Marionette's recommended prefs nor geckodriver's set an LNA override. (3) Not measured: trusted-HTTPS proving on a person's Firefox profile, and the PXE frame itself (same origin as the background, which was measured). What would overturn the stop: a permission-dependent failure, with trusted Presto HTTPS and the same approval state, in the PXE frame, that granting the permission fixes. The close-out's comment on #156 takes this narrower wording.

## Phase 2.3: the store Send frame (#170), 2026-10-13

- Before: the committed `apps/extension/store/captures/send.png` copied to `screenshots/170-send-before.png`.
- The file as it is, at retry 0 (Chrome, proverless): red at `fillPrivateSend`'s strip expectation under the sponsor (`you: "unknown"`, `action: "send"`), as the issue's comment of 2026-10-10 recorded. Reproducible.
- **I6, the cause: the harness read the strip too early.** A scratch copy logged the stored rows and the page after the pick. Both protocol rows were there, with the sandbox's sponsor address (`0x06a9…924b`) on the local chain. The strip read `unknown` while the trigger already read `sponsored`, then `hidden` and stayed there. A second scratch copy recorded every frame from the pick: `0 ms` no method, `you=unknown`, not armed; `34 ms` `sponsored`, `you=unknown`, not armed; `194 ms` `sponsored`, `you=hidden`, armed. The trigger draws the pick while the card's selection is still `pending` (its preview, `FeeSettingsCard.vue` `displayMethod`), and the strip turns `hidden` in the same frame the send arms, when the card's settings and payer land. `waitForFee` returns on the trigger, so the expectation read the pending frame. The wallet is right to show "—" while it has not resolved a payer, and the send is disarmed in that window, so this is not a wallet fault and OA-6 does not apply (D11's harness branch).
- Fix, in `store-captures.test.ts` only: `fillPrivateSend` asserts the strip after the send arms, through the existing `readSendView` and `assertPublishInvariant`. No shared fixture changed, so D11's caller sweep has nothing to list.
- `clearAmountLine` (OA-5 A): the least scroll that clears the amount line, refused when the page cannot scroll that far, and re-measured once scrolled; the transfer-type labels may pass under the header.
- Proof A (harness fix, `clearAmountLine` as on `19629fdb`): the strip expectation passes and the run fails at the base helper's refusal, `the amount line needs 35px of scroll, and Send has 18px`.
- The committed captures were restored after every run (`git checkout -- apps/extension/store/captures`); `git status -- apps/extension/store` was clean each time.
- Proof B (harness fix, new `clearAmountLine`), at retry 0: the whole file passes in 168 s; `clearAmountLine: {"scrolled":35}`. The re-staged `send.png` is `screenshots/170-send-after.png`. At 35 px the From/To labels pass wholly under the header and the toggles stay, noted in OA-5.
