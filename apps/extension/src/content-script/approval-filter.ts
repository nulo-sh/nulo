/**
 * Keeps a discovery approval to the document that asked for it. The background sends an approval to
 * every frame of the tab, and the SDK's content script answers its page with a channel for each one,
 * so a document passes on only an approval whose session id is a discovery request it forwarded.
 * Ids correlate, they do not authenticate: the background's key-exchange check is the boundary.
 */

/** `InternalMessageType` values; the SDK's package entry does not export the enum. */
const DISCOVERY_REQUEST = "discovery-request"
const DISCOVERY_APPROVED = "discovery-approved"

/** A document has a few discoveries in flight at most; older request ids are forgotten. */
export const REMEMBERED_REQUESTS = 32

export interface ApprovalFilter {
	/** Notes a message this document sends to the background. */
	sent(message: unknown): void
	/** Whether a background message may reach this document's SDK handler. */
	admits(message: unknown): boolean
}

export function createApprovalFilter(): ApprovalFilter {
	const requested: string[] = []
	return {
		sent(message) {
			const requestId = discoveryRequestId(message)
			if (requestId === undefined) return
			const known = requested.indexOf(requestId)
			if (known !== -1) requested.splice(known, 1)
			requested.push(requestId)
			if (requested.length > REMEMBERED_REQUESTS) requested.shift()
		},
		admits(message) {
			if (!isRecord(message) || message.type !== DISCOVERY_APPROVED) return true
			return typeof message.sessionId === "string" && requested.includes(message.sessionId)
		},
	}
}

function discoveryRequestId(message: unknown): string | undefined {
	if (!isRecord(message) || message.type !== DISCOVERY_REQUEST || !isRecord(message.content)) return undefined
	const { requestId } = message.content
	return typeof requestId === "string" ? requestId : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}
