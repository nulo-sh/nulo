# Package extraction

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The wallet split into layered workspace packages (`packages/wallet-core`, `packages/wallet-crypto`, `packages/extension-messaging`, `packages/aztec-runtime`, `packages/wallet-bridge`) with the extension as the thin shell, and import-layer rules enforced in `biome.json`. The planned UI package was deferred in this work; the UI primitives later moved to `packages/design`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Cut the monolithic extension package into workspace packages, each owning one concern, in dependency order: `wallet-core` (no dependencies), then `wallet-crypto` and `extension-messaging`, then `aztec-runtime` (the heaviest, with the PXE stack and the offscreen document lifecycle) and `wallet-bridge`. A sixth package for the UI primitives was deferred. The final step welded the boundaries shut: Biome `noRestrictedImports` overrides (each layer imports only from layers below it), a `chrome.*` ban in the packages that must not touch it, and per-package `typecheck` and `test` scripts. The layering is in [CLAUDE.md](../../../CLAUDE.md) and [ARCHITECTURE.md](../../../ARCHITECTURE.md).

## Why

The wallet's services had become constructable with fake ports, so the seams existed; without package boundaries nothing stopped a later change from importing the extension shell into the core. Biome was chosen over a dedicated dependency-graph tool because it was already installed and fast, and it can express the same layering rules.

The UI package was deferred because the boundary had no motive. There was no second UI consumer, no plan to publish the primitives, and moving typed single-file components across a package boundary loses their types and breaks the auto-import setup. The same rule is enforced at directory level instead, as the component layers in `CLAUDE.md`.

## What shipped

- Packages expose TypeScript source through `exports` (source-first), so the extension's bundler processes them with no per-package compile step. Inside a package files use relative imports; across packages they import the package name.
- The bundler workarounds for the proving WASM stay in the extension build, and apply to every workspace package during its bundle.
- Before the bridge extraction, the dispatcher's six concrete service imports were replaced by one structural interface, `packages/wallet-bridge/src/services-contract.ts`, so the dispatcher depends on a contract rather than on service classes.
- Invariants the extraction had to keep: the key-derivation labels never change, the passkey relying-party id stays in the extension, and the ciphertext format stays in `wallet-crypto` behind its test vectors, which must pass before and after.
- Tests move with their source; new tests only lock an invariant an extraction could silently break.
- The closing audit found no code left behind and no unused workspace dependency; three unused path aliases in the extension's `tsconfig.json` were removed, leaving only `@/*`.
