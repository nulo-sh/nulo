# Arc 3: revision and implementation log

## Re-verification at the base (2026-10-14)

Arcs 1, 1b and 2 merged (#246, #247, #418). Arc 3 branches from `origin/dev` 1ba770cf as `backup-import-export-arc-3` (D-orch-4). `dev` moved once since, to 7e9eb0fc (#425, the token-list file only). The plan's arc 3 facts were read at f15a9b5; each was re-read here, and where the plan and the tree disagree, the tree wins.

- **Holds.** The tail runs in the page and its retry context is never persisted (`useFullBackupImport.ts:423-425`, `full-backup-restore.ts:630-703`). `PROFILE_UI_KEY_PREFIXES` is what profile deletion removes (`utils/profile-ui-keys.ts:13`, `profile-deletion/coordinator.ts:135`). Torn imports are reaped at seven days (`profile/service.ts:199`). `navigator.locks` is already used (`popup/windows/execute/scope-follow.ts:47`). #230's page builds a plain file at Create and Download has no rule (`export/account.vue:117-146,182-197`). #231's count is logged and dropped (`account/service.ts:871-895`).
- **Tree wins: the passkey export's names.** The probe lives in the private `ProfileService.exportPasskeyCredential` (`profile/service.ts:1788-1857`), exposed as the RPC `exportPasskeyBackupMaterial` (`:1917-1925`), and never touches rows. `AccountService` resolves `ProfileService` at `init()` (`account/service.ts:157`), not in its constructor.
- **Tree wins: OA-9 = B is not built.** Arc 1 shipped option A (no profile check, `useFullBackupImport.ts:86-151`), as its "what ships now" said; the owner then picked B. The brief says to build nothing for #226 unless the tree disagrees; it does, so Phase 3.1 builds B.
- **Tree wins: the tail has a fixed budget.** `IMPORT_CHAIN_SYNC_TOTAL_BUDGET_MS = 45_000` (`importChainSync.ts:29`). The reminder's lease is therefore one write at the start of a run and one at its end; the 10-second renewal timer the plan had is dropped (D-arc3-2).
- **Tree wins: a profile row commit drops UI keys first.** `dropUiKeysBeforeAdoption` runs at every restore's row commit (`profile/service.ts:1477-1482`), before the reminder is armed. With the reminder's prefix in the list, a stale record under a reused id is dropped by the commit itself.
- **Tree wins: Firefox intercepts RPC.** `interceptRpc` refuses or redirects on Firefox too (`tests/e2e/FIREFOX.md:47`); only held-target CDP Fetch is Chrome-only (`import-dead-rpc.test.ts:164`). The refused-node smoke scenario runs on both browsers.
- **Tree wins: no composition test fits.** The account-state restore calls `registerSender`, which is outside the four `ShallowPxe` methods (`tests/COMPOSITION-TESTS.md` D1), and contract registration hashes artifacts (D6). Arc 3 has no composition layer; unit tests and e2e carry it.
- **Tree wins: the e2e plain account files.** `tests/e2e/helpers/account-io.ts:97-125` downloads a plain account file from the ready stage; `account-import-export.test.ts` and `backup-imported-account.test.ts` depend on it. After #230 no screen makes one.
- **Tree wins: `Banner` carries one action.** `packages/design/src/ui/Banner.vue` has a single `action` prop; its button composes `type--label`. The `shot/192-A` prototype hand-picks a face and letter spacing, which `type-role-ban.test.ts` now refuses.
- **Dropped with its record: #98.** OA-5 = C. F15, F16, I7, D11 and the old Phase 3.1 are retired.
- **The commit subject the brief names is 109 characters**; commitlint's `header-max-length` is 100. The planning commit uses a shorter subject with the same four topics.

## Planning audits of the revision (2026-10-14)

Transcripts: the gitignored `audit-arc3-*.md` in the plan folder. Every cited line was re-read before a finding was accepted.

| Round | Verdict | Findings | Disposition |
|---|---|---|---|
| Codex r1 (gpt-6.1-sol, high, session 01a13bf1) | reject | C1-C8: a stale page registering into a same-id successor; non-retryable read as restored; the banner's re-reads and an empty-list prune; stale admission; worker removals outside the lock; NE1 held by a gate that self-releases at 20 s; build transitions; names in logs | all accepted: D-arc3-6 to D-arc3-8, D-arc3-13 to D-arc3-15, D-arc3-18, I9 |
| Opus 5.5 Plan | conditional approve | O1-O13: the read pruning during a profile switch; the gate; the chaos note; the per-network hook; the arm's failure; seven specs on plain account files; Protect doing nothing; the passkey count's boundary; fact fixes | all accepted: D-arc3-6, D-arc3-8, D-arc3-16 to D-arc3-19, OA-11 |
| Codex r2 (resumed) | conditional approve | C2-1 an async per-launch assert left a window before the PXE client captured the generation, and rows of another profile passed; C2-2 the collected rows drop successes; C2-3 a default network run refuses marked files; C2-4 a cold PXE read under the refusal; C2-5 OA-10's switch row promised a rollback | all accepted: D-arc3-7, D-arc3-13, D-arc3-18, the arc gate, OA-10 |
| Codex r3 (resumed, last) | conditional approve | C3-1 a fence captured after `finalizeRestore` by a second call can be a same-id successor's | accepted: `finalizeRestore` returns the fence (one caller) |

- **Tree wins: seven, not nine, specs** take plain account files, through two helpers (`exportAccountBody`, `exportImportedAccountBody`), three of them network specs.
- **Tree wins: a network refused for another chain is not retryable** (`importChainSync.ts`, `syncOneNetwork`), so settling by retryability would have shown a success toast for it.
- **Tree wins: the fence needs a synchronous check.** `ContactService` pairs its async `assertRunFence` with `isFenceLive` right before the write (`contact/service.ts:241-246`); the account-state launch awaits its artifact check first (`account-state/service.ts:415`), so an async assert alone leaves a window.
- **Tree wins: a default network run refuses `@requires-proverless` files** (`scripts/e2e/proverless-guard.sh:54`), so the arc gate runs two selections.
