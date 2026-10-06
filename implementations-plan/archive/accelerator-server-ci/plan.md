# Native proving in the network e2e CI

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the headless prover server installed and started in the network e2e lanes by `.github/actions/setup-presto-server/` and `.github/workflows/_extension-network-e2e.yml`, with the wallet-side required mode in `packages/aztec-runtime/src/pxe/chain-runtime.ts`. The server has since taken the name Presto, and the integration kept its shape under that name.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Install the prover vendor's headless server binary on the CI runner and make the wallet prove through it, so the network e2e lanes use native `bb` instead of in-browser WASM. Enforce it in layers rather than trusting the wallet's silent fallback:

- A preflight step waits for the server's health endpoint and requires that it reports a usable `bb`.
- A build-time flag puts the wallet's prover in required mode, where a fallback or denied phase throws at the prove call that caused it.
- A post-test step reads the server log and reports how many proofs it served; only a canary lane that served none fails on it.

The binary is verified against a hash pinned in the repository, never against the checksum file published next to the release. A repository variable and a dispatch input switch the whole thing off for investigation. It shipped as one PR with that kill switch rather than a staged rollout.

## Why

GitHub-hosted runners vary widely: on slow ones the prove-and-submit test took minutes. That forced the slowest test to stay quarantined and its wait to be stretched. Native proving makes proof time predictable.

A silent fallback to WASM in CI would hide exactly the regression the change exists to prevent, so required mode hard-fails. A checksum published beside a release is replaced together with the tarball in a compromise of the release origin, so only a pin in this repository defends against that. The log-counting layer started as a gate and was demoted: the log format is not a documented contract, and a shard with no proving paths legitimately serves zero proofs, so the wallet-side throw is the authoritative signal. Origin restriction on the server was left open on purpose. The vendor README's example origin is the dApp's, while the proving traffic comes from the extension's offscreen page, so copying it would deny every request.

The first measured matrix ran roughly four times faster than the WASM baseline. The one red shard was a simulation test that never touches the prover, a capability-popup timeout of the kind the earlier e2e stabilization work fixed with pre-granted fixtures.

## What shipped

- A composite action that downloads the tarball, checks the pinned hash, caches by version and hash, and puts the binary on `PATH` without privilege escalation. The hash input is required so a version bump with a stale hash fails loudly.
- Workflow steps to start the server, which fetches the `bb` version the wallet asks for, and the health-gated wait. Server logs are uploaded on failure.
- The required-mode build flag and the wallet-side enforcement in `packages/aztec-runtime/src/pxe/chain-runtime.ts`. Required mode is also the only place plaintext HTTP to the local server is accepted; production always requires HTTPS.
- The bump procedure for the pinned binary is in `SECURITY.md` under Binary dependencies, and the layers are described in `CI.md`.
