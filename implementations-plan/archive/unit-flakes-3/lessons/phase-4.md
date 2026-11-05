# Phase 4: whole-suite gates and the review loop

- `test:all` run 1: red in `scripts/type-roles/inventory.test.ts`. The unreachable `action_operations` branch pins a digest of each producer file, and Phase 2 edited `auth-registry/service.ts`. Re-attested (the edit only returns the tx-update handler's promise; the operations still go through `executeSendTransaction`, outside the execute window) and re-pinned in its own commit. The plan's change map had missed this pin (D8).
- `test:all` run 2: red in `account-state/service.test.ts` (PER-LAUNCH deadline), the open flake #1226, on a loaded host; no file under `account-state/` changed. Commented the occurrence on #1226; one rerun.
- `test:all` run 3: exit 0. `bun run test`: exit 0 (15932 passed).
- Review loop round 1: Codex `findings: 1` (stale auth-registry comment with a plan path), Opus `findings: 3` (slot header primitive, same-tick name and comment, missing invariant on the new check); all low, all accepted in one commit. The comment edit moved the type-roles digest again: re-pinned in the same commit.
- Review loop round 2 (Codex resume): `clean`.
