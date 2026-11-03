# w3-popup-1: owner asks

Arc 1 (#1486, #1499, #1406) depended on none of these and shipped in #1580. OA-1 is answered.

## OA-1. #1405: an address pasted with invisible characters at its ends

**Answered: A**, by the owner on decision page 102 (P102-01, signed 2026-11-03, no note): "When the pasted text is an address once the invisible characters at its two ends are removed, the field keeps only the address. It looks exactly as a clean paste does today." Built in arc 2.

**Surface**: Send › Recipient Address, and the same rule in Holdings' search and Send's token picker (their Add token offer).

**Today**: a person pastes an address copied with a trailing space, a no-break space, a tab, a zero-width joiner or non-joiner, or a Hangul filler. The field looks right. After the field loses focus it says "Invalid address", and Confirm stays off. Nothing on screen shows why. The wallet already removes bidi controls and zero-width spaces as text is typed (#1388), but it keeps spaces and joiners, because the same field searches contact and account names.

**Options**

- **A (recommended).** When the pasted text is an address once the invisible characters at its two ends are removed, the field keeps only the address. It looks exactly as a clean paste does today: no "Invalid address", Confirm available once an amount is set. Holdings and the token picker treat such a paste the same way: they show the token if it is listed, else the Add token offer. Text that is not an address (a name, a partial address) keeps its spaces. A space or joiner inside an address is still refused. Three things a person would notice: a padded paste of a saved contact's address shows that contact's card when the field is left, as a clean paste does today; a space typed right after a complete address does not appear; and Holdings offers Add token, or shows the listed token, for a paste with a joiner at its end.
- **B.** Keep refusing such a paste, and make the hint say why. For example: "Invalid address. It has a space or a hidden character." The words are yours to choose. The person must still find and delete a character they cannot see.
- **C.** Leave it as it is.

**Recommendation**: A. The characters draw nothing, with one exception: the Ogham space mark (U+1680) draws a short dash, and A removes it at the edges too, as Holdings' search already does today. The address is unchanged, and nothing is reinterpreted: only characters at the edges go, and only when what is left is a valid address. B asks the person to fix something they cannot see.

**Captures** (Chrome, light, taken on arc 1's smoke build, which does not touch this field): [today, a paste with a trailing space (C)](screenshots/oa1-c-today-trailing-space.png); [a clean paste, which is what A shows for such a paste](screenshots/oa1-a-as-a-clean-paste.png). B is a copy change, described above.
