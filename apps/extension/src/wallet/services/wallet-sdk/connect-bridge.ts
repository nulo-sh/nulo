/**
 * The connect window an Allow handed to the worker, kept only as a bridge to the emoji check: it
 * closes once the check's own window exists, so a page that exchanges keys at once never shows
 * between the two windows, and it never holds a verify-window slot. A page that has not started
 * its exchange `BRIDGE_MS` after the wallet approved its discovery loses the bridge; its check, if
 * it comes, opens in a window of its own.
 */
import type { ClockPort, TimerHandle } from "@nulo/wallet-core/ports"

export const BRIDGE_MS = 1_500

/** One Allow's connect window. Every call names the hold it acts on: a page can reuse a request
 *  id, and a caller still holding an earlier attempt's hold must never reach its successor's. */
export type BridgeHold = { readonly id: string; readonly tabId: number; readonly windowId: number }

type Entry = BridgeHold & { removed: boolean; pinned: boolean; timer?: TimerHandle }

export class ConnectBridge {
	private readonly held = new Map<string, Entry>()

	public constructor(
		private readonly clock: Pick<ClockPort, "setTimeout" | "clearTimeout">,
		private readonly closeWindow: (windowId: number) => void,
	) {}

	/** Take the window an Allow handed over. A hold already under the id is ended first, so no
	 *  window is ever left without an owner. */
	public hold(id: string, tabId: number, windowId: number): BridgeHold {
		const previous = this.held.get(id)
		if (previous) this.end(previous)
		const entry: Entry = { id, tabId, windowId, removed: false, pinned: false }
		this.held.set(id, entry)
		return entry
	}

	/** Still held, and its window not closed by the person. */
	public isOpen(hold: BridgeHold): boolean {
		const entry = this.current(hold)
		return entry !== undefined && !entry.removed
	}

	public windowRemoved(windowId: number): void {
		for (const entry of this.held.values()) if (entry.windowId === windowId) entry.removed = true
	}

	/** The wallet approved the discovery: the page has `BRIDGE_MS` to reach establishment. */
	public arm(hold: BridgeHold): void {
		const entry = this.current(hold)
		if (!entry || entry.pinned) return
		this.clearTimer(entry)
		entry.timer = this.clock.setTimeout(() => this.end(entry), BRIDGE_MS)
	}

	/** Establishment reached the worker: the id's hold stays until `end`, once the check window
	 *  exists. Returns that hold, so the establishment ends it and never a later one. */
	public pin(id: string): BridgeHold | undefined {
		const entry = this.held.get(id)
		if (!entry) return undefined
		entry.pinned = true
		this.clearTimer(entry)
		return entry
	}

	public end(hold: BridgeHold): void {
		const entry = this.current(hold)
		if (!entry) return
		this.held.delete(entry.id)
		this.clearTimer(entry)
		if (!entry.removed) this.closeWindow(entry.windowId)
	}

	public endForTab(tabId: number): void {
		for (const entry of [...this.held.values()]) if (entry.tabId === tabId) this.end(entry)
	}

	private current(hold: BridgeHold): Entry | undefined {
		const entry = this.held.get(hold.id)
		return entry === hold ? entry : undefined
	}

	private clearTimer(entry: Entry): void {
		if (entry.timer === undefined) return
		this.clock.clearTimeout(entry.timer)
		entry.timer = undefined
	}
}
