# pxe-limits-1, phase 0: planning consults

## Recon (2026-10-21)

Two Sonnet explorers (the offscreen PXE, proving and the sandbox; the wallet's lists and seal), plus the planner's reads of CI logs: PR run 39655767369's canary job and nightly 39571470226's three canary jobs (per-file times in recon.md), and a re-read of block-time-1's node logs (build to published by quarter of a run). Every audit claim used below was re-read in the tree before it was accepted.

## Codex r1 (gpt-6.1-sol, high; session 01a15ff0)

Verdict: *reject* (CI probes cannot run as specified; the sync and throughput methods do not establish the limits; one held item). Thirteen findings; twelve accepted, one rejected (the exclusive CI window through the orchestrator: a headless lane cannot reach it, and an overlap only adds noise to job-internal times). Verified before acceptance: the soak passes no `probe` input and the reusable workflow's bundle guard fails a probe build (`_extension-network-e2e.yml:329-345`); `simulateTx` returns `publicSimulation` and `validation`, not `proving` (`<pxe>/pxe.js:778`); `sync` is the header step only (`<pxe>/operation_queue.js:85-89`); a sender refuses an index past finalized + 84 (`sender_tagging_store.js:111-113`).

## Opus r1 (Plan agent, opus)

Verdict: *conditional approve* (fix the per-block metric, add senders, rework the CI legs, the note recipe before phase 1; sessions and one held item before phase 5). Twelve findings; all accepted but two parts: keeping instrument strings off the bundle guard's regex (rejected: the guard has an input for exactly this run, D4) and dropping CI from phases 3 to 5 (rejected for phases 4 and 5: the runner is the representative host). Verified: `APP_MAX_CALLS = 5` (`@aztec-labs/entrypoints/dest/encoding.js:9`); `MAX_THREADS = 32` in bb.js; `DAPP_REGISTRATIONS_PER_CHAIN = 128` "not a measured threshold"; #924's head moved to `21a6c47e`; imported contacts become PXE senders (`useContactImportExport.ts:401`); `maxTxsPerBlock` unset in automine.

## Codex r2 (resumed 01a15ff0, verification)

Verdict: *conditional approve* (batch capacity, tag instrumentation, PrivateFPC selection, the envelope's classes). All four conditions and two low findings accepted after verification: the sponsored fee adds `sponsor_unconditionally` to the 5-call budget (`wallet-sdk/dest/base-wallet/base_wallet.js:115-120`, `aztec.js/dest/fee/sponsored_fee_payment.js:20`); `selfpay-phase.test.ts:287` is one test over every route; `launchExtension({userDataDir})` keeps a profile (`fixtures/extension.ts:92`). It accepted the queue disposition (separate CI VMs; best-effort serialisation, no coordinator).

## Codex r3 (resumed 01a15ff0, verification only)

Verdict: **approve**. No new material defect or regression.
