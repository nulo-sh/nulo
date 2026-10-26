import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { Page } from "puppeteer"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import type { NetworkRow } from "../../helpers/identity-rows"
import { nodeInfoResult, planBatchReplies } from "../../helpers/rpc-stub"
import { listenClaimed } from "../egress-guard"
import { refuseNodeCall } from "../node-stub"
import { callService } from "../session"
import { isLoopbackUrl } from "./release-reads"

/** A loopback node that reports one network's chain identity until `refuseAll`, then refuses every
 *  call as a guarded launch's node stub does. */
type StandIn = { url: string; refuseAll: () => void; stop: () => Promise<void> }

async function startStandIn(network: NetworkRow): Promise<StandIn> {
	const info = nodeInfoResult(network.l1ChainId, (network.chainId ^ network.l1ChainId) >>> 0)
	let identifying = true
	const handle = (req: IncomingMessage, res: ServerResponse) => {
		let body = ""
		req.on("data", (chunk) => {
			body += String(chunk)
		})
		req.on("end", () => {
			const plan = identifying
				? planBatchReplies(body, (method) => (method === "aztec_getNodeInfo" ? info : undefined), [])
				: undefined
			if (plan?.kind !== "replies") return refuseNodeCall(res)
			res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(plan.payload))
		})
	}
	const { server, port, release } = await listenClaimed<Server>(() => createServer(handle), "update-endpoint-stand-in")
	let stopping: Promise<void> | undefined
	return {
		url: `http://127.0.0.1:${port}`,
		refuseAll: () => {
			identifying = false
		},
		stop: () => {
			stopping ??= new Promise<void>((resolve) => {
				server.closeAllConnections()
				server.close(() => resolve())
			}).finally(release)
			return stopping
		},
	}
}

/**
 * Moves every endpoint of `networks` that is not on this machine onto a loopback stand-in, through
 * the release's own `updateEndpoint`, which probes the new URL for the row's chain identity: a sealed
 * row cannot be rewritten offline, and a recording names no outside endpoint (a default seed's URL
 * may carry a provider's key). The stand-ins then refuse every call; `stop` them once the run that
 * reaches them ends. Call it from a page unlocked on the networks' profile.
 */
export async function moveEndpointsToLoopback(page: Page, networks: readonly NetworkRow[]): Promise<{ stop: () => Promise<void> }> {
	const standIns: StandIn[] = []
	const stop = async () => {
		await Promise.all(standIns.map((standIn) => standIn.stop()))
	}
	try {
		for (const network of networks) {
			const outside = network.endpoints.filter((endpoint) => !isLoopbackUrl(endpoint.rpcUrl))
			if (outside.length === 0) continue
			const standIn = await startStandIn(network)
			standIns.push(standIn)
			for (const [index, endpoint] of outside.entries()) {
				// A network refuses two endpoints on one URL, so each takes its own path.
				const params = [network.id, endpoint.id, endpoint.label ?? "", `${standIn.url}/${index}`]
				await callService(page, NETWORK_SERVICE_NAME, "updateEndpoint", params, 30_000)
			}
		}
	} catch (error) {
		await stop()
		throw error
	} finally {
		for (const standIn of standIns) standIn.refuseAll()
	}
	return { stop }
}
