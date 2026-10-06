# Behaviour-preserving deduplication

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Most of the duplication a whole-codebase quality audit found, folded into shared helpers without changing behaviour, which cut duplicated production lines by about a quarter, plus two bug fixes the refactors reached and four invisible, strictly safer fixes. New shared homes include `packages/wallet-core/src/utils/serial.ts`, `apps/extension/src/wallet/services/profile/profile-row.ts` and `apps/extension/src/composables/usePopupStack.ts`.
- **Open items**: deferred deduplications, robustness leads pinned as today's behaviour, and visible drift left for owner calls, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Remove the audit's duplication without changing behaviour. Where copies disagreed, the helper took the difference as a named policy or parameter, not a stack of boolean flags, so each consumer kept what it did. Behaviour included what tests rarely watch: await placement and microtask counts, event order, which properties a render or guard reads and in what order, native error text, persisted key order, pixels and computed styles.

Three routes allowed change, each with a red-then-green test. Two bugs the refactors reached were fixed in their own commits. An invisible, strictly safer fix could ship as its own change if it moved no pixel, copy, dApp wire code or persisted byte and only added a cleanup, or a refusal where today's result was wrong. Anything a user could see went to the owner as separate calls ([hd-behaviour-alignment](../hd-behaviour-alignment/plan.md)). Some safer-looking changes were excluded by name, such as strict base64 decoding at the sites that decode leniently, where a garbled restore would start to throw.

The work landed on one integration branch as stacked, gated changes, one per group of related findings, ordered from deletions and CSS up to persisted rows, concurrency and popups, each helper before its consumers. Every change first pinned today's behaviour in characterization tests the refactor could not edit, proved them by mutation or a forced diff, and compared anything that renders at its parent and head on Chrome and Firefox, dark and light, where only a zero pixel diff passed.

## Why

The audit found the same rules hand-copied across sites, and copies had drifted: an account patch checked two of its three identity fields, and an account import lacked the deletion fence that account creation had. A missed copy fails silently. Deduplication is also where silent behaviour change hides: deletion fences and concurrent writers depend on await placement, a Vue render tracks every read made before a throw, and the unit tests run on Bun while users run Chrome and Firefox. Sharing only what could be proved equivalent, and recording the rest, beat shipping a guess.

## What shipped

- **Styles.** The dark palette declared once in `packages/design/src/base.css`, hairline and scrim tokens in `packages/design/src/token-contract.ts`, and shared CSS modules that consumers compose for settings rows, record cards, toolbar buttons, popup bodies, detail pages, activity cards, empty states and the error shake. A composed module is copied into every lazily loaded chunk that uses it, so source order never decides: on each element the shared and local declarations stay disjoint, or the local rule wins by specificity.
- **Primitives.** `walletChainId` (`packages/wallet-core/src/utils/chain-id.ts`), one RPC transport verdict that the endpoint schema and the node adapter each wrap, a serial queue with a propagate or report policy, record guards (`packages/wallet-core/src/utils/guards.ts`), the lenient base64 decode named once and kept lenient (`apps/extension/src/wallet/utils/lenient-base64.ts`), and one code-to-class registry for wire errors (`packages/extension-messaging/src/errors.ts`).
- **Trust checks.** `liveChainInfo` checks a live node's chain identity against the selected network before building its `ChainInfo` (`packages/aztec-runtime/src/utils/chain-identity.ts`), and `assertSelectorBinding` takes named policies (`apps/extension/src/wallet/services/execution/contract-resolver.ts`), beside one class-id assert, authwit effect decoder and sender rule; consent planning moved verbatim into `packages/wallet-bridge/src/capability-negotiation.ts`.
- **Fees and rows.** The primary-endpoint lookup, validated simulation options, the fee card's scope identity and the estimate-reuse vocabulary (`apps/extension/src/wallet/services/execution/estimate-reuse-shared.ts`); a named-field transaction record; row identity and scope keys; the restore preamble (`apps/extension/src/wallet/services/restore-fence.ts`); the credential-row builder and an expiring stash (`apps/extension/src/wallet/services/profile/expiring-stash.ts`); one IndexedDB delete with named blocked policies; one incoming-transfer trust promotion and scope clear.
- **Popups and pages.** `usePopupStack`, `useIncomingTrustPrompts` and `useTokenBalanceSnapshot` in `apps/extension/src/composables/`, contact rules, activity row scope and card fields, one guarded window close, a password visibility toggle, a profile-name field and the Password/Passkey tablist in `apps/extension/src/components/composite/`, and the full-backup button rules (`apps/extension/src/utils/full-backup-ctas.ts`). Unreachable code was deleted.
- **Fixes.** When a dApp confirm reuses an estimate and the min-fee read fails or answers null, the wallet rebuilds the estimate instead of failing the send. An account import is fenced against a concurrent profile deletion, and chain and profile purges delete account rows under the per-row lock, so an import racing a deletion, or a rename racing a purge, leaves no orphan or resurrected row. Invisible: the log viewer clears its fetch deadline, the json and logger windows close only a window with an id, History drops an incoming row stamped with another profile, and an account patch checks all three identity fields.
- **Left as it was.** Any extraction that would add an await, move a read, change an engine's error text or touch byte-frozen crypto stayed inline, and copies that genuinely disagree stayed apart, each difference pinned.

## Lessons

### success-control

A check that only asserts something never happens passes on a page that never rendered: a screenshot check that Send showed no contact name passed with no sheet open, and zero sheets counted when the popup root was missing. Pair each such check with a success control: a reader returns null when its host is missing or hidden, null fails, and a negative probe runs every check against a wrong state and a missing host. Match captured state exactly: compare an identity by attribute or whole collapsed `textContent` (`innerText` follows CSS case transforms, and a substring accepts `Mainx` for `Main`), and never read an unknown value as absent, or a wrong warning passes as none. Stub only what production returns in that state: `getTokenBalances` never returns a balance whose token row is missing, and a zero diff over an impossible stub proves only that the stub is stable.

### engine-text

Moving an expression into a helper can change a thrown `TypeError`'s text with identical logic: JavaScriptCore (Bun runs the unit tests) and SpiderMonkey name the variable or expression, and V8 often does not. Firefox reports `active.endpoints is undefined` where the inline lookup named its row `active`, and `network.endpoints is undefined` once the lookup moved into a helper taking `network`; Chrome's text is the same for both. Where malformed data can reach a property access, keep the expression inline or the production local names in the helper, probe all three engines, and pin the message computed from a reference expression that binds the same names.
