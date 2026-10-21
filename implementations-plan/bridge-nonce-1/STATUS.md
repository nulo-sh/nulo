# bridge-nonce-1 status

- 2026-10-21 recon done (one Explore agent on sonnet plus the installed CLI read); plan drafted.
- 2026-10-21 panel: Codex r1 approve-with-changes, Opus approve-with-changes, Codex r2 approve-with-changes, Codex r3 approve; plan committed.
- 2026-10-21 A1 phase 1 green: l1-signer test 2/2 (reds proved: index 0 fails (a), a stray createExtendedL1Client fails (b)); lint, typecheck:all, test (891 files) exit 0.
- 2026-10-21 A1 phase 2 green: Chrome network run, proverless (CI's shard pool), retry 0: 7 files 30 tests passed, send-chaos skipped (opt-in `NULO_E2E_CHAOS=1`); 9/9 `Minting … tokens for` lines name 0x7099…79C8, 0 name 0xf39F…2266, 0 `nonce too low`; wall-clock 1489 s.
- 2026-10-21 review round 1: Codex (fix: one comment), Opus (clean; scan viem signers too, "by default"); fixes applied, l1-signer test green, red for the wider scan proved, lint and typecheck:all exit 0.
