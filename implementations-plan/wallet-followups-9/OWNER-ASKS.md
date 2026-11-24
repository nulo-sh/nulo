# wallet-followups-9: owner asks

Each ask shipped with the recommendation built, so the frames showed it. **Answered** on decision page 203 (signed 2026-11-24): OA-1 A; OA-2 A, with the bound at 77 ("This token has more than 77 decimals. Nulo supports up to 77."); OA-3 B. The plan's § The owner's decisions quotes them; the tables below are the asks as put, at the first build's 18.

## OA-1: how Delete profile names a chain with no network row (#1925)

**Surface:** Settings → Security → Delete profile, the "Imported accounts" list. Rows on a network show the name and the short address, as today; only a row whose chain has no network row gets a chain label.

| Option | The row's second line | Note |
|---|---|---|
| **A (recommended, built)** | `AZTEC:677692 · 0x1d7a…4d19` | What the wallet already prints for a chain it has no name for (`getChainName`, Connected apps' account rows). |
| B | `Chain ID 677692 · 0x1d7a…4d19` | Echoes the restore page's "Waiting for a network with chain ID 677692". New words. |
| C | `0x1d7a…4d19` (no label) | Same as the other rows; two rows of one address on two chains look identical. |

## OA-2: the words when New token refuses a token with more than 18 decimals (#1926)

**Surface:** the New token popup and the Holdings paste field, under the address. No existing sentence fits: the form's interface refusal says it could not detect the token's interface, which is false for a standard token configured with more than 18 decimals (the review of arc 2), and its other refusal invites a retry that fails the same way. So the built option is new words.

| Option | Text | Note |
|---|---|---|
| **A (recommended, built)** | "This token has more than 18 decimals. Nulo supports up to 18." | New words; exact; the number comes from the one bound. |
| B | "Couldn't auto-detect this token's interface. Try a contract whose ABI matches a known standard." | Existing words; false for a standard token past 18 decimals. |
| C | "Something went wrong. Try again." | Existing words; wrong advice, since a retry fails the same way. |

## OA-3: does Send say why it refuses a stored token past the bound (#1926)

**Surface:** Send, with a token picked whose stored decimals are past 18 (only a row added before this change can hold one; no seed or list entry can).

| Option | What the person sees | Note |
|---|---|---|
| **A (recommended, built)** | The token row reads "—" in the picker, as on Home; Send takes no amount (no USD rate, no conversion, Max fills nothing) and Review stays disabled, with no new words. | The wallet's existing treatment of a token whose decimals it does not know. |
| B | As A, plus a line under the amount: "Nulo can't send this token." | New words. |
| C | The picker leaves such a token out. | A row disappears from one list but not from Home. |
