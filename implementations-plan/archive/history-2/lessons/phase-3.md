# Phase 3: the window's retry and the locked card

- As built, `index.test.ts`'s shared map fake only clears `failed[key]` on `estimate` and `cancel` (what the window reads at once); each new case sets results and estimating itself, as the file's other cases do. Making the shared fake clear results too would have reached into every existing case for nothing.
- The window's toast double became the same pass-through to the real singleton as the popups' (D10); every existing `toastMocks.openToast` assertion still holds.
- `scope-follow.test.ts`'s map fake needed `failed` (the template reads it at render); no other double broke (`bun run test`: 953 files green).
- Cancelling on withdrawn settings (D9) broke no existing case.
- The locked row's ring is inset (`outline-offset: -2px`): the card's `overflow: hidden` would clip one drawn outside.
- Base proof (sources from `f738cba62`): five new cases red (the window's three, `OperationCard.fee`'s, the locked focus); "a snack opened after the failure" passes on the base by design, as the never-happens control beside the closing case. Restored from `99b1f1d74`.
- Gate: lint 0, typecheck:all 0, 43 files / 1077 tests at retry 0, `bun run test` exit 0.
