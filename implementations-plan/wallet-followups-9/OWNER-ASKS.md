# wallet-followups-9: owner asks

Each ask ships with the recommendation built, so the frames show it; the PR waits for the owner's word.

## OA-1: how Delete profile names a chain with no network row (#1925)

**Surface:** Settings → Security → Delete profile, the "Imported accounts" list. Rows on a network show the name and the short address, as today; only a row whose chain has no network row gets a chain label.

| Option | The row's second line | Note |
|---|---|---|
| **A (recommended, built)** | `AZTEC:677692 · 0x1d7a…4d19` | What the wallet already prints for a chain it has no name for (`getChainName`, Connected apps' account rows). |
| B | `Chain ID 677692 · 0x1d7a…4d19` | Echoes the restore page's "Waiting for a network with chain ID 677692". New words. |
| C | `0x1d7a…4d19` (no label) | Same as the other rows; two rows of one address on two chains look identical. |

## OA-2: the words when New token refuses a token with more than 18 decimals (#1926)

**Surface:** the New token popup and the Holdings paste field, under the address.

| Option | Text | Note |
|---|---|---|
| **A (recommended, built)** | "Couldn't auto-detect this token's interface. Try a contract whose ABI matches a known standard." | The form's existing refusal for a contract it cannot add; no new words. Reads as "not a standard token", which is true of a token past 18 decimals. |
| B | "Something went wrong. Try again." | The form's other existing refusal; wrong advice, since a retry fails the same way. |
| C | "This token uses more than 18 decimals. Nulo supports up to 18." | New words; exact. |
