import { bytesToHex } from "@nulo/wallet-core/utils"
import type { Network } from "./spec"

/** An endpoint URL an earlier build seeded and this one retired, named by the SHA-256 of the URL
 *  as the seed stored it so the source never holds it, and the URL that replaces it. */
export type RetiredEndpoint = { readonly sha256: string; readonly replacement: string }

async function sha256Hex(text: string): Promise<string> {
	return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
}

/**
 * A copy of `network` whose endpoints on a `retired` URL take its replacement, each keeping its id,
 * label and primary role; `undefined` when none moves. An endpoint whose replacement the network
 * already holds stays as it is, so no endpoint disappears and no network holds one URL twice.
 */
export async function retireEndpoints(network: Network, retired: readonly RetiredEndpoint[]): Promise<Network | undefined> {
	const held = new Set(network.endpoints.map((endpoint) => endpoint.rpcUrl))
	const endpoints = []
	let moved = false
	for (const endpoint of network.endpoints) {
		const digest = await sha256Hex(endpoint.rpcUrl)
		const entry = retired.find((candidate) => candidate.sha256 === digest)
		if (entry === undefined || held.has(entry.replacement)) {
			endpoints.push(endpoint)
			continue
		}
		held.add(entry.replacement)
		endpoints.push({ ...endpoint, rpcUrl: entry.replacement })
		moved = true
	}
	return moved ? { ...network, endpoints } : undefined
}
