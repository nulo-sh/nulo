# service-structure-1: phase 0 (planning consults)

Every consult of the planning run, failed ones included.

## Consult 1: Codex plan audit (2026-10-17)

- Model gpt-6.1-sol, effort high, read-only, fresh session. Verdict: **conditional approve**.
- Accepted: the fee-trait proof must be a two-way equality (a flipped entry passed the one-way check); `FEE_SETTINGS_OF` refuses nothing, so test its real contract; the nested-action refusal test already exists; a stale failure record for a reused profile id could start a second bootstrap after a good activation, fixed by retiring the record at the activation's synchronous entry; name one e2e invocation per arc; run the cross-arc pass before the last PR opens.
- Rejected: outline B (the lane brief assigns whole issues to arcs); a test pinning the bootstrap interleaving (the entry clear removes its trigger; the event-before-response ordering is cited from code).

## Consult 2: Opus Plan leg (2026-10-17)

- Verdict: **conditional approve**. Outline A preferred.
- Accepted: the send/fee pair is hard-coded at eight more sites; the ones that only guard `feeSettings` read the table, the rest are listed as unchanged. The drain cases stay in the service suite (the owner's "keeps its tests"). Arc 3's e2e must include `incoming-public-transfers` (the spec that reaches the outbox). Shape equalities for `actions`, `eventFilter` and scope; a three-way branch with a refusing arm; null-safe guards; `readonly` holders and a state-key allowlist; redaction keys for the restore inputs; an inline deps literal; wording fixes. Kinds are wallet literals built by the dispatcher, so the threat model names the fields, not the kind, as page-controlled.
- Rejected: a second, smoke e2e invocation for the passkey restore (unit coverage through `restore()` proves the commit).

## Consult 3: final fresh Codex pass (2026-10-17)

- New session, gpt-6.1-sol, high. First verdict: **conditional approve**: full-backup import finalizes on its own client, so the event-before-response ordering does not cover it; and the last arc's close-out must wait for every other arc.
- Resume 1: close-out fixed; my trace that recovery always joins the shell's run was wrong (the SW answers `getActiveProfile` only after the profile lock and initialization), so the full-backup case is plausible, not unsupported. Disposition: a closed `known-limit` issue filed by arc 1.
- Resume 2: **approve**.
