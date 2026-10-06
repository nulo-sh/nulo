# Harden findings remediation

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the dApp-boundary, messaging, storage and session hardening listed under What shipped, across `packages/wallet-bridge/`, `packages/extension-messaging/`, `packages/wallet-crypto/` and `apps/extension/src/wallet/services/`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Remediate every finding of a whole-codebase security audit as eleven independently reviewable units, each on a child branch of one integration branch, which then promoted to the default branch through a single pull request so that real CI ran once, on the combined change.

- Units were ordered risk-first with quick wins in between: the dispatcher boundary first, the session-bearer redesign last because it depends on the backup-restore allowlist.
- Each unit carried a rigor tier. Mechanical units were implemented and validated directly; the two auth-boundary units (dispatcher, bearer) wrote a design with invariants and the negative tests that must pass before any code.
- The bearer redesign was confined to the ephemeral session record, so profile encryption stays byte-identical: no storage version bump, no wipe, no re-registration.
- The selector-to-name binding for contract calls lives in execution, not in the scope checker, because the contract ABI is unreachable at authorization time and making scope checks asynchronous would put the PXE inside the dispatcher.

## Why

The primary adversary is a malicious or compromised connected dApp; the secondary ones are local malware or a shared clipboard, and tampered local storage or backup files. Each unit was checked for regressing the boundary it hardens, and several constraints held throughout: no custom cryptography, no new runtime dependency, no async scope checks, and the verified-sound authwit signature binding untouched.

PRs into an integration branch get no GitHub CI because the workflows trigger only on pull requests to `main` and `dev`, so each unit ran its full local gate and the promotion carried the required checks. Editing the workflow filters to add the temporary branch was out of scope.

## What shipped

- **Dispatcher**: a bare authwit hash from a dApp is rejected in favour of a structured intent, call arguments are shape-checked where they bear on authorization (`assertAuthRelevantArgShape`), and a function selector must match its name at all three execution sites, including the authwit intent.
- **Approval display**: labels are sanitized and the `canCreateAuthWit` grant is shown.
- **Chain identity**: signing uses validated chain info rather than a second fetch.
- **Discovery**: global and per-origin caps with coalescing in `discovery-queue.ts`.
- **Backup restore**: a typed config allowlist so a backup cannot disable strict mode, set the session TTL or toggle developer settings.
- **CSP**: `img-src 'self' data: blob:` in `apps/extension/manifest/manifest.config.ts`.
- **Messaging**: sender-URL authentication for the offscreen channel.
- **Storage**: dApp session rows carry a per-row MAC (`mac-storage.ts` and `integrity.ts` under `apps/extension/src/wallet/services/dapp-session/`), keyed from the profile master secret, and a row that fails verification is dropped.
- **Clipboard**: a warning on the recovery-phrase export page and a best-effort delayed scrub of the copied phrase.
- **Session bearer**: `SessionSecretBox` replaces the password-equivalent passhash with a random-token wrapped secret, with a fail-closed shape check on restore and scratch buffers wiped.

## Lessons

### pgrep

`pgrep -f` matches the agent's own `zsh -c` wrapper when the pattern appears in the command running it, so a teardown can signal its own shell and kill the harness's tracked tasks. Match by process name or by `/proc/<pid>/cwd`, exclude the launcher's own pid and parent, and signal the launcher's process group instead of one picked from a pattern.
