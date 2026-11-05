# Phase 0: planning consults

## Codex R1 (gpt-6.1-sol, high, read-only), 2026-11-05

Verdict: approve with changes. Findings, each checked against the tree:

1. F6 false (demonstrated): `TokenSchema.contract` is `z.string()` (`wallet/services/token/spec.ts:65`) and `restoreRow` keeps a backup's spelling (`wallet/services/token/service.ts:1077-1078`), so a restored `0X…` row matches today's `toLowerCase()` check and not `sameFieldAddress`. Accepted: New token's comparison stays as it is; its existing comment is the why (D6).
2. Select profile's delete: splice in place vs `withoutId`'s new array; no identity-sensitive reader found. Codex: keep the splice. Decision in plan D4 after the Opus leg.
3. Pins missing for wrapper behaviour: connected-apps logo on add and unlisted update; Edit FPC's own-row update and the close-before-delete. Accepted.
4. D7 overstated: the smoke specs do not reach Select profile, Import contacts, New sender, Edit FPC. Accepted: the claim is narrowed and those surfaces are assigned to component tests.
5. A1 cannot be silent. Accepted: the plan records the evidence (the harden filing rule, the orchestrator's launch record) and the final report names it.

## Opus R1 (Plan agent, opus), 2026-11-05

Verdict: approve with changes. Accepted: the two missed "Invalid address" displays (`EditFpcPopup.vue:282`, `ContactFormFields.vue:54`); Edit FPC, connected-apps and reducer-option pins; the smoke list swapped (`accounts` out; `auth-flows`, `contacts`, `contacts-import` in); F2 restated; D6's issue items; the verbatim preselect guard; `.add` registrations below the reducer object; the `entity-rules.ts` header and Edit profile's comment. Rejected: dropping #1449 for want of a record (A1 keeps it on the orchestrator's launch, named in the final report). On Select profile's delete it sided with `withoutId` against Codex R1 (D4).

## Codex R2 (resumed), 2026-11-05

Verdict: approve with changes; D4 and D8 upheld. Accepted: the reducer-option and `profileNameTaken` tests cannot be green at the base, so they land with their code; Edit FPC's delete pin also checks the early return; F2 says "production file"; recon's contract spelling includes restore. Rejected: a close-before-toast order assertion (one synchronous handler; no consequence).

## Codex R3 (resumed), 2026-11-05

Verdict: approve. The R2 fixes verified; no new defect.
