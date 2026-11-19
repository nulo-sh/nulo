# fee-default-1: owner asks

## OA-1: Mainnet, private Fee Juice cannot pay, public Fee Juice can

**Surface.** The app windows' fee card (the execute window, the Change and Revoke authorizations popups) on Mainnet, when no pick is remembered for the account, its private Fee Juice is read as zero (or unread), and its public Fee Juice can pay. Mainnet offers no sponsor.

**Today (and after this lane).** The trigger reads "Select method"; no estimate runs until the person picks a payer. The person can pick Public Fee Juice from the menu.

**Options.**
- **A. Keep it.** Nothing is chosen; the person picks. Paying with public Fee Juice names the account as the fee payer on chain, and the window shows no notice saying so (Send shows one for a private send).
- **B. Default to Public Fee Juice.** The trigger reads "Public Fee Juice" and the estimate runs at once, as Send's public-side walk does. The account's address becomes the transaction's public fee payer without the person choosing it.

**Recommendation.** A. Choosing a payer that publishes the account's address is a privacy call the person should make; the window has no notice for it, and the authorization popups already fall back to public Fee Juice only for a transaction whose calls are public.
