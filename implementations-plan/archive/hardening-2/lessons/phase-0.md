# Phase 0: planning log

## Recon (2026-10-08)

- Three read-only Explore agents on sonnet: a batched reuse sweep (seven capabilities), the dApp ingress and PXE artifact store, and the storage fences and CSP. All three returned; findings consolidated in `recon.md`.
- Hand checks that changed the plan:
  - Upstream's iframe wallet parses the same `jsonStringify`-ed args with `parseWithOptionals`, so stock-SDK traffic passes a full parse by construction.
  - A `bun -e` probe (run from `packages/wallet-bridge`, nothing written) showed: zod-4 tuples refuse extra args; `optional()` accepts `null`; `requestCapabilities(null)` and a `batch` leg naming a patched method are refused.
  - The full `requestCapabilities` schema refuses unknown capability types, which the connect window shows as an "unknown" row: a visible behaviour, so it became OA-1.
  - `updateToken` has no caller.
  - The balance commit's write is dispatched in the tick of its fence checks, and the purge fences each row before deleting it.
  - Every production `addContractArtifact` call computes the store key from the artifact.

## Consults

### Codex audit, round 1 (gpt-6.1-sol, high)

- Session `01a11cf4-4932-7f03-8f4e-47aed7c75ef7`. Verdict: **conditional approve** (fence raw balance purges, repair CSP validation, bound batch parsing, owner approval for changed behaviour). Ten findings; triage recorded in plan.md § Audit verdicts.
- Verified by hand before triage: the balance purge's malformed-row pass deletes without fencing (`purge-rows.ts:79`); `validPayloads()` drops the storage key, so a tombstone stored under one id but naming another drives hydration and resume for the named id (`profile/service.ts:452`, `:1572`); `DappInteractionService.execute` re-reads the session after the parse (`dapp-interaction/service.ts:419`, `:447`); the projector runs before the commit's re-read (`balance-job-queue.ts:245`, `:355`).

### Opus 5.5 audit, round 1 (Plan agent)

- Verdict: **conditional approve** (fix findings 1 through 6; send findings 4, 5 and 8 to the owner). Eleven findings; triage recorded in plan.md § Audit verdicts.
- Verified by hand before triage: `test:e2e` runs the last `dist/<browser>` and never builds (`global-setup-smoke.ts:14-18`); the migration smoke files skip without the fixture flag at build and run time (`migration.test.ts:38`); nine extension test files mock the patch's `register` entry with an empty module; `onTokenUpdated` is subscribed by `token-balance/service.ts:152`; offscreen documents have no `chrome.storage` (`src/e2e/proof-gate.ts:20`); `RpcUrlSchema` accepts plain HTTP only on loopback, `[::1]` included (`network/spec.ts:145-162`).
- Where the two round-1 audits disagreed: D-16c (Opus favoured cutting args, adopted) and D-26 (Opus marginally favoured the identity cache, Codex the tripwire; kept the tripwire).

### Round-1 revisions that matter to the implementer

- A schema transform can throw a plain `Error` quoting the value (`Fr.fromString` over the modulus). The parse catches every throw and rethrows fixed text without `cause`.
- Batch legs are parsed only on re-entry, after their own capability check. The draft's union parse would have run before any capability check and parsed `requestCapabilities` legs.
- The bridge patches a private schema copy instead of relying on the `register` side effect, which test mocks disable.

### Codex final pass (fresh session, gpt-6.1-sol, high)

- Session `01a11d0e-19d5-72d2-a1eb-fcaee9e3201c`, three rounds: conditional approve (seven findings), conditional approve (three), **approve**. Triage recorded in plan.md § Audit verdicts.
- Verified by hand before triage:
  - `writeSyncFailure` fences before its write and never after (`balance-job-queue.ts:209-230`).
  - `purgeForAccounts`' raw pass deletes unfenced (`token-balance/service.ts:580-587`).
  - `agent.sh` refuses the eleven `@requires-proverless` files unless `NULO_E2E_PROVERLESS=1` (`agent.sh:16-34`); CI runs the proverless pool with `--exclude` of the five prover-on canaries (`pr-extension-network-e2e.yml:169-174`, `:254`).
  - `migration.test.ts` closes its own contexts, bypassing fixture teardown.
  - `grantPublicAuthwit`'s `args` is `z.array(z.unknown())` (`apply.ts:37-42`).
- D-26 settled on the tree, not by vote: one `ArtifactRegistry` serves every PXE runtime (`pxe/service.ts:200`, `:939-960`), and upstream keeps an unbounded per-instance artifact object cache (`contract_store.js:132-145`). So the class-id `Set` vouches across stores, and an object-keyed `WeakMap` costs one verify per artifact per runtime. Lesson: before trusting a cache key, check whether the cache outlives the store it vouches for.
