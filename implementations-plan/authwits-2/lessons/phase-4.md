# authwits-2, phase 4: a row names its action and contract (N1)

- Built `authwitAction`, the card's title and chip slot, and the page's chip context from the signed list's reader, the profile's tokens and the default explorer, with no name book.
- Gate: `bun run lint` exit 0, `bun run typecheck:all` exit 0, the authwits card, page and helper tests 32/32.
- Two test misses on the way: a selector on a CSS-module class (hashed, removed), and a short address written by hand where `trimAddress` keeps six hex digits (`0x2c2c2c..2c2c`); the test now calls `trimAddress`.
- The N1 frame put the chip on a second row that the card's height hid; the built title wraps instead, so the chip is never cut (D12, the UI impact line).
