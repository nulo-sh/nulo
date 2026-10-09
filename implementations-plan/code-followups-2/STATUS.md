# code-followups-2 — status

One dated line per gate or decision; the close-out commit deletes this file.

- 2026-10-09 — homed in the lane worktree at `61060c0`; registered in the manifest; recon started (three Explore agents on sonnet).
- 2026-10-09 — base moved to `f557e20` (#56, #74 merged); recon done (R1-R3 folded, recon.md written); plan.md drafted; dual audit next.
- 2026-10-09 — dual audit round 1: Codex reject (entry 34), Opus conditional approve; all findings accepted, plan revised (34 parked, 125 partial); final fresh Codex pass running.
- 2026-10-09 — final fresh Codex pass: conditional approve, 5 findings accepted (Phase 2.5 added for 172/186 cleanups); confirmation round running.
- 2026-10-09 — confirmation round: Codex approve; plan committed for the orchestrator's approval.
- 2026-10-09 — approved by the orchestrator, with D-orch-1 (no stack) and D-orch-2 (no `follow-ups.md` edits); `origin/dev` at `79bbd7b` merged in (#55, #58, #75 landed); arc 1 started.
- 2026-10-09 — Phase 1.1 gate pass: transfer-estimate-reuse.pins (6 red on base, green after), account-state/service.test, log-payload-ban green; grep for `base fee fetch failed:` empty (95aaa3b).
- 2026-10-09 — Phase 1.2 gate pass: profile/ + token-balance/ 24 files 513 tests; smoke profile-rename + auth-flows Chrome retry-0 2/2 files, 7/7 tests (badfaf1).
- 2026-10-09 — Phase 1.3 gate pass: purge-rows + account/ 17 files 183 tests (3 new red on base; the 2 never-happens cases red under mutation); smoke security-reset + passkey-retry Chrome retry-0 2/2 files, 9/9 tests (26e410a).
- 2026-10-09 — Phase 1.4 gate pass: nine calls converted (#58 merged, D8 resolves to nine); typecheck:all 0; the six specs' services + dapp-session 35 files 550 tests, aztec-runtime 367; `nativeEnum` grep empty (b8d5451).
- 2026-10-09 — Phase 1.5 gate pass: execution/ + wallet-sdk/ 83 files 1,323 tests (15 assertions red on base); network scope-refusal + err-scope-and-cap retry-0 on Chrome 3 files 5/5 (with the throwaway shot spec) and on Firefox 2 files 4/4; shot texts equal § UI impact's four rows (4647f05, ea1b589).
- 2026-10-09 — session resumed after a rate-limit stop; arc 1 fix loop round 1: Codex approve with nits (3 minor) and Opus approve with nits (1 material, 2 minor), all accepted (ba12c4e, 721fe5c); `audit:vue` and `test:all` green at ba12c4e; network scope-refusal + err-scope-and-cap + shot spec on Chrome, retry 0, 3 files 5/5.
- 2026-10-09 — arc 1 fix loop round 2: Codex approve with nits, "no new material finding" (one plan wording, accepted); loop converged. Final gates on the final head next.
