# fu2-copy-1: recon

Base `1e6c5bc1f` (origin/dev). One Sonnet explorer (reuse sweep over six capabilities) plus the planner's own reads. Paths are under `apps/extension/` unless they name a package.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Singular and plural beside a count | No helper anywhere (searched `plural`, `pluralize`, `Intl.PluralRules`, `*plural*` file names over `apps/extension/src`, `packages/*`, `scripts`). Inline noun ternaries at `components/composite/import/restore-warning.ts:24`, `popup/components/modules/settings/contacts/useContactImportExport.ts:455,474`, `popup/components/popups/ImportContactsPopup.vue:180`, `popup/components/modules/send/RecipientField.vue:60`, `components/composite/send/AmountCard.vue:543`, `popup/windows/capabilities/details-table.ts:149-150`, `popup/windows/capabilities/permission-rows.ts:90,180,236`, `popup/windows/execute/call-surface.ts:305` (12 ternaries in 9 files), plus the noun of `popup/pages/settings/security/export/full.vue:254` | build new `src/utils/plural.ts`; migrate the noun ternaries |
| Counts broken at 1 | `popup/pages/holdings.vue:119` ("1 tokens", pinned by `holdings.test.ts:185`), `popup/pages/settings/connected-apps/index.vue:95` ("Disconnect all 1 sessions?") | fix through the helper |
| Counts that need no helper | Phrase-level alternations: `popup/pages/settings/security/export/full.vue:72-74`, `components/stale-network/copy.ts`, `call-surface.ts:252`, `composables/useLockWallet.ts:17-25`, `popup/windows/capabilities/index.vue:410`. Guarded `> 1`: `SignerIdentityStrip.vue:21`, `verify/header-labels.ts:42`, `scope-mismatch.ts:118` (multi-signer). No noun: `GetStartedCard.vue:28` ("N of 4 done", shown only above one step), `recovery-phrase.ts:44` ("1 of 24 words" reads right), `SectionLabel` (`packages/design/src/ui/SectionLabel.vue:22` prints a bare number beside a heading) | leave |
| Duplicate-name verdict | Literal `"Already exist"` produced, compared back and displayed in `NewAccountPopup.vue:34,42,126`, `EditAccountPopup.vue:32,42,112`, `NewFpcPopup.vue:44,63,168`, `EditFpcPopup.vue:42,88,266`, `NewTokenPopup.vue:46,54,340`, `NewSenderPopup.vue:51`, `EditProfilePopup.vue:159`, `pages/settings/accounts/import.vue:299`, `ContactFormFields.vue:37,57`; `EditProfilePopup.vue:159` shows the same words for an unchanged name (`:44`), while the profile's real duplicate warnings read "Name in use" (`:158`, `composables/useProfileNameField.ts:105`); `utils/contact-rules.ts:6` exports `CONTACT_EXISTS = "Already exist"` (contact popups compare to it). Network popups already say "Already exists" (`NewNetworkPopup.vue:39,48,58-59,172,186`, `EditNetworkPopup.vue:33,42,124`). No e2e asserts it; about 14 component tests do | adapt: one shared constant, every producer, comparison and display reads it |
| Glossary | `utils/glossary.ts` (`GLOSSARY`, `GLOSSARY_SECTIONS`); `utils/glossary.test.ts` pins every entry "the owner signed, word for word"; `components/composite/DottedTerm.scan.test.ts` refuses a dotted key whose definition is over one sentence or 100 characters; `popup/pages/settings/glossary.vue` renders sections in order; `tests/e2e/tooltips-glossary.test.ts` reads the order from the module | reuse; `proving` (123 characters, two sentences) cannot be dotted as it stands |
| Dotted term | `components/composite/DottedTerm.vue` (`term` = a literal `GlossaryKey`). `settings/proving.vue`, `settings/lock.vue`, `settings/fpcs*` hold none today | reuse as is |
| Outside-link mark | Glyph `open` (`packages/design/src/core/glyph-sources.ts:13`). `components/ui/Settings/SettingItem.vue:170-176` draws it in the chevron's place when `external` is set, and `:76-83` keeps the row in click mode when it has no `to` | reuse: `external` on the Get started row |
| Store listing | `store/listing.md:31` "• No account, no telemetry."; the same claim in the screenshot caption `scripts/store-art.ts:37` (rendered to `store/screenshot-4-1280x800.png` by Puppeteer from committed captures). No repeat in `apps/landing`, `README.md`, `SECURITY.md`; `legal/privacy.md`'s short version is the policy itself | edit both |
| Strict mode's line | One source: `utils/settings-search.ts:216-217` (`lock-strict-mode`), rendered by `settings/lock.vue:222-223`, pinned by `lock.test.ts:97`. No e2e asserts it | edit the one source |

## Facts checked against the tree

- **Strict mode locks on every background restart.** `wallet/services/profile/session-manager.ts:299` persists no restore bearer when strict mode is on; the restore path's shape gate (`:611`) closes a session without a bearer. The expiry check (`:594`) runs before that gate in both modes, so the timeout applies either way. The lab's reading holds.
- **How Aztec works opens a website from a click row.** `popup/pages/general.vue:119-120` marks `aztecOpened`, then `window.open`s the landing page. `GetStartedCard.vue:46` hands the row a click listener and a chevron.
- **Delete profile's third box** is `reset.vue:323`. Lane fu2-security-1 carries P93-40 C, whose third box reads "I have my recovery phrase or a full backup", so it replaces this sentence.

## Measured: the website row (smoke harness, Chrome, light, base build)

A scratch spec opened Home on a new profile and set the How Aztec works row's value in the DOM (the glyph swap has the chevron's size, so it moves nothing). Title width needed / given:

| Width | Today ("1 min") | "1 min · website" | "1 min website" | "1 min · website" as a second line |
|---|---|---|---|---|
| 360 px | 157 / 157, row 56 px | 110 / 101: "How Aztec w…" | 110 / 108: "How Aztec wor…" | 198 / 198, row 72 px |
| 240 px | 112 / 112 (value already below the title) | 112 / 112 | 112 / 112 | 78 / 78 |

`SettingItem`'s value never shrinks (`SettingItem.vue:78-81`) and its title ellipsizes from 359 px up; below that the row stacks (`:326-352`). Pictures: `screenshots/get-started-360-*.png`, linked from OA-2.

## Words on screen

No screen says "Mainnet": the main network's seeded row and chain name are "Alpha" (`wallet/services/network/seeds.ts:61-66`, `components/ui/utils.ts:34-35`). A full backup leaves out added networks and fee payers (`wallet/services/backup/README.md`, retired slices), and the recovery phrase does not restore imported accounts (`reset.vue:308`), which bears on two of OA-1's signed rows.

## Collisions

- fu2-security-1 (Delete profile; its #1529 carries P93-40 C), fu2-home-1 (Get started across a switch, Accounts' toast), fu2-send-1 (Holdings' public line) touch neighbouring files; none had a plan at this base. Expect line-level merges only.
- #1449 (entity popups' inline rules) names the verdict literal as one of its duplications; D2 takes that part and leaves the reducers and limits to it. #1499 (New sender's Enter) is untouched.

## Open issues for the lane

Filed from the lab (none existed; searched each title's words): #1505 (P93-13), #1506 (P93-23), #1507 (P93-34), #1508 (P93-52), #1509 (P93-03), #1510 (P93-46).
