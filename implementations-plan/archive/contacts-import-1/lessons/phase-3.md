# Phase 3: verify #44, full gates, pictures, review loop

- **#44.** `EditContactPopup.vue` unchanged since 61060c0; `EditContactPopup.test.ts` 20/20, including "import mode: the saved contact a row would write is not its duplicate, …" (from #41, 3b80761).
- **test:all** exit 0 (extension 10534 passed). **audit:vue** exit 0, run before the armed builds as the plan warns.
- **Pictures.** A throwaway smoke spec (kept outside the tree) imports 500 generated contacts, locks the wallet from a second window once six rows are stored, waits for the result toast and calls `shotSend`. Run on the arc build (A: "Import incomplete · 10 contacts written"), on a local `shot/toast-B` build (B: "11 of 500"), and on a local `shot/today` build with the base composable and service: today's lock mid-import reads "Error occurred during import", because the next row's read fails and aborts the import. The plan and OWNER-ASKS said "Import ended with errors"; corrected (D12). A first base-code run timed out only because the spec's regex was case-sensitive (`/Import/` vs "import").
- **Slip.** `git commit -a` on the throwaway branch swept the uncommitted STATUS.md lines into it; restored from that commit. Commit throwaway edits by path.
- **Codex round 1** (session 01a12045): approve with fixes; a race test that passed on broken code (the update half), three comments. **Opus review**: same race test, plus a forged-fence row that never exercised its incarnation and an untested capture failure. All folded in `ba2a09c`.
- **Codex round 2** (resumed): clean. Loop converged.
