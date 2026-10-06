# Build the bb.js WASM assets from the installed package

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a build-time extractor in `apps/extension/scripts/extract-bb-wasm.ts` wired into `apps/extension/vite.config.ts`, and the fetch shim `apps/extension/src/shims/bb-fetch-code.ts` with its build-side counterpart `apps/extension/scripts/bb-fetch-code-shim.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Stop vendoring the two barretenberg WASM binaries by hand. A small build step reads them out of the installed `@aztec-foundation/bb.js` package and writes both into the build's assets directory, so bumping the npm dependency updates the JavaScript and the WASM together.

- The threaded binary is copied from the package's Node tree, where it ships as a standalone gzip file.
- The single-threaded binary has no standalone file in the package. It is parsed out of the browser build's inlined module, where it is a base64 gzip data URI. The bytes are already gzipped and are written as they are.
- The build fails if the threaded binary stops being byte-identical to the threaded payload inlined in the browser module, or if the data-URI layout changes, with a message naming the extractor.
- The hand-vendored copies are deleted.

## Why

The vendored copies had already drifted from what the installed package ships, and nothing would have caught a dependency bump that updated the JavaScript half and left the WASM stale. That would have surfaced only as broken proving.

Shipping the threaded binary alone was rejected. The wallet's proving runs in a service worker, and cross-origin isolation is not reliably available there, so the single-threaded path is reachable in production and is not dead code. Keeping the vendored directory with a postinstall hash check was rejected because it still needs the extraction for the single-threaded file and leaves a stale copy in the tree for the next contributor to edit. The extractor lives in its own module so its parsing, the fragile part, has a focused test, and the equality check is strict rather than a warning, since a divergence means upstream changed its layout.

## What shipped

- `apps/extension/scripts/extract-bb-wasm.ts` locates package files through `@nulo/resolve-asset`, never by walking `node_modules`, and is called from the Vite config for both emitted assets.
- The fetch shim exists because Chrome extension service workers forbid runtime dynamic `import()`, which the package's own loader uses when no path is given. The shim fetches the emitted asset instead. It checks the HTTP status, so a missing asset reads as an HTTP error rather than a gzip failure, and it derives the threaded file name from the single-threaded one without ever doubling the suffix.
- The build-side plugin in `apps/extension/scripts/bb-fetch-code-shim.ts` redirects only the package's browser fetcher, matched by resolved file rather than by specifier, and fails the build if that fetcher's inlined WASM would ship anyway.
