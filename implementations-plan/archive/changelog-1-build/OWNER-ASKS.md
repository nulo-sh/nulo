# Owner asks: changelog-1-build

Both answered on decision page 118 (signed 2026-11-06 19:37 UTC), and both built on this arc's PR, which closes #1711 (A1) and #1712 (A2).

## A1. Link the changelog from the home page

- **Surface**: nulo.sh's home page (`apps/landing/index.html`): the bar's nav or the footer.
- **Options**:
  - (a) No link. The pages are reached from the wallet's What's new row and About (P117-08), the sitemap, and their URLs.
  - (b) A "Changelog" text link in the footer, beside "privacy · website privacy · terms".
  - (c) A "Changelog" link in the bar's nav, before "Get Nulo", as the changelog pages' own bar shows it.
- **Recommendation**: (b). It reaches people who look for it without competing with the install button.
- **Answer**: "P118-06: B" (page 118). Built: `changelog` between `releases` and `privacy` in the home page's footer, in the footer's lower case (its CSS sets every footer link in capitals), linking `/changelog/`. Captures: [`screenshots/footer-desktop.png`](screenshots/footer-desktop.png), [`screenshots/footer-phone.png`](screenshots/footer-phone.png); the home page has one theme, so light and dark render alike.

## A2. A patch release with fewer than three changes worth a card

- **Surface**: the top part of a future patch release's page (`/changelog/vX.Y.Z/`).
- **Options**:
  - (a) Keep the rule: every stable, patch included, writes three to five changes. A small patch needs three lines.
  - (b) Allow one to five changes for a patch (`Z > 0`), the grid laying out one or two cards.
  - (c) A patch writes no editorial file; its page shows the notes under a plain title.
- **Recommendation**: (b), once a real patch needs it; the grid already handles any count from the first card's width.
- **Answer**: "P118-07: B" (page 118). Built: a patch release's editorial file holds one to five changes, a minor or major release's still three to five. The grid is unchanged: one card takes the first card's two columns and leaves the third empty; two fill the row. Captures from a fixture cut from 1.2.0's page: [`screenshots/patch-1-card-light.png`](screenshots/patch-1-card-light.png), [`screenshots/patch-2-card-dark.png`](screenshots/patch-2-card-dark.png) and their other themes.
