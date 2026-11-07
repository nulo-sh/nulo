# Phase 2: the guard

- `unlock-conversions.scan.test.ts` parses each non-test `src` file with `ts.createSourceFile`, finds every `sealOnRowKeysReady(` and `*.onRowKeysReady.add(` call, follows a handler one hop when it only delegates to `this.m`, and pins the sorted callee set per file (15 files, the shell and the journal reaper included). Locals such as `fn`, `live` and `seal` appear as callees; harmless, and they red only when the handler changes.
- Mutation (step 2): `await this.storage.set(profileId, ...)` added inside `ContactService.sealLegacyRows` reds the pin with `+ "this.storage.set"` under the contact entry; restored, `git status` clean.
- Gate: `bun run lint` exit 0; `bun run typecheck:all` exit 0; the Phase 1 test set plus the guard: 12 files, 340 tests passed.
