# Phase 0: planning consults

Every consult of the planning run, with its verdict. Paths repo-relative.

## Recon (2026-10-27)

- Two Sonnet explorers: the e2e reuse sweep for the passkey flows, and the product map of those flows with the in-process layer. Both verified at the cited lines by the planner (`service.passkey-unlock.test.ts:836`, `useFullBackupImport.ts:444`, `useProfileImportFlow.ts:464-467`, `unlock-method.vue:255`).
- The model test at the base: 209 tests, 32 s.

## Codex, round 1 (gpt-6.1-sol, high, 2026-10-27)

Verdict: reject (blocking 1 to 3). Each claim checked against the tree:
1. Shared credentials do not mean shared accounts: O6's `siblings` (`PC/checkers.ts:853`) pairs credential sharers; each create mints fresh entropy (`service.ts:910`). Confirmed. Accepted: siblings by phrase only, with a fixture of two phrases on one credential.
2. `checkSentinels` (`PC/checkers.ts:877`) expects no imported accounts on a passkey profile. Confirmed. Accepted: imports checked under either method.
3. D1's shim overwrites whatever `allowCredentials` the wallet sent, so a reuse that named credentials would be repaired. Accepted: the narrowing first records the wallet's request and fails a request that names a credential or lacks the PRF input.
4. Capture by `rawId` in the wallet's base64 (`passkey-ceremony.ts:89`), bound before a drain or a navigation (onboarding). Accepted.
5. Wrong credentials from every minted one but the target's, so a replaced credential is tried. Accepted, with a hand list (change, lock, old credential refused, new one opens).
6. `|| break` returns 0. Confirmed. Accepted: `|| exit 1`; plus short browser hand lists for the critical combinations.
7. CH6 cannot start in a session (`chaos-session/serve.ts:653` plans from `empty`). Accepted: CH6 leaves the fleet; the `pre-update` seeds cover retired rows.
8. Keep the full confinement probe. Accepted: CHARTERS.md lists its items.

## Opus Plan agent, round 1 (2026-10-27)

Verdict: conditional approve; 9 findings, each checked against the tree. Findings 1 and 2 match Codex 1 and 3. Accepted: the launcher's `do` runs the drivers without `PC/run.ts`'s capture (`chaos-session/serve.ts:645-660`), so each passkey driver installs it; the archived probe list verbatim, plus a `$HOME` canary and the CLI flags rechecked; D7's salt clause dropped, since two rows on one salt already fail O7 (`PC/run.ts:167-178`, fixture at `scripts/e2e/profile-chaos-model.test.ts:1512`); D10 narrowed: of the drawn variants only Unlock method's `other` answer logs at error (`unlock-method.vue:173` after `service.ts:501-502`; a wrong password and a refused prompt log nothing, `:188-192`, `:172`); `World.minted` replaced by the credential counter, optional fields as `onboardingCreate`; `PC/network-drivers.ts:219` in the map; hand lists carry per-action coverage; the network command arms the file; every un-narrowed discovery refused in arc 2. Rejected: none.

## Codex, final fresh pass (gpt-6.1-sol, high, 2026-10-27)

Verdict: conditional approve; 3 conditions, each checked against the tree and accepted: Unlock method's passkey → new passkey asks a `get` by the current credential, then a `create` by the new one (`unlock-method.vue:205-209`), so a step's answers are checked as a sequence; an absent `method` on a recorded list must keep password semantics (`spec.ts` loads lists raw); the launcher check could pass with `unlockPasskey other` refused by its precondition before any ceremony, so it names its parameters and needs two credentials. No finding against F1 to F10.
- Codex final resume: approve.
