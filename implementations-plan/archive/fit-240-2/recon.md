# fit-240-2: recon

Base: `origin/dev` at `4fe6ea6cb`, then `b88c20a39` once #986 merged (2026-10-21 21:34Z). The probe ran on #986's head `fc6422d53`; nothing it used changed between the two. One Sonnet explorer (reuse sweep) and a planner probe; the probe's scratch diff stayed outside the repository.

## The surface

- **Done state** (`full.vue:293-310`): `Banner variant="done"`, testid `backup-done-banner`, vertical with the password reminder, horizontal with the title alone after a passkey profile's plain file (`savedPlain`, line 296). Its titles: "Saved to your downloads" (`downloaded`), "Backup is successfully encrypted" (`encrypted`). One CTA under it: Close (`backup-close-btn`, line 400) once downloaded, Download Backup while encrypted.
- **Working card** (`full.vue:206-220`): `StatusCard` (`components/composite/StatusCard.vue`), testid `backup-status-card`, while `backupStatus` is `progress` or `encrypting`. It is not part of the done state. The contacts export shows the same component (`contacts/index.vue:179-183`, `contacts-export-status-card`).
- **Shell**: `CollapsingHeroLayout`. #986 measures it at 240 on Reset, Export account, Import account, New profile and Restore again; never on Full Backup (no `export/full` in `type-roles.test.ts`).
- **CSS that could cut** (explorer, checked): none. No `nowrap`, `text-overflow` or fixed width on the done banner, the card or `export_section*`; `StatusCard .description { max-width: 280px }` only caps; the `row-title`, `value` and `body` roles set no `white-space`.

## Reuse map

| Capability | Verdict | Where |
|---|---|---|
| 240 px gate | exists (on #986) | `expectFitsNarrow`, `fixtures/type-roles.ts:734`; `NARROW_ACCEPTED` `:575` |
| Visits that reach the done state | exist | password: `security-backup.test.ts:101-136` (done at `:129-132`); passkey plain done and encrypted: `passkey-backup.test.ts:101-229` (`:162-167`, `:213-221`) |
| The done state under a warning | exists | `backup-imported-account.test.ts:166-178` (stage 6): `backup-imported-unopened-banner`, then a download; `discardRun` keeps the warning flags (`useFullBackupExport.ts:476-488`) |
| Holding the working card on screen | exists, passkey profile, `progress` only | `holdNextPasskeyRequest` (`fixtures/passkey.ts:144`): `runBackup` sets `progress` before `openRun` awaits the ceremony (`useFullBackupExport.ts:335-337`). Used the same way at `type-roles.test.ts:1080` on #986. |
| Holding `encrypting` or the contacts export | none | the only await is `sealFullBackupText` (`useFullBackupExport.ts:396`); the contacts run awaits the worker, which a refused node answers with an error, not a stall |
| Layout in a cheaper layer | none | `StatusCard.test.ts` mounts in jsdom (no layout engine); no StatusCard story |
| Pictures in both themes | exists | `shotSend` (`fixtures/shots.ts`) under `NULO_E2E_SHOT_DIR`; `atWidth` (#986) sets the width |

Per-file smoke medians (`tests/e2e/shard-timings.json`, s, Chrome/Firefox): `security-backup` 28/36, `passkey-backup` 25/34.

## The probe (2026-10-21, #986's head, armed builds, retry 0, load1 near 160)

`expectFitsNarrow` added, uncommitted, at five points; both files green on both browsers.

| Point | Chrome | Firefox |
|---|---|---|
| working card, held under the passkey dialog | pass | pass |
| passkey profile, plain done state (title alone) | pass | pass |
| passkey profile, `encrypted` (Download Backup) | pass | pass |
| password profile, ready (`backup-ready-banner`) | pass | pass |
| password profile, done state (reminder, Close) | pass | pass |

Runs: Chrome 78 s for both files (`passkey-backup` test 1 23.8 s, `security-backup` test 3 11.0 s); Firefox 86 s (26.2 s and 11.4 s). #964 recorded test 1 at 22.5 s (Chrome) and 26.3 s (Firefox) without the checks.

Geometry at 240 (Chrome): the plain done banner spans 24 to 216 px and its title is 146 px wide on one line; the document does not scroll sideways.

**Controls** (Chrome):

- **Cut card title.** `nowrap`, `overflow: hidden` and an ellipsis on the card's title: the gate fails, fate `cut`.
- **`nowrap` on the done banner.** The gate passes, and the reading is valid: the title already fits on one line.
- **Done banner at `min-width: 300px`, wider than the 240 px view.** The gate passes. The only ancestor that scrolls is `CollapsingHeroLayout .wrapper`: `overflow: auto` (`CollapsingHeroLayout.vue:135`), 0 to 240 px, scrollWidth 324. `expectInsideView` excuses any box such a scroller holds, and the text-fates check counts text such a scroller can reach as painted.

## Known limits searched

`gh issue list --state closed --label known-limit --search "backup 240"`: none. #1005 (a placeholder cut below 360) does not touch this page's states.
