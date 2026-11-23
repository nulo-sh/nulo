# Phase 1: arc 1 implementation and review

## Implementation

- `isObjectLike` and `isRecord` narrow to `Record<string, unknown>`, where the inline form narrowed to `object`, so two casts the inline form allowed stopped compiling: `params as unknown[]` after `unwrapParams` (`base-service.ts`, now `unwrapParams<unknown>`), `value as Error` in `trim` (now through `unknown`: the error tag test is what proves it an error). The narrowing also made most `as { field?: unknown }` casts at converted sites redundant; they went with the site.
- `trim` scored 43 after its two sites converted; `baseline:rescore` reported it, the stamp was edited by hand and `baseline:complexity` rewritten.
- The armed smoke build is not what `audit:vue` builds: smoke needs `VITE_NULO_E2E_*` set at build time and the matching `NULO_E2E_*` at run time (`tests/e2e/global-setup-smoke.ts` names them).
- `test:release` fails 7 zip tests on this host because `zip` is not installed; the rest pass. CI's runner has it.
- The built content script and the staged `@nulo-sh/wallet-crypto` tree are byte-identical to the base's.

## Review loop

- Codex r1 (`gpt-6.1-sol`, high, read-only, fresh session): conditional approve, three findings. Verified the prefilter bypass by reverting the fix (the escaped case fails) and the false `emit.ts` reason; both fixed. The guards.test.ts comment was reworded, not deleted: it says why raw expressions sit in a helper's table.
- Opus diff review (general-purpose, opus), beside r1: conditional approve, six findings, none a set mismatch. Accepted the digest false positive (no helper, and the ratchet would refuse every new one), kept-entry moves, `!!E`, the false ratchet comment and the comment reword; rejected `predates` failing closed (only a gate self-edit reaches it, and it is arc 1's own expected state).
- Codex r2 (resumed): conditional approve, two findings, both reproduced from the code and accepted: a pending entry promoted to kept in place could then move (identity now includes kind); grouped `0x` prefixes and grouped classes escaped the adjacency test (now looked past).
