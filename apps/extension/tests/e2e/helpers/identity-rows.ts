/**
 * Network, account and imported-key rows as the wallet reads them, for the seeds that rewrite them
 * and the specs that compare them. The three roots are sealed, so a row is read through its service:
 * the account service reads accounts on a locked wallet too, while this worker holds the profile's
 * keys; the network service serves networks only to an unlocked profile, so a seed run locked on a
 * build without the sealed-row reader takes the rows {@link readNetworkRows} read before the lock.
 *
 * A seed writes plaintext replacements, which the dual read serves and the next unlock seals. A
 * network row sits at its own id, so its replacement overwrites it; an account or a key sits at its
 * address's keyed hash, which a spec cannot compute, so a seed drops every sealed row of the chain it
 * rewrites and writes each account of that chain back at its address.
 */
import type { Page } from "puppeteer"
import { ACCOUNT_SERVICE_NAME, ACCOUNT_STORAGE_ROOT, IMPORTED_KEYS_STORAGE_ROOT } from "@/wallet/services/account/spec"
import { NETWORK_SERVICE_NAME, NETWORK_STORAGE_ROOT } from "@/wallet/services/network/spec"
import { isSealedEnvelope, readSealedRows } from "../fixtures/sealed-rows"
import { callService } from "../fixtures/session"

export const NETWORKS = `${NETWORK_STORAGE_ROOT}@`
export const ACCOUNTS = `${ACCOUNT_STORAGE_ROOT}@`
export const IMPORTED_KEYS = `${IMPORTED_KEYS_STORAGE_ROOT}@`

export type NetworkRow = Record<string, unknown> & {
	id: string
	profileId: string
	chainId: number
	l1ChainId: number
	name: string
	kind?: string
	primaryEndpointId: string
	endpoints: Array<{ id: string; rpcUrl: string; label?: string }>
}

export type AccountRow = {
	profileId: string
	chainId: number
	l1ChainId: number
	address: string
	index: number
	type: number
	name: string
	visible: boolean
}

/** An imported key's sealed field that no key opens. */
export const UNOPENABLE_SIGNING_KEY = Buffer.alloc(45, 1).toString("base64")

/** Every stored value whose key starts with one of `prefixes`. */
export async function storedEntries(page: Page, prefixes: string[]): Promise<Record<string, unknown>> {
	return page.evaluate(async (wanted: string[]) => {
		const all = await chrome.storage.local.get(null)
		return Object.fromEntries(Object.entries(all).filter(([key]) => wanted.some((prefix) => key.startsWith(prefix))))
	}, prefixes)
}

/** Writes `writes`, then removes `removes` but any key just written: a keyed root prefers its
 *  sealed copy, so the replacement lands before the row it replaces goes. */
export async function storeRows(page: Page, writes: Record<string, string>, removes: string[] = []): Promise<void> {
	const gone = removes.filter((key) => !(key in writes))
	await page.evaluate(
		async (items: Record<string, string>, keys: string[]) => {
			await chrome.storage.local.set(items)
			await chrome.storage.local.remove(keys)
		},
		writes,
		gone,
	)
}

/** The scope `["account", profileId, chainId, tail]` of an account or imported-key storage key: the
 *  tail is the address, or its keyed hash once the row is sealed. */
export function accountScope(key: string): { profileId: string; chainId: number } | undefined {
	const prefix = [ACCOUNTS, IMPORTED_KEYS].find((root) => key.startsWith(root))
	if (!prefix) return undefined
	try {
		const [tag, profileId, chainId] = JSON.parse(key.slice(prefix.length)) as unknown[]
		return tag === "account" && typeof profileId === "string" && typeof chainId === "number" ? { profileId, chainId } : undefined
	} catch {
		return undefined
	}
}

/** The storage key an account or imported-key row of `root` takes as plaintext. */
export function plaintextKey(root: string, row: { profileId: string; chainId: number; address: string }): string {
	return `${root}${JSON.stringify(["account", row.profileId, row.chainId, row.address])}`
}

/** The open profile's networks, read by the network service: call it unlocked. */
export function readNetworkRows(page: Page): Promise<NetworkRow[]> {
	return callService<NetworkRow[]>(page, NETWORK_SERVICE_NAME, "getNetworks")
}

/** The sealed network rows this page can have opened now: the network service's while unlocked,
 *  else the build's sealed-row reader's. */
async function openedNetworks(page: Page): Promise<NetworkRow[]> {
	const unlocked = await readNetworkRows(page).catch(() => undefined)
	if (unlocked) return unlocked
	const sealed = await readSealedRows<NetworkRow>(page, "networks").catch(() => [])
	return sealed.map(({ row }) => row)
}

/**
 * Every network row the wallet reads now: a plaintext row as stored, a sealed one from `opened`, or
 * else as {@link openedNetworks} opens it. A sealed row nothing opens is left out, so a seed run
 * locked on a smoke build that finds no row was not handed the rows read before the lock.
 */
export async function networkRows(page: Page, opened?: NetworkRow[]): Promise<NetworkRow[]> {
	const stored = await storedEntries(page, [NETWORKS])
	const sealed = Object.values(stored).some(isSealedEnvelope) ? (opened ?? (await openedNetworks(page))) : []
	return Object.entries(stored).flatMap(([key, raw]) => {
		if (typeof raw !== "string") return []
		if (!isSealedEnvelope(raw)) return [JSON.parse(raw) as NetworkRow]
		const row = sealed.find((network) => `${NETWORKS}${network.id}` === key)
		return row ? [row] : []
	})
}

/** Every account of `chainId` the account service reads, of each profile with a row stored on that
 *  chain. With `complete`, throws unless every stored row opened: a worker started since the unlock
 *  holds no key. */
export async function accountRows(page: Page, chainId: number, { complete = false } = {}): Promise<AccountRow[]> {
	const stored = Object.keys(await storedEntries(page, [ACCOUNTS]))
	const scoped = stored.map(accountScope).filter((scope) => scope?.chainId === chainId)
	const profiles = [...new Set(scoped.map((scope) => scope?.profileId as string))]
	const rows: AccountRow[] = []
	for (const profileId of profiles) {
		rows.push(...(await callService<AccountRow[]>(page, ACCOUNT_SERVICE_NAME, "getAccounts", [profileId, chainId, true])))
	}
	if (complete && rows.length !== scoped.length) {
		throw new Error(`${scoped.length - rows.length} account row(s) of chain ${chainId} did not open`)
	}
	return rows
}

/**
 * Replaces the imported key of every imported account the profile holds, or `profileId`'s, with
 * one whose signing key does not open, as a key a corrupted store or a moved chain leaves. Returns
 * how many it replaced.
 */
export async function corruptImportedKeys(page: Page, profileId?: string): Promise<number> {
	const stored = await storedEntries(page, [ACCOUNTS, IMPORTED_KEYS])
	const chains = new Set(Object.keys(stored).flatMap((key) => accountScope(key)?.chainId ?? []))
	const imported: AccountRow[] = []
	for (const chainId of chains) {
		const rows = await accountRows(page, chainId)
		imported.push(...rows.filter((row) => row.type === 1 && (profileId === undefined || row.profileId === profileId)))
	}
	const writes = Object.fromEntries(
		imported.map(({ profileId: owner, chainId, address }) => [
			plaintextKey(IMPORTED_KEYS, { profileId: owner, chainId, address }),
			JSON.stringify({ profileId: owner, chainId, address, encryptedSigningKey: UNOPENABLE_SIGNING_KEY }),
		]),
	)
	const owners = new Set(imported.map((row) => row.profileId))
	const removes = Object.keys(stored).filter((key) => key.startsWith(IMPORTED_KEYS) && owners.has(accountScope(key)?.profileId ?? ""))
	await storeRows(page, writes, removes)
	return imported.length
}

/** Every `(profileId, chainId)` an account row is stored under, `profileId`'s only when given. */
async function accountScopes(page: Page, profileId?: string): Promise<Array<{ profileId: string; chainId: number }>> {
	const scopes = new Map<string, { profileId: string; chainId: number }>()
	for (const key of Object.keys(await storedEntries(page, [ACCOUNTS]))) {
		const scope = accountScope(key)
		if (scope && (profileId === undefined || scope.profileId === profileId)) scopes.set(JSON.stringify(scope), scope)
	}
	return [...scopes.values()]
}

/** The account at `address` the account service reads, of `profileId` when given, on whichever
 *  chain it is. */
export async function findAccount(page: Page, profileId: string | undefined, address: string): Promise<AccountRow | undefined> {
	for (const scope of await accountScopes(page, profileId)) {
		const rows = await callService<AccountRow[]>(page, ACCOUNT_SERVICE_NAME, "getAccounts", [scope.profileId, scope.chainId, true])
		const found = rows.find((row) => row.address === address)
		if (found) return found
	}
	return undefined
}

/** Rewrites the account at `address` as `edit` returns it, keeping its scope and address. Every
 *  account of its profile and chain is written back as plaintext and every stored row of that scope
 *  dropped, since a sealed copy sits at a keyed hash a spec cannot compute. */
export async function rewriteAccount(page: Page, address: string, edit: (row: AccountRow) => AccountRow): Promise<void> {
	const account = await findAccount(page, undefined, address)
	if (!account) throw new Error(`no account ${address} the wallet reads`)
	const scoped = (await accountRows(page, account.chainId)).filter((row) => row.profileId === account.profileId)
	const writes = Object.fromEntries(
		scoped.map((row) => [plaintextKey(ACCOUNTS, row), JSON.stringify(row.address === address ? edit(row) : row)]),
	)
	const stored = Object.keys(await storedEntries(page, [ACCOUNTS]))
	const removes = stored.filter((key) => {
		const scope = accountScope(key)
		return scope?.profileId === account.profileId && scope.chainId === account.chainId
	})
	if (removes.length !== scoped.length)
		throw new Error(`${removes.length - scoped.length} account row(s) of ${address}'s scope did not open`)
	await storeRows(page, writes, removes)
}
