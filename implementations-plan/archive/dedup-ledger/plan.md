# Dedup ledger

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Shared helpers, page shells and style partials across the extension and its packages, for example `packages/design/src/ui/FieldWarning.vue`, `apps/extension/src/components/composite/SettingsPageShell.vue`, `apps/extension/src/composables/useAuthRegistryStatus.ts`, `apps/extension/src/composables/usePopupEntity.ts` and `apps/extension/src/wallet/utils/raw-row.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

A maintainability review, not a bug hunt: fourteen cluster reviewers each read every non-test source file of one cluster, a clone detector ran over the same scope, and the largest claims were re-verified by hand. The result was 92 findings worth about 3,300 net lines out of roughly 117k read. The work shipped as five phases in one bottom-up stack of pull requests, and a sixth small change fixed three bugs the stack had pinned.

- Delete dead code and make the access-level map exhaustive, so a new operation kind cannot silently get the weakest gate.
- Adopt the helper that already exists instead of re-typing it inline.
- Collapse repeated wrappers in the service and utility layers.
- Share the page shells and style partials.
- Share the field, list-sync and card pieces of popups and windows.

Nine findings stayed out of scope on purpose: byte-frozen ciphertext framing, KAT-pinned bit math, and audit-hardened session and purge code.

## Why

The services were tight and already audit-scarred. More than half the waste was copy-pasted Vue style blocks and page scaffolds, which is cheap to share and costly to leave. Every phase had the same rules: zero user-visible change, every `data-testid` verbatim, no new complexity suppression, layer bans decide where a shared piece lives, and a finding that proves wrong or unsafe on contact is skipped and logged, never substituted.

Skips made on contact, always because the copies were not the same thing:

- A generation fence in the export and import pages bumps on every capture, so repeated file picks would stop sharing a generation.
- The strict base64 decoder rejects what the permissive one accepts, so the MAC verifier keeps its decoder and only the encoder is shared.
- An async wrapper would insert a microtask in front of task completion, an ordering class that already regressed once.
- A profile-activation wait would fail immediately where the page waited out a timeout.
- Onboarding heroes, incoming-card chips and some list empty states differ in padding, markup or shrink rules, so a shared piece needed more props than the lines it saved.

## What shipped

- **Delete**: dead components, an unreachable enum member with its switch cases, and an ignored argument. Access levels are a `Record` over operation kinds.
- **Helpers**: `deferred`, `errorMessageFromUnknown` at 36 call sites, `copyWithToast` at 17, `randomIdNotIn`, `requireArtifact`, `isNewPasswordValid`, `isEmbeddedFeePayment` and `buildIncomingCardProps`.
- **Services**: `prefixedEntries` and `decodeRow` for the repositories, `definePassthroughsExhaustive` for the clients, a table for transfer function lookup that rejects inherited names, and `createListenerBag` for test fakes.
- **Vue**: CSS-module partials consumed with `composes`, the settings page shell and loading and error blocks, `FieldWarning` for fourteen warning rows, one decision path for the trust popup, and table-driven capability rows. Net across the Vue phases: about 870 source lines removed and about 1,000 lines of parity tests added.
- **Follow-up fixes**: the simulate view now renders an authwit action like the send view (`OperationActionRow.vue`), the token metadata popup renders only after its token loads, and console forwarding hooks moved off `window.onerror` to `self.nuloOn<method>`. Three more popups moved onto `usePopupEntity` and the registry scaffold the authwit popups copied became `useAuthRegistryStatus`.

## Lessons

### Merge ref

A `pull_request` run takes its workflow files from the merge ref but builds `head.sha`. On a linked stack, a gate that the trunk gained after the branch point therefore runs against code that lacks the matching fix, and a red there is not real. Merge or sync the trunk before debugging, and sync a stack when the trunk adds a gate.
