# Messaging primitives dedup

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the error-name constructor parameter in `packages/extension-messaging/src/errors.ts`, the shared transport error hooks in `packages/extension-messaging/src/core/base-client.ts`, and the exhaustive passthrough factory in `packages/extension-messaging/src/core/service-client-factory.ts` used by the extension's service clients.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The first arc of the duplication remediation, with zero behavior change, removed three pieces of copy-paste in the messaging package.

- **Error names.** The `WalletError` base constructor takes the subclass's frozen literal name as an optional fourth argument and owns both halves of the old ritual, setting the name and restoring the prototype chain from `new.target.prototype`. Each subclass constructor becomes a single `super` call.
- **Transport errors.** The four error-construction hooks of the base client become concrete with defaults. Only the timeout and send-failure message strings differ between the two transports, so those two become small abstract hooks that return the transport's exact current text.
- **Passthrough lists.** A curried `definePassthroughsExhaustive<Methods>()` makes the compiler prove a client's method list covers its interface, in both directions, and the sixteen clients that carried the hand-written guard skeleton adopt it. The seven clients with a structural reason to differ were left alone.

## Why

The old ritual lived in eleven constructors and could be forgotten by the twelfth. The transports' error hooks were byte-identical apart from two strings, and the base client already followed the "concrete hook with a default, override where transports differ" pattern for its other hooks.

Taking the name from `new.target.name` was rejected: the production bundler's minifier strips class names, so the name would change in shipped builds. Passing the literal through `super` survives minification. All four message strings stay frozen. The disconnect message is matched by `isClientDisconnectRejection`, and the others are genericized before they reach a dApp but were pinned by exact assertions anyway. A shared message template and a helper the subclasses call were both rejected because they keep the duplication or loosen those contracts. The per-file interface merge for the passthrough methods stays, because declaration merging binds to the named class.

## What shipped

- A completeness test over every error subclass checks prototype chain, literal name and code, and a round-trip test covers the codes that `walletErrorFromPayload` reconstructs. One code, too-many-pending, still reconstructs as the base error, and a pinned test documents that.
- The two transports each shrank to two one-line message hooks, and tests pin all four messages with exact class, code, details and cause assertions. A stale header comment on the offscreen transport was corrected.
- The factory's runtime behavior is tested against the plain `definePassthroughs`, and its compile-time guarantees by `@ts-expect-error` cases inside a function that never runs.
- The service-side dispatch allowlist, which is the trust boundary, was not touched.
