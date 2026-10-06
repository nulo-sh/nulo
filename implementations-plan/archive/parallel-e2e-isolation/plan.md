# Parallel-safe e2e isolation

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the per-agent runner `apps/extension/scripts/e2e/agent.sh` with `apps/extension/scripts/e2e/resolve-ports.ts`, the owned-sandbox setup in `apps/extension/tests/e2e/global-setup.ts`, and the local-network URL stamping and structural chain-id match in `apps/extension/src/wallet/services/network/service.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Two to four agents running the network e2e suite at once from sibling worktrees must not collide on ports, processes, build artifacts or external state. Each run owns its own anvil, Aztec sandbox, playground and browser, and runs to completion independently.

- Ports are always allocated, never defaulted. All five (anvil, the Aztec node and its admin and peer ports, and the playground) are reserved by a bind-test and released together just before the build. They come from a static window below the operating system's ephemeral range, which the kernel never hands to outgoing connections, so the gap between finding a free port and binding it cannot be lost to the build's own sockets. Binding port 0 is only the fallback.
- The wallet's "Local Network" seed takes its URL from a build-time variable, with the old localhost default as the fallback. The runner builds with the allocated URL and fails if the bundle does not contain it.
- Chain-id resolution for a network of kind local is structural: callers that already know the kind pass it as a hint, so a user editing the local endpoint's URL no longer gets a chain mismatch. A normalized-URL comparison covers the rest.
- A sandbox is owned by a lock file that records ports, the pids of the process-group leaders and the node's L1 contract addresses. A direct test run, without the agent runner, reuses a sandbox only if the pids are alive, the ports answer, the baked URL matches and the contract addresses match, and it tears down anything else.
- Teardown kills the process groups the run owns, with escalation to a kill signal, and never kills a service by name. Only leftover test browsers loaded from this build's own extension path are matched by pattern.

## Why

The suite relied on an anvil that happened to be listening on a default port and on an Aztec node on another, and it attached to any service that answered there. Two agents silently shared services and polluted each other's chain state, and a foreign project's anvil contaminated runs. Reuse across runs bought nothing, since every run cold-started anyway.

The chain-id match was a pre-existing bug the work exposed: only the literal default URL mapped to the local chain id. Ownership is checked by identity rather than by port because a port answering proves nothing about whose service it is, while an L1 contract address set cannot belong to another run's deployment. A lock is atomic by writing to a temporary file and renaming it. The lock also serves as the single-runner-per-worktree gate, documented as a constraint rather than enforced with a file lock.

## What shipped

- Port reservation, the build wrapper and the post-build bundle assertion, plus the lock file with a liveness-checked orphan reaper.
- Anvil and the sandbox spawned on allocated ports with a per-run data directory, and with the sandbox pointed at that anvil.
- Unit cases for the kind hint, the normalized-URL fallback and adding an endpoint to a local network with a non-seed URL.
- Acceptance by running two worktrees at once: each deployed its own contracts on its own ports and passed a network test with no collision.
- The validation exposed Puppeteer and Chrome behavior in the helpers. Element-handle clicks could hang, so the helpers use in-page clicks. Default animation-frame polling is throttled in unfocused tabs, so waits poll on a timer. The first handshake on a fresh tab can drop, so the popup is opened through a blank page first. A transition could stick mid-enter in headless Chrome, so a helper clears a stuck popup after asserting the real signal.
