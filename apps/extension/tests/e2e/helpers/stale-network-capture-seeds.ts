/**
 * Seeds and holds the stale-network captures need beyond S1's: a user node on Testnet, a second
 * stale network, a custom one, an imported key that no longer opens, and a hold that freezes a
 * running reset inside the background. Every seed runs locked, like `stale-network.ts`.
 */
import type { Page } from "puppeteer"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { type BackgroundOwner, evaluateInBackground } from "../fixtures/browser"

const NETWORKS = "nulo:core:networks@"
const ACCOUNTS = "nulo:core:accounts@"
const IMPORTED_KEYS = "nulo:core:imported-account-keys@"

/** Makes a node of the user's Testnet's primary, or, with `null`, the seed's node again. */
export async function setTestnetPrimary(page: Page, rpcUrl: string | null): Promise<void> {
	await page.evaluate(
		async (networks: string, url: string | null) => {
			const all = await chrome.storage.local.get(null)
			for (const [key, raw] of Object.entries(all)) {
				if (!key.startsWith(networks) || typeof raw !== "string") continue
				const row = JSON.parse(raw)
				if (row.kind !== "testnet") continue
				const seedEndpoint = row.endpoints[0]
				if (url === null) {
					row.endpoints = [seedEndpoint]
					row.primaryEndpointId = seedEndpoint.id
				} else {
					const id = "e2e0node"
					row.endpoints = [seedEndpoint, { id, rpcUrl: url, label: "My node" }]
					row.primaryEndpointId = id
				}
				await chrome.storage.local.set({ [key]: JSON.stringify(row) })
			}
		},
		NETWORKS,
		rpcUrl,
	)
}

/** Removes a network row added by {@link addNetwork}, and its accounts. */
export async function removeNetwork(page: Page, networkId: string): Promise<void> {
	await page.evaluate(
		async (networks: string, accounts: string, id: string) => {
			const all = await chrome.storage.local.get(null)
			const row = JSON.parse(all[`${networks}${id}`] as string)
			const gone = Object.entries(all)
				.filter(([key, raw]) => key.startsWith(accounts) && typeof raw === "string" && JSON.parse(raw).chainId === row.chainId)
				.map(([key]) => key)
			await chrome.storage.local.remove([`${networks}${id}`, ...gone])
		},
		NETWORKS,
		ACCOUNTS,
		networkId,
	)
}

/** Moves the Local row off its seed's chainId (a network reset) and makes it the active network. */
export async function seedStaleLocal(page: Page): Promise<void> {
	await page.evaluate(async (networks: string) => {
		const all = await chrome.storage.local.get(null)
		for (const [key, raw] of Object.entries(all)) {
			if (!key.startsWith(networks) || typeof raw !== "string") continue
			const row = JSON.parse(raw)
			if (row.kind !== "local") continue
			await chrome.storage.local.set({
				[key]: JSON.stringify({ ...row, chainId: 77 }),
				[`nulo:core:active-network@${row.profileId}`]: row.id,
			})
		}
	}, NETWORKS)
}

/** Flips one character in every imported key's sealed fields, so no stored key opens. */
export async function corruptImportedKeys(page: Page): Promise<number> {
	return page.evaluate(async (prefix: string) => {
		const flip = (value: unknown) => {
			if (typeof value !== "string" || value.length < 40) return value
			const at = Math.floor(value.length / 2)
			return `${value.slice(0, at)}${value[at] === "A" ? "B" : "A"}${value.slice(at + 1)}`
		}
		const all = await chrome.storage.local.get(null)
		const rows = Object.entries(all).filter(([key, raw]) => key.startsWith(prefix) && typeof raw === "string")
		for (const [key, raw] of rows) {
			const row = Object.fromEntries(Object.entries(JSON.parse(raw as string)).map(([field, value]) => [field, flip(value)]))
			await chrome.storage.local.set({ [key]: JSON.stringify(row) })
		}
		return rows.length
	}, IMPORTED_KEYS)
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
	const hold = { mode: null, seed: ${CHAIN_IDS.TESTNET}, held: 0, release: null };
	globalThis.__staleHold = hold;
	const area = chrome.storage.local;
	const set = area.set;
	const parse = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v } catch { return null } };
	const matches = (key, row) => {
		switch (hold.mode) {
			case "purged":
			case "fail-purged":
				return key.startsWith("nulo:core:network-reset@") && row?.purged === true;
			case "second-account":
				return key.startsWith("nulo:core:accounts@") && row?.index === 1 && row?.chainId === hold.seed;
			case "local-default-account":
				return key.startsWith("nulo:core:accounts@") && row?.chainId === 0;
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
		`globalThis.__staleHold.mode = ${JSON.stringify(mode)}; globalThis.__staleHold.held = 0; return true;`,
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
		hold.release = null;
		release?.();
		return true;`,
	)
}
