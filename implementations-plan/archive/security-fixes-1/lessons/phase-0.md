# Phase 0 — planning

## Consults

- Codex plan audit, first attempt: `CODEX_ACCOUNT=gmail` failed before the model ran (`cannot resolve CODEX_ACCOUNT=gmail`). `codex-usage list` names the roster accounts `alejo-gmail` and `alejo-icloud`; reran on `alejo-gmail`. The plan's Post-implementation section uses those names.
- Codex plan audit (gpt-6.1-sol, high, read-only): `reject` on three blocking findings. Dropping a malformed stored grant can make a narrow "authorize without asking" consent effective and sign silently; three rare-input changes were visible (#13 debug text, #29 consent window, #27 restore warning); upstream hash errors carry artifact-chosen names into logs and the connectivity classifier. All three accepted; the per-finding calls are in plan.md § Audit verdicts.
- Opus Plan agent audit: `conditional approve`. Its conditions (two broken e2e gates, the #29 writer `TypeError`, #33 failing open without a snapshot, #33 reason format and complexity, wrong I3/I4/D2) were all accepted; one finding rejected (`setActiveNetwork` reorder: no stored row can carry userinfo).
- The two audits split on #29 (Codex: neither drop nor write-side; Opus: drop plus writer fix). The plan took a third option, refuse on read, which closes both audits' findings and keeps today's visible behaviour.

## Findings while planning

- The selector-binding refusal never reaches a dApp: a plain `Error` is off the code channel, so the dApp envelope is the constant unclassified text. Its sinks are task records, the journal row (message and stack), the operation result, two `logError` sites and two popup `console.error`s.
- The profile facade `Lock` has the default hold watchdog, so a finalize parked past it can overlap a newer `restore()` of the same id. A cleanup in `finally` must check it still holds the entry it saw.
- A stored dApp-session row that was edited fails its MAC and is dropped; malformed grants reach coverage only through the RPC setters or rows written before projection existed.
- `isConnectivityErrorMessage` matches `timeout`/`refused` anywhere in a message, so any upstream error that interpolates attacker-chosen text can trip the restore's per-network fail-fast.
- `e2e:agent` refuses a file list that includes a `@requires-proverless` file unless `NULO_E2E_PROVERLESS=1`; network vitest retries twice unless `NULO_E2E_RETRY` is set; smoke runs against whatever `dist/chrome` holds.

## Final pass

- Fresh Codex session (gpt-6.1-sol, high, read-only): `conditional approve`. Two conditions, both verified against the code and applied: the post-decision grant read in `handleRequestCapabilities` also interprets stored grants and must be projected; OA-2 named the wrong journal label (a failed claimed send reads "Stopped before broadcast", because the journal keeps the send's stage) and understated option A (the journal's `failureKind` and the execution code-channel allowlist both ignore `ScopeViolationError`).
