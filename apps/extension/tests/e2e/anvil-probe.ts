import http from "node:http"

/** The local L1's chain id: anvil is spawned with it, and a listener on any other chain is not ours. */
export const ANVIL_CHAIN_ID = 31337

const HEX_QUANTITY = /^0x(0|[1-9a-f][0-9a-f]*)$/

function rpcResult(url: string, method: string, timeoutMs: number): Promise<unknown> {
	return new Promise((resolve) => {
		const u = new URL(url)
		const req = http.request(
			{
				hostname: u.hostname,
				port: u.port,
				path: "/",
				method: "POST",
				headers: { "Content-Type": "application/json" },
				timeout: timeoutMs,
			},
			(res) => {
				let body = ""
				res.on("data", (c) => {
					body += c.toString()
				})
				res.on("end", () => {
					try {
						resolve((JSON.parse(body) as { result?: unknown }).result)
					} catch {
						resolve(undefined)
					}
				})
			},
		)
		req.on("error", () => resolve(undefined))
		req.on("timeout", () => {
			req.destroy()
			resolve(undefined)
		})
		req.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }))
		req.end()
	})
}

const isHexQuantity = (value: unknown): value is string => typeof value === "string" && HEX_QUANTITY.test(value)

/**
 * True only for an L1 this suite could have spawned: a JSON-RPC listener answering a hex block
 * number on chain 31337; any other listener is never adopted. `--slots-in-an-epoch 1` is still
 * trusted: no RPC reports it.
 */
export async function probeAnvil(url: string, timeoutMs = 1500): Promise<boolean> {
	if (!isHexQuantity(await rpcResult(url, "eth_blockNumber", timeoutMs))) return false
	const chainId = await rpcResult(url, "eth_chainId", timeoutMs)
	return isHexQuantity(chainId) && Number.parseInt(chainId, 16) === ANVIL_CHAIN_ID
}
