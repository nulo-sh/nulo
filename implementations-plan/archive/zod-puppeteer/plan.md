# Zod 4 and Puppeteer 25

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the e2e tooling moved to Puppeteer 25 (`apps/extension/package.json`). The Zod 4 half was deferred by this plan, and the tree now declares `zod` `^4.4.3` in `packages/aztec-runtime/package.json` and the other schema-owning workspaces through later work.
- **Open items**: nine `z.nativeEnum` calls use an API zod 4.4.3 deprecates, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Land the two dependency bumps as separate changes, since their blast radii differ: Zod sits on the wire-boundary schemas, Puppeteer only in test infrastructure. Bridge Aztec's Zod 3 schemas into a Zod 4 layer with one typed cast helper rather than rebuilding about twenty Aztec schemas by hand.

A spike then ran the cast approach with a tree-wide override forcing one Zod 4 copy. It type-checked and built, but Zod 4 was deferred until Aztec's own schema layer no longer needed Zod 3. Puppeteer 25 shipped alone.

## Why

Aztec's compiled schema code imports internals that exist only in Zod 3 (`OK`, `ZodFirstPartyTypeKind`, `ZodParsedType`). Zod 4 ships them on its `zod/v3` subpath, not on the main entry. With the override, the import failed at module load and a quarter of the unit suites could not start, which would have been a production import-time failure.

The cast helper alone would also have been unsound. Zod 4's object and array schemas eagerly reject children that lack its internal marker, so a Zod 3 child fails at schema construction, not only at parse. Bun's overrides are tree-wide, so Aztec could not be given one major while the wallet used another. The remaining routes were waiting for upstream or restructuring about twenty sites so Aztec and wallet schemas are parsed independently and merged afterwards, the mixed-major pattern Zod documents for libraries. That was judged a dedicated change.

## What shipped

- Puppeteer moved from 24 to 25 as a manifest and lockfile change with no code edits. The breaking changes did not touch the suite: the Node and TypeScript minimums were already met, the tests were already ESM, and the two APIs that became asynchronous were never called. The smoke suite matched its previous baseline. A temporary release-age exclusion for the Puppeteer packages was removed once the version aged past the gate.
- The Zod 4 spike was reverted cleanly, and the failure mode is recorded here for whoever picks the migration up.
- The plan also settled that the messaging package's Zod peer range would tighten to Zod 4 once the migration landed, and that deprecation cleanups such as `z.nativeEnum` and `z.intersection` would not ride along with a major bump. The `nativeEnum` cleanup is the open item above.
