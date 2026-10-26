import type { Page } from "puppeteer"
import { ACCOUNT_SERVICE_NAME } from "@/wallet/services/account/spec"
import { CONTACT_SERVICE_NAME } from "@/wallet/services/contact/spec"
import { DAPP_SESSION_SERVICE_NAME } from "@/wallet/services/dapp-session/spec"
import { FPC_SERVICE_NAME } from "@/wallet/services/fpc/spec"
import { INCOMING_TRANSFER_SERVICE_NAME } from "@/wallet/services/incoming-transfer/spec"
import { OPERATION_JOURNAL_SERVICE_NAME } from "@/wallet/services/operation-journal/spec"
import { TOKEN_BALANCE_SERVICE_NAME } from "@/wallet/services/token-balance/spec"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import { type AccountRow, type NetworkRow, readNetworkRows } from "../../helpers/identity-rows"
import { selectedAccount } from "../accounts"
import { ensureUnlocked } from "../auth"
import { stopBackground } from "../browser"
import type { HeldNode } from "../egress-guard"
import { type ExtensionContext, launchExtension, openPopup, waitForHash } from "../extension"
import { holdNodeStubs } from "../node-stub"
import { captureSoleProfileId } from "../profiles"
import { callService } from "../session"
import { writeLocalStorage } from "./in-place"
import { readPreferences } from "./preferences"
import type { ReleaseReads } from "./release-reads"

type Row = Record<string, unknown>

const call = <T>(page: Page, service: string, method: string, params: unknown[] = []) =>
	callService<T>(page, service, method, params, 30_000)

/** Each row of `lists` once, by `key`. */
const distinct = (lists: Row[][], key: string): Row[] => [...new Map(lists.flat().map((row) => [row[key], row])).values()]

/** Every trust record the profile holds: one per network and token contract on its chain whose
 *  state is not the default no record reads as. */
async function trustRows(page: Page, profileId: string, networks: NetworkRow[], tokens: Row[]): Promise<Row[]> {
	const rows: Row[] = []
	for (const network of networks) {
		const contracts = new Set(tokens.filter((token) => token.chainId === network.chainId).map((token) => token.contract as string))
		for (const contract of contracts) {
			const state = await call<string>(page, INCOMING_TRANSFER_SERVICE_NAME, "getTrustState", [profileId, network.id, contract])
			if (state !== "unknown") rows.push({ profileId, networkId: network.id, contract, state })
		}
	}
	return rows
}

export async function readRelease(page: Page, profileId: string): Promise<ReleaseReads<NetworkRow, AccountRow>> {
	const networks = await readNetworkRows(page)
	const accounts: AccountRow[] = []
	for (const chainId of new Set(networks.map((network) => network.chainId))) {
		accounts.push(...(await call<AccountRow[]>(page, ACCOUNT_SERVICE_NAME, "getAccounts", [profileId, chainId, true])))
	}
	const tokens = await call<Row[]>(page, TOKEN_SERVICE_NAME, "getTokens", [profileId])
	const txs: Row[][] = []
	const incoming: Row[][] = []
	for (const account of accounts) {
		txs.push(await call<Row[]>(page, TRANSACTION_SERVICE_NAME, "getTransactions", [account.address]))
		for (const network of networks.filter((row) => row.chainId === account.chainId)) {
			const params = [profileId, network.id, account.address]
			incoming.push(await call<Row[]>(page, INCOMING_TRANSFER_SERVICE_NAME, "getIncomingTransfers", params))
		}
	}
	return {
		profileId,
		selection: await selectedAccount(page),
		preferences: await readPreferences(page, profileId),
		networks,
		accounts,
		rows: {
			contacts: await call<Row[]>(page, CONTACT_SERVICE_NAME, "getContacts"),
			dappSessions: await call<Row[]>(page, DAPP_SESSION_SERVICE_NAME, "getDappSessions"),
			txs: distinct(txs, "hash"),
			journal: await call<Row[]>(page, OPERATION_JOURNAL_SERVICE_NAME, "getOperations"),
			tokens,
			fpcs: await call<Row[]>(page, FPC_SERVICE_NAME, "getFpcs"),
			tokenBalances: await call<Row[]>(page, TOKEN_BALANCE_SERVICE_NAME, "getTokenBalances"),
			incomingTransfers: distinct(incoming, "id"),
			incomingTrust: await trustRows(page, profileId, networks, tokens),
		},
	}
}

/**
 * The release `build`, a fresh install with `entries` written in and unlocked under the test
 * password, read through its own services. Every one of `dials` answers with a refusal for the
 * install's life, so the unlocked release reaches nothing a later run holds; an origin its rows name
 * that `dials` omits is refused only after the read, which the live scenario prevents by writing the
 * dials from the rows it read. Its own install, never the one an update runs over, so the candidate
 * meets the recorded rows as the release left them.
 */
export async function readSealedRelease(
	build: string,
	entries: Record<string, unknown>,
	dials: readonly string[],
): Promise<ReleaseReads<NetworkRow, AccountRow>> {
	const ctx = await launchExtension({ extensionPath: build, cspRecorder: false })
	let held: HeldNode[] = []
	try {
		held = await holdNodeStubs(ctx.browser, ctx.extensionId, dials)
		await writeLocalStorage(ctx, entries)
		// The background booted over an empty store; its successor boots over the recording.
		await stopBackground(ctx)
		const reads = await readUnlocked(ctx)
		const failures = (await Promise.all(held.map((node) => node.failures()))).flat()
		if (failures.length > 0) throw new Error(`the release's dials did not refuse every request: ${failures.join("; ")}`)
		return reads
	} finally {
		try {
			await ctx.close()
		} finally {
			await Promise.all(held.map((node) => node.stop()))
		}
	}
}

async function readUnlocked(ctx: ExtensionContext): Promise<ReleaseReads<NetworkRow, AccountRow>> {
	const page = await openPopup(ctx)
	try {
		await ensureUnlocked(page)
		await waitForHash(page, "#/popup/general", 30_000)
		return await readRelease(page, await captureSoleProfileId(page))
	} finally {
		await page.close().catch(() => {})
	}
}
