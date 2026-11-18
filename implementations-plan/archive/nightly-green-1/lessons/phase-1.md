# nightly-green-1, phase 1 (arc 1)

- Codex pass over the plan and the net diff (gpt-6.1-sol, high, read-only): approve. One comment nit accepted (`secondToken`'s comment cut to its invariant); the unpriced-second-entry assumption already fails loudly in `openSeededHome`. No second round.
- The production Chrome bundle used for the artifact-leg runs was built at the base: the arc changes no file under `apps/extension/src` or `packages/`, so it is the head's bundle.
