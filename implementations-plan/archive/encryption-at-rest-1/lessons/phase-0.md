# Phase 0 (planning): consults and findings

## Consults

- 2026-10-19, recon: three Sonnet Explore agents (storage-root inventory; crypto, session and storage layer; backup, migration and tests). One claim corrected: imported-key rows root in the DEK, not the master (`packages/wallet-crypto/src/imported-account-key-box.ts:24-32`).
- 2026-10-19, deep step 1, Codex draft: `run-codex.sh … high read-only gpt-6.1-sol`; the script ran on the `alejo-icloud` Codex home it selected itself.
  - Verdict folded into the ledger as source C: keyed-hash ids, incarnation binding, batch preparation. Rejected: per-row keys, a decrypt capability, a completion record, a dark flag, the runner built now.
- 2026-10-19, deep step 1, Opus Plan draft (`model: opus`, `subagent_type: Plan`, about 31 min).
  - Folded in as source O: the worker-lifetime keyring (precedent: the offscreen keeps PXE store keys across lock, `packages/aztec-runtime/src/pxe/service.ts:166-169`); the dual read with conversion after open; the envelope field `profileId`; the keyless deletion sweep; `decodeParsed`; four more check-then-write sites; the legal text (OA-3); the queued-journal write site at `:251-268`.
  - Rejected: `master ‖ dek` with a narrow boundary (D4), and deleting the dApp-session MAC (D17).
  - Corrected a main-draft claim: no code bounds balance rows at 16 384; the figure was dropped.
- 2026-10-19, deep step 2, consolidation: the main draft's capability scheme (D7), its conversion before publish (D10) and its read/write e2e channel (D15) were replaced by O's simpler forms. Two facts were checked against the code for D4: `S/profile/service.ts:1107` runs the pre-open check before the DEK unseal at `:1143`; recovery mode already loses chain data and sessions (`RecoveryModeBanner.vue:11-12`).
- 2026-10-19, deep step 3, Codex contradiction check (resumed draft session `01a155ca`, gpt-6.1-sol high, the `alejo-icloud` home recorded at creation). Verdict INCONSISTENT: 11 findings, no ledger flips, and Codex conceded its capability design (D6/D7).
  - All 11 were checked against the code and adopted:
    1. a half-converted account pair fed the orphan sweep;
    2. dropping keys before the typed purges left watches behind;
    3. three more check-then-write sites;
    4. sole-owner adoption is blind to sealed accounts;
    5. transaction identity becomes per profile;
    6. dApp maintenance reads and recovery-mode conversion;
    7. #865's real encoding and removal guards;
    8. codec renames fail #865's preservation check;
    9. the owner-facing promise needed qualifying;
    10. startup replay;
    11. timing layer and KL labels.
- 2026-10-19, deep step 3, Opus contradiction check (Plan agent, fresh, about 29 min). Verdict CONSISTENT-WITH-FIXES: 17 findings, no flips, all adopted.
  - The weightiest finding: the integrity verified stamp keeps every address in plaintext permanently.
  - Opus offered two fixes for an unopenable account; the panel took a third, today's codec-hidden contract, as the smaller change.
  - Lesson: the lane brief's "Chrome kills the worker within ~30 s" ignores the wallet's own 10 s heartbeat (`wallet/runtime.ts:282-291`).
- 2026-10-19, deep step 4, Codex audit: a fresh session `01a15613`, gpt-6.1-sol high, on the `alejo-gmail` home. The machine-local `~/.agents/codex-sandbox` upgrades read-only to approve-for-me; the prompt forbids writes.
  - Verdict CONDITIONAL APPROVE, 8 findings. 2-8 adopted: arming under the transaction lock with an epoch check; historical goldens keep their wire form; KL-6 broadened; the pinned-tokens cross-context refresh; `waitForTx` with the originating profile; the Firefox-skipped restore spec marked Chrome-only; D14 scoped to the sealing layer.
  - Finding 1 rejected (a hidden account lets the integrity check pass). A hidden sealed account is today's corrupt-row contract (`liveRows`, `S/account/service.ts:177-183`). AEAD stops address substitution, so a hidden row can only make the wallet derive the next account of the user's own master. `pxeGeneration` is minted only for a new row (`profile-row.ts:37,60`; callers `service.ts:638,778,2138,2185,2355,2513`), so no live profile's keys change. The stale P8 line that promised a block was corrected.
- 2026-10-19, deep step 4, Opus audit (Plan agent, fresh, about 25 min). Verdict CONDITIONAL APPROVE, 11 findings, all adopted.
  - The biggest: keyed-hash roots needed a physical-key contract for the dual-read window.
  - #865's restricted-shape rules (`restricted`, `migrationProblems`, the writers test on `migration-rule-1-a1`) block retiring the `structured` `nulo:ui:*` keys, so they left the lane (D26, KL-12, follow-up issue). That also retired P9 and OA-4.
  - Lesson: a lane that changes another lane's guarded shapes must read that guard's code, not its plan.
- 2026-10-19, deep step 5, final fresh Codex pass: a new session `01a1562f`, gpt-6.1-sol high, on the `alejo-icloud` home.
  - Verdict CONDITIONAL APPROVE, 3 conditions: the balance conversion against purge, the keyless refusal as OA-4, digest-field scanning.
  - Two follow-up turns: one corrected the P6 test interleaving, then the verdict was **APPROVE**.
