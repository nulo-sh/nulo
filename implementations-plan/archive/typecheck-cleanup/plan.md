# Typecheck cleanup

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a green typecheck across the extension and every `@nulo/*` workspace, gated by the root `typecheck:all` script in `package.json`, with a blanket SFC shim in `apps/extension/src/shims-vue.d.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Take the extension from 113 type errors in 22 files to zero, then wire a per-package typecheck into one root command. The work was split into eight steps, ordered so the runtime-affecting ones ran first behind a manual send-transaction QA gate and a failure there could be rolled back without losing the mechanical cleanups: stale imports and dead suppressions, the authwit hash construction, Aztec SDK drift (timestamps, scope types, gas fee shapes), Vue SFC and router shims, store and implicit-any annotations, logger signature separation, capability narrowing, and per-package typecheck with the root script.

## Why

A green baseline was a prerequisite for a CI typecheck gate and for letting the compiler act as a correctness checker during later package extractions. Some errors masked real drift: the code compiled through coercion chains while upstream SDK shapes had changed, so the runtime could silently pass wrong shapes into SDK calls.

Two audits reshaped the draft. A test helper with live consumers is rewired, not deleted. A `.toString()` that feeds a string-typed parameter is kept; only the scope arguments that upstream now types as addresses change, and the fix belongs at the fee-strategy context contract, not in the lambdas. The authwit hash is computed with the SDK's own hash function instead of a wrapper cast. A type that crosses an IPC boundary is narrowed only behind a runtime guard at that boundary, otherwise the narrowing lies about runtime trust.

## What shipped

- The execution paths compute the authwit message hash with the SDK's own `computeAuthWitMessageHash` rather than casting a hand-built shape.
- The logger's RPC surface is separated from the narrow `ILogger` port, so the service no longer claims both shapes; about thirty consumers of the narrow port are unaffected.
- A blanket `*.vue` module shim, so later component extractions do not cascade new missing-declaration errors, plus the stale-import, dead-directive, fixture and annotation fixes.
- `typecheck:all` runs the typecheck of every `@nulo/*` package through the workspace filter.
