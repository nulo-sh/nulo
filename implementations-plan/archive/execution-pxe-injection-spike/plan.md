# Execution service PXE-injection spike

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `ExecutionService` takes an injectable PXE client factory (`apps/extension/src/wallet/services/execution/service.ts`), pinned by `service.pxe-seam.test.ts`. `service.composition.test.ts` drives the real service graph against a dumb fake, and `apps/extension/tests/COMPOSITION-TESTS.md` holds the rules for that test layer.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Prove the in-process composition test layer with the smallest vertical slice. One service, `ExecutionService`, gets a constructor seam for its PXE client, and one test drives the real `executeTransfer` and `cancelJob` entry points through the real coordinator and journal against a fake. No Aztec sandbox, offscreen worker, proving or browser is involved. The test is the cancel-mid-prove story. The transfer path only is in scope, since dApp sends read proof and offchain-effect data that a dumb fake cannot supply.

## Why

- Several services construct their PXE client directly, so the execution path stopped at a hard-built client and could only be checked by booting the sandbox.
- The seam is the client, not the raw PXE interface. The execution path calls client-level methods beyond the PXE (contract lookup and registration), so the fake covers both.
- The client's base class wires browser runtime messaging in its constructor, so a fake cannot subclass it. The fake implements the used subset and is cast at the factory.
- A mis-wired default could make production run against the fake. The default factory builds the real client, a unit test pins that, and the fakes live inside test files, which no production entry imports. A build followed by a search of `dist` for a unique marker string proved the fake absent from the bundle.

## What shipped

- The defaulted `pxeClientFactory` constructor parameter, with `DEFAULT_PXE_CLIENT_FACTORY` exported so the seam can be tested without a full service collection.
- The composition test boots the real graph and uses the real operation journal. It asserts the operation ends `cancelled`, never reaches `submitting` or `succeeded`, and that the proof was dropped at the post-prove checkpoint and never sent. A first version faked the journal and could have passed even if cancel fired at a later checkpoint.

## Lessons

- The fresh transaction-build path is too deep to fake without writing a second wallet, since it validates node identity and resolves contracts through the PXE. The test seeds the estimate-reuse cache so the transfer takes the fast path and skips the build. Bring that path under the layer last, and start with services whose boundary is only PXE, node and storage.
- Spreading an object that exposes state through a getter snapshots the value instead of forwarding it. Keep the controller object whole.
- A faked collaborator can hide the real contract: the real journal showed that the transfer type is a numeric enum, which a stub had accepted as an invalid string.
- A local port interface that the client satisfies would remove the cast, and the plan left it for a wider rollout.
