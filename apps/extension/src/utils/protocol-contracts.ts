import { CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS, CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS } from "@aztec-labs/constants"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { feeJuiceAddress, feeJuiceName } from "@/wallet/utils/fee-juice"

const at = (n: number): string => AztecAddress.fromNumberUnsafe(n).toString().toLowerCase()

/** The protocol's own contracts, keyed by their canonical addresses: protocol constants, the same on every network. */
const PROTOCOL_NAMES: ReadonlyMap<string, string> = new Map([
	[at(CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS), "Contract Class Registry"],
	[at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS), "Contract Instance Registry"],
	[feeJuiceAddress.toLowerCase(), feeJuiceName],
])

/** The wallet's name for a protocol contract; `undefined` for any other address or spelling. */
export function protocolContractName(address: unknown): string | undefined {
	return typeof address === "string" ? PROTOCOL_NAMES.get(address.toLowerCase()) : undefined
}
