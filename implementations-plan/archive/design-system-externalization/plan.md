# Design system externalization

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `packages/design` (token contract, generated tokens, `src/base.css`, fonts, and the core and ui layers with their tests), consumed by the extension through the resolver in `apps/extension/scripts/design-resolver.ts`. The extension's `src/design/tokens.ts` re-exports the package.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

The work ran in three stages. The first moved tokens, the base stylesheet and the pure primitives, the second moved the remaining ui primitives and the composables, and the third closed the leftovers. This record covers all three.

## Decision

Make `@nulo/design` the single source for the wallet's tokens (names, values, themes, fonts), its base stylesheet, and its framework-agnostic primitives, so the extension and the other apps that share the package render identically from one place.

- The extension imports `@nulo/design/base.css` and deletes its local base styles.
- Templates keep their bare tags (`<Flex>`, `<Text>`, `<Badge>`) through a component resolver. The package has no auto-import, so its components import everything explicitly.
- Four components stay local to the extension because they touch the router or app-shell state. Three of them wrap a router-free base in the package, and the fourth is a local row link.
- The package takes no router dependency, and every behavior-affecting reconciliation of a duplicate follows the extension's API.
- The toast of the former faucet app stays separate from the wallet's by design.

## Why

Two apps carried near-identical copies of tokens, fonts and primitives that drifted. Single-sourcing the contract removes the drift, and the generated token file is byte-pinned so a hand edit fails CI.

The base stylesheet could not simply be dropped: the unmigrated app depends on its resets, transitions and utility classes, so they were relocated into the package and only deleted later as components became self-contained. jsdom cannot resolve the CSS variable cascade and nothing in the repository compares pixels, so no machine check can prove an identical look. The takeover therefore ran supervised, with a textual parity test against the prior styles plus human sign-off in both browsers, both themes and with and without the bottom nav.

The two toasts model different things. The faucet's is a queue of several results with explorer links, built for a full viewport. The wallet's is one transient confirmation in a narrow popup. Both already share the presentational card, so unifying would only bloat the popup or strip the queue.

## What shipped

### Token contract

`packages/design/src/token-contract.ts` is the canonical contract: names, scales and per-theme values, including the nav-clearance state. `packages/design/scripts/gen-tokens.ts` generates `src/tokens.ts` and `src/utilities.css`, which `tokens.drift.test.ts` and `utilities.drift.test.ts` byte-pin. The hand-authored `base.css` must declare every token the contract exposes (`tokens.parity.test.ts`), and its non-token globals were carried over faithfully. `base.css.test.ts` pins the hand-authored `base.css` by sha256, added after a review found it was the one unpinned file.

- The core layer (`Flex`, `Icon`, `Text`, `MaterialIcon`) and the ui layer are self-contained scoped styles with explicit imports, and `mount-all.test.ts` mounts every migrated component un-stubbed and exercises its branches.
- Layer and floor rules are enforced by Biome: core may not import ui, and the package may not import `@nulo/*` or touch `chrome.*`. `boundary.test.ts` also audits the indirections Biome cannot see.
- A router-free `Button` base takes a closed tag choice. `Spinner` merged into a superset that keeps both apps' accessibility attributes (a status role, and a busy flag on `Button`). The toast and outside-click composables moved into the package, with named re-export shims left in the extension.
- Faucet-visible changes (its buttons moving to the shared `Button` and its spinner speed) were isolated into one separately revertible change. It turned out the old buttons were already uppercase headline-font, so the real button delta was one font weight.
- The `dark` text color name referenced an undeclared variable and silently inherited full color. Its eight uses were split between `tertiary` and `secondary`, chosen from rendered options, and the name was removed. The retired `AppButton` alias was removed, and the nine local component copies that shadowed the package were deleted so the resolver takes effect. A no-shadow guard prevents their return.

## Lessons

- A verbatim port of one app's base stylesheet is not a superset of another app's old base: the faucet lost its page background, button reset, disabled cursor and focus rings, and rendered white. Token drift tests passed because values matched and rules were missing. The human gate caught it, and the faucet app had to carry those rules itself (it is no longer in this tree).
- A component that was copied and then drifted needs a reconciliation with targeted unit pins, not a delete. The shadows had gained a disabled guard on `Checkbox` and a color prop on `Toggle`.
