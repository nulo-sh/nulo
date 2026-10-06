# Passkey display-name branding

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a pure label formatter, `apps/extension/src/wallet/utils/passkey-label.ts`, used by `buildCreateOptions` in `apps/extension/src/wallet/utils/passkey-ceremony.ts`, with the profile name threaded through every passkey creation path.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

New passkeys register as `nulo-{name}-{id}` instead of the opaque `profile-{id}`, so a password manager shows a readable, unique label. `user.name` and `user.displayName` carry the same value, so the label renders the same whichever field a manager prefers.

The name goes through a sanitizing formatter: compatibility-decompose, strip combining marks, lowercase, reduce runs outside `[a-z0-9]` to a hyphen, trim, cap the slug at 24 characters. An empty result (all-emoji, all-symbol or non-Latin names) falls back to `nulo-profile-{id}`. The relying-party name and id are untouched, and existing passkeys keep their old label, since WebAuthn metadata is fixed at creation.

## Why

An opaque label makes several profiles indistinguishable in a keychain, while the name alone is not unique, hence name plus id. The change is cosmetic: the PRF input is a constant and neither the master-secret derivation nor the address derivation reads the user fields, with the key-vector tests as the tripwire.

The real trade-off is privacy: the label syncs to the platform's cloud keychain, and where the opaque label carried nothing personal, it now carries a normalized form of the profile name. It is accepted for the sake of disambiguation, and only a sanitized, length-capped slug leaves the device. The same allow-list removes bidi overrides, zero-width and control characters, so a crafted profile name cannot spoof another credential's label. The combining-mark strip is what makes an accented name fold cleanly instead of leaving a stray hyphen.

## What shipped

- `formatPasskeyUserName` with unit tests covering folding, spoofing characters, the length cap and the fallback.
- `name` as a required field on the create request, so the typechecker proved every creation path was covered. There are two: the popup's in-page ceremony and the background-driven window, which needed the name passed through the recovery coordinator and the passkey service.
- A ceremony test asserting the label and that the PRF input, challenge size, relying party, algorithms and user id are unchanged.
- A manual smoke against a real authenticator was not run at delivery.
