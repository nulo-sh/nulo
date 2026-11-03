# popup-followups-1 recon

Base: `origin/dev` at `67c1ac545`. One Explore agent (sonnet) mapped the e2e coverage, the capture tooling and `create.test.ts`; the rest was read directly. Paths under `apps/extension/` unless they start with `packages/`.

## #1473 claims, checked

| Claim | Holds? |
|---|---|
| `useConfigRead` has about nine consumers | Yes: `Header.vue`, `onboarding/app.vue`, `general.vue`, `received/[id].vue`, and five settings pages. |
| `BalanceView.vue` reads the fiat switch once, with no `onConnected` re-read | Yes (`src/popup/components/modules/general/BalanceView.vue:88-96`), and its `then` has no `catch`, so a read refused at unmount is an unhandled rejection. |
| `holdings.vue` registers its read on `onConnected` | Yes, and it also reads at setup, so a mount sends four reads (`src/popup/pages/holdings.vue:87-104`). |
| `PopupManager.vue` hand-rolls a read | Yes; declined in the archived plan (D14): it seeds `useIncomingTrustPrompts`, which registers its listener after the seed and fails open. Out of scope here. |

The staleness paths (the archived OA-1), traced:
- **Hero, missed update** (demonstrated by trace): the worker restarts while Home is open; the port drops and the client reopens it (`packages/extension-messaging/src/background/client.ts`, `onDisconnect` → `connect`); an update sent while it was down is never replayed; `BalanceView` has no `onConnected` listener, so the hero keeps the old flag until it remounts.
- **Stale read overrides a newer change** (demonstrated by trace, both views): a `getValue` in flight when an `onUpdate` arrives resolves later with the older value, and the `then` writes it over the update.

## Create profile, checked

- `src/onboarding/pages/create.vue:231-258`: headings `Text variant="label-section" color="secondary"` with gap 8; testids `onboarding-password-input` (root), `onboarding-password-confirm` (root) and `onboarding-password-confirm-input` (native input); the hint `v-if="passwordStrengthHint && !isCreating"`.
- `useProfileCreateFlow.strengthHint` is read only by `create.vue` and its own test.
- `src/components/composite/NewPasswordPair.vue`: hint under the first field, always rendered; `labelRepeat` renders "Repeat password" with `.export_section_label`, coloured only by `src/components/composite/CollapsingHeroLayout.vue`'s global style.
- The design `Input`'s `label` prop matches Create's heading markup but also turns on its "Maximum length reached" note at the cap, a behaviour Create does not have today, so it is not a way to keep the headings.
- E2E reach: `tests/e2e/keyboard-guards.test.ts:150-167` (the confirm input's native testid), `onboarding-tab.test.ts`, `legal-acceptance.test.ts`, `type-roles.test.ts:1129-1131`, the legal and chaos drivers, and `registration.test.ts` / `tests/e2e/fixtures/extension.ts:390-395` by the "Strong password" placeholder. No e2e asserts the hint's text; `src/onboarding/pages/create.test.ts:370-377` asserts its absence while the create runs.
- Home's hero fiat switch: `tests/e2e/fiat-display.test.ts`; Holdings: `holdings-add-token.test.ts`, `token-list.test.ts`, `type-roles.test.ts`. No e2e reads `holdings-summary` or the dust threshold.
- Captures: the archived quality-popup-1 used a scratch spec outside the repository with `shotSend` (`tests/e2e/fixtures/shots.ts`, writes `$NULO_E2E_SHOT_DIR/<name>.png`, both themes); `onboarding-tab.test.ts:141` already calls it on onboarding.
- `tests/e2e/helpers/profile-chaos/model.ts:374-376` cites `create.vue:151,175,195`; `scripts/e2e/profile-chaos-model.test.ts` reds when a cited line moves.

## Closed known limits searched

`known-limit` + "useConfigRead": #600 (Header's one-read flash; unrelated to these views). "password pair": none.
