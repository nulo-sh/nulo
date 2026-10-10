# Phase 0: planning consults

Every consult of the planning run, failed ones included.

## Recon (2026-10-10)

- Three Explore agents (sonnet): arc-1 internals, arc-2 surfaces, upstream Aztec 6.0.0-rc.1 fee semantics. All returned; findings in [recon.md](../recon.md).
- One agent reported a plan directory outside the worktree; checked, it was inside (`git status` showed `implementations-plan/fees-and-sponsors/` untracked in the worktree). Its wording was wrong, not the write.
- The arc-1 agent said `node_modules` is not installed in any worktree; the upstream agent read the installed packages under `node_modules/.bun/`. The upstream agent's citations are the ones used.

## Dual audit, round 1 (2026-10-10)

- **Codex** (`gpt-6.1-sol`, high, read-only), session `01a123fd`, account alejo-gmail.
  - Returned in one run, with no quota or auth error.
  - **VERDICT: reject.** Blocking findings: S1, page 9 missing from H3's gate; S2, the authwit readout.
  - Plus 19 other findings: S3-S5, F1-F3, I1-I2, A1, C1-C8, O1, and the OWNER-ASKS corrections.
  - Every finding was verified against the tree before it was accepted. Dispositions are in plan.md § Audit verdicts.
- **Opus Plan agent** (background, about 19 minutes, 111 tool calls).
  - **VERDICT: conditional approve.** Its conditions are listed in plan.md.
  - Its sharpest find: removing `feeReadFailed`'s rethrow would make a level that bypasses the boundary fail open into a send at a default (S1).
  - It also found the re-entrancy of a lazy orphan reap that emits inside `admitNext`, and the horizon that would reap an orphan still queued behind a proof.
- **Where the auditors disagreed**, the driver's decisions:
  - **#91's fix.** Codex: one owner under the lock. Opus: a writer-chain clear plus a startup sweep. Took Codex's, because removal is immediate rather than eventual (D7).
  - **#119's attribution.** Codex: estimate-owned. Opus: per (profile, chain). Took per-profile, for every orphan (D3).
- **A driver error caught during the revision.** The first v2 draft claimed that only ExecutionService's PXE client issues `simulateTx`. `token-balance/service.ts:128-137` disproved it, so the orphan ledger became process-wide.
- **Lesson.** Before claiming an RPC or transport inventory, grep for every construction site of the client, not just its methods. Both audits caught inventory errors: the five-versus-seven RPCs, and the "global" count.

## Final fresh Codex pass (2026-10-10)

- **The run.** New session `01a12418`. The script picked the alejo-icloud account; there was no error.
- **VERDICT: reject.**
  - Blocking: v2's per-profile count of every orphaned simulation was an unapproved admission-policy change.
  - Blocking: H3's unseen-fee clause was missing from the gates.
  - Plus 10 more findings: READY is not a replacement proof, disconnect is not completion, #91's lock force-releases, #113's verdict lacks the network, PrivateFPC funds itself, OA-8 C versus the guard, the TTL interplay, OA-10/OA-11 misstatements, #107's subscription cleanup, and `checking` rows being disabled.
- **The response, v3.**
  - #119 is now the issue's own fix: hold the estimate's own entry. That is simpler than v2: no ledger, no new registry logic.
  - Every other finding is accepted, except a non-releasing lock shared with deletion (R4).
- **Lessons.**
  - Each audit round moved #119 toward the smallest fix: a v1 global count, a v2 per-profile ledger, a v3 entry hold.
  - The issue's own "Possible fix" was the right shape from the start. Read it as the default design and argue away from it only with evidence.
  - Widening a mechanism's scope to dodge an attribution problem is a behaviour change, and it needs an owner.

## Resumed final pass (2026-10-10)

- **The run.** Same session `01a12418`, resumed. `CODEX_ACCOUNT` is ignored on resume, so it stayed on alejo-icloud. There was no error.
- **VERDICT: conditional approve.** Both blocking findings and eight others were resolved.
- **The four conditions**, all applied in v3.1:
  - retire a document only on a successful close;
  - prove a payer cannot fund itself only for a validated shape, nested claims included;
  - describe OA-11 from Send's real walk (Nulo's sponsor only);
  - give abandoned client records a lifetime equal to the registry's TTL.
- **Not re-audited.** Each change narrows what the condition named and adds no new mechanism.
- **Lesson.** "The probe says it's gone" and "the close resolved" are not proof that a document is gone in this codebase. `getContexts` misses ghosts, and `closeOffscreen()` swallows errors. Treat only a successful close as proof.
