# Phase 5: the contact admission rules

- `canSubmitContact` takes the popups' `isValidAddress` computed as a `validAddress` handle, not the raw address: the gate read that computed before, and reading the address ref directly would change what the submit computed depends on. Refinement inside D11, which names an address handle.
- The validators are generic over the row type, so Edit's `isEditedContact` (which reads `id`) types against the rows it is given.
- A test pins the invariant the handles exist for: a check that returns early never reads the handles after it (each later handle throws on read).
- `bun run --cwd apps/extension build` regenerated exactly the three globals in `auto-imports.d.ts` and `.eslintrc-auto-import.json`; #534 had already landed on `dev` before this arc began, so no rebuild over a merge was needed.
