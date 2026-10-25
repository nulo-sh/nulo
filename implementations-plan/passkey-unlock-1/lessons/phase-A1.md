# Phase A1: core and seams

## 2026-10-25 · A1.2: the classifier cannot be the stored-shape schema

Attempt 1: the repository classified every row with `ProfileRowSchema` (the stored-shape entry, which requires `envelopeMac`, `dekSealed`, `walletFingerprint`) and hid a row that failed, as `EntityStorage` hides a row that fails its codec. Six tests in `P/service.integration.test.ts` went red: a password row whose `envelopeMac` is deleted or non-string must unlock derived-only (`:4329-4357`), and a restored passkey row whose `type` is edited must keep its finalize refusal (`:4446-4500`). Hiding turned both into "Invalid profile id".

Cause: the stored-shape schema says what writers write; the runtime has to decide which unlock reads a row, and the degradation rule tolerates damage to exactly the fields the writer schema requires (MAC, DEK slot, fingerprint).

Codex consult (gpt-6.1-sol, high, read-only): the split is right, high confidence. Accepted: return only the validated unlock fields, derived with `.pick()` from the writer variants so one definition stays the source; record that a type-edited row is now refused before any decrypt, and pin it; in A2, `unreadable` must not mean hidden, and the passkey export and silent restore must go through the classifier. Rejected: none. Decision: plan.md D19, D20.

## Smaller deviations

- `RestoreMaterial` and its decoder live in `P/restore-material.ts`, unit-tested on their own; A2 moves the type to `P/spec.ts` if the RPC takes it.
- `openSlots`'s DEK opener takes the sealed blob, because unlock opens the re-read row's DEK, as before.
- A password slot that is not a string now opens to `null` in `PasswordSecretBox` instead of throwing from `Buffer.from`; the classifier keeps such a row from reaching it.
