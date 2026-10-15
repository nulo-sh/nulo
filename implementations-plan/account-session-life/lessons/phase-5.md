# Arc 5: lessons

## Start (2026-10-15)

- Base: `origin/dev` at `1a8b2b6d` (arc 4 merged as #445), branch `account-session-life-arc-5`; `bun install --frozen-lockfile` first (#437 changed `bun.lock`).
- Records built: P7-06 = B (#99), P7-05 = B (#100), P7-07 = B (#159), and from page 7's re-signing (2026-10-14 21:59Z) P7-12 = B (#100, OA-8) and P7-10 = B (#137, OA-6). P7-11 (OA-7) = A is what arc 4 shipped.
- The smoke runner refuses an unarmed build: build with `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1` and run with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`.

## Where § Arc 5 and the tree or the records disagreed

1. **F31, F32, F33** hold at `1a8b2b6d` as written (create's max + 1 and replace, the one caller of `activateCreatedProfile`, the window's kept credential).
2. **P7-12 = B reverses part of § Arc 5.** The plan rethrew `ActivationSupersededError` and every tail failure, keeping "Creating…" (OA-8's "what ships now"). The re-signed page sends those cases to the open profile's home with the same toast. So `activateCreatedProfile` now catches every activation failure and hands off; it rejects only when the hand-off itself fails (a storage write), which keeps the latch.
3. **"The one selected when Create was pressed"** is captured when the New profile page opens (`selectedOnEntry`), not at the press: the page selects no profile itself, so only a shell activation can change the selection in between, and that is another profile taking over, the case P7-12 routes home.
4. **The in-flight predicate counts `bootstrapActiveProfile` only.** Counting `hydrateKnownProfile` too pushed `useProfileBootstrap()` to 82 lines (the budget is 80, and a suppression is never added). The case only a hydrate covers needs a worker restart during the create, another window unlocking the profile that was selected on entry, and the created profile's start failing; its consequence is the unlock screen for the new profile while the other's session is open in the worker (no data crosses). Plausible but unverified; not built.
5. **P7-10 had no phase.** Built as phase 5.4: the unlock screen closes only the toast its own failure ladder opened (by toast id), as the passkey ceremony closes only its own. The shell's bootstrap-failure toast after an unlock attempt and the P7-05 hand-off toast stay on Continue: OA-9 asks.
6. **`activationFailureReason`** moved from `useProfileCreateFlow.ts` to `unlockWait.ts`, beside the error classes, so the hand-off's log and `handleCreate`'s share one copy.

## Gates

- 5.1: account unit 124/124; four proofs red on base; smoke accounts + account-import-export Chrome 12/12 (59 s).
- 5.2: unit 82/82; 14 proofs red on base; smoke passkey-retry + registration Chrome 11/11 (81 s).
- 5.3: window unit 12/12; two proofs red on base; smoke passkey-retry + passkey-toolbar-panel Chrome 9 passed / 6 skipped by design (71 s), Firefox 15/15 (211 s).
- 5.4: auth unit 30/30; the proof red on base; smoke auth-flows Chrome 5/5 (40 s).

## Review, round 1 (2026-10-15)

- Codex `gpt-6.1-sol` high, session `01a13d01-613b-7ee0-9f12-1227ec89d9c3`, read-only: `CHANGES`, three Medium, each demonstrated with a probe. The Opus agent found the same three (as Medium, Low, Low) plus three comments. All fixed (plan § Audit verdicts).
- `test:all` caught what the targeted unit runs did not: `toast-call-sites.test.ts` is a textual guard over every `openToast` call in `src/`, so a toast passed as a constant or through a wrapper fails it. Run `test:all` before the review, not after.
- Two fences guard one activation: the bootstrap fence (`supersedeProfileActivations`) stops `isLogined`, and the shell's event sequence stops failure publication. A supersede that is not also an event (the hand-off) must fence the failure itself.
