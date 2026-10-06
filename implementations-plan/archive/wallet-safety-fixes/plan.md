# Wallet safety fixes

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Enter confirms a transaction popup only from its own focused confirm button, `createAuthWit` refusals carry fixed text, trust writes land only in the session and profile incarnation that decided them, and profile deletion removes the pinned-tokens key (`apps/extension/src/composables/usePopupEntity.ts`, `packages/wallet-bridge/src/method-scope-checkers.ts`, `apps/extension/src/wallet/services/incoming-transfer/service.ts`).
- **Open items**: residual cases around profile-keyed state, trust writes and token-add cleanup, and the e2e notes to route into the testing skill, all tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Four small safety and privacy fixes and one comment correction, delivered as one change.

- **Enter.** The `submitKey` override that let a popup install a document-level Enter able to confirm a transaction is removed from `usePopupEntity`, so no consumer can install one again. Its remaining Enter shortcut answers only a keystroke inside a text field. The confirm button's native activation is the one keyboard path, and it ignores a repeat or composing Enter. `DropdownRoot`'s Enter clicks only an item of its own menu.
- **Refusals.** The three `createAuthWit` scope refusals state fixed text with no request value.
- **Trust writes.** `setTrustAllow`, `setTrustReject` and the token add's automatic trust write only if the session and the profile incarnation are still the ones that decided. A decision overtaken by a lock, a switch or a deletion writes no row, moves no floor, un-hides nothing and returns `false`.
- **Deletion.** Every deletion path removes the profile's pinned-tokens key, and a pin writes nothing once its scope changed. A new profile-keyed UI key has to be registered or a test fails.
- The operation journal's id comment states the id's real width and cites no review.

## Why

- A confirm that any control can trigger lets a keystroke aimed elsewhere send a transaction. Held and IME-composing Enter can also reach an idle focused confirm, so both confirms cancel such an event.
- Refusal text is one logger call from the log store, which exports into bug reports, so a refusal must not interpolate what a dApp sent. A sentinel placed in every request field proves it appears in no error, log call or response.
- A trust decision that outlives the session that made it can apply to a same-id profile re-imported afterwards, which would inherit trust it never granted.
- Removing the override from the composable's API fixes the class, where deleting the two uses would fix only the instances.

## What shipped

- `isRepeatOrComposing` in `usePopupEntity.ts`, used by both authwit confirm buttons and by the form popups. `CLAUDE.md` states the rule under keyboard and focus order.
- Fixed refusal texts that keep the `Scope violation:` prefix.
- Lifecycle fences on the three trust writers. The token add's last fence deletes its row only while it owns the lock.
- A deletion purge and a test that registers profile-keyed UI keys.
- Tests that fail on the old code prove each case, and network e2e specs ran on Chrome with the prover on and on Firefox proverless.

## Lessons

### Protocol timeout

One `waitForFunction` is one protocol call, capped by the connection's `protocolTimeout` whatever its own `timeout`. A 600-second wait failed with a protocol error instead of its own message once the awaited toggle outlasted the 300-second cap. Poll in short reads and log what started the wait.
