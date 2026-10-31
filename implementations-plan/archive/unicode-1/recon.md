# unicode-1 recon

Base: `origin/dev` at `13bb2133c`. Two Sonnet explorers (a reuse sweep and a flow map), then the planner's own reads. Paths are under `apps/extension/src` unless they start with `packages/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Strip invisible and direction characters | `stripWireControl` in `wallet/services/dapp-session/capability-meta.ts:155-159`: `\p{Cf}` (bidi embeddings, overrides, isolates and marks; zero-width space, joiner and non-joiner; word joiner; soft hyphen; BOM; tags), variation selectors, C0/DEL/C1. `sanitizeWireString` adds a code-point cap. Tests per class at `capability-meta.test.ts:63-127`. About 15 render sites, `utils/clipboard.ts:32` and `utils/string.ts:54` (`isBlank`) use it. | build new beside it (plan D1): it also strips joiners, selectors and tags, which shape emoji and scripts a person types; it stays the display rule for a dApp's strings |
| A second invisible class | `utils/contact-name.ts:11`, `INVISIBLE = \p{Default_Ignorable_Code_Point}`, inside the contact-name rules (allowlist after it). | leave: contact names are out of scope and stricter already |
| An allowlist for names | `sanitizeString` (`utils/string.ts:36`; copy in `packages/design/src/internal/sanitize.ts`, pinned by `sanitize-parity.test.ts`): letters, digits, space, `-._`. The design `Input`'s `sanitize` prop runs it. | not for these fields: it drops emoji and punctuation an alias may hold |
| A field-level text rule | `packages/design/src/ui/Input.vue:137-140,189,278`: the `normalize` prop maps typed and pasted text to the kept text; `v-model` writes it back to the DOM and skips while an IME composes. Used by `ContactFormFields.vue:29` (`typedContactName`). Tests `Input.test.ts:142-170`. | reuse as is (Send recipient, Settings search) |
| Writing a native input back | `AmountCard.vue:96-101` (`showText`, amount-specific caret). No generic helper (searched `setSelectionRange`, `selectionEnd`). | not needed: the alias field takes `v-model` on a local ref, the mechanism `Input` uses |
| Address validity | `utils/aztec-address.ts:24` `isValidAztecAddress` (`isValidHex` `^0x[a-fA-F0-9]{64}$` plus the curve check). | reuse as is |

Absence trail for "no other typed-text strip": `\p{Cf}`, `​`, `‮`, `200B`, `202E`, `FEFF`, `zero-width`, `bidi`, `invisible`, `control char`, `NFKC`, `NFC`, `.normalize(`, `stripWireControl`, `sanitizeString` over `*.ts`, `*.vue`, `*.json`, `node_modules` excluded.

## The three fields

- **Send recipient.** `send.vue:225` `searchTerm` ⇄ `RecipientField.vue:28,250` ⇄ `AddressInput.vue:59` (`$attrs` to `Input`) ⇄ `Input.vue:347-348`. No transform: no `sanitize`, `normalize` or `maxLength`. Raw readers: the hint (`RecipientField.vue:68`), the blur auto-pick (`:83-85`, strict `===`), the suggestions (`recipient-search.ts`, which folds invisibles for names but compares addresses raw), the Confirm gate (`send.vue:232,339`), the fee key and estimate (`:380,636,649`), the destination (`:521`), the review sheet (`:933`). Programmatic writes (`:675`, `RecipientField.vue:72`) take stored contact or account addresses.
- **App alias.** `AccountSelectRow.vue:100-108`: a bare `<input :value="alias ?? account.name" @input="emit(..., value)">`. Parent `capabilities/index.vue:424` stores it; `:284` falls back to the account name only when the alias is `""`. `wallet-bridge` `capability-negotiation.ts:445-469` copies it verbatim into the session; `dispatcher.ts:454` returns it to the dApp. `dapp-session/spec.ts:105` is `z.string()`. Rendered raw at `pages/settings/connected-apps/[id].vue:159-163,270`. `setAccountAliases` has no UI caller; the window is the only writer.
- **Settings search.** `SettingsSearch.vue:14,71-79`, a design `Input` with no transform. `settings/index.vue:35` holds the query as `ref("")`; nothing else writes it. `utils/settings-search.ts:389-391` `fold` removes combining marks only.

## #1388's unexplained half

`showInvalidHint = !isSearchInputFocused && !isValidAztecAddress(term) && term.length > 0`. Every path ends the focused flag: Tab or touch through the 250 ms timer (`:93-95`); a mouse or pen press through `endHold` at pointerup, click capture, pointercancel or window blur (`:109-148`). A refocus during the hold drops the hold. So on the code read the hint shows for the lab's input once the field loses focus. Not reproduced yet; Phase 1 tries both layers.

## Tests and e2e that reach the fields

- Unit and component: `capability-meta.test.ts`; `RecipientField.test.ts` (hint at `:101-120`; the real `AddressInput`+`Input` mount at `:304-309`; the press-hold describe at `:454`, no hint assertion); `AccountSelectRow.test.ts:117`; `SettingsSearch.test.ts` (real `Input`); `recipient-search.test.ts`; `send.test.ts` stubs `RecipientField`.
- Smoke: `tests/e2e/send-keyboard.test.ts`, `send-picker-add.test.ts`, `type-roles.test.ts` (Send recipient); `settings-routes.test.ts` (Settings search). No smoke file opens the capabilities window.
- Network: `tests/e2e/network/cap-window.test.ts`, `cap-widening.test.ts`, `meta-getAccounts.test.ts` type into the alias field through `fixtures/popups.ts:279-292` (native setter plus an `input` event).

## Neighbours

- #1380 (open, another lane) changes how the execute window marks stripped characters in a dApp's string. It may touch `safeWire` or `sanitizeWireString`; this lane reads `stripWireControl` and adds tests beside it, so a conflict stays in one test file.
- Closed known limits searched (`invisible OR bidi OR zero-width OR unicode`): none on these fields.
- Layering: `biome.json:409-455` lets components and windows import `capability-meta` (precedent `DetailsTable.vue:9`, `DappIdentityBlock.vue:7`). `packages/design` cannot import the extension, so the rule reaches `Input` through `normalize`.
