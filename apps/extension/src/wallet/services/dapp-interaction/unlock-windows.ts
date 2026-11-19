import { LogLevel } from "@/wallet/logger"
import type { WindowManager } from "@/wallet/services/window-manager/window-manager"
import { unlockWindowHash } from "./unlock-window-url"

/**
 * One unlock window per origin while a discovery of that origin waits behind the lock. The window
 * grants nothing: a person's close or its cut-off ends only the window, never a request, and after
 * an unlock it is either closed or handed to the request's next window.
 */
export class UnlockWindows {
	/** Origin → its window's handle, until the handle settles or is handed over. */
	private readonly handles = new Map<string, string>()

	public constructor(
		private readonly windowManager: WindowManager,
		private readonly pageUrl: (hash: string) => string,
		private readonly now: () => number = Date.now,
	) {}

	/** Moves the cut-off of the origin's window to `deadline`. `false` when it has none open. */
	public retime(origin: string, deadline: number): boolean {
		const handleId = this.handles.get(origin)
		if (handleId === undefined) return false
		if (this.windowManager.retime(handleId, this.remaining(deadline))) return true
		this.handles.delete(origin)
		return false
	}

	/** Opens the origin's window until `deadline`; the caller has seen `retime` find none. */
	public open(origin: string, deadline: number): void {
		const handle = this.windowManager.openAndAwait<void>({
			url: this.pageUrl(unlockWindowHash(origin)),
			width: 400,
			height: 800,
			timeoutMs: this.remaining(deadline),
			kind: "unlock",
			placement: "top-right",
			// A page can make the cut-off recur at will, and `warn` reaches every person's log.
			timeoutLogLevel: LogLevel.Debug,
		})
		this.handles.set(origin, handle.handleId)
		void handle.promise
			.catch(() => undefined)
			.finally(() => {
				if (this.handles.get(origin) === handle.handleId) this.handles.delete(origin)
			})
	}

	public close(origin: string): void {
		const handleId = this.handles.get(origin)
		if (handleId === undefined) return
		this.handles.delete(origin)
		this.windowManager.cancel(handleId, "Unlock window closed")
	}

	/** The origin's window id, handed over once. `undefined` when none is open or its creation is
	 *  still in flight; such a window closes on arrival. */
	public take(origin: string): number | undefined {
		const handleId = this.handles.get(origin)
		if (handleId === undefined) return undefined
		this.handles.delete(origin)
		let windowId: number | undefined
		this.windowManager.handOver(handleId, (id) => {
			windowId = id
		})
		return windowId
	}

	public origins(): readonly string[] {
		return [...this.handles.keys()]
	}

	private remaining(deadline: number): number {
		return Math.max(0, deadline - this.now())
	}
}
