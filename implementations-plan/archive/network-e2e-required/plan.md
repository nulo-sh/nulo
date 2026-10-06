# Network e2e as a required check

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the strict PR gate in `.github/workflows/pr-extension-network-e2e.yml` and `.github/workflows/_extension-network-e2e.yml`, the boot-failure classification in `apps/extension/scripts/e2e/classify-exit.ts` and `apps/extension/scripts/e2e/agent.sh`, the session-bounded `from` resolution in `packages/wallet-bridge/src/dispatcher.ts`, and the post-send pending-authwit recording in `apps/extension/src/wallet/services/auth-registry/service.ts`.
- **Open items**: routing the e2e gotchas that the lessons rewrite retired into the `e2e-testing` skill, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make the network e2e PR check reliably green, then require it on the integration branch, by fixing root causes and never masking with retries.

- The PR check runs at zero test retries. Per-test retry overrides in the network suite are removed, and each flake they hid is root-caused.
- One retry is allowed for infrastructure only. The runner writes explicit boot-started, boot-ready and tests-started markers, and a distinct exit code means the sandbox failed to boot before any test ran. The workflow retries the agent once on that code and fails immediately on any other.
- The check's path filter is widened to cover the grant-approval and revoke surfaces; it now covers all of `apps/extension/`.
- The required flip waits for five consecutive green runs of the real PR workflow on one commit, including the heavy concurrent jobs.
- The wallet is fixed, not the test: public-authwit recording moves from build time to a post-send, pending-then-reconciled flow.

## Why

The gate was masking app flakes. The workflow left retries to the config default, and about ten tests carried their own retry or a skip, so a green run proved little. Only a strict gate gives a signal worth requiring.

Build-time recording was at the wrong trust point: a fee estimate or a rejected request left a grant in the local revocation index. The real cause of the "revoke finds nothing" flake turned out to be two swapped storage-slot constants in the auth-registry helper, which were corrected. Chasing it exposed a second bug: `sendTx` ignored `from` and always sent as the session's first account, so a second account's authwit consume became a self-send that needed no authwit and made revoke invisible. The send now honors a session-authorized `from` and rejects anything outside the session.

## What shipped

- The strict gate and the exit-86 sentinel, with a state-machine test for boot failure, test failure and a fixture failure after boot.
- Every revealed flake fixed at its cause: a constructor-mock regression, a fee ceiling on sponsored sends, a trust-prompt test seeding under the wrong network, and a contact edit clicked before its sender state loaded. The last waits on the app's own readiness signal rather than a longer timeout.
- Build-pure authwit building. Recording happens after send as a tx-linked pending row, the cap is enforced before send, and reconciliation confirms or removes the row from the transaction's settled outcome. Pending rows are excluded from the sync prune.
- The `authwit-lifecycle` e2e is a true end-to-end revoke proof: a consume from the second account succeeds while the grant stands and fails once it is revoked.

## Lessons

### Pending authwits

A sent transaction is not a mined one. `waitForTx` and a journal `succeeded` return when the transaction leaves the pending map, which includes dropped, so reconcile off the transaction's settled outcome. A pending grant is not yet consumable, so the sync prune would delete it early. The cap is checked per build, existing plus pending plus unique new hashes, and before send, because a grant accepted by the node cannot be blocked afterwards. Losing a successful grant from the index silently loses the ability to revoke it.

### Opts from clobber

The dispatcher overwrote a caller's `from` with the first session account, while the sibling grant handler honored it. When two paths resolve the same thing, the asymmetry is the tell. The fix resolves the requested account only among session-authorized ones and rejects the rest, never falling back to the first account. The same clobber later survived in simulation and profiling and is closed the same way.

### Certifying greens

A run of greens certifies a deflake only if the trigger actually occurred during them. Four of five runs passed on a fee fix that covered sends but not the simulate reads, because no fee spike happened. The heavy concurrent jobs run only in the real PR workflow, not the proverless soak, so that real run is load-bearing. A latent contact flake surfaced during a re-prove and restarted the streak.
