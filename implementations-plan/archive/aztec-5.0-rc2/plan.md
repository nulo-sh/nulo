# Aztec 5.0 release candidate 2 bump

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The `@aztec/*` pins moved from the first to the second 5.0 release candidate, with re-keyed patches under `patches/`, a re-derived chain identity in `apps/extension/src/utils/chain-ids.ts` and `apps/extension/src/wallet/services/network/service.ts`, and a wallet storage baseline bump; later bumps have since moved those pins on. The bridge contracts, faucet and fuel router redeployed in the same arc now live in the unleashed repository.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Bump the whole Aztec set together and treat the testnet redeploy as part of the arc, not a follow-up. The release candidate changed protocol internals, so contract class ids were expected to shift. Rather than assess the drift and continue, the plan made the shift an inventory (every address and class id, old to new), then redeployed the shifted contracts, re-pinned the live manifests and proved the result with live canaries before the network e2e. The cheap gates ran first: install, typecheck, units, Noir recompile.

## Why

A class-id or derivation drift cannot be left for later. The deployment verifier runs in the faucet build gate and re-derives the live instances from pinned parameters, and the private fee contract's bytecode tripwire fires on the same class of change, so a bump that moved either one would turn CI red until the world and the pins agreed again. Recompiling against the old Noir toolchain would also have produced a false "no drift", which is why the toolchain and the aztec-nr tags moved with the library. A lockfile re-resolve can move unrelated ranges, so the lockfile diff was allow-listed to Aztec packages and checked for any remaining old-candidate entry, which would mean a mixed set.

## What shipped

- The roughly twenty `@aztec/*` pins across seven workspaces, the accelerator package that drags the same `@aztec` transitives, both Noir patch files, the Noir toolchain pin and every aztec-nr tag, with the compiled contract artifacts regenerated.
- A temporary min-age exemption for the young set, to be removed once the set aged past the gate; the lockfile was regenerated from scratch.
- The private fee contract tripwire re-pinned as a conscious act, not skipped, and then proven by a settled private fueled claim on the live testnet.
- The testnet had been reset, so the rollup version and with it the wallet chain id moved; the chain-identity constants cascaded through the extension, and the wallet's persisted-storage baseline moved with a documented reset. The reset also wipes entity rows keyed by `<root>@<id>`, which an earlier baseline had missed, while user-authored contacts are preserved.
- The bridge side redeployed candidate-first: a candidate manifest, verification of the L1 sources, a deposit-to-claim smoke, and only then promotion to the live pins. The manifest writer was extended to carry the fee-juice block and to refresh rollup-coupled fields from the node instead of carrying them forward.
- Network e2e ran green with native proving against the new candidate, with the accelerator binary unbumped because the prover binary is injected per SDK version.
- Two third-party token and fee-payment packages were switched to first-party npm publications at the new candidate, with the imports renamed.
