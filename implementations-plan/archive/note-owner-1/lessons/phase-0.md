# note-owner-1 phase 0: consults

## Path consult (Codex gpt-6.1-sol, high, read-only)

- **r0**: the first run returned a provider error before any review. Reworded and rerun.
- **r1**: the facts hold (NoteStore scopes, per-scope sync, the key oracle's scope check, UintNote's owner-key nullifier, owner-only delivery). Without the owner's key no nullifier is computed, so nothing is stored. Partial-note completion and the offchain inbox pass the same gate. Recommended `owner: account` on the incoming reads, the developer viewer kept scope-only.
- **r2**: pushback: the filter closes no path the per-scope sync trace leaves open, and the house rule fixes causes, not payloads. Codex withdrew the filter: `approve (a)`, #1049 a known limit, its public reopening conditions as written in plan.md.
- Decision: D1 adopted. The tripwire (D2) came after, from the `*.sources.test.ts` precedent found while drafting.

## Dual audit

- **Codex leg (resumed session)**: `conditional approve`; six conditions, all adopted (plan.md § Audit verdicts).
- **Opus 5.5 leg (`Plan` agent)**: `conditional approve`; findings on wording, the regex form, F7 and the Post-implementation steps adopted. Codex asked for comment-stripped, method-bounded matches; Opus for no parser helper. D5 first took Opus's anchored contiguous regexes.

## Final fresh pass (Codex gpt-6.1-sol, high, new session)

- **r1**: `conditional approve`. It showed a plain regex still matched when the original method sat in a block comment beside an unchecked replacement, and that two regexes were not tied to their function. D5 now drops comments with one expression before signature-anchored, function-bounded regexes, with retired-code and rename controls; a scratch prototype confirmed every control. Also folded: the test header and public text bounded to the PXE's own sync, the gate's working directory, I1 replaced by the code-order fact F12.
- **r2**: verified the fixes; one gap left: the sync regex could match the pinned call in a non-exported sibling `async function`. Fixed: the bound now stops at any function declaration, and sibling-function controls join rules 2-5; the prototype misses them all.
- **r3**: `approve`.
