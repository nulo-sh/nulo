/**
 * The guarded smoke launch's stand-in for an outside node: a loopback endpoint that answers every
 * call with HTTP 400 and a JSON-RPC error. The node client stops at once on a 4xx with a readable
 * JSON body; a refused connection, or a 400 without one, it retries for seconds per call.
 */
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http"
import type { Browser } from "puppeteer"
import { holdRpcInterception } from "./browser"
import { listenClaimed } from "./egress-guard"
import type { HeldNode } from "./egress-guard"

const REFUSAL = JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32601, message: "no node answers a guarded smoke run" } })

export interface NodeStub {
	url: string
	/** Requests answered so far. */
	requests(): number
	stop(): Promise<void>
}

export async function startNodeStub(): Promise<NodeStub> {
	let requests = 0
	const handle = (req: IncomingMessage, res: ServerResponse) => {
		requests++
		req.resume()
		req.on("end", () => res.writeHead(400, { "Content-Type": "application/json" }).end(REFUSAL))
	}
	const { server, port, release } = await listenClaimed<Server>(() => createServer(handle), "egress-node-stub")
	let stopping: Promise<void> | undefined
	return {
		url: `http://127.0.0.1:${port}`,
		requests: () => requests,
		stop: () => {
			stopping ??= new Promise<void>((resolve) => {
				server.closeAllConnections()
				server.close(() => resolve())
			}).finally(release)
			return stopping
		},
	}
}

/** Redirects every request the browser makes to `nodeUrl`'s origin to a fresh stub, for the launch's life. */
export async function holdNodeStub(browser: Browser, extensionId: string, nodeUrl: string): Promise<HeldNode> {
	const stub = await startNodeStub()
	try {
		const held = await holdRpcInterception(browser, extensionId, nodeUrl, { kind: "redirect", to: stub.url })
		return {
			requests: stub.requests,
			failures: held.failures,
			stop: async () => {
				try {
					await held.stop()
				} catch {
					// The browser is already closed, and the interception went with it.
				} finally {
					await stub.stop()
				}
			},
		}
	} catch (err) {
		await stub.stop()
		throw err
	}
}
