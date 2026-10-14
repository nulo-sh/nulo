/**
 * Activity rows written straight into storage, for the specs that measure a row. The smoke build
 * has no sandbox, and none could make a dApp's long title, a nine-digit amount and a priced receipt
 * on demand.
 */
import type { Page } from "puppeteer"
import { getPriceMapEntry } from "@/wallet/services/price/price-map"
import { seedsForChain } from "@/wallet/services/token/default-tokens"
import { captureSoleProfileId, getAccountAddress } from "../fixtures/helpers"

/** The active profile, network and account, and the chain's first default token the price map
 *  prices. */
export type ActivityScope = {
	profileId: string
	networkId: string
	chainId: number
	account: string
	token: { contract: string; name: string; symbol: string; decimals: number }
}

/** The scope without its token, for a chain with no default token seeds (the local one). */
export async function readScopeIdentity(page: Page): Promise<Omit<ActivityScope, "token">> {
	const profileId = await captureSoleProfileId(page)
	const account = await getAccountAddress(page)
	const { networkId, chainId } = await page.evaluate(async (pid: string) => {
		const all = await chrome.storage.local.get(null)
		const networkId = all[`nulo:core:active-network@${pid}`] as string
		const network = JSON.parse(all[`nulo:core:networks@${networkId}`] as string) as { chainId: number }
		return { networkId, chainId: network.chainId }
	}, profileId)
	return { profileId, networkId, chainId, account }
}

export async function readActivityScope(page: Page): Promise<ActivityScope> {
	const identity = await readScopeIdentity(page)
	const { chainId } = identity
	const seed = seedsForChain(chainId).find((s) => getPriceMapEntry(chainId, s.contract))
	if (!seed) throw new Error(`the price map prices no default token seed on chain ${chainId}`)
	const token = { contract: seed.contract, name: seed.displayName, symbol: seed.expectedSymbol, decimals: seed.expectedDecimals }
	return { ...identity, token }
}

/** The chain's next default token: a second contract, for specs that tell two tokens' rows apart. */
export function secondToken(scope: ActivityScope): ActivityScope["token"] {
	const seed = seedsForChain(scope.chainId).find((s) => s.contract !== scope.token.contract)
	if (!seed) throw new Error(`chain ${scope.chainId} has a single default token seed`)
	return { contract: seed.contract, name: seed.displayName, symbol: seed.expectedSymbol, decimals: seed.expectedDecimals }
}

export type TransferSeed = {
	hash: string
	/** Base units of the scope's token. */
	amount: string
	at?: number
	/** The wire's transfer type: 0 private, 1 private → public, 2 public, 3 public → private. */
	transferType?: number
	/** Sent by a dApp: its name is the row's second chip. */
	dapp?: string
	/** Base units of Fee Juice the send was built to pay at most. */
	estimatedFee?: string
	/** The wire's fee option: 0 a fee contract (the default), 1 public Fee Juice, 2 Fee Juice with a claim. */
	feePaymentMethod?: number
	priorityLevel?: "normal" | "fast" | "urgent"
}

/** A finalized transfer under the tx root, with every field the row codec branches on. */
export async function seedTransaction(page: Page, scope: ActivityScope, seed: TransferSeed): Promise<void> {
	const at = seed.at ?? Date.now()
	const { contract, ...token } = scope.token
	const tx = {
		chainId: scope.chainId,
		profileId: scope.profileId,
		networkId: scope.networkId,
		account: scope.account,
		nonce: "0",
		feePaymentMethod: seed.feePaymentMethod ?? 0,
		hash: seed.hash,
		createdAt: at,
		updatedAt: at,
		status: 5,
		executionResult: 0,
		...(seed.estimatedFee === undefined ? {} : { estimatedFee: seed.estimatedFee }),
		...(seed.priorityLevel === undefined ? {} : { priorityLevel: seed.priorityLevel }),
		origin: seed.dapp === undefined ? { type: 0 } : { type: 1, name: seed.dapp },
		calls: [
			{
				contract,
				method: "transfer",
				args: [],
				transfers: [{ token, type: seed.transferType ?? 0, from: scope.account, to: scope.account, amount: seed.amount }],
			},
		],
	}
	await page.evaluate(
		(key: string, row: unknown) => chrome.storage.local.set({ [key]: JSON.stringify(row) }),
		`nulo:core:txs@${seed.hash}`,
		tx,
	)
}

/** A registered token row, the scope's token unless `token` names another: a receipt shows its amount
 *  and quote only through one, and only with the decimals getter that makes its stored decimals known. */
export async function seedTokenRow(
	page: Page,
	scope: ActivityScope,
	id: number,
	opts: { token?: ActivityScope["token"]; decimalsGetter?: boolean } = {},
): Promise<void> {
	const getter = opts.decimalsGetter === false ? {} : { getDecimalsFn: { name: "decimals", impl: 0 } }
	const row = { id, profileId: scope.profileId, chainId: scope.chainId, ...(opts.token ?? scope.token), ...getter }
	await page.evaluate(
		(key: string, value: unknown) => chrome.storage.local.set({ [key]: JSON.stringify(value) }),
		`nulo:core:tokens@${id}`,
		row,
	)
}

export type ReceiptSeed = { tokenId: number; amount: string; nullifier: string; at?: number }

/** A visible note receipt of the registered token. Block 1 keeps it history: it never plays as an arrival. */
export async function seedReceipt(page: Page, scope: ActivityScope, seed: ReceiptSeed): Promise<string> {
	const id = `note:${scope.profileId}|${scope.networkId}|${seed.nullifier}`
	const record = {
		kind: "note",
		id,
		siloedNullifier: seed.nullifier,
		noteHash: `0x${"ab".repeat(32)}`,
		owner: scope.account,
		profileId: scope.profileId,
		networkId: scope.networkId,
		accountAddress: scope.account,
		contract: scope.token.contract,
		tokenId: seed.tokenId,
		amountRaw: seed.amount,
		txHash: `0x${"7c".repeat(32)}`,
		l2BlockNumber: 1,
		txIndexInBlock: 0,
		indexInTx: 0,
		hidden: false,
		discoveredAt: seed.at ?? Date.now(),
	}
	await page.evaluate(
		(key: string, value: unknown) => chrome.storage.local.set({ [key]: JSON.stringify(value) }),
		`nulo:core:incoming-transfers@${id}`,
		record,
	)
	return id
}

export type JournalSeed = {
	/** 16 hex characters, as the journal mints them. */
	id: string
	tokenId: number
	/** Base units of the token. */
	amount: string
	progress: { stage: "failed" | "cancelled"; [field: string]: unknown }
	errorKind?: string
	at?: number
}

/** A Send-page transfer that ended without a settled transaction, stamped with the scope. */
export async function seedJournalRecord(page: Page, scope: ActivityScope, seed: JournalSeed): Promise<void> {
	const at = seed.at ?? Date.now()
	const record = {
		id: seed.id,
		kind: "transfer",
		origin: "popup",
		profileId: scope.profileId,
		accountAddress: scope.account,
		networkId: scope.networkId,
		tokenId: seed.tokenId,
		amountRaw: seed.amount,
		recipientAddress: scope.account,
		transferType: 0,
		progress: seed.progress,
		error: seed.errorKind === undefined ? null : { kind: seed.errorKind, message: "seeded", normalizedRaw: null },
		terminalAt: at,
		attempts: 0,
		createdAt: at,
		updatedAt: at,
	}
	await page.evaluate(
		(key: string, row: unknown) => chrome.storage.local.set({ [key]: JSON.stringify(row) }),
		`nulo:journal@${seed.id}`,
		record,
	)
}
