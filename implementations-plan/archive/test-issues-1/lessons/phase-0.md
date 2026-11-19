# test-issues-1: phase 0 (planning)

## Recon

- Two Explore agents on sonnet: e2e (sweep targets, wait helpers, egress guard, runners) and unit (probe budget, clock-pinning conventions, fee comments). Findings in `../recon.md`.
- The failing CI job of #1743 (run 42346943042, attempt 1, job 128326689216) was read in full: the spec's last assertion and the close both report one held Mainnet request, on all three attempts.

## Consults

- **Codex round 1** (gpt-6.1-sol, high, read-only): conditional approve, three conditions, all accepted (plan § Audit verdicts).
- **Opus Plan leg** (opus): conditional approve, five findings, all accepted (plan § Audit verdicts). Both legs independently rejected the first draft's 15 s settle bound for the popup RPC's 60 s contract.

## #1743 reproduction (base 5736a920a, armed builds, retry 0, `NULO_E2E_INTERCEPT_LOG=1`)

| Browser | Runs | Green | Wall-clock per run | load1 (188 cores) |
|---|---|---|---|---|
| Chrome | 10 | 10 | 37 to 69 s | 154 to 330 |
| Firefox | 5 | 5 | 72 to 83 s | 180 to 289 |

No held request in any run. One Chrome run printed 129 `[rpc-intercept]` lines for three tests; the target labels were `service_worker:<id>/background.js`, `other:` and `background_page:offscreen/index.html`.
- **Codex round 2** (resumed): approve, with three wording fixes, applied. It ran the `DEFAULT_RPC_TIMEOUT_MS` import in Node under a throwing `chrome` getter: 39 modules, no `chrome` read.
