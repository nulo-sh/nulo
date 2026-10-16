/**
 * What a dApp approval window shows of a request: its operations resolved against the profile's
 * networks and accounts, their calls decoded for display, and the tokens amounts render in. Every
 * client is the caller's, which owns its connection.
 */

import type { Account, AccountServiceClient } from "@/wallet/services/account/client"
import type { CaipAccount, CaipChain, ExecutionPayload } from "@/wallet/services/dapp-interaction/client"
import type { DecodedCall, DisplayCallInput } from "@/wallet/services/execution/client"
import type { Network, NetworkServiceClient } from "@/wallet/services/network/client"
import type { Ref } from "vue"
import type { TokenInfo, TokenServiceClient, TokenUpdated } from "@/wallet/services/token/client"
import { parseCaipAccount, parseCaipChain, resolveNetworkByChainId } from "@/wallet/utils/caip"
import { displayCallsOf, undecodedAll } from "./display-calls"
import { isEmbeddedFeePayment } from "./operation-validation"
import type { DraftUIOperation } from "./types"

/** Resolve every requested operation SEQUENTIALLY (op N+1's lookups start only after op N
 *  resolved); returns the draft operations plus the unique signer accounts. */
export async function resolveOperations(
	requested: ExecutionPayload["params"]["operations"],
	accountService: Pick<AccountServiceClient, "getAccount">,
	networkService: NetworkServiceClient,
	profileId: string,
): Promise<{ operations: DraftUIOperation[]; accounts: Account[] }> {
	const getNetwork = async (caipChain: CaipChain): Promise<Network> => {
		const { chainId } = parseCaipChain(caipChain)
		return resolveNetworkByChainId(networkService, chainId)
	}

	const getNetworkAndAccount = async (caipAccount: CaipAccount): Promise<[Network, Account]> => {
		const { chainId, address } = parseCaipAccount(caipAccount)
		const network = await resolveNetworkByChainId(networkService, chainId)
		const account = await accountService.getAccount(profileId, network.chainId, address)
		if (!account) throw new Error("Account no longer exists")
		return [network, account]
	}

	const accounts: Account[] = []
	const operations: DraftUIOperation[] = []
	for (const op of requested) {
		switch (op.kind) {
			case "register_contract":
			case "register_sender":
			case "aztec_getContractClassMetadata":
			case "aztec_getContractMetadata":
			case "aztec_getChainInfo":
			case "aztec_registerSender":
			case "aztec_getAddressBook":
			case "aztec_registerContract":
			case "aztec_getPrivateEvents": {
				const network = await getNetwork(op.chain)
				operations.push({ ...op, network, networkId: network.id })
				break
			}
			case "register_token":
			case "simulate_transaction":
			case "simulate_utility":
			case "aztec_simulateTx":
			case "aztec_executeUtility":
			case "aztec_profileTx":
			case "aztec_createAuthWit": {
				const [network, account] = await getNetworkAndAccount(op.account)
				operations.push({
					...op,
					network,
					networkId: network.id,
					account,
					accountAddress: account.address,
				})
				pushUniqueAccount(accounts, account)
				break
			}
			case "aztec_sendTx":
			case "send_transaction": {
				const [network, account] = await getNetworkAndAccount(op.account)
				// A dApp-supplied fee path pre-fills embedded so the FeeSettingsCard is suppressed. A
				// requested self-pay (the account named as payer with no fee call) renders the card locked
				// to Fee Juice and derives the settings once a verified balance can pay — nothing is
				// pre-filled, so Confirm stays off over an empty or unread balance. Otherwise leave
				// feeSettings undefined for the user; `requiresFeeSelection` at approve() gates undefined.
				operations.push({
					...op,
					network,
					networkId: network.id,
					account,
					accountAddress: account.address,
					feeSettings: isEmbeddedFeePayment(op) ? { paymentMethod: { kind: "embedded" } } : undefined,
				})
				pushUniqueAccount(accounts, account)
				break
			}
			default:
				throw new Error("Invalid operation kind")
		}
	}
	return { operations, accounts }
}

/** The signer list is unique by (address, chainId), first occurrence wins. */
function pushUniqueAccount(accounts: Account[], account: Account): void {
	if (!accounts.find((x) => x.address === account.address && x.chainId === account.chainId)) {
		accounts.push(account)
	}
}

/** Per operation, one batch decode of its calls, handed to `onDecoded` as it lands; a failed batch
 *  reads as unavailable so the card falls back to raw fields instead of waiting forever. */
export async function decodeOperationArguments(
	ops: DraftUIOperation[],
	executionService: { decodeCallsForDisplay(networkId: string, calls: DisplayCallInput[]): Promise<DecodedCall[]> },
	onDecoded: (index: number, decoded: readonly DecodedCall[]) => void,
): Promise<void> {
	await Promise.all(
		ops.map(async (op, index) => {
			let calls: ReturnType<typeof displayCallsOf> = []
			try {
				calls = displayCallsOf(op)
				if (!calls.length) return
				onDecoded(index, await executionService.decodeCallsForDisplay(op.networkId, calls))
			} catch (error) {
				console.warn("[Execute] Argument decode failed", { index, error })
				onDecoded(index, undecodedAll(calls.length))
			}
		}),
	)
}

/** The wallet's registered tokens on the operations' chains; `undefined` when the read failed, which
 *  leaves the card without the vocabulary: transfers on the wallet's own tokens read as decoded
 *  parameters, amounts in base units. */
export async function readKnownTokens(
	ops: DraftUIOperation[],
	profileId: string,
	tokenService: { getTokens(profileId: string, chainId: number): Promise<TokenInfo[]> },
): Promise<TokenInfo[] | undefined> {
	const chainIds = [...new Set(ops.map((op) => op.network.chainId))]
	try {
		const lists = await Promise.all(chainIds.map((chainId) => tokenService.getTokens(profileId, chainId)))
		return lists.flat()
	} catch (error) {
		console.warn("[Execute] Token list unavailable", { error })
		return undefined
	}
}

/**
 * Holds `known` to the tokens of the operations' chains and reads them again whenever one of the
 * profile's tokens is updated, as a restore's chain read does after the window opened; a read an
 * update superseded never lands. The window calls `dispose` on unmount.
 */
export function followKnownTokens(
	tokenService: Pick<TokenServiceClient, "getTokens" | "onTokenUpdated">,
	known: Ref<TokenInfo[]>,
): { start(ops: DraftUIOperation[], profileId: string): Promise<void>; dispose(): void } {
	let ops: DraftUIOperation[] = []
	let profileId: string | undefined
	let reads = 0
	const read = async () => {
		if (!profileId) return
		const mine = ++reads
		const tokens = await readKnownTokens(ops, profileId, tokenService)
		if (tokens && mine === reads) known.value = tokens
	}
	const onUpdated = (token: TokenUpdated) => {
		if (token.profileId === profileId) void read()
	}
	tokenService.onTokenUpdated.add(onUpdated)
	return {
		start(nextOps, nextProfileId) {
			ops = nextOps
			profileId = nextProfileId
			return read()
		},
		dispose: () => tokenService.onTokenUpdated.remove(onUpdated),
	}
}
