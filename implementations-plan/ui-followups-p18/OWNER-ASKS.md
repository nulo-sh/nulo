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

The five popup captures they frame (`store/captures/{home,send,approve,security,history}.png`, 720×1200, dark theme) were written on 2026-10-06. Since then the type roles changed the face, size, weight, case or tracking of text on every one of those screens, and #495 and arc 1 of this lane moved meta text to the secondary grey. The captions and the frame layout do not change.

| Option | What you see on the listings |
|---|---|
| **A. The regenerated set** | The five screenshots above, rendered from new captures of the wallet as it ships after arc 1: the same five screens, the same captions, today's type and greys. The five captures are replaced too (11 files). The promo tile uses no capture, so it changes only if its render differs. Addresses and hashes in the frames differ from the old set, because each capture run stages a fresh sandbox wallet; balances, prices and names are pinned and stay the same. |
| **B. Keep the current set** | The listings keep showing the type and greys of 2026-10-06. |

**Recommendation: A.** The listing then matches the wallet a person installs.

**Side-by-side:** produced by [plan.md](plan.md) phase 3, after arc 1 merges, so the new captures carry arc 1's greys: one old | new composite per listing image (six), with the five old and new raw captures beside them, in the lane's scratch directory, with the SHA-256 of each of the 11 new files. Not yet produced.

**What ships now:** nothing. The committed images stay as they are until you answer. On A, arc 2's PR commits exactly the files you saw, byte for byte (no second capture run). On B, the images stay, #364 is closed as not planned with your answer, and arc 2's PR carries only the plan's close-out, the store-art README line (it names three screenshots of five) and any fix the capture tool needed. Uploading the images to the store dashboards stays your manual step, as today.

## SA-2. The tx detail page's fee toggle dims its text on hover

Found by arc 1's review; arc 1 ships without it, and nothing changes until you answer.

**Surface:** a tx detail page, Details: the "Fee paid" / "Estimated fee" row when it opens the gas breakdown, and the developer panel's toggle below it. Both buttons compose `disclosure_toggle` (`apps/extension/src/popup/components/modules/tx/tx-shared.module.css`), whose hover sets `opacity: 0.8` on the whole row. That predates arc 1: the row's label and estimated value were already in `--nulo-secondary`, and arc 1 moves the fee's dollar figure there too.

| Option | What you see |
|---|---|
| **A. Keep the dim (today)** | Hovering the row fades it to 80%. Its grey text reads 3.5:1 in light and 4.4:1 in dark while the pointer is on it, under the 4.5:1 text minimum; at rest it reads 5.3:1 and 6.4:1. |
| **B. No dim on hover** | The row keeps full strength under the pointer; the pointer cursor and the chevron stay the only hover cue. The text keeps 5.3:1 and 6.4:1. |

**Recommendation: B.** The fade is the only thing that takes this text under the minimum, and the cursor already says the row opens.
