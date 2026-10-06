# Production-ready audit remediation

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Nine remediation batches, each its own record, touching among others `packages/wallet-core/src/utils/lock.ts`, `apps/extension/src/wallet/services/profile/session-manager.ts` and `apps/extension/src/wallet/services/operation-journal/`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The findings of a production-readiness bug audit were re-verified against the current code and then fixed in nine strictly sequential batches. Each batch was planned at a tier suited to it, merged on its own, and closed before the next began. Colocated regression tests adopted the audit's proofs where those proofs were sound. No gate was weakened, skipped or bypassed to land a batch.

| Batch | Record |
|---|---|
| Export integrity | [export-integrity](../export-integrity/plan.md) |
| Migration lifecycle | [migration-lifecycle](../migration-lifecycle/plan.md) |
| dApp session and profile binding | [dapp-profile-binding](../dapp-profile-binding/plan.md) |
| Lock ownership | [lock-ownership](../lock-ownership/plan.md) |
| Data safety | [data-safety](../data-safety/plan.md) |
| Shell identity fences | [shell-identity-fences](../shell-identity-fences/plan.md) |
| Service fences | [service-fences](../service-fences/plan.md) |
| Journal reaper | [journal-reaper](../journal-reaper/plan.md) |
| Runtime edges | [runtime-edges](../runtime-edges/plan.md) |

## Why

The second-opinion pass mattered because the audit's text overstated several findings. One was refuted as reachable in production, because every restore path allocates ids through the canonical allocator, and its proof could never go green, so it was never adopted as a regression pin. Others were re-weighted: a stall that a transport timeout already foreclosed, and a popup hang that an RPC timeout already bounds. The sharpest harm witness for the lock defect was chain deletion under the long proving envelope, not the incoming-transfer path the audit named.

The batches ran strictly one at a time. The host mass-fails when network end-to-end suites run concurrently, and each batch had to build on its predecessor's merge.

Two rules held throughout. A recommended recipe that would have broken another path was paired with its counterweight: re-running a failed migration only after a cool-down or on a gesture, and not wrapping a non-reentrant lock in itself. A vestigial reset-and-sentinel path in the shell was removed, not fixed, along with its call sites, tests and build define.

## What shipped

- The nine batches above, each with colocated tests.
