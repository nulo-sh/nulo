# Owner asks: icons-1

The owner's pick is signed (P48-01 C, #764). The lane brief delegates the stroke, the fill rule and the near rows to the plan; the plan keeps every signed pick and stroke 2 at every size. One ask is open, and the PR waits on it (plan D6).

## Ask 1: the public mark at 10 px on a 1x screen is not a dotted square

**Surface.** The public balance mark at 10 px: Send's fee method row (`FeeMethodSelector.vue:36`), the review sheet's rows (`SendReviewSheet.vue:143`) and the publish strip (`PublishStrip.vue:31`). The glossary says "Anyone can see it, like a balance on Ethereum. Marked with a dotted square." (`glossary.ts:20`).

**What the check found.** Tabler's `square-dashed` repeats a dash every 4 units. At 10 px that is 1.67 screen pixels, so on a 1x screen the dashes blur into a thin gray hollow square. Along each side the darkness stays between 77 and 105 out of 255, in Chrome and in Firefox, so no pixel comes near the background. Today's mark drops to 17 between its dots at the same size. At 12 px and at 9 px Tabler's dashes separate, and on a 2x screen they separate at every size. The private mark stays a solid square everywhere, so the two marks never look alike. Only the word "dotted" fails, and only at 10 px on a 1x screen.

Pictures, enlarged 8 times with no smoothing. In each, the top row is today and the bottom row is Tabler's. The columns are 12, 10 and 9 px, each showing private then public:
`screenshots/marks-1x-chrome-light-x8.png`, `screenshots/marks-1x-chrome-dark-x8.png`, `screenshots/marks-1x-firefox-light-x8.png`, `screenshots/marks-1x-firefox-dark-x8.png`.
On the screen, the publish strip at 4x shows before on the left and after on the right, in rows of light 1x, light 2x, dark 1x and dark 2x: `screenshots/crops-publish-strip-public-10px-chrome-4x.png` and `screenshots/crops-publish-strip-mixed-10px-firefox-4x.png`.

**Options.**

1. **Ship as signed; the glossary is unchanged.** On a 1x screen the 10 px public mark reads as a thin outline beside the solid private square. Nothing else moves.
2. **Ship as signed, then draw the three 10 px marks at 12 px in a follow-up.** A 24-unit set halves cleanly at 12 px, so the dashes land on whole pixels. #654 (wallet-bugs-2) already moves the token row's marks to 12 px, so every mark would end up at 12 px. The follow-up is a layout change in three surfaces, with its own pictures.
3. **Change the glossary to "Marked with an outlined square."** This is true at every size and screen; the two glossary tests are re-pinned to it.
4. **Keep today's dotted public mark** beside the 57 Tabler glyphs. Its square ends and separate dots differ from the rest of the set, and it departs from the signed pick.

**Recommendation: 2.** It keeps the signed set and the glossary's word, and it fixes the cause, the 10 px size, rather than the text. Option 1 is the cheap choice if a gray outline on 1x screens is acceptable.
