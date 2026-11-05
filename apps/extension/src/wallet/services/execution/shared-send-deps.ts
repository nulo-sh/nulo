import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import type { IAccountContract } from "@nulo/aztec-runtime/account"
import type { Network } from "@/wallet/services/network/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import type { IPXE } from "@/wallet/services/pxe/client"
import type { TransactionService } from "@/wallet/services/transaction/service"
import type { PublicStorageReader } from "@/wallet/utils/fee-juice-balance"

/** The profile, fence, network and history access both send executors take from the facade, wired
 *  once. Widths are the narrowest either executor reads; an executor may narrow a member further. */
export interface SharedSendDeps {
	getActiveProfile(): Promise<{ id: string } | undefined>
	captureExecutionFence(): Promise<ExecutionFence>
	assertFence(fence: ExecutionFence): Promise<void>
	isFenceLive(fence: ExecutionFence): boolean
	getNetwork(networkId: string): Promise<Network>
	getNode(chainId: number): Promise<AztecNode>
	/** The sponsor probe's read: bounded and silent, unlike the build's retrying `node`. */
	readPublicStorageOnce: PublicStorageReader
	getPXE(network: Network): IPXE
	getAccountContract(profileId: string, chainId: number, accountAddress: string): Promise<IAccountContract>
	getPendingForAccount(account: string): { hash: string }[]
	addTransaction: TransactionService["addTransaction"]
}
