# stalled-retry-flake-1: phase 0 (recon, reproduction, panel)

## Runs

All at retry 0 through `agent.sh`, with the trace patch kept at `~/.cache/nulo-backlog/stalled-retry-flake-1/repro.patch` (env: `STUB_TRACE=<file>`, `FORCE_FULL_POOL=1` for the forced fill, `STUB_RELEASE=refuse` for the 400 release). Results: recon.md § Traces.

1. Firefox and Chrome unforced, reset: green both. Firefox re-sent 3 of 4 held calls within 3 ms; Chrome re-sent 2 of 6, both on reused connections.
2. Forced fill from the import page: Firefox red with the CI row; Chrome's fill reached the stub once (its interception attaches no page), green, not a valid control.
3. Forced fill from the background: Firefox red (6 of 6 re-sent); Chrome green (4 of 6 re-sent).
4. Forced, 400 release: green on Firefox (page fill) and Chrome (background fill); nothing re-sent.

Note for a rerun: zsh does not split `$var` in a `for` list; use `for b mode in chrome reset ...`.

## Consults

### Codex plan audit, round 1 (gpt-6.1-sol, high; session 01a15715)

Verdict: approve with changes. Findings and dispositions:
1. The assertions do not prove the Retry made its own registration call (a rejection also records the deadline, `importChainSync.ts:122`). Accepted as wording: the plan no longer claims it. Rejected the extra probe assertion: the deadline row already implies a `go` verdict, so an answered probe (`importChainSync.ts:104-106`).
2. A 400 ends one request, not the work behind it (the registration loop launches its next call). Accepted: wording, and the body must parse, else `mapBodyFailure` retries.
3. The refusal window is an unproven coordination protocol; a foreign `getNodeInfo` closes it early. Accepted: D3 is now A (held calls only); the queued case is KL-2.
4. Label the mechanism demonstrated and CI's red its likely instance; I2 low confidence. Accepted.
5. T1's "D was held" step can pass on a reply cut by `close()`. Accepted: T1 tests the release and a success control, with a mutation check (reset in place of the refusal must fail it).

### Opus Plan leg (opus, read-only)

Verdict: approve with changes. Findings and dispositions:
1. I3's reason was wrong: a popup's status read (`getNodeStatus`, background, 60 s client) queued at the release would close a window early. Moot: the window is dropped (D3).
2. A refused boot fails its PXE operation and the next waiting one boots at once (the in-window `getL1ContractAddresses`). Accepted: Mechanics states it.
3. KL-1 holds for HTTP/1.1 nodes only; production Testnet is HTTP/2 per the archived `ci-e2e-hygiene-1`. Accepted: KL-1 narrowed.
4. Heading overclaims; a stalled background would time out the same way. Accepted: "demonstrated in reproduction; CI's instance inferred".
5. Step 4 cannot apply the probe patch to the fix as is. Accepted: rebase it, keep its own `held()`.
6. Define what closes the window. Moot.
D3: Opus argued for the window (it catches a probe-less Retry; #838 saw counts vary). Codex argued against. Decided for A: starving the probe under A takes about eleven pending calls at the release (six held, five queued, plus the first pass's next launch), assuming no other producer fires before the probe; the traces show at most six held at the stub.

### Codex round 2 (resumed)

Verdict: approve with changes. The eleven-pending count is conditional (no other producer before the probe, no request mid-body at the release), and the traces count server-held calls, not browser-queued ones. Accepted: the count is qualified in (W), D3, KL-2 and here. The probe-assertion rejection, T1 and the accepted fixes check out; no blocker, no owner question.
