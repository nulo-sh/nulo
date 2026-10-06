# Third-party notices

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Every extension build writes a byte-stable `THIRD-PARTY-NOTICES.txt`, refuses an unreviewed licence or asset, and Settings, About opens the file (`packages/third-party-notices`, `apps/extension/src/popup/pages/settings/about.vue`).
- **Open items**: five declined items wait on their triggers, and `vite dev` in an agent worktree routes a new test file, both tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Ship the notices file and stop there. The extension bundles well over a hundred third-party components and had no attribution. A first, larger attempt built a generator that worked and then grew without bound. The narrower design lists every package that renders into the bundle, its workers and its inlined stylesheets, each under an allowlisted licence with its text. It also lists the bundled fonts with copyright line and licence, each font file bound by hash. The wasm binaries are attributed to the project that publishes them, and the file says plainly that their internal components are not itemised.

The review standard was that the generator is a compliance tool and not a security boundary. A blocking finding is an ordinary dependency edit whose licence is missed, mislabelled or ships without its text, an input the generator cannot read that does not stop the build, output that is not byte-stable, or a stale policy record that does not fail. A package that deliberately hides its own licence is not blocking, since the release-age gate, the frozen lockfile and provenance cover that. Unknown means the build refuses by name, never a partial file.

## Why

- The earlier attempt overran because no review standard was stated, one loop covered four concerns, and two fixes were proven only against fakes. Accepting every audit point is how a compliance file becomes a research project, so each finding is weighed against what a wallet this size owes.
- MPL-2.0 left the allowlist. It carries a source-availability duty the generator does not discharge, and nothing bundled uses it, so an MPL package refuses the build until someone decides.
- A font claim carries its file hash, upstream URL, copyright line and licence, and is judged against its own allowlist (OFL-1.1, Apache-2.0). Replacing a font file changes the hash and refuses the build.

## What shipped

- The library (`spdx`, `policy`, `packages`, `collect`, `generate` and reviewed texts under `texts/`) takes plain bundle contents, so it cannot change a build by itself.
- The Vite plugin, the stylesheet reader, `check-minimum` with `expected-minimum.txt`, the CI assertion on the built file, and the About row. A separate fix removed test modules from the production routes, which shrank the bundle.

## Lessons

### Hook order

The notices hook is ordered `post` at the hook level (`generateBundle: { order: "post", handler }`). Being last in the plugin list does not make a hook run last, because Vite sorts `enforce: "post"` plugins behind the list, and the extension plugin emits content scripts from one. A probe plugin that emitted a file late built clean before the change and was refused after it. The fix also exposed the service-worker loader, which had never been seen and is now claimed as generated output.

### Declined items

Each was a true finding that the narrower design declined, with the trigger that reopens it.

- Itemising what the two large wasm binaries compile in: reopen when upstream publishes an inventory.
- Reconciling every file of the final zip against a claim: reopen when a third-party image, data or asset pack joins the extension.
- Licence files in package subdirectories and prebundled dependencies without a nested manifest: reopen when such a dependency arrives or a bump grows the bundle without growing the notices.
- MPL-2.0 handling: reopen when the build refuses an MPL-2.0 package.
- Notices for `apps/landing`: reopen when the landing gets its own release checklist.

### Merge interplay

The minimum list caught a real interaction between two changes. Once test modules left the bundle, `vue` rendered nothing, since it is a re-export facade whose code ships as `@vue/runtime-core` and friends, and the list now names the latter. The smoke scenario asserting the old name failed after a rebase, so a rebase that changes what the base ships needs the whole gate list.
