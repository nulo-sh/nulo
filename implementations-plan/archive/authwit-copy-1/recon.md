# authwit-copy-1: recon

Base `origin/dev` at 4291a8c98. One Sonnet explorer (tests, consumers, envelopes, playground, capture harnesses), then the planner's own trace. Every line below was checked against the tree.

## The app-paid listing (#1656)

- The app-paid (embedded) route runs one validated simulation and hands it to an `observer` probe (`fee/embedded-strategy.ts:46-47`). The executor lists `consumedOf(probe)`: the probe's records with `onBehalfOf` set (`dapp-send-executor.ts:1398-1401`), at estimate (`:569-571`) and at confirm (`:1194-1204`, as `discoveredHashes`).
- The probe's `discovered` holds the decoder's `signable` records (the sender's, no `onBehalfOf`) then its `consumed` ones (`discovery-probe.ts:67-77`). The decoder files a request naming the signer under `signable` whether or not the request carries its witness (`decode-authwit-effects.ts:86`); only another account's request is checked against `carried` (`:87`).
- On the validated run a request for the sender that its contract checks fails the sender's own account check without a valid witness, before any effect is read (the same mechanism as #1648). A contract that emits the request and never checks it reaches the probe with or without a witness, so the listing must test `carried` itself.
- The card already passes any record with `onBehalfOf` on an app-paid send (`OperationCard.vue:241-243`), and `SendTxSummary.vue:130-132` renders "Already authorized by <AddressDisplay>." for it. The details split on `onBehalfOf` alone (`OperationCard.vue:265-279`); a record of the sender's would land under "Authorizations your other accounts already gave".
- `listedKey` keys an `onBehalfOf` record as `<account>:<hash>` (`discovered-authwit.ts:40-42`); `assertWithinPreview` holds confirm's keys to the preview's (`preview-snapshots.ts:104-114`).
- The wire doc of `DiscoveredAuthwit.onBehalfOf` says "Another approved account of the send" (`packages/wallet-bridge/src/fee.ts:158-160`).
- Tests that pin today's app-paid listing: `dapp-send-executor.test.ts:2004` (the sender's record left out) and `OperationCard.summary.test.ts:481` (`[OWN]` renders nothing). `OperationCard.discovered.test.ts:175` (a record with no `onBehalfOf` on an embedded send renders nothing) stays true. The harness already has `carry(built, tag)` (`dapp-send-executor.test.ts:1839-1840`).
- The explorer's claim that `discovery-probe.test.ts:143` pins a record with `onBehalfOf` equal to the signer did not hold: that record names `0xother`.

## The `unattached` refusal (#1657)

- `UnattachedAuthorizationRefusalError extends ScopeViolationError`, constant message, rebuilt by `walletErrorFromPayload` (`packages/extension-messaging/src/errors.ts:243-253`, `:717-719`).
- The worker keeps the original instance (`execution/service.ts:820-832`, `dapp-interaction/service.ts:347-353`); after Reject, `dapp-interaction/service.ts:686` throws it, and `wallet-sdk/wallet-message.ts:383-396` hands the same `error` to `toWalletResponseError` and to `failQueuedForError`.
- History kind: `queuedFailureKind` (`wallet-sdk/queued-journal.ts:313-323`) and `scopeRefusalKind` (`execution/mark-failed-unless-cancelled.ts:45-47`) each test `AuthRegistryRefusalError` and give every other scope refusal `scope_refused`. Kind texts: `utils/journal-state.ts:310-313` and `:372-374`. Lists that name every refusal kind: `KnownJobErrorKind` and its table (`packages/wallet-core/src/jobs/types.ts:139-197`), `QueuedFailureKind` (`queued-journal.ts:275-285`), `REFUSED_BEFORE_SENDING` (`operation-journal/gc.ts:56-63`).
- Stored shape: a journal row's `error.kind` is `z.string().min(1)` (`operation-journal/spec.ts:342`); the snapshot names no kind, so a new kind is no stored-shape change.
- App error: `scopeViolationEnvelope` gives the registry and own-account-intent refusals their own frozen envelope (code 4100, `SCOPE_VIOLATION`, own text) and every other one `SCOPE_VIOLATION_ENVELOPE` (`error-envelope.ts:226-261`). Documented in `packages/wallet-bridge/README.md:146-214`; `scripts/publish/readme/*` names none of these texts.
- Tests to extend: `error-envelope.test.ts:91-115`, `journal-state.test.ts:765`, `types.test.ts:10-33`, `gc.test.ts:96`, `mark-failed-unless-cancelled.test.ts:96-107`, `queued-journal.test.ts:~416-425`, `dapp-send-executor.test.ts:2284`.
- The network e2e `tx-sendTx-fields.test.ts:47-53` asserts the window's `unattached` reason, then the app's answer `SCOPE_VIOLATION_ENVELOPE`. No smoke e2e names these texts.

## Captures

No story or smoke route renders the execute window; a capture of it needs the network suite (the playground and a live node). No playground send combines an app-paid fee with the sender's own witness (`apps/playground/src/sections/transactions.ts`: `pg-btn-sendTx-appSponsored` carries no witness; `pg-btn-sendTx-onBehalf` carries the owner's and is not app-paid). History rows render offline in the smoke suite from seeded journal rows (`tests/e2e/send-outcome-rows.test.ts`, `tests/e2e/helpers/activity-seeds.ts`). `shotSend` (`tests/e2e/fixtures/shots.ts`) writes light and dark PNGs when `NULO_E2E_SHOT_DIR` is set. The precedent for alternatives and capture-only steps is temporary uncommitted edits, restored before commit (`archive/authwit-window-1/lessons/phase-1.md`).
