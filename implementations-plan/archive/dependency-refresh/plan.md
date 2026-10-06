# Dependency refresh

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: One in-range refresh of every workspace's dependencies, with the lint configuration changes the newer Biome needed in `biome.json`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Land the minor and patch updates that already sit inside the existing `^` ranges, with no `--latest`, so the seven-day release-age gate keeps holding back the week's fresh publishes. Audit the whole lockfile diff, transitives included, for publish age, and fix any fallout inline.

The plan first wanted two attributable stages, runtime libraries and then build and test tooling. That split is not achievable in this Bun workspace, so it collapsed into one refresh. The mechanisms tried:

- `bun update <list>` writes the listed packages into the root `package.json`.
- A bare `bun update` at the root re-resolves only the root's own dependencies.
- Deleting the lockfile and reinstalling re-hoists the tree and exposes latent under-declared dependencies.
- Running `bun update` inside each workspace directory, plus once at the root, works: no root pollution, hoisting preserved.

## Why

A routine refresh is where a malicious or breaking minor hides, and Bun's age gate can still leave a too-new transitive in the lock. So the trust artifact is the audited diff rather than the gate alone. The trigger for the plan, a zod major, turned out not to exist: the repo was already on the latest. The only available major was `@types/node`, which policy caps below the next major.

## What shipped

- **Refresh.** Nearly two hundred lockfile entries and a dozen within-major `^`-floor bumps. Every changed entry, transitives included, was at least seven days old; the freshest releases of the build tool, the linter and the Ethereum client were correctly held back.
- **Biome fallout.** The newer linter promoted rules to errors and started linting standalone SVG files. `biome.json` now excludes `**/*.svg` (brand assets, not lint source; inline SVG in `.vue` files is still checked) and turns `useVueMultiWordComponentNames` off, since single-word component names are the deliberate naming of the design system and the wallet.
- **Types fallout.** A newer `@types/webextension-polyfill` made one alarm test helper's return type unassignable, so the helper casts its return, matching the sibling helper.
- **Under-declared dependencies.** Packages that imported `zod` or Node types only through hoisting now declare them, since the PR already edited those manifests.
