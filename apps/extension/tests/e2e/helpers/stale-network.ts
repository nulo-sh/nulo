/**
 * Stored networks as an update meets them. Each seed rewrites rows while the wallet is locked, so
 * the unlock's integrity check classifies them exactly as it classifies a real update: a Testnet
 * row on an older chainId is a network reset, every derived address on a chain moved is an address
 * change, and a Mainnet chain whose addresses moved is quarantined with no reset.
 *
 * Networks are sealed, and the network service serves them only unlocked, so a seed run locked on
 * a smoke build takes `networks`, the rows {@link readNetworkRows} read before the lock; the network
 * suite's build opens them itself. How the rows are read and replaced: `identity-rows.ts`.
 */
import { randomBytes } from "node:crypto"
import type { Page } from "puppeteer"
import { readyToast } from "@/components/stale-network/copy"
import { CHAIN_IDS, LOCAL_L1_CHAIN_ID, MAINNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { TEST_PASSWORD } from "../fixtures/constants"
import { revealSeedPhrase, waitForToast } from "../fixtures/helpers"
import {
	ACCOUNTS,
	type AccountRow,
	accountRows,
	accountScope,
	IMPORTED_KEYS,
	NETWORKS,
	type NetworkRow,
	networkRows,
	plaintextKey,
	storedEntries,
	storeRows,
	UNOPENABLE_SIGNING_KEY,
} from "./identity-rows"

import { deriveNuloAccountAddress } from "./import-drivers"

export { type NetworkRow, readNetworkRows } from "./identity-rows"

/** A chainId no seed carries: the Testnet before its last reset, as a stored row remembers it. */
export const PREVIOUS_TESTNET_CHAIN_ID = (CHAIN_IDS.TESTNET ^ 1) >>> 0
/** A Mainnet chain under this build's Mainnet L1. */
export const E2E_MAINNET_CHAIN_ID = 2070860441
/** A closed loopback port: a node that never answers, and no host the egress guard records. */
export const DEAD_NODE = "http://127.0.0.1:9"

export type StoredAccount = { address: string; name: string; index: number; type: number; visible: boolean }

/** Every account of `chainId` the wallet reads, by index, type, then address. */
export async function readAccounts(page: Page, chainId: number): Promise<StoredAccount[]> {
	return (await accountRows(page, chainId))
		.map(({ address, name, index, type, visible }) => ({ address, name, index, type, visible }))
		.sort((a, b) => a.index - b.index || a.type - b.type || a.address.localeCompare(b.address))
}

/** Each of `rows`, derived accounts, at the address this build derives for its index on
 *  `l1ChainId` from the profile's revealed recovery phrase. Leaves the popup on the phrase. */
export async function rederive<T extends { index: number; address: string }>(page: Page, rows: T[], l1ChainId: number): Promise<T[]> {
	const { deriveMasterFromMnemonic } = await import("@nulo/wallet-crypto")
	const master = Buffer.from(await deriveMasterFromMnemonic(await revealSeedPhrase(page, TEST_PASSWORD))).toString("base64")
	return Promise.all(rows.map(async (row) => ({ ...row, address: await deriveNuloAccountAddress(master, l1ChainId, row.index) })))
}

/** Waits for the reset's ready toast for `network` and returns whether it says the addresses
 *  moved, read as it shows: a success closes itself after 2 s. Throws on any other wording. */
export async function readyToastSaysMoved(page: Page, network: string, timeout = 120_000): Promise<boolean> {
	const card = await waitForToast(page, readyToast(network, false).label, timeout, { kind: "success" })
	const sub = await card.evaluate((el) => el.querySelector('[data-testid="snackbar-sub"]')?.textContent?.trim())
	const said = [false, true].find((moved) => readyToast(network, moved).sub === sub)
	if (said === undefined) throw new Error(`the ready toast for ${network} says "${sub}"`)
	return said
}

/** The network row of `kind` the wallet reads. */
export async function readNetwork(page: Page, kind: string, networks?: NetworkRow[]): Promise<NetworkRow> {
	const row = (await networkRows(page, networks)).find((network) => network.kind === kind)
	if (!row) throw new Error(`no ${kind} network the wallet reads: a locked smoke seed takes the networks read before the lock`)
	return row
}

/** Points the stored active network at the row of `kind`, as a switch made before this moment
 *  would have; the network service reads the pointer on every call. */
export async function storeActiveNetwork(page: Page, kind: string, networks?: NetworkRow[]): Promise<void> {
	const { id, profileId } = await readNetwork(page, kind, networks)
	await storeRows(page, { [`nulo:core:active-network@${profileId}`]: id })
}

/** What the wallet reads of `chainId`: the network row `networkId`, the accounts on the chain, how
 *  many imported keys name it, and every other row naming it, exactly as stored. A sealed row of
 *  another root names its chain only inside its envelope, so none is here. */
export type ChainSnapshot = {
	network: NetworkRow | undefined
	accounts: AccountRow[]
	importedKeys: number
	rows: Record<string, string>
}

export async function snapshotChain(page: Page, chainId: number, networkId: string, networks?: NetworkRow[]): Promise<ChainSnapshot> {
	const stored = await storedEntries(page, ["nulo:core:"])
	const rows: Record<string, string> = {}
	for (const [key, raw] of Object.entries(stored)) {
		if (typeof raw !== "string" || [NETWORKS, ACCOUNTS, IMPORTED_KEYS].some((root) => key.startsWith(root))) continue
		if (parseRow(raw)?.chainId === chainId) rows[key] = raw
	}
	return {
		network: (await networkRows(page, networks)).find((network) => network.id === networkId),
		accounts: await accountRows(page, chainId),
		importedKeys: Object.keys(stored).filter((key) => key.startsWith(IMPORTED_KEYS) && accountScope(key)?.chainId === chainId).length,
		rows,
	}
}

function parseRow(raw: unknown): Record<string, unknown> | null {
	try {
		return typeof raw === "string" ? JSON.parse(raw) : null
	} catch {
		return null
	}
}

const movedAddress = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(32)}`

type Shape = "network-reset" | "address-change" | "both"

/** Where `shape` takes an account of the seeded chain, the `fake`-th it gives a new address. */
function movedAccount(account: AccountRow, shape: Shape, fake: () => number, hideIndex: number | null): AccountRow {
	const chain = shape === "address-change" ? {} : { chainId: PREVIOUS_TESTNET_CHAIN_ID }
	const derived = account.type === 0
	if (shape === "network-reset" || (shape === "both" && !derived)) return { ...account, ...chain }
	if (!derived) return account
	return { ...account, ...chain, address: movedAddress(fake()), visible: account.index === hideIndex ? false : account.visible }
}

/**
 * Rewrites the Testnet row the way an update meets it. `network-reset` moves the row and every
 * row of its chain to an older chainId; `address-change` moves every derived (Nulo_v1) address on
 * it and hides the account at `hideIndex`; `both` does the two. Run it locked: an unlocked worker
 * would act on half the writes. A moved imported key no longer opens, since its seal binds its
 * chainId, so after `network-reset` or `both` every imported account reads unmovable. A sealed row
 * of another root names its chain only inside its envelope, so it stays as it is: seed before any
 * send on Testnet.
 */
export async function seedStaleNetwork(
	page: Page,
	shape: Shape,
	opts: { hideIndex?: number; networks?: NetworkRow[] } = {},
): Promise<void> {
	const seed = CHAIN_IDS.TESTNET
	const moves = shape !== "address-change"
	const stored = await storedEntries(page, ["nulo:core:"])
	const writes: Record<string, string> = {}
	for (const network of (await networkRows(page, opts.networks)).filter((row) => row.chainId === seed)) {
		if (moves) writes[`${NETWORKS}${network.id}`] = JSON.stringify({ ...network, chainId: PREVIOUS_TESTNET_CHAIN_ID })
	}
	let fake = 0
	const accounts = (await accountRows(page, seed, { complete: true })).map((account) =>
		movedAccount(account, shape, () => ++fake, opts.hideIndex ?? null),
	)
	for (const account of accounts) writes[plaintextKey(ACCOUNTS, account)] = JSON.stringify(account)
	for (const account of moves ? accounts.filter((row) => row.type === 1) : []) {
		const { profileId, chainId, address } = account
		writes[plaintextKey(IMPORTED_KEYS, account)] = JSON.stringify({
			profileId,
			chainId,
			address,
			encryptedSigningKey: UNOPENABLE_SIGNING_KEY,
		})
	}
	const onSeed = (key: string) => accountScope(key)?.chainId === seed && (key.startsWith(ACCOUNTS) || moves)
	for (const [key, raw] of Object.entries(stored)) {
		if ([NETWORKS, ACCOUNTS, IMPORTED_KEYS].some((root) => key.startsWith(root)) || !moves) continue
		const row = parseRow(raw)
		if (row?.chainId === seed) writes[key] = JSON.stringify({ ...row, chainId: PREVIOUS_TESTNET_CHAIN_ID })
	}
	const changed = Object.keys(writes).filter((key) => key.startsWith(NETWORKS) || key.startsWith(ACCOUNTS)).length
	if (changed === 0) throw new Error(`seedStaleNetwork(${shape}) found no network or account row to rewrite`)
	await storeRows(page, writes, Object.keys(stored).filter(onSeed))
}

/** Local's chainId before an update moved it: no build seeds it. */
export const PREVIOUS_LOCAL_CHAIN_ID = (LOCAL_L1_CHAIN_ID ^ 5) >>> 0

/**
 * Local as a reset bump meets it, with both causes, on a profile that never opened Local: the row
 * on {@link PREVIOUS_LOCAL_CHAIN_ID}, the Testnet's derived accounts copied onto it at moved
 * addresses, and Local active. Refuses a profile that already holds Local accounts, whose PXE
 * store for the seed chain would already exist. Run it locked.
 */
export async function seedStaleLocalBothCauses(
	page: Page,
	networks?: NetworkRow[],
): Promise<{ profileId: string; networkId: string; moved: string[] }> {
	const rows = await networkRows(page, networks)
	const local = rows.find((row) => row.kind === "local")
	const testnet = rows.find((row) => row.kind === "testnet")
	if (!local || !testnet) throw new Error("seedStaleLocalBothCauses: no Local or Testnet network the wallet reads")
	if ((await accountRows(page, CHAIN_IDS.SANDBOX)).length > 0) throw new Error("the profile already opened Local")
	const derived = (await accountRows(page, testnet.chainId, { complete: true })).filter((row) => row.type === 0)
	const writes: Record<string, string> = {
		[`${NETWORKS}${local.id}`]: JSON.stringify({ ...local, chainId: PREVIOUS_LOCAL_CHAIN_ID }),
		[`nulo:core:active-network@${local.profileId}`]: local.id,
	}
	const moved = derived.map((row, i) => {
		const address = `0x${(0xa0 + i).toString(16).repeat(32)}`
		const next = { ...row, chainId: PREVIOUS_LOCAL_CHAIN_ID, l1ChainId: LOCAL_L1_CHAIN_ID, address }
		writes[plaintextKey(ACCOUNTS, next)] = JSON.stringify(next)
		return address
	})
	await storeRows(page, writes)
	return { profileId: local.profileId, networkId: local.id, moved }
}

export type AddedNetwork = { name: string; kind: string; chainId: number; l1ChainId: number; movedAccount: boolean; active: boolean }

/**
 * Adds a network row whose node is {@link DEAD_NODE}, optionally with the Testnet's first derived
 * account copied onto it at a moved address, and optionally as the active network.
 */
export async function addNetwork(page: Page, network: AddedNetwork, networks?: NetworkRow[]): Promise<{ networkId: string }> {
	const testnet = (await networkRows(page, networks)).find((row) => row.kind === "testnet")
	if (!testnet) throw new Error("addNetwork: no Testnet network the wallet reads")
	const networkId = randomBytes(Math.max(8, Math.ceil(testnet.id.length / 2))).toString("hex")
	const endpointId = randomBytes(8).toString("hex")
	const writes: Record<string, string> = {
		[`${NETWORKS}${networkId}`]: JSON.stringify({
			id: networkId,
			profileId: testnet.profileId,
			chainId: network.chainId,
			l1ChainId: network.l1ChainId,
			name: network.name,
			primaryEndpointId: endpointId,
			endpoints: [{ id: endpointId, rpcUrl: DEAD_NODE, label: "e2e" }],
			kind: network.kind,
		}),
	}
	if (network.movedAccount) {
		const account = (await accountRows(page, testnet.chainId)).find(
			(row) => row.profileId === testnet.profileId && row.type === 0 && row.index === 0,
		)
		if (!account) throw new Error("addNetwork: the Testnet network has no first derived account to copy")
		const moved = { ...account, chainId: network.chainId, l1ChainId: network.l1ChainId, address: `0x${"5a".repeat(32)}` }
		writes[plaintextKey(ACCOUNTS, moved)] = JSON.stringify(moved)
	}
	if (network.active) writes[`nulo:core:active-network@${testnet.profileId}`] = networkId
	await storeRows(page, writes)
	return { networkId }
}

/**
 * Adds a Mainnet network whose one derived account sits at a moved address, and makes it the
 * active network. Run it locked.
 */
export async function seedStaleMainnet(page: Page, networks?: NetworkRow[]): Promise<{ networkId: string }> {
	return addNetwork(
		page,
		{
			name: "Mainnet",
			kind: "mainnet",
			chainId: E2E_MAINNET_CHAIN_ID,
			l1ChainId: MAINNET_L1_CHAIN_ID,
			movedAccount: true,
			active: true,
		},
		networks,
	)
}

export const TAKEOVER = '[data-testid="stale-network-takeover"]'

/**
 * The takeover's screen once one shows, or, with `screen`, once that one shows. A timeout names
 * the route, the visible text and the stale-network rows, since "no takeover" alone says nothing.
 */
export async function takeoverScreen(page: Page, screen?: string, timeout = 60_000): Promise<string | null> {
	const selector = screen === undefined ? TAKEOVER : `${TAKEOVER}[data-screen="${screen}"]`
	try {
		await page.waitForSelector(selector, { visible: true, timeout })
	} catch (err) {
		const seen = await page
			.evaluate(async (takeover: string) => {
				const all = await chrome.storage.local.get(null)
				return {
					hash: location.hash,
					screen: document.querySelector(takeover)?.getAttribute("data-screen") ?? null,
					text: (document.body.innerText ?? "").slice(0, 300),
					stale: Object.entries(all)
						.filter(([key]) => /stale-networks|network-reset|active-network|networks@/.test(key))
						.map(([key, raw]) => `${key}=${String(raw).slice(0, 200)}`),
				}
			}, TAKEOVER)
			.catch((e) => ({ unreadable: String(e) }))
		throw new Error(`no ${screen ?? "takeover"} screen: ${JSON.stringify(seen)}; ${(err as Error).message}`)
	}
	return page.$eval(TAKEOVER, (el) => el.getAttribute("data-screen"))
}

export type TakeoverTrace = {
	sawProgress: boolean
	/** The shell when the first "is ready" snack appeared. */
	atToast: null | { hash: string; account: boolean; takeover: boolean }
	/** How many distinct "is ready" snacks this page showed. */
	readyToasts: number
}

/** Records, from now on, whether A4 ever shows, what the shell shows when the A5 snack lands, and
 *  how many A5 snacks land. */
export async function traceTakeover(page: Page): Promise<void> {
	await page.evaluate(() => {
		const trace: TakeoverTrace = { sawProgress: false, atToast: null, readyToasts: 0 }
		;(window as unknown as { __staleTrace: TakeoverTrace }).__staleTrace = trace
		const counted = new WeakSet<Element>()
		const check = () => {
			if (document.querySelector('[data-testid="stale-progress"]')) trace.sawProgress = true
			const titles = [...document.querySelectorAll('[data-testid="snackbar-title"]')].filter((t) =>
				/is ready/i.test(t.textContent ?? ""),
			)
			for (const title of titles) {
				if (counted.has(title)) continue
				counted.add(title)
				trace.readyToasts++
			}
			if (trace.atToast || titles.length === 0) return
			trace.atToast = {
				hash: window.location.hash,
				account: !!document.querySelector('[data-testid="account-address-copy"]'),
				takeover: !!document.querySelector('[data-testid="stale-network-takeover"], [data-testid="stale-progress"]'),
			}
		}
		new MutationObserver(check).observe(document.body, { childList: true, subtree: true, characterData: true })
		check()
	})
}

export async function readTakeoverTrace(page: Page): Promise<TakeoverTrace> {
	return page.evaluate(() => (window as unknown as { __staleTrace: TakeoverTrace }).__staleTrace)
}
