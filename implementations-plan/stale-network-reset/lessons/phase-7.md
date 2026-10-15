# Phase 7: docs

## Built

- `CLAUDE.md` § Account-address freeze: the runtime-mismatch bullet now says a mismatch is classified per chain, a chain-confined one quarantines that chain, a non-Mainnet network cause or address change is offered the in-place reset by a takeover that never solicits the recovery phrase, Mainnet is quarantined with no reset, and anything else keeps `AccountIntegrityBarrier`. Only that bullet changed.
- `ARCHITECTURE.md`: the three per-profile stale-network keys (§5), the session model and the popup's side of a reset, including that a dApp window takes no part (§7), the dApp scope (§8), and the reset's locks and run lock (§9).
- `.claude/skills/aztec-update/SKILL.md` Branch B: the client-side reset is the in-place reset; a reset bump runs S1 on both browsers; a Mainnet derivation change stays new-major territory.
- Nine known limits, each a closed `known-limit` issue (#468–#476): the refused earlier key file after an address change, codec-hidden rows, the lenient-mode boot bounce, a custom node's reset, a corrupt journal after the purge, one journal per profile, a backup straddling a whole reset, a dropped unopenable imported key, and a notice lost to a profile switch inside one round trip.

## Gotchas

- #427 already records the imported-only half of the first limit (the integrity check re-derives derived rows only). The new issue keeps the half #427 does not cover, the refused re-import, and points at #427 for the rest.
- Run the filing script from the repository: `gh` infers the repository from the working directory's git remote and fails outside one.
- The issues cite the plan at its archive path, which exists once the close-out lands.

## Gate

Retry 0: `bun run check:plans` exit 0 (0 findings); `bun run lint` exit 0 (27 warnings, all in files this plan does not touch; complexity baseline OK). Every path the three docs name exists at the commit.
