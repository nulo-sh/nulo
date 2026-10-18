# Phase 3: #710, export a paused reset's imported accounts

- Plan correction: the export page lists held accounts whenever the profile has a paused reset, not only when it is the active network. The signed drawing puts "Export them first." on Delete chain, which only a non-active network offers, so the narrower rule would have sent the person to a page without the account. `plan.md` § Architecture is updated.
- `exportsHeld(view, profileType)` (`composables/useStaleNetwork.ts`) is the one rule for the takeover's button and both sentences: a password profile, and at least one imported entry whose key the journal holds.
- The takeover's TRY AGAIN keeps its starting guard and repeat-Enter refusal as `Action.guarded` in the outlined slot; the primary slot stays guarded as before.
- Type-role inventory keys template expressions: renaming `content.secondary.text` to `action.text` needed its `identifier-sites.expected.json` entry renamed (`scripts/type-roles/inventory.test.ts` fails until it is).
- Captures: the `network-reset` seed renames an imported key row's chain, which its AEAD binds, so every imported key reads unmovable after it. R1b uses the `address-change` seed, which keeps the chain. `STALE_NETWORK_CAPTURES=1` green, 47.1 s; R1b frames at both scroll positions and the export picker.
- Gate: F exit 0; `stale-network.test.ts` (smoke, Chrome, retry 0) 4/4, 62.5 s.
