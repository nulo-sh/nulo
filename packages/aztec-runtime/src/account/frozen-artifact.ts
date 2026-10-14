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
export const FROZEN_ARTIFACT_SHA256 = "9aebda2a0b8cf96e833dba4379bef6a2ed0f93e975e9689afaa26ac71203cdc8"

/** Contract class id of the loaded artifact — the address-visible identity of the account code. */
export const FROZEN_ACCOUNT_CLASS_ID = "0x2a5784fa8315d0150f36a1fba87b41cdb9cd8ebea611ceaa80c7a787e83efa60"

export const FrozenSchnorrAccountArtifact: ContractArtifact = loadContractArtifact(SchnorrAccountJson as unknown as NoirCompiledContract)
