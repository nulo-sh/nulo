# w3-dapp-1 owner asks

## OA-1: a call's string argument the card cannot print whole (#1380, arc 2)

- **Surface**: the execute window, a call's argument rows (the decoded view of `aztec_sendTx` calls and of the authorizations it lists).
- **The state**: a call's string argument holds characters the card removes before printing (direction marks such as U+202E, zero-width characters, control characters) or cannot draw (a lone surrogate). Two sources: a hostile dApp, and real non-ASCII text. A contract string reaches the card one byte per character, so UTF-8 text whose bytes include 0x80-0x9F carries control characters: an em dash, a euro sign or an emoji does. "José" does not: it already prints as "JosÃ©" today, and so does most non-ASCII text the options below leave decoded. Much Chinese, Japanese and Korean text carries such bytes too.
- **Today**: the row prints the string with those characters gone, as if whole: `memo: payevil` for `pay` + U+202E + `evil`. Nothing says something was removed. A grant with the same string is already refused ("Can't read the arguments", Confirm disabled).
- **Options**:
  - **A (recommended, with E filed as its own issue if you want real text to print as written)**: the call reads as unreadable, the rule grants use, but stays approvable as an unreadable call is today. The card shows the existing notice "Can't read the arguments. The arguments don't fit the *interface*.", the "Show N raw values" toggle with the 32-byte fields (the first 32 shown, each character as hex; the JSON view holds the rest), and the window's existing line "Check what the app says this does before approving." The call's section opens on its own, as for any unreadable call. No new copy. Weak points: "don't fit the interface" is not the real reason (grants already use the same words for it), and a legitimate memo with an em dash, a euro sign, an emoji or such CJK text reads as unreadable too.
    ```
    Can't read the arguments
    The arguments don't fit the interface.
    Show 3 raw values
    ```
  - **B**: as A, with a fifth reason and its own line, for example "Some arguments hold characters Nulo can't show." New copy (title kept).
  - **C**: the decoded rows stay; the string row gets a mark after the value, for example `memo: payevil · hidden characters`. New copy and a new row state.
  - **D**: refuse the request, as for a grant (error row, Confirm disabled). Blocks every call whose string holds such characters, real text with an em dash or an emoji included.
  - **E (larger, combinable with A, B or C)**: the card reads a string's bytes as UTF-8, so "José" and "€" print as written and only text that is still unprintable (or a character no byte can hold) gets the A, B or C treatment. Changes how every non-ASCII string looks, and the grant rule with it; its own scope.
- **What ships now**: arc 1 does not touch the execute window. Arc 2 starts once this is answered and builds the option picked; its PR carries before/after captures, light and dark.
