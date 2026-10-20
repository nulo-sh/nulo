// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { ILogger } from "@nulo/wallet-core/logger"
import { type Deferred, deferred, EventHandler } from "@nulo/wallet-core/utils"
import type { EventsMap, MethodsMap } from "@nulo/wallet-core/base"
import { BaseServiceClient, type RequestErrorMeta } from "../core/base-client"
import { summarizeMessage } from "../core/envelope-summary"
import { RpcConnectError } from "../errors"
import { MessageType, type EventMessage, type ReadyMessage, type ResponseMessage } from "../messages"

/** Default upper bound on any RPC request. Individual calls can override.
 *
 *  30s was too tight: PXE-backed views (getGasBalances, simulateTx on
 *  a cold PXE, etc.) routinely run past that on local networks and a
 *  freshly-unlocked wallet. The timeout exists to catch a wedged SW, not
 *  to police slow-but-healthy calls — 60s gives real work room to finish
 *  while still surfacing a hang. */
export const DEFAULT_RPC_TIMEOUT_MS = 60_000

/** Warn (don't fail) when a request has been pending unusually long. */
const WARN_AFTER_MS = 10_000

/** A port that closes before Ready (a worker still starting refuses it at once) reopens after this. */
export const RECONNECT_DELAY_MS = 250

/**
 * Popup ↔ service-worker client over a long-lived `chrome.runtime.Port`.
 * Correlation, timeout, and terminal cleanup live in `BaseServiceClient`; this
 * subclass owns the Port lifecycle (connect / reconnect / disconnect) and the
 * typed-error shaping.
 */
export abstract class ServiceClient<
	TRequests extends MethodsMap,
	TEvents extends EventsMap = Record<string, never>,
> extends BaseServiceClient<TRequests, TEvents> {
	/** Fires once per Ready, in a task after the requests that waited for it have posted. */
	public onConnected: EventHandler<void> = new EventHandler()
	/** Fires when a port that said Ready drops, or on an explicit `disconnect()` from that state. */
	public onDisconnected: EventHandler<void> = new EventHandler()

	/** onConnected/onDisconnected are local lifecycle signals — never wire
	 *  events. Reserve them so a forged event message can't invoke them. */
	protected override readonly reservedEventNames: ReadonlySet<string> = new Set(["onConnected", "onDisconnected"])

	private state: ClientState = ClientState.Disconnected
	private port?: chrome.runtime.Port
	/** Moves whenever the current port changes, so a deferred `onConnected` from an older port fires nothing. */
	private generation = 0
	/** The Ready of this `Connecting` episode; it outlives closes before Ready. */
	private ready?: Deferred<void>
	private reconnectTimer?: ReturnType<typeof setTimeout>

	/** A port that said Ready is open: a request made now is posted before the call returns. */
	public get isConnected(): boolean {
		return this.state === ClientState.Connected
	}

	protected constructor(service: string, logger: ILogger, name?: string, options?: { requestTimeoutMs?: number }) {
		super(service, logger, name, { defaultTimeoutMs: options?.requestTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS, warnAfterMs: WARN_AFTER_MS })
	}

	/**
	 * Opens the port if none is open or pending. Never rejects and never waits for Ready — most
	 * callers do not await this: a failed open is logged where it happens and reported by the
	 * request that needs the port.
	 */
	public async connect(): Promise<void> {
		try {
			this.openPort()
		} catch {}
	}

	/**
	 * Opens a port synchronously or throws `RpcConnectError`. A synchronous throw from
	 * `chrome.runtime.connect` is permanent (the extension context is gone), so nothing retries: an
	 * asleep worker never throws, it is woken, and a missing peer surfaces later as `onDisconnect`.
	 */
	private openPort(): void {
		if (this.port || this.reconnectTimer) return
		let port: chrome.runtime.Port
		try {
			port = chrome.runtime.connect(undefined, { name: this.service })
		} catch (cause) {
			const error = new RpcConnectError(this.service, cause)
			this.logError("Failed to connect", error)
			this.endEpisode(error)
			throw error
		}
		this.generation++
		this.port = port
		port.onDisconnect.addListener(this.onDisconnect)
		port.onMessage.addListener(this.onMessage)
		if (this.state === ClientState.Disconnected) {
			this.state = ClientState.Connecting
			this.ready = deferred()
			// A close with no waiter must not surface as an unhandled rejection.
			this.ready.promise.catch(() => {})
		}
		this.logDebug("Connecting")
	}

	public disconnect() {
		const wasConnected = this.state === ClientState.Connected
		this.closePort()
		this.endEpisode(this.makeDisconnectError())
		this.rejectAllPending(() => this.makeDisconnectError(), "disconnected", "client_disconnect")
		this.logDebug("Disconnected")
		if (wasConnected) this.onDisconnected.invoke()
	}

	/** Stops using the current port and any pending reopen. Closing it from this end fires nothing here. */
	private closePort(): void {
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
		this.reconnectTimer = undefined
		const port = this.port
		if (!port) return
		this.port = undefined
		this.generation++
		port.onMessage.removeListener(this.onMessage)
		port.onDisconnect.removeListener(this.onDisconnect)
		port.disconnect()
	}

	private endEpisode(error: unknown): void {
		const ready = this.ready
		this.ready = undefined
		this.state = ClientState.Disconnected
		ready?.reject(error)
	}

	private readonly onDisconnect = (port: chrome.runtime.Port) => {
		if (port !== this.port) {
			this.dropStalePort(port)
			return
		}
		const reason = closeReason(port)
		if (reason) this.logDebug("Port closed with an error", { reason })
		this.closePort()
		if (this.state === ClientState.Connecting) {
			// Nothing was posted on it, so nothing is rejected: the episode's waiters keep waiting.
			this.reconnectTimer = setTimeout(this.reopen, RECONNECT_DELAY_MS)
			return
		}
		this.state = ClientState.Disconnected
		// A posted request may have run, so it is rejected, never resent.
		this.rejectAllPending(() => this.makeDisconnectError(), "disconnected", "client_disconnect")
		this.onDisconnected.invoke()
		void this.connect()
	}

	private readonly reopen = () => {
		this.reconnectTimer = undefined
		try {
			this.openPort()
		} catch {}
	}

	private readonly onMessage = (
		message: ResponseMessage<TRequests> | EventMessage<TEvents> | ReadyMessage,
		port: chrome.runtime.Port,
	) => {
		if (port !== undefined && port !== this.port) {
			this.dropStalePort(port)
			return
		}
		if (message?.type === MessageType.Ready) {
			this.onReady()
			return
		}
		if (!message || (message.type !== MessageType.Response && message.type !== MessageType.Event) || !message.content) {
			this.logWarn("Invalid message received", summarizeMessage(message))
			return
		}
		if (message.type === MessageType.Response) {
			this.handleResponse(message.content)
		} else {
			const { event, payload } = message.content
			this.handleEvent(event, payload)
		}
	}

	private onReady(): void {
		if (this.state !== ClientState.Connecting) return
		this.state = ClientState.Connected
		const ready = this.ready
		this.ready = undefined
		const generation = this.generation
		this.logDebug("Connected")
		ready?.resolve()
		// A task, not a microtask: every request that waited for this Ready posts first.
		setTimeout(() => {
			if (this.generation === generation && this.state === ClientState.Connected) this.onConnected.invoke()
		}, 0)
	}

	private dropStalePort(port: chrome.runtime.Port): void {
		this.logDebug("Stale port dropped")
		port.onMessage.removeListener(this.onMessage)
		port.onDisconnect.removeListener(this.onDisconnect)
		try {
			port.disconnect()
		} catch {}
	}

	// ── Transport hooks ─────────────────────────────────────────────────

	/** Void once Ready, so a request runs straight through to the send. Otherwise the episode's
	 *  Ready, opening a port first if none is open or pending. A failed open throws and rejects that
	 *  request. */
	protected ensureTransportReady(): void | Promise<void> {
		if (this.state === ClientState.Connected) return
		this.openPort()
		return this.ready?.promise
	}

	/** Posts only on a port that said Ready. Between Ready and a waiting request's continuation only
	 *  microtasks run, so the one thing that can intervene is an explicit `disconnect()`; that request
	 *  then fails as a send failure and nothing reopens a port. */
	protected sendEnvelope(content: unknown): void {
		const port = this.port
		if (this.state !== ClientState.Connected || !port) throw new Error("port not ready at send")
		port.postMessage({ type: MessageType.Request, content })
	}

	protected timeoutMessage(meta: RequestErrorMeta): string {
		return `RPC '${meta.methodName}' timed out after ${meta.timeoutMs}ms`
	}

	protected sendFailureMessage(meta: RequestErrorMeta): string {
		return `RPC '${meta.methodName}' aborted: port disconnected`
	}

	// ── Convenience RPCs ────────────────────────────────────────────────

	public async backup(): Promise<unknown> {
		return this.request("backup" as keyof TRequests, ...([] as unknown as Parameters<TRequests[keyof TRequests]>))
	}

	public async restore(..._args: unknown[]): Promise<unknown> {
		return this.request("restore" as keyof TRequests, ...(_args as unknown as Parameters<TRequests[keyof TRequests]>))
	}
}

/**
 * Which channel reported the port's close error, if any. Chrome sets `runtime.lastError` only while
 * `onDisconnect` runs and logs "Unchecked runtime.lastError" when no listener reads it; Firefox sets
 * `port.error` instead. The error's text is never kept.
 */
function closeReason(port: chrome.runtime.Port): "runtime.lastError" | "port.error" | undefined {
	const lastError = (chrome.runtime as { lastError?: unknown }).lastError
	const portError = (port as { error?: unknown }).error
	if (lastError) return "runtime.lastError"
	if (portError) return "port.error"
	return undefined
}

enum ClientState {
	Disconnected,
	/** A port is open or about to reopen, and no Ready has come. Nothing is posted. */
	Connecting,
	Connected,
}
