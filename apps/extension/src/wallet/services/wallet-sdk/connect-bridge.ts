/**
 * The connect window an Allow handed to the worker, kept only as a bridge to the emoji check: it
 * closes once the check's own window exists, so a page that exchanges keys at once never shows
 * between the two windows, and it never holds a verify-window slot. A page that has not started
 * its exchange `BRIDGE_MS` after the wallet approved its discovery loses the bridge; its check, if
 * it comes, opens in a window of its own.
 */
import type { ClockPort, TimerHandle } from "@nulo/wallet-core/ports"

export const BRIDGE_MS = 1_500

type Held = { tabId: number; windowId: number; removed: boolean; pinned: boolean; timer?: TimerHandle }

export class ConnectBridge {
	private readonly held = new Map<string, Held>()

	public constructor(
		private readonly clock: Pick<ClockPort, "setTimeout" | "clearTimeout">,
		private readonly closeWindow: (windowId: number) => void,
	) {}

	/** Take the window an Allow handed over. A page-chosen id already held is ended first, so no
	 *  window is ever left without an owner. */
	public hold(id: string, tabId: number, windowId: number): void {
		this.end(id)
		this.held.set(id, { tabId, windowId, removed: false, pinned: false })
	}

	/** Held, and its window not closed by the person. */
	public isOpen(id: string): boolean {
		const entry = this.held.get(id)
		return entry !== undefined && !entry.removed
	}

	public windowRemoved(windowId: number): void {
		for (const entry of this.held.values()) if (entry.windowId === windowId) entry.removed = true
	}

	/** The wallet approved the discovery: the page has `BRIDGE_MS` to reach establishment. */
	public arm(id: string): void {
		const entry = this.held.get(id)
		if (!entry || entry.pinned) return
		this.clearTimer(entry)
		entry.timer = this.clock.setTimeout(() => this.end(id), BRIDGE_MS)
	}

	/** Establishment reached the worker: the bridge stays until `end`, once the check window exists. */
	public pin(id: string): void {
		const entry = this.held.get(id)
		if (!entry) return
		entry.pinned = true
		this.clearTimer(entry)
	}

	public end(id: string): void {
		const entry = this.held.get(id)
		if (!entry) return
		this.held.delete(id)
		this.clearTimer(entry)
		if (!entry.removed) this.closeWindow(entry.windowId)
	}

	public endForTab(tabId: number): void {
		for (const [id, entry] of [...this.held]) if (entry.tabId === tabId) this.end(id)
	}

	private clearTimer(entry: Held): void {
		if (entry.timer === undefined) return
		this.clock.clearTimeout(entry.timer)
		entry.timer = undefined
	}
}
