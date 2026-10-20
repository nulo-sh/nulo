# stalled-retry-flake-1: phase 1 (arc 1)

## Implementation

- `5e4830450`: `refuseUnanswered` with the shared `refuseNodeCall`, the spec's call, T1. `3ccd264e9`: the review's wording fixes.
- T1 green; a reset in place of the refusal turned it red (`TypeError: fetch failed`), then reverted.
- Lint and `typecheck:all` exit 0.

## Red on base, green on the fix (forced fill, retry 0, `agent.sh`)

- Base copies of the three files plus the probe patch, Firefox: green. The wallet itself held six calls (four from the second popup's Home); Firefox re-sent four, so two slots were free. With the two phase-0 reds, the forced spec is red 2 of 3 on base.
- The deterministic control is the browser probe (recon.md § Traces): six held calls on six reused connections. Reset: all six re-sent and the next identity call never arrived, 3/3 on each browser. 400: none re-sent, the call arrived within 3 ms, 3/3 on each.
- The fix with the probe patch rebased (its own `held()`), forced: green on Firefox and on Chrome; the probe 123 ms and 63 ms after the click.

Correction to phase 0: Firefox does not re-send every reset call. Both browsers re-send those on a reused connection; Firefox also re-sent the PXE's call and some on new connections.

## Review loop

### Round 1

- Codex (gpt-6.1-sol, high): fix these, one doc finding. "A reset frees none" overclaims (Chrome freed four of six); "later ones" needs "unanswerable". Accepted, `3ccd264e9`.
- Opus diff review: clean. Two comment fixes accepted (the per-browser phrase was ambiguous; the spec comment repeated "first" and ran long). One optional pin, a 200 ms race proving a later call stays held, rejected: a wait on time, and a stub that refused later calls would turn the Retry's registration into refusals, which the spec's deadline row does not survive.

### Round 2

- Codex, resumed with the fix and the browser probe's results: clean. The doc's per-browser parenthesis matches the traces.

## Gates on the final head

- `bun run lint`, `bun run typecheck:all`, `bun run test:all`: exit 0.
- Smoke, armed builds, retry 0: `import-dead-rpc` and `egress-guard`, 16/16 on Chrome, 12/12 and 4 Chrome-only skips on Firefox.
- Network, the stalled spec at retry 0 through `agent.sh`, each run started at load1 < 150: Firefox 10/10 (file 104-121 s, median 111 s), Chrome 5/5 (98-113 s, median 106 s). Before, one base run each: Firefox 120 s, Chrome 113 s.
