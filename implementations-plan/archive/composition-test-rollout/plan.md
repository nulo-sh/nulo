# Composition test rollout

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a shared PXE seam in `apps/extension/src/wallet/services/pxe/shallow-port.ts` with one fake in `shallow-port.fake.ts`, composition tests for the token and dApp-session services, the normative rules in `apps/extension/tests/COMPOSITION-TESTS.md`, and a bundle-hygiene marker check in `.github/workflows/_build-extension.yml`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Apply the composition layer (drive the real service graph in-process against dumb fakes, with no sandbox, proving or browser) to the services where it pays, behind one shared minimal PXE seam instead of per-service copies. The seam narrows the PXE client to `getPXE` only; the fake implements a four-method `Pick` of the PXE interface, so an interface change breaks typecheck. Rules, ahead of any new test:

- A PXE fake implements at most four methods, holds only seeded contract metadata and a registered-address set, and never reproduces simulation or proving semantics.
- Faking that needs a transaction request, an account contract, chain-identity validation or address derivation means the test belongs in e2e.
- The fake lives under `src/` so it is typechecked and linted, and carries a unique marker that CI greps out of the built extension.

The dApp-session service is a second harness shape: storage only, no PXE types.

## Why

Without a shared fake, copy-pasted fakes drift independently. A shared fake is only safe if two guards exist: compile-time conformance (hence its location under `src/`) and a CI grep proving it never reaches a production bundle. The grep did not exist before this work, so it is a deliverable, not an assumption.

The boundary turned out narrower than "shallow PXE surface". The fee-payer service looked shallow but its discovery and add paths derive contract instances, which runs the Barretenberg hash that the unit-test runtime deliberately does not load. The honest limit is shallow PXE, bb-free, and no simulate or prove. A re-scoped test for that service only checked its own plumbing, so the service was reverted to its original shape and stays the limits doc's counter-example, with its behavior covered by network e2e.

## What shipped

- The shared seam and fake, a conformance test in both directions (real client to port, fake to port), and an injectable client factory plus storage seam on the token service. Production wiring passes nothing and gets the real client.
- A token-service composition test over the bb-free interface parsing path, and a dApp-session composition test over the real session lifecycle, including the per-chain scoping that stops trust leaking between networks.
- `apps/extension/tests/COMPOSITION-TESTS.md`, linked normatively from `CLAUDE.md`: the decision tree, the hard rules above, the failure taxonomy (theatre, second wallet, drift) and a reviewer checklist.
- The fake's marker added to the build's "test-only markers absent" check.

## Lessons

### Fresh build deferred

The execution composition test covers only the reused-prepared-transaction cancel path. The fresh-build path stays out of the composition layer: faking its chain-identity check, contract resolution and account-contract request building would be building a second wallet, and anything that derives instances needs the Barretenberg hash, which unit runtimes do not load. Those paths are covered by network e2e.
