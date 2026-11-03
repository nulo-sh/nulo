# w3-dapp-1 owner asks

## OA-1: a call's string argument the card cannot print whole (#1380, arc 2)

**Answered 2026-11-03: E** (decision page 101, P101-01, signed 18:20 UTC at `250cec0a6`), with A's treatment for a string still unprintable. The owner: "How would a non-ascii thing look this way? What I am trying to maximize is the UX... So if they want to sign a memo with "José" they should be able too, but I don't want to: 1. Break everything else just because of it. So we may need to evaluate correctly when to parse this way; 2. Put the user at risk just cause." Built in arc 2 except the case OA-2 holds.

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

## OA-2: text whose every character is Latin-1 has two encodings that read alike (#1380, arc 2)

- **Surface**: the execute window, a call's or a grant's string argument whose text is accented Latin-1 only, such as "José", "café", "Zürich" or "Ñandú".
- **The ambiguity**: a contract's `str<N>` is bytes, and Noir writes text as UTF-8, so "José" is `4a 6f 73 c3 a9`. The SDK's encoder writes one field per JavaScript character instead, so a dApp passing "José" through it sends `4a 6f 73 e9`. Today the card reads one character per field: the first prints "JosÃ©", the second "José". Read as UTF-8, both would print "José": two different arguments, one text on screen, and only the UTF-8 one is the contract's "José".
- **Built (A for this case, as the pick's note asks)**: such text keeps today's reading, composed or decomposed ("José" as `e` plus a combining accent draws like the SDK's "José", so it stays bytes too). The SDK's "José" prints "José"; the UTF-8 "José" prints "JosÃ©"; UTF-8 text whose Latin-1 bytes are control characters ("Ñ" is `c3 91`) reads as unreadable, as option A does. Text holding any character beyond Latin-1 has no one-byte twin, so it prints as written: "€", "José — café", "日本", "Ω".
- **Options**:
  - **Keep as built.** Two arguments never read alike; UTF-8 accented text keeps its mojibake.
  - **Read the UTF-8 form as written too.** "José" prints for both encodings; the card can no longer tell them apart, and a contract keyed by the text sees two different keys.
  - **Read the UTF-8 form as written, and the SDK's one-byte form as unreadable.** Faithful to the contract; a dApp that passes "José" through the SDK's encoder shows "Can't read the arguments" (a call stays approvable, a grant is refused).
- **Recommendation**: keep as built: it keeps every reading the card prints whole today and never shows two arguments as one text.

## OA-3: right-to-left text (#1380, arc 2)

- **Surface**: the execute window, a call's or a grant's string argument holding Hebrew, Arabic or another right-to-left script.
- **The risk**: printed as written, right-to-left letters reorder the digits and words around them with no control character: the bytes of `12א34` draw as `34א12`. That is #1380's own consequence, a string read in another order than the contract holds, and today's card never shows it, since its one-character-per-byte reading holds no right-to-left letter.
- **Built (A for this case)**: a string holding a character of a right-to-left block reads as unreadable: the existing notice and raw toggle, a call still approvable, a grant refused. Most such UTF-8 text already reads that way today, because its bytes carry control characters.
- **Options**:
  - **Keep as built.** Right-to-left memos never print, so nothing reorders.
  - **Print right-to-left text, drawn strictly left to right in stored order** (a style on the value). Nothing reorders, but a Hebrew or Arabic reader sees each word reversed. A new look for the row.
  - **Print right-to-left text as written.** Reads naturally; digits and words around it can swap places on screen.
- **Recommendation**: keep as built.
