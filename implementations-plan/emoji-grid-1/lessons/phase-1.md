# emoji-grid-1 phase 1: the role, the grid, its tests, the captures

- **Rebase before branching.** `origin/dev` moved to `f336e0f22` after the plan commit; the plan commit was cherry-picked onto it. No file the arc touches differs between the two bases.
- **Lint red, once**: Biome's formatter wanted the expected-cells array of `EmojiGrid.test.ts` on one line. Formatted; green.
- **Design tests red, once**: `base.css.test.ts` pins `base.css` by hash, so the new `--font-emoji` line needs the hash moved and the choice named in its comment. Done in the same commit.
- **Commitlint red, once**: a commit body line over 100 characters. Rewrapped.
- **Capture harness** (scratch, outside the repo): a Vite dev server whose root is the scratch dir, with the extension's `vue`, auto-import and component plugins and the design resolver, aliasing `vue` to its `esm-bundler` build (Bun resolves the bare `vue` to the Node entry, whose CJS re-export lacks `createBlock`). Its port is claimed in `~/.agents/ports.md` and released after.
