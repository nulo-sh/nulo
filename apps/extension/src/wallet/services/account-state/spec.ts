// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { ContractArtifact } from "@aztec-labs/stdlib/abi"
import type { ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import type { Restored } from "@/wallet/base"
import type { RunFence } from "@/wallet/services/profile/spec"
import { isRecord } from "@nulo/wallet-core/guards"

export const ACCOUNT_STATE_SERVICE_NAME = "account-state"

export type BackupSender = {
	address: string
}
/** A contract entry of a format-1 part: it carries its own copy of its class's artifact. */
export type BackupContract = {
	address: string
	instance: ContractInstanceWithAddress
	artifact: ContractArtifact
}
/** One network's item of a format-1 part. */
export type BackupAccountState = {
	networkId: string
	/** The chain the item's network served; the import binds the item to the seeded network
	 *  of this chain, never to the exported id. Absent on older exports. */
	chainId?: number
	senders: Restored<BackupSender>[]
	contracts: Restored<BackupContract>[]
}

/** A contract entry of a format-2 part: its code is the class table's entry for its instance's
 *  `currentContractClassId`. */
export type BackupContractEntry = Omit<BackupContract, "artifact">
/** One class's artifact in a format-2 part, shared by every instance of the class on any network. */
export type BackupContractClass = { classId: string; artifact: ContractArtifact }
export type AccountStateItemV2 = Omit<BackupAccountState, "contracts"> & { contracts: BackupContractEntry[] }
/** Format 2: each class's artifact once per part, however many instances and networks use it. */
export type AccountStateSliceV2 = { format: 2; classes: BackupContractClass[]; items: AccountStateItemV2[] }
/** The part as a file carries it: format 1 (an array, every file written before format 2) or format 2. */
export type AccountStateSlice = BackupAccountState[] | AccountStateSliceV2

/** A format-2 part. Any other object is a part this build cannot read. */
export function isAccountStateV2(raw: unknown): raw is Record<string, unknown> & Pick<AccountStateSliceV2, "format"> {
	return isRecord(raw) && raw.format === 2
}

/** A restore's outcome for one contract. It never carries the contract's code. */
export type RestoredContract = { address: string; restoreError?: string }
/** A restore's outcome for one network. */
export type AccountStateRestoreRecord = {
	networkId: string
	senders: Restored<BackupSender>[]
	contracts: RestoredContract[]
	restoreError?: string
}

/** One contract the PXE holds, as its own store has it. */
export type ContractRow = {
	address: string
	/** The class the instance was deployed with; absent when the PXE lists an address it holds no instance for. */
	classId?: string
	/** Every PXE registers it at boot: a protocol contract or a preloaded standard one. */
	builtIn: boolean
	/** A built-in's compiled-in name, when the wallet knows one. */
	name?: string
}

export type Methods = {
	/**
	 * Returns a list of registered accounts.
	 * @param networkId Network id.
	 */
	getAccounts(networkId: string): string[]

	/**
	 * Returns a list of registered senders.
	 * @param networkId Network id.
	 */
	getSenders(networkId: string): string[]

	/**
	 * Returns the union of registered sender addresses across every
	 * network in the active profile that reports `Active` node status.
	 * Networks whose status check or `getSenders` call fails are
	 * silently skipped — same precedent as `backup()`. Used by the
	 * contacts export to mark which contacts are senders without
	 * caring about per-network attribution.
	 */
	getSendersAcrossActiveNetworks(): string[]

	/**
	 * Adds a sender.
	 * @param networkId Network id.
	 * @param address Sender address.
	 * @param fence A popup run's fence: a session it no longer names refuses with `SessionEndedError`
	 *        before the PXE is asked.
	 * @emits `SenderAdded` event.
	 */
	addSender(networkId: string, address: string, fence?: RunFence | null): string

	/**
	 * Deletes a sender.
	 * @param networkId Network id.
	 * @param address Sender address.
	 * @emits `SenderDeleted` event.
	 */
	deleteSender(networkId: string, address: string): string

	/**
	 * Returns a list of registered contracts.
	 * @param networkId Network id.
	 */
	getContracts(networkId: string): string[]

	/** Returns every registered contract with its class id, read from the PXE's own store only. */
	getContractRows(networkId: string): ContractRow[]
}

export type Events = {
	/** Emitted when a new sender is added */
	onSenderAdded: string
	/** Emitted when an existing sender is deleted */
	onSenderDeleted: string
}
