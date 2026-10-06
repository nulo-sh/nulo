/**
 * The terminal status of a request's lifecycle, owned by the transport-agnostic
 * `core/` layer. It lives here, not in a transport's leaf module, so that
 * `core/base-client.ts` (which settles every pending request with one of these)
 * never imports UP into a specific transport, and transports (offscreen
 * telemetry) import it DOWN. A third transport wanting terminal telemetry no longer has to fork or
 * grow an offscreen-owned type.
 */
export type RequestTerminalStatus =
	| "success"
	| "rejected"
	| "timeout"
	| "disconnected"
	/**
	 * Synchronous failure of `chrome.runtime.sendMessage(...)` —
	 * typically because the offscreen document is gone or transitioning.
	 * The request never reached the offscreen handler; the client cleaned
	 * up state synchronously and rejected the caller's promise.
	 */
	| "send_failed"
