/**
 * A document passes a discovery approval to its page only for a discovery request it forwarded;
 * approvals are addressed to the tab, not the frame. Ids correlate, they do not authenticate: the
 * background's key-exchange check is the boundary.
 */

/** `InternalMessageType` values; the SDK's package entry does not export the enum. */
const DISCOVERY_REQUEST = "discovery-request"
const DISCOVERY_APPROVED = "discovery-approved"

/** A document has a few discoveries in flight at most; older request ids are forgotten. */
export const REMEMBERED_REQUESTS = 32

export interface ApprovalFilter {
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
