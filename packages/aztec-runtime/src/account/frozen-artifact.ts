/**
 * The vendored Schnorr account artifact — a frozen input to Nulo account addresses.
 *
 * Account addresses embed this artifact's contract class id. Upstream rebuilds its artifacts on
 * any toolchain or bytecode change, which shifts class ids across Aztec bumps and would
 * strand every stored account behind an address the wallet can no longer re-derive. The
 * address-bearing copy is therefore vendored in-repo (never bumped with the Aztec line; only a
 * regime rotation in `address-freeze.ts` replaces it) and pinned by digest + class id in
 * `artifact-freeze.test.ts`; provenance lives in `artifacts/PROVENANCE.md`.
 *
 * The JSON→artifact interpretation (`loadContractArtifact`) and the class-id hash computation
 * remain upstream code: the class-id pin is a TRIPWIRE for that path, not a freeze of it.
 */
import type { ContractArtifact } from "@aztec-labs/stdlib/abi"
import { loadContractArtifact } from "@aztec-labs/stdlib/abi"
import type { NoirCompiledContract } from "@aztec-labs/stdlib/noir"
import SchnorrAccountJson from "./artifacts/SchnorrAccount.json"

/** sha256 of the vendored `artifacts/SchnorrAccount.json` bytes. */
export const FROZEN_ARTIFACT_SHA256 = "f701e393d933a3229ada1e121113a540c9906d0cc9b1cd4450252888b29ab9f9"

/** Contract class id of the loaded artifact — the address-visible identity of the account code. */
export const FROZEN_ACCOUNT_CLASS_ID = "0x2f7d07db78643da21eefb63ee07d28d1cc23dd86ec9b3a9fa29323bf17269d15"

export const FrozenSchnorrAccountArtifact: ContractArtifact = loadContractArtifact(SchnorrAccountJson as unknown as NoirCompiledContract)
