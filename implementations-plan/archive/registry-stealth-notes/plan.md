# Registry, stealth settings and note parsing

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the artifact registry reduced to local and bundled sources in `packages/aztec-runtime/src/pxe/artifact-registry.ts`, and per-class note decoding in `packages/aztec-runtime/src/pxe/note-schemas.ts`. The privacy settings and external-link plumbing are gone from the extension. Making `artifact` required on `aztec_registerContract` is not in the tree.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

A three-part refactor, executed in this order:

1. Delete the privacy and stealth-mode settings surface, with its promo popup, route, config fields and external-link composables.
2. Drop the HTTP artifact registry, so artifacts resolve from the PXE's own store and a bundled set, and make resolution failures read the same everywhere.
3. Decode notes with a hand-written slot map per bundled contract class, instead of leaving every note as raw items.

## Why

The registry fetched contract artifacts from a remote service, which is a privacy and trust cost the wallet did not need once the common contracts are bundled. The stealth-mode settings existed only to gate that fetching and the external-link and image behavior around it, so deleting the registry left them dead. Notes were shown as undecoded field lists because the wallet could not tell which storage slot held which note type.

The slot map rests on what the bundled artifacts actually contain: balance sets of `UintNote` and private sets of `NFTNote`, whose packed items hold only the value. Owner and randomness live beside the items on the note record and are appended separately.

## What shipped

- **Registry**: the default resolution order is the PXE's own store, then the bundled set, with class-id verification kept for locally stored artifacts. The HTTP fetcher, its policy flag and its endpoint constants are gone.
- **Settings surface**: the stealth promo popup, the privacy settings route and the config fields behind them were removed, and external links open with a plain `noopener` window.
- **Notes**: `note-schemas.ts` maps a contract class and storage slot to a schema, and a test asserts each slot exists in the artifact's storage layout under the same name. Unknown classes fall back to raw content, and one bad note cannot blank the page.
- **Not shipped as planned**: tightening `aztec_registerContract` so the artifact is required. The operation type still marks it optional, matching the upstream wallet SDK, so that divergence never landed.
