# fee-public-warning-build-1: owner asks

## OA-1: should a Mainnet app window read the account's balances fresh when it opens, as Send does?

**Surface.** The app windows' fee card (the execute window, the Change and Revoke authorizations popups) on a network that offers no sponsor (Mainnet), with nothing remembered for the account.

**Built.** The window opens on Public Fee Juice when its balance read shows private Fee Juice empty and public Fee Juice able to pay (page 198). That read may be the wallet's cached one, up to five minutes old, refreshed early only by this wallet's own transactions (#1889). Send reads fresh on every opening for exactly this reason: its own move to Public Fee Juice rests on a private balance read as empty.

**What can happen.** The person follows the warning's "Get private Fee Juice", bridges on Shield, and opens an app window within five minutes. The cached read still says private Fee Juice is empty, so the window opens on Public Fee Juice, with the warning and the bridge link again instead of "Pay it from private Fee Juice". Nothing is sent without Confirm, and the warning is on screen.

**Options.**
- **A. Keep the cache (built).** Windows open as fast as today; the case above can occur for up to five minutes after a credit made outside the wallet.
- **B. Read fresh on Mainnet windows**, as Send does. The default always rests on a current balance; every Mainnet app window waits for a fresh read of both balances before its fee settles (Send's wait), and each Revoke chunk's card asks for its own.

**Recommendation.** B, for Mainnet only: it is the rule Send already follows for the same decision, and the wait is Send's. A one-line change (`forceRefresh` in `useFeeSelection.ts`), with a test.
