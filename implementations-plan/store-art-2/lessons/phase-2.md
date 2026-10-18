# Phase 2: review against the captions

All ten new pictures viewed beside the old ones (`S/pairs/old/`) and their captions (`scripts/store-art.ts:18-44`). Every frame: the glyphs draw (Tabler set, no empty box, no icon name as text), no spinner, skeleton or toast, the header chip reads TESTNET; the approve window's account card reads SANDBOX, as in the signed set. Addresses: the staged account `0x0fda…3f4f` and the contact Alice `0x19a4d0…29316d0b`; the activity rows' second line is a sandbox transaction hash. No phrase, password or path. Chunks `IHDR,IDAT,IEND` only (phase 1).

| Frame | Verdict | What changed |
|---|---|---|
| 1 Home | pass | The hero is fixed and the middle scrolls under it (58 px fit, 15 before): the Holdings label and its menu now pass under the hero, and the USD Coin row sits whole just below its shadow, its split readable (250 private, 1,000 public). Private and public marks are a solid and a dotted square, not a padlock and a globe. Incoming chips drop under the row title. Type scale, Tabler glyphs (nav, lock, row icons). `$1,250.00`, `1,000 FJ` twice; the second activity row is whole above the nav. |
| 2 Send | pass | The publish strip's marks are squares, not padlocks. Meta text at 13 px (`≈ $120.00`, `250 USDC`). Alice's card, both toggles private (labels under the header, as before), the amount line clear of the footer (46 px fit), You, To and Amount hidden. |
| 3 Approve | pending owner (OA-1) | The new last row, "Let this app list all your accounts", has a description line, which the sticky footer cuts in half; before, the row was "See Account 1's address" with no second line, and only the next row's top edge showed. The app's icon is the apps grid, the account's mark a square check. Both buttons and the first two grant sections are whole; the caption holds. |
| 4 Security (Lock page) | pass | The Lock now card lost its padlock (settings rows carry no leading glyph). Lock now, strict mode naming the password, Auto-lock 30. |
| 5 History | pass | Dated Oct 18, 2026. Both incoming chips drop under their titles and stay whole; the outgoing row keeps its chip inline. Type scale and glyphs. |

D4 for frame 3: the spec frames the permission window "as the window first shows it" (`store-captures.test.ts` header of `captureApproval`) and meets that, so the cause is the window's new wording, not the spec: branch (b), an owner ask, and the set ships as produced.
