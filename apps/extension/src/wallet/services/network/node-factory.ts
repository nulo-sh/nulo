import { AztecNodeFactoryAdapter } from "@nulo/aztec-runtime/adapters"
import type { NodeFactory } from "@nulo/aztec-runtime/ports"
import { maxBatchSizeFor } from "./seeds"

/** The node factory every production node of the wallet is built through: the background's and
 *  the offscreen PXE's, so both honour each provider's batch cap. */
export function createWalletNodeFactory(): NodeFactory {
	return new AztecNodeFactoryAdapter(maxBatchSizeFor)
}
