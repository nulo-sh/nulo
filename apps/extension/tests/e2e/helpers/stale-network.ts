/**
 * Stored networks as an update meets them. Each seed rewrites rows while the wallet is locked, so
 * the unlock's integrity check classifies them exactly as it classifies a real update: a Testnet
 * row on an older chainId is a network reset, every derived address on a chain moved is an address
 * change, and a Mainnet chain whose addresses moved is quarantined with no reset.
 */
import type { Page } from "puppeteer"
import { CHAIN_IDS, MAINNET_L1_CHAIN_ID } from "@/utils/chain-ids"

const NETWORKS = "nulo:core:networks@"
const ACCOUNTS = "nulo:core:accounts@"
const IMPORTED_KEYS = "nulo:core:imported-account-keys@"

/** A chainId no seed carries: the Testnet before its last reset, as a stored row remembers it. */
export const PREVIOUS_TESTNET_CHAIN_ID = (CHAIN_IDS.TESTNET ^ 1) >>> 0
/** A Mainnet chain under this build's Mainnet L1. */
export const E2E_MAINNET_CHAIN_ID = 2070860441
/** A closed loopback port: a node that never answers, and no host the egress guard records. */
export const DEAD_NODE = "http://127.0.0.1:9"

export type StoredAccount = { key: string; address: string; name: string; index: number; type: number; visible: boolean }

/** Every stored account row of `chainId`, by index, type, then address (keys sort by address). */
export async function readAccounts(page: Page, chainId: number): Promise<StoredAccount[]> {
	return page.evaluate(
		async (prefix: string, chain: number) => {
			const all = await chrome.storage.local.get(null)
			return Object.entries(all)
				.filter(([key, raw]) => key.startsWith(prefix) && typeof raw === "string")
				.map(([key, raw]) => ({ key, row: JSON.parse(raw as string) }))
				.filter(({ row }) => row.chainId === chain)
				.map(({ key, row }) => ({
					key,
					address: row.address,
					name: row.name,
					index: row.index,
					type: row.type,
					visible: row.visible,
				}))
				.sort((a, b) => a.index - b.index || a.type - b.type || a.address.localeCompare(b.address))
		},
		ACCOUNTS,
		chainId,
	)
}

/** The stored network row of `kind`. */
export async function readNetwork(page: Page, kind: string): Promise<{ id: string; chainId: number; profileId: string }> {
	const row = await page.evaluate(
		async (prefix: string, k: string) => {
			const all = await chrome.storage.local.get(null)
			for (const [key, raw] of Object.entries(all)) {
				if (!key.startsWith(prefix) || typeof raw !== "string") continue
				const parsed = JSON.parse(raw)
				if (parsed.kind === k) return parsed
			}
			return null
		},
		NETWORKS,
		kind,
	)
	if (!row) throw new Error(`no stored ${kind} network`)
	return row
}

/** Every stored row that names `chainId`, and the network row `networkId`, exactly as stored. */
export async function snapshotChain(page: Page, chainId: number, networkId: string): Promise<Record<string, string>> {
	return page.evaluate(
		async (chain: number, id: string, networks: string) => {
			const all = await chrome.storage.local.get(null)
			const out: Record<string, string> = {}
			for (const [key, raw] of Object.entries(all)) {
				if (typeof raw !== "string") continue
				if (key === `${networks}${id}`) {
					out[key] = raw
					continue
				}
				try {
					if (JSON.parse(raw)?.chainId === chain) out[key] = raw
				} catch {
					// Not a JSON row.
				}
			}
			return out
		},
		chainId,
		networkId,
		NETWORKS,
	)
}

/**
 * Rewrites the Testnet row the way an update meets it. `network-reset` moves the row and every
 * row of its chain to an older chainId; `address-change` moves every derived (Nulo_v1) address on
 * it and hides the account at `hideIndex`. Run it locked: an unlocked worker would act on half
 * the writes.
 */
export async function seedStaleNetwork(
	page: Page,
	shape: "network-reset" | "address-change",
	opts: { hideIndex?: number } = {},
): Promise<void> {
	const changed = await page.evaluate(
		async (args: {
			shape: string
			seed: number
			previous: number
			hideIndex: number | null
			networks: string
			accounts: string
			importedKeys: string
		}) => {
			const parse = (raw: unknown): Record<string, unknown> | null => {
				try {
					return typeof raw === "string" ? JSON.parse(raw) : null
				} catch {
					return null
				}
			}
			let fake = 0
			const rewrite = (key: string, row: Record<string, unknown>): Record<string, unknown> | null => {
				if (args.shape === "network-reset") return { ...row, chainId: args.previous }
				if (!key.startsWith(args.accounts) || row.type !== 0) return null
				fake++
				const address = `0x${fake.toString(16).padStart(2, "0").repeat(32)}`
				return { ...row, address, visible: row.index === args.hideIndex ? false : row.visible }
			}
			// Account and imported-key rows live under their scope (`accountRowId`): a moved row moves key.
			const keyFor = (key: string, row: Record<string, unknown>) => {
				const root = [args.accounts, args.importedKeys].find((r) => key.startsWith(r))
				return root ? `${root}${JSON.stringify(["account", row.profileId, row.chainId, row.address])}` : key
			}
			const all = await chrome.storage.local.get(null)
			const writes: Record<string, string> = {}
			const removes: string[] = []
			for (const [key, raw] of Object.entries(all)) {
				const row = key.startsWith("nulo:core:") ? parse(raw) : null
				const next = row?.chainId === args.seed ? rewrite(key, row) : null
				if (!next) continue
				const nextKey = keyFor(key, next)
				writes[nextKey] = JSON.stringify(next)
				if (nextKey !== key) removes.push(key)
			}
			await chrome.storage.local.remove(removes)
			await chrome.storage.local.set(writes)
			return Object.keys(writes).filter((key) => key.startsWith(args.networks) || key.startsWith(args.accounts)).length
		},
		{
			shape,
			seed: CHAIN_IDS.TESTNET,
			previous: PREVIOUS_TESTNET_CHAIN_ID,
			hideIndex: opts.hideIndex ?? null,
			networks: NETWORKS,
			accounts: ACCOUNTS,
			importedKeys: IMPORTED_KEYS,
		},
	)
	if (changed === 0) throw new Error(`seedStaleNetwork(${shape}) rewrote no network or account row`)
}

export type AddedNetwork = { name: string; kind: string; chainId: number; l1ChainId: number; movedAccount: boolean; active: boolean }

/**
 * Adds a network row whose node is {@link DEAD_NODE}, optionally with the Testnet's first derived
 * account copied onto it at a moved address, and optionally as the active network.
 */
export async function addNetwork(page: Page, network: AddedNetwork): Promise<{ networkId: string }> {
	return page.evaluate(
		async (args: AddedNetwork & { networks: string; accounts: string; dead: string }) => {
			const all = await chrome.storage.local.get(null)
			const rows = Object.entries(all).filter(([, raw]) => typeof raw === "string") as [string, string][]
			const parsed = (prefix: string) => rows.filter(([key]) => key.startsWith(prefix)).map(([, raw]) => JSON.parse(raw))
			const testnet = parsed(args.networks).find((row) => row.kind === "testnet")
			const hex = (bytes: number) =>
				[...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("")
			const networkId = hex(Math.max(8, Math.ceil(testnet.id.length / 2)))
			const endpointId = hex(8)
			const writes: Record<string, string> = {
				[`${args.networks}${networkId}`]: JSON.stringify({
					id: networkId,
					profileId: testnet.profileId,
					chainId: args.chainId,
					l1ChainId: args.l1ChainId,
					name: args.name,
					primaryEndpointId: endpointId,
					endpoints: [{ id: endpointId, rpcUrl: args.dead, label: "e2e" }],
					kind: args.kind,
				}),
			}
			if (args.movedAccount) {
				const account = parsed(args.accounts).find((row) => row.chainId === testnet.chainId && row.type === 0 && row.index === 0)
				if (!account) throw new Error("addNetwork: the Testnet network has no first derived account to copy")
				const moved = { ...account, chainId: args.chainId, l1ChainId: args.l1ChainId, address: `0x${"5a".repeat(32)}` }
				writes[`${args.accounts}${JSON.stringify(["account", moved.profileId, moved.chainId, moved.address])}`] =
					JSON.stringify(moved)
			}
			if (args.active) writes[`nulo:core:active-network@${testnet.profileId}`] = networkId
			await chrome.storage.local.set(writes)
			return { networkId }
		},
		{ ...network, networks: NETWORKS, accounts: ACCOUNTS, dead: DEAD_NODE },
	)
}

/**
 * Adds a Mainnet network whose one derived account sits at a moved address, and makes it the
 * active network. Run it locked.
 */
export async function seedStaleMainnet(page: Page): Promise<{ networkId: string }> {
	return addNetwork(page, {
		name: "Mainnet",
		kind: "mainnet",
		chainId: E2E_MAINNET_CHAIN_ID,
		l1ChainId: MAINNET_L1_CHAIN_ID,
		movedAccount: true,
		active: true,
	})
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
}

/** Records, from now on, whether A4 ever shows and what the shell shows when the A5 snack lands. */
export async function traceTakeover(page: Page): Promise<void> {
	await page.evaluate(() => {
		const trace: TakeoverTrace = { sawProgress: false, atToast: null }
		;(window as unknown as { __staleTrace: TakeoverTrace }).__staleTrace = trace
		const check = () => {
			if (document.querySelector('[data-testid="stale-progress"]')) trace.sawProgress = true
			if (trace.atToast) return
			const titles = [...document.querySelectorAll('[data-testid="snackbar-title"]')]
			if (!titles.some((t) => /is ready/i.test(t.textContent ?? ""))) return
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
