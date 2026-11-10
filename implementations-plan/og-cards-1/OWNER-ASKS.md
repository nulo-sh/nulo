# og-cards-1: owner asks

The O2 pick (2026-11-10) signs the mechanism. What a person sees waits for the owner's sign-off on the PR body's pictures; the arc builds the forms below and the PR does not land until the owner signs.

## OA1. The three cards' look (blocks the merge, not the build)

- **Surface:** the link preview of `/changelog/`, `/changelog/v1.1.0/` and `/changelog/v1.2.0/` (X, iMessage, Slack, Discord).
- **What ships now:** the layout in plan.md § Architecture & Implementation, Card layout: the landing's dark ground and faces, the ring mark, `nulo.sh/changelog`, the version, the date, the title, one tile per change (glyph and title). The PR body shows each card at full size and under 2:1 and 1.91:1 crop overlays.
- **Options:** sign as shown; or name the changes (type size, which TOML fields, the tile row), and the arc re-renders.
- **Recommendation:** sign as shown, or name the change on the PR.

## OA2. What the index card names (blocks the merge, with OA1)

- **Surface:** the `/changelog/` preview.
- **What ships now (A):** the word Changelog, the newest release's version, title and icons (the lane brief). After a promote and until the Release PR merges, production's `/changelog/` lists the previous release while this card already names the next one; nothing bounds how long the Release PR stays open (plan.md D6).
- **Option B:** a card with no version (the word Changelog, the mark and `nulo.sh/changelog`), the same across releases, with no such window.
- **Option C:** no index card: `/changelog/` previews with the newest listed release's own card, so it always matches the list.
- **Recommendation:** A, because the window ends when the release is out and the card says what the page is; B if a preview that runs ahead of the page is not acceptable.

## OA3. Alt text (with OA1)

- **What ships now:** `Nulo 1.2.0: Read before you sign.` on a release page; `Nulo changelog: Nulo 1.2.0, Read before you sign.` on the index. TOML words only.
- **Recommendation:** sign with OA1.
