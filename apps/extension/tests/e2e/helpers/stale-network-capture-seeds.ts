/**
 * Seeds and holds the stale-network captures need beyond S1's: a user node on Testnet, a second
 * stale network, a custom one, an imported key that no longer opens, and a hold that freezes a
 * running reset inside the background. Every seed runs locked, like `stale-network.ts`.
 */
import type { Page } from "puppeteer"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { type BackgroundOwner, evaluateInBackground } from "../fixtures/browser"
import { ACCOUNTS, accountScope, IMPORTED_KEYS, NETWORKS, type NetworkRow, networkRows, storedEntries, storeRows } from "./identity-rows"

export { corruptImportedKeys } from "./identity-rows"

/** The network row of `kind` the wallet reads, `networks` holding the rows read before the lock. */
async function networkOf(page: Page, kind: string, networks?: NetworkRow[]): Promise<NetworkRow> {
	const row = (await networkRows(page, networks)).find((network) => network.kind === kind)
	if (!row) throw new Error(`no ${kind} network the wallet reads`)
	return row
}

/** Every account and imported-key storage key on `chainId`. */
async function keysOnChain(page: Page, chainId: number, roots: string[]): Promise<string[]> {
	return Object.keys(await storedEntries(page, roots)).filter((key) => accountScope(key)?.chainId === chainId)
}

/** Makes a node of the user's Testnet's primary, or, with `null`, the seed's node again. */
export async function setTestnetPrimary(page: Page, rpcUrl: string | null, networks?: NetworkRow[]): Promise<void> {
	const row = await networkOf(page, "testnet", networks)
	const seedEndpoint = row.endpoints[0]
	const id = "e2e0node"
	const next =
		rpcUrl === null
			? { ...row, endpoints: [seedEndpoint], primaryEndpointId: seedEndpoint.id }
			: { ...row, endpoints: [seedEndpoint, { id, rpcUrl, label: "My node" }], primaryEndpointId: id }
	await storeRows(page, { [`${NETWORKS}${row.id}`]: JSON.stringify(next) })
}

/** Removes a network row added by `addNetwork`, and its accounts. */
export async function removeNetwork(page: Page, networkId: string, networks?: NetworkRow[]): Promise<void> {
	const row = (await networkRows(page, networks)).find((network) => network.id === networkId)
	if (!row) throw new Error(`no network ${networkId} the wallet reads`)
	await storeRows(page, {}, [`${NETWORKS}${networkId}`, ...(await keysOnChain(page, row.chainId, [ACCOUNTS]))])
}

/** Moves the Local row off its seed's chainId (a network reset) and makes it the active network. */
export async function seedStaleLocal(page: Page, networks?: NetworkRow[]): Promise<void> {
	const row = await networkOf(page, "local", networks)
	await storeRows(page, {
		[`${NETWORKS}${row.id}`]: JSON.stringify({ ...row, chainId: 77 }),
		[`nulo:core:active-network@${row.profileId}`]: row.id,
	})
}

/** Removes every account and imported key on the Testnet row's chain and makes Testnet the active
 *  network: a Testnet this profile never opened. */
export async function forgetTestnetAccounts(page: Page, networks?: NetworkRow[]): Promise<void> {
	const testnet = await networkOf(page, "testnet", networks)
	const gone = await keysOnChain(page, testnet.chainId, [ACCOUNTS, IMPORTED_KEYS])
	if (gone.length === 0) throw new Error("forgetTestnetAccounts: the Testnet chain holds no account")
	await storeRows(page, { [`nulo:core:active-network@${testnet.profileId}`]: testnet.id }, gone)
}

/**
 * Which background storage write to hold. `purged` and `fail-purged` match the journal write that
 * records the purge (A4's "Removing old data"; the second refuses it, so the run fails and its
 * journal stays: R1); `second-account` matches the second re-created account (A4 mid-run);
 * `local-default-account` matches the default account a first switch to Local creates (A15b).
 */
export type HoldMode = "purged" | "fail-purged" | "second-account" | "local-default-account"

/** Wraps the background's `chrome.storage.local.set`, the object its storage adapters hold, once
 *  per background; a background restart drops the wrapper and any held write with it. */
const INSTALL_HOLD = `
	if (globalThis.__staleHold) return true;
	const hold = { mode: null, seed: ${CHAIN_IDS.TESTNET}, held: 0, release: null, accounts: 0 };
	globalThis.__staleHold = hold;
	const area = chrome.storage.local;
	const set = area.set;
	const parse = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v } catch { return null } };
	const chainOf = (key) => { try { return JSON.parse(key.slice("nulo:core:accounts@".length))[2] } catch { return undefined } };
	const matches = (key, row) => {
		switch (hold.mode) {
			case "purged":
			case "fail-purged":
				return key.startsWith("nulo:core:network-reset@") && row?.purged === true;
			// A sealed account names its chain in its key and its index nowhere: the reset re-creates
			// accounts in index order, so the second write on the chain is the second account.
			case "second-account":
				return key.startsWith("nulo:core:accounts@") && chainOf(key) === hold.seed && ++hold.accounts === 2;
			case "local-default-account":
				return key.startsWith("nulo:core:accounts@") && chainOf(key) === 0;
			default:
				return false;
		}
	};
	Object.defineProperty(area, "set", {
		configurable: true,
		writable: true,
		value: async function (items, ...rest) {
			if (items && typeof items === "object" && Object.entries(items).some(([k, v]) => matches(k, parse(v)))) {
				hold.held++;
				if (hold.mode === "fail-purged") throw new Error("the e2e refused this write");
				await new Promise((resolve) => { hold.release = resolve });
			}
			return set.apply(this, [items, ...rest]);
		},
	});
	return true;`

/** Arms `mode` in the running background. */
export async function armHold(owner: BackgroundOwner, mode: HoldMode): Promise<void> {
	await evaluateInBackground(owner, INSTALL_HOLD)
	await evaluateInBackground(
		owner,
		`globalThis.__staleHold.mode = ${JSON.stringify(mode)}; globalThis.__staleHold.held = 0; globalThis.__staleHold.accounts = 0; return true;`,
	)
}

/** How many writes the armed mode has held or refused so far. */
export function heldWrites(owner: BackgroundOwner): Promise<number> {
	return evaluateInBackground<number>(owner, "return globalThis.__staleHold?.held ?? 0;")
}

/** Lets a held write through, arming `next` in the same step so no write slips between the two. */
export async function releaseHold(owner: BackgroundOwner, next: HoldMode | null = null): Promise<void> {
	await evaluateInBackground(
		owner,
		`const hold = globalThis.__staleHold;
		if (!hold) return false;
		const release = hold.release;
		hold.mode = ${JSON.stringify(next)};
		hold.held = 0;
		hold.accounts = 0;
		hold.release = null;
		release?.();
		return true;`,
	)
}
