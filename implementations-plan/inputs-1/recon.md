# inputs-1 recon

Read at `origin/dev` `9ce6bb0bd`. One Explore sweep (sonnet) plus the planner's own reading of each issue's file:line.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Count what a person sees as characters | none: no `Intl.Segmenter` or grapheme count in `apps/` or `packages/` (searched `Segmenter`, `graphem`, `codePoint`, `[...x].length`, `Array.from(x).length`); `packages/token-list/src/parse.ts:86` counts code points; `sanitizeString` and Input `maxLength` count UTF-16 units | build new, private to `utils/password.ts` (one rule, one caller module) |
| Keep the caret through a rewrite | `caretAfter` (`composite/send/amount-field.ts:91`), used by `AmountCard.vue:95-100`; Input's `maxLength` paste path (`Input.vue:273-290`) | reuse as-is for Send; Input's `int` branch restores the edit's own range (no shared helper: the design package cannot import the extension) |
| Split an edit into before / inserted / after | `splitEdit` (`amount-field.ts:44`) | reuse inside amount-field; the `int` branch needs only the prefix and suffix lengths |
| A message bound to the value it judged | `useFormState` field errors are computeds of the value (`useFormState.ts`), so "Invalid address" / "Already exist" are always current; the submit error in `NewTokenPopup.vue:69` is a plain ref cleared only on submit, show and hide | adapt: clear the ref when the address changes |
| The Send field's own error line | `readHint` lines `send-amount-unreadable-hint` / `-ambiguous-hint` (`AmountCard.vue:531-537`), lifetime set by `settle` (`amount-field.ts:79-85`) | reuse as-is ("Not an amount. Type it like 1234.56") |
| A design Input error state | `error` prop → `.base.error` red underline (`Input.vue:336,414`), `ariaInvalid` passthrough (`:360`) | reuse the style; the `int` subtype sets it itself |
| Numeric fields | Send amount (`AmountCard.vue`, raw input) and Settings → Lock (`lock.vue:252`, the only `subtype="int"` caller); Display's dust threshold (`display.vue:235`) parses strictly on `change` and snaps back, a different pattern | change the two; leave Display |

## Claims checked

- #1389 holds: `clean` (`amount-field.ts:41`) drops `[^\d.,]` from a keystroke and `settle` gives a read hint after a keystroke only while one already shows. The keystroke already keeps the caret (`caretAfter`); what is missing is the sign. A dropped second point or comma (`placePoint`, `amount-field.ts:60`) is silent too: typed `1.000.000` reads `1.000000` and rests as `1`.
- #1390 holds, with one correction: at the end of the text the `int` branch already refuses the character at each keystroke (`Input.vue:220`), so the brief's rule changes nothing for the lab's steps unless the field also signs the refusal; the caret jumps to the end only for a key typed inside the digits (v-model re-render). A paste of `1.5` saves `15` with a success toast.
- #1391 holds: `password.length` at `utils/password.ts:2,7,9`. The same function guards two worker paths (`profile/service.ts:1389`, `account/service.ts:110`); both judge a NEW password, no read path (unlock, opening a file or backup) applies the rule, so nothing stored becomes unopenable.
- #1393 holds: `error` is set at `NewTokenPopup.vue:177,211,266` and cleared at `:181,282,293` only; the green check (`:329`) is `isAvailableToCreateToken`, a format gate.

## Collisions and side observations

- `Input.test.ts:222` pins the `int` branch's strip-and-join ("a minus typed before 5 shows 5"); the change rewrites those cases.
- Known limit #1154 (Input `int` with `maxLength` / `clearable`, IME full-width digits) stays a limit: the only caller sets neither.
- `normalizeAmount` (`utils/amount.ts:30`) replaces any typed whole part at or above 9 999 999 999 999 with `9999999999999`, silently: a value cap, not a refused character; outside this lane.
- E2E: no smoke spec types into `send-amount-input` (the smoke wallet is unfunded, the field disabled); real typing is only in `tests/e2e/network/send-amount-clamp.test.ts` and `send-amount-exact.test.ts`. `security.test.ts` fills `auto-lock-input` through `replaceInputValue` (value setter, digits only). `settings-crud.test.ts:286` types `not-hex` into Import token. `new-token-error` has no e2e.
