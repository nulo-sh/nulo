# Phase 1: moves, route lists, lint

## Consult 1: Codex planning pass (gpt-6.1-sol, high, read-only)

Verdict: approve, confidence high. Facts F2 (top-level-only auto-import scan) and F4 (scan roots) confirmed independently; F3 not re-probed (its sandbox would not write a scratch config) but judged consistent with the repeated wallet-clocks group. D1-D5 judged sound; D3 judged within bounds.

- Finding (low, plausible but unverified): the split of the components override could drop an existing group silently, and a popup-only probe would not see it. Adopted: the lint probes also check that a composite production file and a composite test still refuse a store, a service client and the wallet clocks, and that only the production file refuses `@/popup`.
