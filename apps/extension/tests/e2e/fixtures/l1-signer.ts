import { createExtendedL1Client } from "@aztec-labs/ethereum/client"
import type { Chain } from "@aztec/viem"

/** Anvil's dev mnemonic; anvil funds the first ten accounts it derives. */
const ANVIL_MNEMONIC = "test test test test test test test test test test test junk"

/** By default the local network publishes every block as index 0 of this mnemonic, and a transaction from that
 *  account mined between the node's nonce read and its send fails the publish with "nonce too low". */
const FIXTURE_L1_ADDRESS_INDEX = 1

export function createFixtureL1Client(rpcUrls: string[], l1ChainId: number) {
	return createExtendedL1Client(rpcUrls, ANVIL_MNEMONIC, { id: l1ChainId, name: "anvil" } as Chain, undefined, FIXTURE_L1_ADDRESS_INDEX)
}
