# send-side-1 owner asks

The owner decided #1341 on 2026-10-28 ("B, keep the side"). One edge of that decision is left to the owner, since both reviewers doubted that the decision's words settle it (plan I2).

## 1. After a paste-to-add, does Send keep a side the old token forced?

- **Surface:** Send's From origin and To destination pair, right after a token imported from the picker comes back picked.
- **The case:** the token on Send has no private transfer. This happens with a token a dApp registered with only public functions. From and To then sit on Public, and the person cannot switch them. The person types an amount, pastes an address in the picker and imports a full token, which has both sides.
- **Option A, keep what was shown:** From and To stay on Public, with the amount typed against the Public balance. This follows the decision's words, "From and To stay where the person had them", and the reason it was recommended, "the form as you left it". The person sees PUBLIC selected and the strip says the send is public. Public stays selected though the person never chose it; they can switch to Private.
- **Option B, keep only a side the person chose:** a side the old token forced goes back to Private, as it does today. The person sees PRIVATE selected, and a new token's private side often reads "0" with "More than your balance". It keeps the wallet's private default when the person never picked Public.
- **Recommendation:** A. A forced side and a chosen side read the same to the person: the form they left. B adds a check on the old token's flags in the token watcher, plus one test row.
- **What the arc builds without waiting:** A, the plan's code as written, with no extra check. Its PR names this ask, and it does not merge before the owner answers. If the owner picks B, the arc adds the check and the test row named in plan I2; nothing else in the arc changes.
