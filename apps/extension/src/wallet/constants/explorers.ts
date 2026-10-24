// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { CHAIN_IDS } from "@/utils/chain-ids"

/** Canonical list of explorer ids — single source for both the `BlockExplorerType`
 *  union and the config zod schema (`defaultExplorer`), so they can't drift. */
export const BLOCK_EXPLORER_IDS = ["aztecscan"] as const

export type BlockExplorerType = (typeof BLOCK_EXPLORER_IDS)[number]

export type BlockExplorer = {
	/** Unique identifier */
	id: BlockExplorerType
	/** Display name */
	name: string
}

/**
 * Available block explorers for selection in settings.
 * Use `null` in config to disable explorer links.
 */
export const BLOCK_EXPLORERS: BlockExplorer[] = [
	{
		id: "aztecscan",
		name: "Aztecscan",
	},
]

/** The explorer's name for a link's label: "explorer" when the id names none, None included. */
export function explorerDisplayName(explorerId: BlockExplorerType | null | undefined): string {
	return BLOCK_EXPLORERS.find((e) => e.id === explorerId)?.name ?? "explorer"
}

/**
 * Base URLs for each explorer by chain ID.
 * To add a new explorer: add its ID to BlockExplorerType,
 * add to BLOCK_EXPLORERS array, and add URLs here.
 *
 * Either aztecscan host may lag a rollup move (a Testnet reset, a Mainnet upgrade), in which case its
 * links 404 until it indexes the current rollup.
 */
const EXPLORER_BASE_URLS: Record<BlockExplorerType, Record<number, string>> = {
	aztecscan: {
		[CHAIN_IDS.TESTNET]: "https://testnet.aztecscan.xyz",
		[CHAIN_IDS.MAINNET]: "https://aztecscan.xyz",
	},
}

const HEX_32_BYTES = /^0x[0-9a-fA-F]{64}$/

/**
 * A transaction's explorer page. Returns null as `getBlockExplorerUrl` does, for anything but a
 * 32-byte hex hash: a stored hash, which a restored backup supplies, lands in a URL path.
 */
export function getTransactionExplorerUrl(
	chainId: number,
	explorerId: BlockExplorerType | null | undefined,
	txHash: string,
): string | null {
	const baseUrl = HEX_32_BYTES.test(txHash) ? explorerBaseUrl(chainId, explorerId) : null
	return baseUrl ? `${baseUrl}/tx-effects/${txHash}` : null
}

/** The explorer's base URL for the chain, or null when the explorer is None or covers no such chain. */
function explorerBaseUrl(chainId: number | null | undefined, explorerId: BlockExplorerType | null | undefined): string | null {
	if (!explorerId || chainId === null || chainId === undefined) return null
	return EXPLORER_BASE_URLS[explorerId]?.[chainId] ?? null
}

/**
 * A block's explorer page, by its number or its hash. Returns null under explorer None, on a chain no
 * explorer covers, and for anything but a non-negative safe integer or a 32-byte hex hash: the value
 * comes from the node or from storage and lands in a URL path.
 */
export function getBlockExplorerUrl(
	chainId: number | null | undefined,
	explorerId: BlockExplorerType | null | undefined,
	block: number | string,
): string | null {
	const valid = typeof block === "number" ? Number.isSafeInteger(block) && block >= 0 : HEX_32_BYTES.test(block)
	const baseUrl = valid ? explorerBaseUrl(chainId, explorerId) : null
	return baseUrl ? `${baseUrl}/blocks/${block}` : null
}

/** A contract instance's explorer page. Returns null as `getBlockExplorerUrl` does, for anything but a 32-byte hex address. */
export function getContractExplorerUrl(
	chainId: number | null | undefined,
	explorerId: BlockExplorerType | null | undefined,
	address: string,
): string | null {
	const baseUrl = HEX_32_BYTES.test(address) ? explorerBaseUrl(chainId, explorerId) : null
	return baseUrl ? `${baseUrl}/contracts/instances/${address}` : null
}

/** An account's explorer page. Returns null as `getBlockExplorerUrl` does, for anything but a 32-byte hex address. */
export function getAccountExplorerUrl(
	chainId: number | null | undefined,
	explorerId: BlockExplorerType | null | undefined,
	address: string,
): string | null {
	const baseUrl = HEX_32_BYTES.test(address) ? explorerBaseUrl(chainId, explorerId) : null
	return baseUrl ? `${baseUrl}/address/${address}` : null
}
