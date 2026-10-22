# Implementations plan index

Format: `- [plan-name](plan-name/plan.md) — status — one-line hook`

- [launch-prep-1](launch-prep-1/plan.md) — planned, Codex approve, A1 in review — the 1.0.0 checklist boxes the stores meet and the Mainnet line (A1); four known-limit dispositions; Terms 1.1 and the README banner after the owner signs (A2) (#864)
- [encryption-at-rest-1](encryption-at-rest-1/plan.md) — A1 in review, draft PR #924 (lands after #938, the owner's build test and one green nightly soak; the 1.0.0 promote waits for it); A4 waits for OA-3 — seal each profile's rows in `chrome.storage.local` under a master-derived per-profile key: contacts and dApp sessions, history, private-state projections, accounts and tokens (#522)
- [offscreen-ping-1](offscreen-ping-1/plan.md) — planned, Codex approve, awaiting approval — the worker stops pinging a PXE document it heard answer, so a busy document is no longer replaced mid-call; the READY timeout becomes a typed `RpcTimeoutError` (#1035)
