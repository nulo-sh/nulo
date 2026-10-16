# Owner asks: ui-followups-p18

Decision page 18 (P18-06, option C) signs every rule arc 1 moves, and decision page 17 (P17-01, option A: "the wording as shipped") already signs the #451 lock wording, so neither needs an ask. SA-1 is the store art (#364): nothing replaces a store image before you sign the new set. SA-2 is a hover fade arc 1's review found on the tx detail page.

## SA-1. #364: replace the store listing images with the regenerated set

**Surface:** the Chrome Web Store and Firefox Add-ons listing images, committed in `apps/extension/store/`:

| File | Size | What it shows |
|---|---|---|
| `screenshot-1-1280x800.png` | 1280×800 | Home, "Nothing to see. Everything to own." |
| `screenshot-2-1280x800.png` | 1280×800 | Send, "Private by default." |
| `screenshot-3-1280x800.png` | 1280×800 | The connect window, "Apps have to ask." |
| `screenshot-4-1280x800.png` | 1280×800 | Settings → Lock, "Your keys stay with you." |
| `screenshot-5-1280x800.png` | 1280×800 | History, "Everything recorded. You decide what's read." |
| `promo-440x280.png` | 440×280 | the promo tile |

The five popup captures they frame (`store/captures/{home,send,approve,security,history}.png`, 720×1200, dark theme) were written on 2026-10-01 (the date History shows) and committed on 2026-10-06. Since then the type roles changed the face, size, weight, case or tracking of text on every one of those screens, and #495 and arc 1 of this lane moved meta text to the secondary grey. The captions and the frame layout do not change.

| Option | What you see on the listings |
|---|---|
| **A. The regenerated set** | The five screenshots above, rendered from new captures of the wallet as it ships after arc 1: the same captions, today's type and greys. Three frames also show what changed in the wallet since 2026-10-01: frame 4 is the Lock page (Lock now, Strict security mode, Auto-lock timeout), where the old frame showed a Security page with a "Backup profile, Get your recovery phrase" row; frame 2 (Send) gains the "Select asset" label, and the scroll that keeps the amount line clear of the footer now tucks the "From origin" / "To destination" labels and the top edge of the two Private/Public toggles under the sticky header; frame 5 (History) is dated Oct 16, 2026. The five captures are replaced too (10 files change). The promo tile uses no capture and rendered byte-identical, so it does not change. Addresses and hashes in the frames differ from the old set, because each capture run stages a fresh sandbox wallet; balances, prices and names are pinned and stay the same. |
| **B. Keep the current set** | The listings keep showing the type, greys and screens of 2026-10-01. |

**Answer: A**, decision page 24, P24-01, 2026-10-16 12:48Z, no note.

**Recommendation: A.** The listing then matches the wallet a person installs. If frame 2's tucked labels should stay in view, say so with your answer: that is a change to the capture tool's Send framing and a new set you see again before anything is committed.

**Side-by-side** (produced 2026-10-16 at dev `71f98db4`, which carries arc 1; one capture run, green at retry 0 with no fix to the tool), in `~/.cache/nulo-backlog/program-2/shots/store-art/`:

- `compare/compare-screenshot-{1..5}-1280x800.png` and `compare/compare-promo-440x280.png`: old on the left, new on the right, one per listing image.
- `old/` and `new/`: both full sets in the store's layout (`captures/*.png`, `*.png`), with `SHA256SUMS-old` and `SHA256SUMS-new` beside them.

The SHA-256 of the 11 new files, which arc 2 checks before it commits them on A (`sha256sum -c` in `apps/extension/store`):

```
0b9e260ad60d126bbf8a2950c2479fe5d847eed6326cd8c114458c7dddbe3c6a  captures/approve.png
d392f0d4386bbf41b5bedc8629d84691d867990c2c5bd86e0676a04a8be2f6dc  captures/history.png
ba94bb04c03c3efc527a0082bcf0ba8ec364904d66f6e7c4cfefe68377f8448b  captures/home.png
13663e7d77c5a9520a685b74f98e2377fe6584bd441fb1e37791833e4ce56b85  captures/security.png
f96e3c98b84788233235c120dde8741d6b42621fc52efdc4ec76f31f71dba9fd  captures/send.png
05381c4bdde67af68d8f1661caefc85346975f1eed81855d1a29d5b2e995999e  promo-440x280.png
8e7bd6dd3237e264ec968b0eb0f75f1fd2f1d49f03db99262cdd998c76c93a03  screenshot-1-1280x800.png
4a84edd064681cf906d50fac1ec1ed3e79a925e5966201225dd589fa3b565649  screenshot-2-1280x800.png
e249118bcfb50f4beaad7e82f522306a3b8bf9bfdc15877481be545e8912f64b  screenshot-3-1280x800.png
527c071836888a2c5db181e1b083d68d5ebb08007fef2985bb5b0c0ccdb76cef  screenshot-4-1280x800.png
bd3cf79ca6f5c40be6686c6bcff0a14b74f6216f6d1638bfd4a1da7e60d29aa5  screenshot-5-1280x800.png
```

No frame shows a recovery phrase or a local path; the PNGs carry no text chunks.

**What ships now:** nothing. The committed images stay as they are until you answer. On A, arc 2's PR commits exactly the files you saw, byte for byte (no second capture run). On B, the images stay, #364 is closed as not planned with your answer, and arc 2's PR carries only the plan's close-out, the store-art README line (it names three screenshots of five) and any fix the capture tool needed. Uploading the images to the store dashboards stays your manual step, as today.

## SA-2. The tx detail page's fee toggle dims its text on hover

Found by arc 1's review; arc 1 ships without it, and nothing changes until you answer.

**Surface:** a tx detail page, Details: the "Fee paid" / "Estimated fee" row when it opens the gas breakdown, and the developer panel's toggle below it. Both buttons compose `disclosure_toggle` (`apps/extension/src/popup/components/modules/tx/tx-shared.module.css`), whose hover sets `opacity: 0.8` on the whole row. That predates arc 1: the row's label and estimated value were already in `--nulo-secondary`, and arc 1 moves the fee's dollar figure there too.

| Option | What you see |
|---|---|
| **A. Keep the dim (today)** | Hovering the row fades it to 80%. Its grey text reads 3.5:1 in light and 4.4:1 in dark while the pointer is on it, under the 4.5:1 text minimum; at rest it reads 5.3:1 and 6.4:1. |
| **B. No dim on hover** | The row keeps full strength under the pointer; the pointer cursor and the chevron stay the only hover cue. The text keeps 5.3:1 and 6.4:1. |

**Answer: B**, decision page 23, P23-01, 2026-10-16 12:47Z, no note.

**Recommendation: B.** The fade is the only thing that takes this text under the minimum, and the cursor already says the row opens.
