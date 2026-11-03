# fixes-1.2.0-2 owner asks

Arc 1 (the batch cap) touches nothing a person sees and runs now. Arc 2 removes the Sponsored row on Alpha Mainnet under your sign-off of 2026-11-03 ("sponsored FPC being hidden via a fixed per-network list please"); one detail of it was yours, answered below.

## OA-1. A saved "Sponsored" pick on Alpha Mainnet, while a fee card loads (arc 2)

**Answered 2026-11-03: B** (decision page 106, P106-03, signed 19:59 UTC at `df26e450b`, no note), as the page put it: "Also hold the preview: on every network the fee button shows no saved label until the fee list has confirmed that method is available. No label a person cannot pick is ever shown, at the cost of the label arriving a beat later on every open." Built as signed: an unread or failed list shows no sponsor label either (plan D9).

- **Surface:** the fee method trigger on Send and in the app approval windows, on Alpha Mainnet, for a person who once picked "Sponsored" there. While a fee card loads (seconds on a real node), its trigger shows the saved pick's label before the card knows which methods exist; today that label is "Sponsored".
- **A (recommended).** When the wallet removes the Mainnet Sponsored row, it also tries to forget the saved picks naming it, as deleting a fee payer in Settings does. "Sponsored" may still appear on the trigger during the first load after the update, then the method the card will use. It can recur while loading if that forget fails (for example, the wallet locked at that moment) or if a card that stayed open still holds the pick, until the person picks a method.
- **B.** A, plus: once the account's fee payer list has been read and does not contain the saved sponsor, both the Send trigger and the app windows' trigger stop showing it. Until the balances finish loading, the trigger may then show no method. A list that is still unread, or failed to read, removes nothing. This applies on every network, so a hand-added sponsor someone deleted stops being previewed too.
- **C.** No forget: a fee card that reads the saved pick previews "Sponsored" while loading, on every load, until the person picks another method once.
- **Recommendation: A.** Only people who picked Sponsored on Mainnet, where it never paid, can see it; B changes the loading preview on every network for that case.
