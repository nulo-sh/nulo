# Phase 1 lessons: chaos-3, arc 1

## 1.1, the model

- **Counter, not a list (D2).** `mintedCredentials(w) = w.next.credential - 1`; the old count of distinct profile credentials undercounted a declined passkey import and a replaced credential. The model test checks, over 1,000 seeds per caps set and both starts, that the counter moves by one exactly at a mint (create, passkey import or restore kept or declined, a method change's new passkey) and never past `credentialSlots`.
- **Draw counts over 1,000 seeds** (Chrome / Firefox / network): the rarest variants are an onboarding reuse (9 / 10 / 11, it needs every profile deleted first) and a passkey account file answered by another credential (35 / 47 / 35). Every variant is drawn on every caps set; the model test pins it.
- **`otherCredentials` changed meaning (D8):** every minted credential but the target's own. The unlock, reveal and account-file `other` variants now also draw a replaced or a declined credential.
- **verifyAll's passkey re-export** protects the re-exported file under the imported file's own password, not a fresh one: that password is already a needle and opens the original, so no new run state is needed. The property checked is unchanged (the re-export carries the imported signing key).
- **Gate ordering.** `typecheck:all` covers the drivers, so the 1.1 gate ran once 1.2's drivers compiled; the model test (30/30) does not import them.
