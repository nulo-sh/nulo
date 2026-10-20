# backup-restore-2: owner asks

## OA-1: the detail line of a new restore refusal

- **Surface**: the import's error details (Import → "review the details"), one line per refused row. The screen-level outcome is the existing "Profile import completed with some errors" (onboarding: "Import completed with errors" / "Some entries from the backup couldn't be restored."); it does not change.
- **What is new**: one row message, in the register of the existing detail lines ("restored pending transaction rejected", "transaction already exists (hash collision)"): a transaction row naming no account of the restored profile reads `transaction names no account of the restored profile`.
- **Options**: A. keep this line; B. a generic `row rejected`; C. owner wording.
- **Recommendation**: A. The details log exists to say which row failed and why.
- **What ships now**: A, through the existing outcome. No screen, layout or headline copy changes. Today's import drops such rows before this check, so no person meets the line on the current path.
