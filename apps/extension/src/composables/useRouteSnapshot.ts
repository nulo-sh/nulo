import type { EventHandler } from "@nulo/wallet-core/utils"
import { type Ref, shallowRef } from "vue"
import { routeOrder } from "@/utils/endpoint-order"
import type { RouteView } from "@/utils/endpoint-status"
import type { Network, RouteEndpoint, RouteSnapshot } from "@/wallet/services/network/client"

type Subscribable<T> = Pick<EventHandler<T>, "add" | "remove">

export interface UseRouteSnapshotDeps {
	/** The parent's client; the parent owns connect and disconnect. */
	client: {
		getRouteSnapshot(networkId: string, shown: readonly RouteEndpoint[]): Promise<RouteSnapshot | null>
		onRouteChanged: Subscribable<{ profileId: string; chainId: number }>
		onConnected: Subscribable<void>
	}
	/** The page's network row; undefined once it is gone. */
	getNetwork: () => Network | undefined
	now?: () => number
}

export type NetworkRouteView = RouteView & { readonly networkId: string }

export interface UseRouteSnapshot {
	/** The account engine's route for the row's current endpoint list; null before the first read
	 *  of that list lands. */
	view: Readonly<Ref<NetworkRouteView | null>>
	/** The parent calls it on mount and whenever its row changes. */
	refresh: () => Promise<void>
	dispose: () => void
}

/** What the route is built from: an answer for another list describes another route. */
const routeKeyOf = (n: Network | undefined) =>
	n ? JSON.stringify([n.id, n.profileId, n.chainId, n.primaryEndpointId, n.endpoints.map((e) => [e.id, e.rpcUrl])]) : ""

/**
 * The endpoint list's view of the account engine's route. The route event is an invalidation, not a
 * value: every signal (event, reconnect, the row changing) reads again, and no timer does. Reads run
 * one at a time, and a signal during one asks for one more after it, so an answer is never dropped
 * for a newer read that then fails. A read that fails changes nothing; one that never answers holds
 * the next until the client's request deadline fails it.
 */
export function useRouteSnapshot(deps: UseRouteSnapshotDeps): UseRouteSnapshot {
	const view = shallowRef<NetworkRouteView | null>(null)
	const now = deps.now ?? Date.now
	let disposed = false
	let shownKey = ""
	let running: Promise<void> | null = null
	let again = false

	/** Clears the view once the row's route is another: its answer describes a route that is gone. */
	const follow = () => {
		const network = deps.getNetwork()
		const key = routeKeyOf(network)
		if (key !== shownKey) {
			shownKey = key
			view.value = null
		}
		return { network, key }
	}

	const readOnce = async () => {
		const { network, key } = follow()
		if (!network) return
		const shown = routeOrder(network.endpoints, network.primaryEndpointId).map(({ id, rpcUrl }) => ({ id, rpcUrl }))
		const snapshot = await deps.client.getRouteSnapshot(network.id, shown).catch(() => undefined)
		if (disposed || snapshot === undefined || routeKeyOf(deps.getNetwork()) !== key) return
		view.value = { networkId: network.id, snapshot, readAt: now() }
	}

	const refresh = (): Promise<void> => {
		if (disposed) return Promise.resolve()
		follow()
		if (running) {
			again = true
			return running
		}
		// Cleared in the loop's own continuation: a signal after its last check starts a new run.
		running = (async () => {
			try {
				do {
					again = false
					await readOnce()
				} while (again && !disposed)
			} finally {
				running = null
			}
		})()
		return running
	}

	const onRouteChanged = (change: { profileId: string; chainId: number }) => {
		const network = deps.getNetwork()
		if (network?.profileId === change.profileId && network.chainId === change.chainId) void refresh()
	}
	const onConnected = () => void refresh()

	deps.client.onRouteChanged.add(onRouteChanged)
	deps.client.onConnected.add(onConnected)

	const dispose = () => {
		disposed = true
		deps.client.onRouteChanged.remove(onRouteChanged)
		deps.client.onConnected.remove(onConnected)
	}

	return { view, refresh, dispose }
}
