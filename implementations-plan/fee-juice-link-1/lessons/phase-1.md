# Phase 1: the build and its one Codex pass

- 2026-11-19: the selector, five sites, privacy 1.4 and the docs landed in three commits; every gate green at retry 0 (STATUS.md).
- Red check: the four Mainnet site tests fail on the base sources (fee-helpers.ts and the three `.vue` files checked out from `b8ec26b1f`), the three Testnet controls pass.
- Codex, gpt-6.1-sol high read-only, session 01a1f440: **approve**. One low finding, demonstrated: the selector's TSDoc restated its conditional, and `send.vue`'s "Open the fee-juice bridge in a new tab." narrated `window.open`. Accepted: the TSDoc is now the rule in one sentence plus the override's scope; the narrating comment is gone. Verified after: `bun run lint`, extension typecheck, `fee-helpers.test.ts` and `send.test.ts` (195) green. The smoke evidence is from `94a634398`; the fix changes comments only.
- Codex's supporting evidence for D1, checked: Shield's live bundle names wallet chain 2070860441 (`CHAIN_IDS.MAINNET`), rollup 2070860440 and the canonical PrivateFPC address `protocol-fpcs.test.ts` pins.
- A slip worth knowing: `git checkout <sha> -- $F` with a space-separated `$F` passes one path in zsh and fails; the uncommitted work survived only because the matching restore failed too. Commit before checking out base copies (lessons.md, Agent tooling, already says `$FILES` stays one word).
