# PXE and network boundary complexity burn-down

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: five over-budget functions in `packages/aztec-runtime/src/pxe/service.ts`, `packages/aztec-runtime/src/pxe/public-events.ts`, `packages/aztec-runtime/src/pxe/client.ts` and `packages/aztec-runtime/src/utils/fetch.ts`, split into helpers, with new pins in `packages/aztec-runtime/src/utils/fetch.pins.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Burn down six complexity suppressions across the PXE, fetch and network-restore layers in one behavior-preserving refactor. A synchronous guard ladder moves into a synchronous helper. An async helper appears only where its call replaces a span that already awaited, behind a caller-side applicability guard, so no path gains a promise hop. The six affected suites stay green with zero edits, and error strings, warning strings and result reasons stay byte-identical because they are the oracles.

## Why

These functions guard storage deletion, chain identity and request cancellation, where ordering is the behavior. Extracting an awaited helper on a path that used to be synchronous, or between a lock release and the next reservation, changes what a concurrent caller can observe.

## What shipped

- **Orphan store sweep**: the origin-private-storage orchestration stays inline, because the next orphan's write reservation must happen on the same continuation as the previous release. Only the legacy IndexedDB sweep is extracted, tail-returned behind the existing guard so no hop precedes the first delete.
- **Contract instance lookup**: the node fallback (rethrow of an upgraded-contract error, best-effort degrade, then the known-bundle cascade) is a helper, entered only on the path that already awaited.
- **Public events**: the ancestry probe and a synchronous page-ordering validator are extracted, with the warn calls moving with the validator.
- **PXE client request**: a synchronous predicate decides whether a generation stamp is needed, and the whole missing-store-key recovery (provider, capture-equality guard, live-generation revalidation, provision and one retry, zeroize in `finally`) moves as one unit with its order untouched.
- **Fetch**: both awaits and the timeout `finally` stay inline, since the abort signal must stay live through a pending body read. Only the synchronous failure classifiers are extracted. The new pins cover the full reject oracle, header and signal passthrough, abort through a pending body read and the retry wrapper.
- **Network restore**: the plan also split the extension's network-restore closure into one synchronous validator (shape gate, boundary schema validation, collision check) so every throw still landed synchronously in the loop's catch. That closure is not found in the current tree as described, so it is not counted as shipped here.
