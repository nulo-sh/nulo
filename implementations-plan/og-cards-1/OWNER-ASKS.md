# og-cards-1: owner asks

The O2 pick (2026-11-10) signs the mechanism. **All three answered**: decision page 132, signed 2026-11-10 at 21:09 UTC. The page's sign-off approves its approve items and recorded one pick; each answer is quoted under its ask. Nothing re-renders: the committed cards and alt text ship as shown on the PR.

## OA1. The three cards' look: answered

- **Surface:** the link preview of `/changelog/`, `/changelog/v1.1.0/` and `/changelog/v1.2.0/` (X, iMessage, Slack, Discord).
- **What ships now:** the layout in plan.md § Architecture & Implementation, Card layout: the landing's dark ground and faces, the ring mark, `nulo.sh/changelog`, the version, the date, the title, one tile per change (glyph and title). The PR body shows each card at full size and under 2:1 and 1.91:1 crop overlays.
- **Options:** sign as shown; or name the changes (type size, which TOML fields, the tile row), and the arc re-renders.
- **Recommendation:** sign as shown, or name the change on the PR.
- **Answer, P132-02 (approve, signed with the page):** "Land #1777 as drawn: a committed Open Graph card per changelog release (your O2). The three cards' look and their alt text". Signed as shown.

## OA2. What the index card names: answered

- **Surface:** the `/changelog/` preview.
- **What ships now (A):** the word Changelog, the newest release's version, title and icons (the lane brief). After a promote and until the Release PR merges, production's `/changelog/` lists the previous release while this card already names the next one; nothing bounds how long the Release PR stays open (plan.md D6).
- **Option B:** a card with no version (the word Changelog, the mark and `nulo.sh/changelog`), the same across releases, with no such window.
- **Option C:** no index card: `/changelog/` previews with the newest listed release's own card, so it always matches the list.
- **Recommendation:** A, because the window ends when the release is out and the card says what the page is; B if a preview that runs ahead of the page is not acceptable.
- **Answer, P132-03 = A:** "As built: the word Changelog, then the newest release's version, date, title and tiles. Can run ahead of the page between a promote and the Release PR's merge." As built; the window is known limit #1779.

## OA3. Alt text: answered

- **What ships now:** `Nulo 1.2.0: Read before you sign.` on a release page; `Nulo changelog: Nulo 1.2.0, Read before you sign.` on the index. TOML words only.
- **Recommendation:** sign with OA1.
- **Answer:** signed with OA1 by P132-02 ("The three cards' look and their alt text", quoted above). As shown.
