# Aztec JS line 5.2.0

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the `@aztec/*` JS line moved from 5.0.1 to 5.2.0 with the Noir surface and the frozen account held (the line has since moved on); the single-generation guard `scripts/aztec-hold-residue-check.ts` and the runbook lessons in `.claude/skills/aztec-update/SKILL.md` and `UPDATE.md` remain.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Bump the 20 `@aztec/*` package names across the workspaces to 5.2.0 as a version-only change (the live network already matched the pinned rollup version, so no reset and no redeploys). Hold the Noir toolchain and committed artifacts, `@aztec-foundation/aztec-standards`, `@alejoamiras/private-fee-juice` (no release for the new line existed), `@aztec/viem`, and the frozen account surface. Ship the CI proving-server binary bump first as its own change, on the old line, so a misbehaving binary reds on known-good code and reverts alone. The bump itself is the second change.

## Why

A red freeze test, address KAT or drift detector means upstream moved a protocol-level input, so the arc was written to stop rather than re-pin. The first prover-on canary run did go red: upstream's verification-key index lookup uses `instanceof` across two byte-identical copies of the same module (the wallet's and the proving SDK's nested copy), fails the check, and treats the whole object as a hash. No SDK logic of ours could fix that short of deduplicating the bundle, so the first-party proving SDK was cut at 5.2.0 instead and moved with the line. That made the prover path single-generation and removed a type cast the arc had provisionally allowed.

## What shipped

- At the bump: exact 5.2.0 pins in every workspace, regenerated patches for the two `noir` export maps (upstream had not fixed them), and a targeted lockfile re-resolution instead of a full regeneration.
- `scripts/aztec-hold-residue-check.ts`: a reachability allowlist for held packages (empty on the current line) replacing "zero residue". It derives its held roots and specs from the lockfile and also asserts the whole prover path resolves to one generation.
- The CI proving server pinned by SHA and run unseeded. A seeded binary answers every proof request with itself whatever version the SDK asked for, so the seed was dropped.
- One dated min-age exclude for the freshly published first-party SDK, justified by its verified registry signature and build attestation, since removed; no exemption is active.
- The account-state backup slice cap in `apps/extension/src/wallet/services/account-state/normalize.ts`, raised to 40 MiB. The bump pushed a three-network backup just past the old cap because each network stores full contract artifacts. 40 MiB stays below the whole-file cap, so the slice cap keeps binding, and the export-time warning (80% of the cap) still fires on today's payload.

Durable lessons from the arc, now in the runbook: clear each dev-served app's `node_modules/.vite` after a dependency-line swap (stale optimizer caches look like a broken dApp page); a canary that fails with zero `Received /prove request` lines failed in witness generation, not in the prover; the frozen-account canary plus the fee-method suites are the only real-proof coverage of the private-fee-juice boundary, because CI runs its fee lanes proverless. The first-party SDK grew from 32 to 38 files across this bump with new transport work: the arc verified its registry signature, build attestation and dependency pins, not that diff.
