/**
 * The checks every content-script message passes before the wallet-sdk handler sees it, and the
 * transport that delivers the handler's replies to a tab.
 */

import type { BackgroundTransport, PendingDiscovery } from "@aztec-labs/wallet-sdk/extension/handlers"
import { describeExternalId } from "@nulo/wallet-bridge"
import { isReceiverGoneRejection } from "@nulo/extension-messaging/errors"
import { attachContentListener } from "./content-message-relay"
import { type ContentScriptMessageEnvelope, isSubframeSender, validateContentScriptMessage } from "./content-script-validator"
import { sessionDisconnectedMessage, staleSessionVerdict } from "./stale-session"
import type { ILogger } from "@/wallet/logger"
import { LogLevel } from "@/wallet/logger"

type DiscoveryCredit = Pick<PendingDiscovery, "origin" | "tabId">

/** What the content wrapper needs besides the SDK's listener. */
type ContentWrapperDeps = {
	logger: ILogger
	/** Whether the sender's tab holds the session, per the handler that exists right now; asked only for a session-bound message. */
	sessionKnown: (sessionId: string, tabId: number) => boolean
	/** The tab and origin the pending discovery under this id is credited to, if one is pending. */
	discoveryCredit: (sessionId: string) => DiscoveryCredit | undefined
	sendToTab: BackgroundTransport["sendToTab"]
}

export function buildContentTransport(
	logger: ILogger,
	{ sessionKnown, discoveryCredit }: Pick<ContentWrapperDeps, "sessionKnown" | "discoveryCredit">,
): BackgroundTransport {
	// The handler's `sendToTab` returns void, so the send's rejection is nobody's to observe. A
	// tab that navigated away (or lost its content script) has nowhere to deliver to; every
	// other failure still surfaces as an unhandled rejection.
	const sendToTab: BackgroundTransport["sendToTab"] = (tabId, message) => {
		chrome.tabs.sendMessage(tabId, message).catch((err: unknown) => {
			if (!isReceiverGoneRejection(err)) throw err
		})
	}
	return {
		sendToTab,
		addContentListener: (listener) => {
			// The chrome.runtime.onMessage registration lives in the module-scope
			// content-message-relay (cold-wake fix): registering a SECOND chrome
			// listener here would double-deliver — a duplicate discovery's
			// coalesce→reject path deletes the entry its twin queued, and a
			// duplicate secure-message double-journals a sendTx. Attach to the
			// relay instead; buffered cold-wake messages flush through this same
			// validated wrapper.
			attachContentListener(admitContentMessage(listener, { logger, sessionKnown, discoveryCredit, sendToTab }))
		},
	}
}

/**
 * The checks every content-script message passes before the SDK handler sees it, in this order:
 * top frame, envelope schema, a key exchange from its discovery's document, then a session this
 * background knows.
 */
function admitContentMessage(
	listener: Parameters<BackgroundTransport["addContentListener"]>[0],
	deps: ContentWrapperDeps,
): (message: unknown, sender: chrome.runtime.MessageSender) => undefined {
	const { logger } = deps
	// Build-time, immutable per release: a runtime config would be a widening primitive an attacker
	// could try to flip by storage poisoning or popup compromise. Vite inlines the literal here as at
	// module scope; it is read when the wrapper is built, so a test can set it without re-evaluating
	// this module. Even on, a key exchange completes only from a frame of the origin its session is
	// credited to, the top frame's: a cross-origin subframe cannot connect.
	const allowIframeDapps = import.meta.env?.VITE_NULO_ALLOW_IFRAME_DAPPS === "1"
	return (message, sender) => {
		// Subframe rejection. Upstream `BackgroundConnectionHandler`
		// attributes origin via `sender.tab?.url` (top-frame URL), so an
		// iframe at https://evil.com/x.html embedded in https://app.example.com
		// would be credited to https://app.example.com — inheriting any
		// grants the user gave to the parent page.
		//
		// Nulo-side defense-in-depth: reject content-script messages
		// from subframes at the wrapper layer. `sender.frameId === 0`
		// is the top frame; a tab sender with any other defined
		// `frameId` is a subframe.
		//
		// Feature flag: `allowIframeDapps` (`VITE_NULO_ALLOW_IFRAME_DAPPS=1`
		// at build time) disables this check. Default is "reject subframes"
		// because research found NO legitimate iframe-dApp use cases in the
		// Nulo ecosystem. If a counterexample surfaces, set the env
		// var rather than removing this check.
		//
		// Frame-targeted send replies (the full fix) require upstream
		// `chrome.tabs.sendMessage(tabId, msg, { frameId })` support
		// in `BackgroundConnectionHandler`'s sendToTab signature —
		// upstream's `(tabId, msg)` interface doesn't pass frameId
		// through, so this remains an upstream coordination item.
		if (!allowIframeDapps && isSubframeSender(sender)) {
			logger.log(
				"wallet-sdk",
				LogLevel.Debug,
				// The tab and sender URLs are the user's browsing history, and any subframe on any
				// page can trigger this line. The frame identity is what diagnoses the rejection.
				`Rejected content-script message from subframe (frameId=${sender.frameId}, tabId=${sender.tab?.id}) — subframe defense-in-depth`,
			)
			return undefined
		}

		// Zod-validate content-script-originated envelopes before
		// forwarding to the upstream handler. `passthrough` lets
		// non-content-script messages through (ServiceClient
		// responses, offscreen pings, etc.) — the upstream handler
		// filters those by `origin`. `invalid` drops adversarial /
		// malformed envelopes early with a structured debug log.
		const verdict = validateContentScriptMessage(message)
		if (verdict.kind === "invalid") {
			logger.log("wallet-sdk", LogLevel.Debug, "Dropping malformed content-script envelope", verdict.reason)
			return undefined
		}
		if (verdict.kind === "valid" && !keyExchangeFromItsDiscovery(verdict.message, sender, deps.discoveryCredit)) {
			logger.log("wallet-sdk", LogLevel.Debug, "Dropping a key exchange from outside its discovery's document")
			return undefined
		}
		if (verdict.kind === "valid" && replyIfStale(verdict.message, sender.tab?.id, deps)) return undefined
		listener(message, sender)
		return undefined
	}
}

/**
 * Upstream credits a session to the pending discovery its key exchange names, so the exchange must come
 * from that discovery's tab and document origin; one naming no pending discovery is upstream's to drop.
 */
function keyExchangeFromItsDiscovery(
	envelope: ContentScriptMessageEnvelope,
	sender: chrome.runtime.MessageSender,
	discoveryCredit: ContentWrapperDeps["discoveryCredit"],
): boolean {
	if (envelope.type !== "key-exchange-request" || envelope.sessionId === undefined) return true
	const credit = discoveryCredit(envelope.sessionId)
	if (credit === undefined) return true
	return sender.tab?.id === credit.tabId && credit.origin !== "unknown" && senderDocumentOrigin(sender) === credit.origin
}

/** The sending document's own origin: Chrome sets `sender.origin` (an opaque document's is `"null"`),
 *  Firefox only `sender.url`. */
function senderDocumentOrigin(sender: chrome.runtime.MessageSender): string | undefined {
	if (sender.origin !== undefined) return sender.origin
	if (sender.url === undefined) return undefined
	try {
		return new URL(sender.url).origin
	} catch {
		return undefined
	}
}

/**
 * A validated message for a session the sender's tab does not hold is answered with the SDK's
 * own disconnect instead of being forwarded: the handler would drop it in silence, and the page
 * would wait out its 300 s ceiling for a background that forgot it (see `stale-session.ts`).
 * Returns whether the message was answered here.
 */
function replyIfStale(envelope: ContentScriptMessageEnvelope, tabId: number | undefined, deps: ContentWrapperDeps): boolean {
	const stale = staleSessionVerdict(envelope, tabId, deps.sessionKnown)
	if (stale === "forward") return false
	// A connected page repeats this every heartbeat until it reconnects; debug keeps it out of
	// every user's log buffer.
	deps.logger.log("wallet-sdk", LogLevel.Debug, "Answering a message for a session the sender's tab does not hold", {
		type: envelope.type,
		session: describeExternalId(stale.sessionId),
	})
	deps.sendToTab(stale.disconnectTab, sessionDisconnectedMessage(stale.sessionId))
	return true
}
