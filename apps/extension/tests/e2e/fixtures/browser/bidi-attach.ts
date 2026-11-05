import puppeteer, { type Browser } from "puppeteer"
import NodeWebSocket from "ws"
import type { SessionCapabilities } from "./webdriver-classic"

export interface BiDiAttachment {
	browser: Browser
	/** Top-level browsing contexts Puppeteer currently believes are open. */
	openContexts(): readonly string[]
	/** Tell Puppeteer a context is gone when Firefox did not. Idempotent. */
	reportClosed(contextId: string): void
}

/**
 * Attach Puppeteer to a BiDi session geckodriver already owns.
 *
 * `puppeteer.connect` opens by sending `session.new`, and Firefox answers a second one with
 * "Maximum number of active sessions" — the classic session holds the only slot. The transport
 * therefore answers `session.new` locally with the session geckodriver handed us and `session.end`
 * with an empty result (ending the session is the classic channel's job, and doing it here would
 * pull the floor out from under the still-open HTTP channel).
 *
 * It also supplies what Firefox leaves out. A window that closes ITSELF produces no
 * `browsingContext.contextDestroyed`, so Puppeteer would list it, and report its page open, for the
 * rest of the session; the driver reports it (`reportClosed`). And an add-on page's URL reaches
 * Puppeteer from its commit (`trackContexts`). Everything else is forwarded untouched.
 */
export async function attachPuppeteerOverBiDi(capabilities: SessionCapabilities, sessionId: string): Promise<BiDiAttachment> {
	const open = new Set<string>()
	const closed = new Set<string>()
	const transport = await openShimmedTransport(capabilities, sessionId, (message) => trackContexts(message, open, closed))
	// Match the 300-second submission wait: BiDi awaits the polling promise within its protocol budget.
	const browser = await puppeteer.connect({ transport, protocol: "webDriverBiDi", protocolTimeout: 300_000 })
	return {
		browser,
		openContexts: () => [...open],
		reportClosed(contextId) {
			if (closed.has(contextId)) return
			closed.add(contextId)
			open.delete(contextId)
			transport.onmessage?.(
				JSON.stringify({
					type: "event",
					method: "browsingContext.contextDestroyed",
					params: {
						context: contextId,
						parent: null,
						url: "about:blank",
						children: [],
						userContext: "default",
						originalOpener: null,
					},
				}),
			)
		},
	}
}

interface ContextInfo {
	context: string
	parent?: string | null
	url?: unknown
	timestamp?: unknown
	"moz:scope"?: unknown
}

interface IncomingMessage {
	method?: string
	params?: ContextInfo
	result?: { contexts?: ContextInfo[] }
}

const COMMITTED = "browsingContext.navigationCommitted"

/**
 * The messages Puppeteer is handed for one message from Firefox: none for a real destroy arriving
 * after ours, and after an add-on page's commit in a top-level context, a `historyUpdated` carrying
 * its URL. Firefox sends no `domContentLoaded` or `load` for an add-on page, and Puppeteer takes a
 * page's URL only from those or from a history change, so a window whose own script never writes its
 * history (a page that failed to load its modules) would stay `about:blank` in `targets()` for good.
 */
export function trackContexts(raw: string, open: Set<string>, closed: Set<string>): string[] {
	// Cheap pre-filter: this runs on every message, and almost none mention a context tree or a commit.
	if (!raw.includes("browsingContext.context") && !raw.includes(COMMITTED) && !raw.includes('"contexts"')) return [raw]
	const message = JSON.parse(raw) as IncomingMessage
	// A tree read in Firefox's own scope lists its browser windows, which no tab or handle ever names.
	for (const info of message.result?.contexts ?? []) {
		if (info["moz:scope"] !== "chrome" && !closed.has(info.context)) open.add(info.context)
	}
	if (!message.params) return [raw]
	if (message.method === COMMITTED) return [raw, ...addonUrlUpdate(message.params, open)]
	if (message.params.parent) return [raw]
	if (message.method === "browsingContext.contextCreated") open.add(message.params.context)
	if (message.method !== "browsingContext.contextDestroyed") return [raw]
	open.delete(message.params.context)
	const alreadyReported = closed.has(message.params.context)
	closed.add(message.params.context)
	return alreadyReported ? [] : [raw]
}

/** `open` holds only top-level contexts still open, so a frame's commit, or a closed window's, gets none. */
function addonUrlUpdate(commit: ContextInfo, open: ReadonlySet<string>): string[] {
	if (!open.has(commit.context) || typeof commit.url !== "string" || !commit.url.startsWith("moz-extension:")) return []
	const params = { context: commit.context, timestamp: commit.timestamp, url: commit.url }
	return [JSON.stringify({ type: "event", method: "browsingContext.historyUpdated", params })]
}

interface ShimTransport {
	send(message: string): void
	close(): void
	onmessage?: (message: string) => void
	onclose?: () => void
}

function openShimmedTransport(
	capabilities: SessionCapabilities,
	sessionId: string,
	deliver: (message: string) => string[],
): Promise<ShimTransport> {
	return new Promise((resolve, reject) => {
		// The client and options of Puppeteer's own BiDi transport. Node's built-in WebSocket has lost this
		// connection on a CI runner with no close frame from either end while Firefox stayed up.
		const ws = new NodeWebSocket(capabilities.webSocketUrl, {
			perMessageDeflate: false,
			allowSynchronousEvents: false,
			maxPayload: 256 * 1024 * 1024,
		})
		const transport: ShimTransport = {
			send(message: string) {
				const { id, method } = JSON.parse(message) as { id: number; method: string }
				if (method !== "session.new" && method !== "session.end") {
					ws.send(message)
					return
				}
				const result = method === "session.new" ? { sessionId, capabilities } : {}
				// A reply cannot be delivered inside `send` — Puppeteer has not registered the
				// callback for this id yet.
				queueMicrotask(() => transport.onmessage?.(JSON.stringify({ type: "success", id, result })))
			},
			close: () => ws.close(),
		}
		ws.onmessage = (event) => {
			for (const message of deliver(String(event.data))) transport.onmessage?.(message)
		}
		ws.onclose = () => transport.onclose?.()
		const deadline = setTimeout(() => {
			ws.close()
			reject(new Error(`BiDi socket ${capabilities.webSocketUrl} did not open within 15s`))
		}, 15_000)
		ws.onopen = () => {
			clearTimeout(deadline)
			resolve(transport)
		}
		ws.onerror = () => {
			clearTimeout(deadline)
			reject(new Error(`BiDi socket ${capabilities.webSocketUrl} failed to open`))
		}
	})
}
