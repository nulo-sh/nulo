# popup-dedupe-1 recon

Base: `origin/dev` at `4b250dfe4`. One Explore agent (sonnet) swept #1449's sites; the driver read #1470's sites and every file named below. Paths are under `apps/extension/src/`.

## #1470: the Send side rule

| Site | Rule | Today |
|---|---|---|
| `popup/pages/send.vue:190` | sender may take a preselect | both transfer flags |
| `popup/pages/send.vue:194-200` | sender forced | `!hasPrivateTransfers` → public, then `!hasPublicTransfers` → private (the later wins) |
| `popup/pages/send.vue:204` | receiver may take a preselect | both balance flags |
| `popup/pages/send.vue:208-214` | receiver forced | the sender's forced rule, on transfer flags |
| `popup/pages/send.vue:625-629` | a token re-read forces both | the same forced rule |
| `components/composite/send/SendTypesCard.vue:15`, `:22` | the toggles switch | both transfer flags (From), both balance flags (To) |
| `popup/components/modules/send/SelectTokenCard.vue:43-46` | the "restricted" mark | `!hasPrivateTransfers \|\| !hasPublicTransfers`: a sixth copy the issue missed |

- Reuse: `popup/pages/send-sides.ts` already exists (`openingSendSide`, from #1544) with a `test.each` table test.
- Layering: `SendTypesCard` is L3. No production file under `components/composite/` imports `@/popup/**` (grep; `components/stale-network/StaleNetworkTakeover.vue:17` does, outside L3), and CLAUDE.md's L0–L6 model forbids an upward import; Biome's composite override bans stores and service clients only. `components/composite/send/publish-facts.ts` is the precedent for a Send rule that `send.vue` imports from the composite folder.
- Adjacent, not this rule: "neither transfer" (`send.vue:160`, `SelectTokenCard.vue:47-49`, `popup/pages/tokens/[id].vue:299`).

## #1449: the entity forms

- **Verdicts.** `ALREADY_EXISTS` (`utils/entity-rules.ts`, #1543) is the only "Already exists" in code. #1543's PR body: "'Already added' and 'Invalid address' still compare literals, which is #1449's part."
  - "Already added": produced, compared back and displayed in `NewFpcPopup.vue:55`, `:65`, `:184` and `EditFpcPopup.vue:52`, `:91`, `:283`.
  - "Invalid address": produced at `NewFpcPopup.vue:36`, `EditFpcPopup.vue:51`, `NewTokenPopup.vue:45` (compared `:56`, displayed `:345`), `NewSenderPopup.vue:66`, `ImportContactsPopup.vue:49`, `utils/contact-rules.ts:42`.
  - Entity words: "Invalid FPC address" (`NewFpcPopup.vue:34`), "Invalid sender address" (`NewSenderPopup.vue:60`). Edit FPC has no such branch; the tests pin both readings (`NewFpcPopup.test.ts:287`, `EditFpcPopup.test.ts:356`, "63 digits read as before").
  - `NewTokenPopup.vue:47` compares contracts with `toLowerCase()`, after `isFieldAddress(v)` (`:45`). An added token stores `AztecAddress.toString()` (`wallet/services/token/service.ts:809`), but a restored one keeps its backup's spelling (`TokenSchema.contract` is `z.string()`, `wallet/services/token/spec.ts:65`; `service.ts:1077-1078`). `sameFieldAddress` is `packages/wallet-bridge/src/field-address.ts:25`.
  - `isAvailableToAddSender` (`NewSenderPopup.vue:40-48`) reads the shared `isAlreadyExist` computed (`:39`, `sameFieldAddress`), as #1580 left it: nothing left to absorb.
- **Reducers.** `utils/entity-list.ts` `contactListReducers` (add appends; update replaces or appends; delete `withoutId`), called by `NewContactPopup`, `ImportContactsPopup`, `EditContactPopup` (wraps update) and `send.vue`.
  - `NewFpcPopup.vue:101-110`: update ignores an unlisted id. `EditFpcPopup.vue:151-169`: the same, plus the edited row's refresh and close on its delete. The FPC service announces every network's rows (`wallet/services/fpc/service.ts:399`, `:416`, `:477`; known limit #529 for adds).
  - `popup/pages/settings/connected-apps/index.vue:56-76`: update appends; both carry the logo (`hydrateLogo`, previous `logoBlobUrl`); delete is already `withoutId`.
  - `SelectProfilePopup.vue:84-98`: add and update both replace or append; delete splices in place.
  - Not popup form code, other contracts (accept filters, resync, scope gates): `composables/useEntityCrud.ts:127-135`, `utils/account-rows.ts:21-23`, `composables/useIncomingTransfers.ts:131-133`, `composables/useExecutingTask.ts:66-68`.
- **Limits.** Profile name 32: `utils/profile-name.ts:26` (private), `components/composite/ProfileNameField.vue:25`, `EditProfilePopup.vue:154`, `composables/useProfileNameField.ts:102`, `composables/useFullBackupImport.ts:165` (a backup's profile name). `utils/string.ts:52` (`sentenceName`) caps account names in a sentence: another limit. `isDuplicate` (`useProfileNameField.ts:116-119`) and Edit profile's collision (`EditProfilePopup.vue:46-50`, `:82-85`, `:115`) both compare `normalizeProfileName`. `isUnchanged` (`:45`) folds case only, pinned by `EditProfilePopup.test.ts:382`.
- **RPC URL.** `urlTerm.value.length < 5` at `NewEndpointPopup.vue:36`, `EditEndpointPopup.vue:51`, `NewNetworkPopup.vue:68` (`:67`'s empty check is implied by it). No URL helper in `utils/`.
- **Left as they are (same behaviour):** the blank guards (`!v.length`, `!v?.length`, `replace(/\s/g, "")`, `storedNameKey`) and the "changed?" checks (`EditFpcPopup.vue:88`, `EditAccountPopup.vue:38`, `EditNetworkPopup.vue:50`) have no shared helper; `maxLength="25"` on eight entity name fields is an input prop that no rule reads back.
- **Generated types.** `src/utils/` is an auto-import dir (`vite.config` `dirs`); `.github/workflows/_build-extension.yml:119` fails when the build changes `src/types/`.
- **Closed known limits in the area:** #529, #493, #528, #1537, #1615: none is reopened by a no-behaviour move.
