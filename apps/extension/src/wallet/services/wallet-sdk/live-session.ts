/**
 * A dApp call bound to the transport session it arrived on. Upstream addresses a session by id, and
 * an id can key-exchange again once its session ends (termination restores its discovery), so a
 * call parked or paused across that re-key would otherwise act on the successor: be dispatched
 * before the successor's check is confirmed, answer under its key, or end it. The `ActiveSession`
 * object upstream handed the call is the identity: the successor is a new object under the same id.
 */
import type { ActiveSession, BackgroundConnectionHandler } from "@aztec-labs/wallet-sdk/extension/handlers"
import type { WalletResponse } from "@aztec-labs/wallet-sdk/types"
import { type WalletErrorEnvelope, withWalletTraceId } from "./error-envelope"

/** A call's own transport session, bound so the call acts only while that exact session is live. */
export interface LiveSession {
	/** `handler.getSession(id) === session`: false once the session ended, even if the id re-keyed. */
	isLive(): boolean
	/** Sends `response` only while live; a reply never reaches a successor under the same id. */
	respond(response: WalletResponse): Promise<void>
	/** Terminates only while live; never ends a successor under the same id. */
	terminate(): void
}

export function bindLiveSession(
	handler: Pick<BackgroundConnectionHandler, "getSession" | "sendResponse" | "terminateSession">,
	session: ActiveSession,
): LiveSession {
	const isLive = () => handler.getSession(session.sessionId) === session
	return {
		isLive,
		// Upstream reads the session by id before its first await, so the check right before the call
		// holds for the whole send.
		respond: async (response) => {
			if (isLive()) await handler.sendResponse(session.sessionId, response)
		},
		terminate: () => {
			if (isLive()) handler.terminateSession(session.sessionId)
		},
	}
}

/**
 * `live` whose every error answer carries `data.walletTraceId`. `onAnswer` sees what was answered
 * (`undefined` for a result) only once delivered: an ended session or a failed send reports nothing.
 */
export function traceAnswers(
	live: LiveSession,
	walletTraceId: string,
	onAnswer?: (error: WalletErrorEnvelope | undefined) => void,
): LiveSession {
	return {
		isLive: () => live.isLive(),
		respond: async (response) => {
			// Every error this pipeline answers comes from `toWalletResponseError` or one of its constants.
			const error = response.error === undefined ? undefined : withWalletTraceId(response.error as WalletErrorEnvelope, walletTraceId)
			// Read in the same turn as `live.respond`'s own check, so the two agree.
			const delivers = live.isLive()
			await live.respond(error === undefined ? response : { ...response, error })
			if (delivers) onAnswer?.(error)
		},
		terminate: () => live.terminate(),
	}
}
