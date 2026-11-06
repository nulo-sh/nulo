# whats-new-1 recon

Base: `dev` at `0bfd2c088`. One reuse sweep (Explore, sonnet) plus direct reads. Paths are under `apps/extension/` unless they start at the repo root.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Running version | `__VERSION__` = `package.json` version verbatim (`vite.shared.ts:54`), read by `src/popup/pages/settings/about.vue:27`; defined for vitest too (`vitest.config.ts:25`). The manifest `version` is 4-part (`1.2.3-rc.1` → `1.2.3.1`, stable `1.2.3.0`) with the full string in `version_name` (`manifest/manifest.config.ts:13-19`). | reuse `__VERSION__` |
| Semver parse | `@nulo/legal` `parseVersion` (`packages/legal/src/status.ts:28`) accepts `X.Y` and `X.Y.Z` legal-document versions; `compareMajorMinor` is private. No semver dependency. | build new (a strict `X.Y.Z` parse: a 2-part legal version is no release) |
| Install/update hook | `src/wallet/index.ts:38`, top-level `onInstalled`, `install` only (opens onboarding). `RealChromeBrowserApi.onInstalled` (`src/core/adapters/chrome-browser-api.ts:140`) is unused and registers after startup awaits. | adapt the top-level listener; never a second one |
| Device-local plaintext key | Registry `src/wallet/storage/stored-shapes.ts` (`uiLastActiveProfile`, `onboardingCompleted`: `value(key)`, `encoding: "structured"`). Last additive device key: `3af5f7840` (#1487) touched the registry, `goldens.json` (`full` + `minimal`), `snapshot.json` (generated), `pins.ts`, `root-census.test.ts` (`PLAINTEXT`), `stored-shapes.writers.test.ts` (`Equivalent` tuple and its count), `tests/e2e/helpers/profile-chaos/checkers.ts` (family entry), `SECURITY.md` § Storage privacy. | adapt (same drill) |
| UI storage I/O | `@/utils/storage` facade (`storageLocalGet`/`storageLocalSet`); `src/utils/lastActiveProfile.ts` is the device-key module model. Raw `chrome.storage.local` is allowed under `wallet/` (`src/utils/storage-facade-ban.test.ts:27`). | reuse |
| Profile reset vs device reset | Profile deletion removes `profileUiKeys(id)`: every prefix ends in `@` (`src/utils/profile-ui-keys.ts:35`), so a key with no `@` survives. No in-product code clears all of `chrome.storage.local` (only the adapter's `clear()`); a device reset is uninstall or "clear extension data". | nothing to build |
| Backup | Slices are opt-in (`src/wallet/services/backup/backup-migration-registry.ts:203-222`); no `nulo:ui:*` key is in one. | nothing to build |
| Home row style | `GetStartedCard.vue`: `ItemsContainer` + `SettingItem` with `external` (draws `open`). `RowAction` (`packages/design/src/ui/RowAction.vue`): 24 px button, `aria-label`, `@click.stop`, 2 px accent ring. `SettingItem` `to` + `external` renders an `<a>` (`SettingItem.vue:92-100`), so a `RowAction` inside it would nest a button in a link; `@click` mode renders a stretched `RowTarget` button, before `#right` in DOM order. | reuse (click mode) |
| Opening a site | `general.vue:120` `window.open(url, "_blank", "noopener,noreferrer")`; `HOW_AZTEC_WORKS_URL` literal (`src/utils/get-started.ts:80`). | reuse the pattern |
| Surfaces after an update | `src/popup/app.vue:669-702`: barriers and the Terms sheet overlay Home; the stale-network takeover and the network arrival unmount `RouterView`. | nothing to build |
| Tests to match | `src/popup/pages/general.test.ts` (STUBS, `installChromeStorage`), `GetStartedCard.test.ts` (real `SettingItem`, glyph and spoken-name asserts); no About test exists. Smoke: `tests/e2e/security-backup.test.ts:53` counts Home's Get started rows via `getStartedRows` (`tests/e2e/fixtures/tokens.ts:128`, prefix `get-started-`); `tests/e2e/fixtures/shots.ts` `shotSend` captures both themes under `NULO_E2E_SHOT_DIR`. The e2e launch reports `install` on every start. | adapt |
| Egress | `tests/e2e/fixtures/egress-guard.ts:112` declares the `nulo.sh` refusal for the How Aztec works tab only. | adapt the reason |
| Release runbook | `.claude/skills/release/SKILL.md` § Release notes; PR #1713 adds the changelog-page TOML bullet there. | one new bullet, in another spot |

## Open work and collisions

- #1691 is the **landing** changelog page, not the wallet notice; PR #1713 (`Closes #1691`, #1711, #1712) builds it at `/changelog/vX.Y.Z/`. This lane references #1691 and closes nothing.
- No open issue covers the wallet notice; no closed `known-limit` matches "update notice", "what's new" or "changelog".
- Collision: a `get-started-*` testid would be counted by `getStartedRows`; the row uses `whats-new-*`.
