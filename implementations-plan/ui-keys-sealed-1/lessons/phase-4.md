# Phase 4: docs, legal (drafted; the close waits for OA-1 and OA-2)

- Privacy 1.2.4 as OWNER-ASKS § OA-2 drafts it. § 3 drops "pinned tokens, fee-payer choices and the last-selected account" from its exceptions. The history row and the manifest entry (`material: false`) carry the drafted line. 1.2.3 is archived byte-identical (`cp` of `legal/privacy.md` at `d208a4fd`'s parent), and `BEFORE-LAUNCH.md` gains the 1.2.4 dating checklist. The line names the last-selected account, which this build still stores plaintext: with OA-1 A or B the pointer lands before the PR is ready, and with C both the line and § 3 keep it among the exceptions.
- SECURITY.md § Storage privacy, ATTACK-SURFACE.md, ARCHITECTURE.md § 5, CLAUDE.md's sealed-roots list and the e2e README name the two maps (pins and fee picks) as sealed. The pointer stays on the plaintext line with #1062 until OA-1.
- CLAUDE.md § Persisted-storage records the one re-cut with the owner's words and the four folded stamps. The release skill's frozen-baseline check points at it. The note's "<and, unless OA-1 is C, the selected account>" clause waits for OA-1.
- `src/utils/fee-picks.ts`' header named the profile service as the maps' one writer; it names the ui preference service now.
- Gate: `bun run --cwd packages/legal test` (59 passed), `test:ci-gating` (687 pass), `check:plans` (0 findings), `test:all` after the merge of `dev` (exit 0).

## After OA-1 A and OA-2: the pointer's docs and issues

- SECURITY.md, ATTACK-SURFACE.md, ARCHITECTURE.md § 5 and CLAUDE.md name the device's selected account among the sealed roots. The plaintext line keeps only the pre-seal `nulo:ui:activeAccount` until a profile holding that account claims it or a selection overwrites it, and § "What sealing does not hide" adds that the envelope names the profile that made the last selection. The re-cut note names the selected account. Privacy 1.2.4's line and § 3 stand as the owner approved them (P84-07).
- KL-1 filed closed as #1096. #1062 reopened with a comment, for the PR to close. #1050 commented: it stays open.

## The review loop

- **Round 1** (Codex gpt-6.1-sol, high, a fresh session over `a2f9e7d0..fddd3e4d`; the Opus leg beside it, an `Agent` on `opus`): both **conditional approve**.
  - Codex 1 = Opus 4 (medium): `purgeForProfile` displaced by the lock's watchdog skipped its removal and resolved, so the sweep could meet the device row and take another profile's later write (Codex reproduced it in memory). Adopted: the purge throws when it lost the lock, so the deletion keeps its tombstone and retries; a regression case stalls the purge's read past the watchdog (it fails without the fix).
  - Codex 2 = Opus 1 (medium): the Home timing case read the account through `getSelectedAccount`, which a base build lacks. Adopted: it reads the fresh profile's first account through the account and network services both builds serve.
  - Opus 2 (low): the committed proof named only the maps-only re-cut. Adopted: the pointer's proof is in `phase-1.md`, and the two merge bases are shown byte-equal for storage.
  - Opus 3 (low): a read refused while the session leaves the profile and returns inside its round trip reads as empty, and the pin toggle or the boot's first-account write then replaces the stored value. Path verified; it needs a switch-and-return through an unlock inside one RPC, which the wallet does not support: closed `known-limit` #1097.
  - Comments: the claim's "one commit" (Codex 3, Opus 5) reworded; `rememberSelection`'s descriptive comment removed (Codex 3); the bare key's registry comment (Opus 5) and `setSelectedAccount`'s `@throws` (Opus 5) corrected.
- **Round 2** (the round-1 Codex session resumed over `fddd3e4d..17b6e5b0`): **approve**, no new material finding. It checked the watchdog fix with an in-memory reproducer before and after, plus a normal-purge control, and found no new evidence to reopen #1097. The loop converged at round 2.

## Close-out

- Merged `dev` at `7c65d152` (#1099, Send's recipient field). The one conflict was `send-keyboard.test.ts`'s imports: this branch dropped `sendFeePicksKey`, and `dev` added `trimAddress`. `baseline:storage` is unchanged.
- No promotion to `lessons.md`: it sits at its 8 KiB budget, and the arc's general gotcha is its `Lock` entry. The browser difference went to `FIREFOX.md`.
