# Implementations plan index

Format: `- [plan-name](plan-name/plan.md) — status — one-line hook`

- [launch-prep-1](launch-prep-1/plan.md) — planned, Codex approve, A1 in review — the 1.0.0 checklist boxes the stores meet and the Mainnet line (A1); four known-limit dispositions; Terms 1.1 and the README banner after the owner signs (A2) (#864)
- [encryption-at-rest-1](encryption-at-rest-1/plan.md) — A1 in review, draft PR #924 (lands after #938, the owner's build test and one green nightly soak; the 1.0.0 promote waits for it); A4 waits for OA-3 — seal each profile's rows in `chrome.storage.local` under a master-derived per-profile key: contacts and dApp sessions, history, private-state projections, accounts and tokens (#522)
- [e2e-tmp-1](e2e-tmp-1/plan.md) — planned, Codex approve, A1 running — every backup a test imports leaves a temp dir behind: the calling test owns it through `onTestFinished`, a self-test proves none remains (#1064)
