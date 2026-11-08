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
		rebuildRoute(networkId: string, shown: readonly RouteEndpoint[]): Promise<void>
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

/** The row's endpoint list in route order, as the background checks it against the row. */
const shownOf = (n: Network) => routeOrder(n.endpoints, n.primaryEndpointId).map(({ id, rpcUrl }) => ({ id, rpcUrl }))

/** Runs `task` one call at a time: a call during a run asks for one more after it, never more, and
 *  none starts once `stopped`. */
function serialized(task: () => Promise<void>, stopped: () => boolean): () => Promise<void> {
	let running: Promise<void> | null = null
	let again = false
	return () => {
		if (stopped()) return Promise.resolve()
		if (running) {
			again = true
			return running
		}
		// Cleared in the loop's own continuation: a call after its last check starts a new run.
		running = (async () => {
			try {
				do {
					again = false
					await task()
				} while (again && !stopped())
			} finally {
				running = null
			}
		})()
		return running
	}
}

/**
 * The endpoint list's view of the account engine's route. The route event is an invalidation, not a
 * value: every signal (event, reconnect, the row changing) reads again, and no timer does. Reads run
 * one at a time, and a signal during one asks for one more after it, so an answer is never dropped
 * for a newer read that then fails. A read that fails changes nothing; one that never answers holds
 * the next until the client's request deadline fails it.
 *
 * An edit evicts the route, so the row's route changing under the open page asks the engine to
 * rebuild it over the new list once, as the network's next use would, instead of leaving every dot
 * grey until then. Those requests run one at a time too, each over the list current when it starts,
 * so a burst of edits costs at most two; none starts once the page is gone.
 */
export function useRouteSnapshot(deps: UseRouteSnapshotDeps): UseRouteSnapshot {
	const view = shallowRef<NetworkRouteView | null>(null)
	const now = deps.now ?? Date.now
	let disposed = false
	let shownKey = ""
	let shownRow = ""
	const stopped = () => disposed

	/** Clears the view once the row's route is another: its answer describes a route that is gone. A
	 *  new list on the same row, profile and chain is an endpoint edit that landed. */
	const follow = () => {
		const network = deps.getNetwork()
		const key = routeKeyOf(network)
		if (key !== shownKey) {
			const row = network ? JSON.stringify([network.id, network.profileId, network.chainId]) : ""
			const edited = row !== "" && row === shownRow
			shownKey = key
			shownRow = row
			view.value = null
			if (edited) void rebuild()
		}
		return { network, key }
	}

	const readOnce = async () => {
		const { network, key } = follow()
		if (!network) return
		const snapshot = await deps.client.getRouteSnapshot(network.id, shownOf(network)).catch(() => undefined)
		if (disposed || snapshot === undefined || routeKeyOf(deps.getNetwork()) !== key) return
		view.value = { networkId: network.id, snapshot, readAt: now() }
	}
	const read = serialized(readOnce, stopped)

	const refresh = (): Promise<void> => {
		if (disposed) return Promise.resolve()
		follow()
		return read()
	}

	// The rebuilt route announces itself by the route event; the read after it stands in for a lost one.
	const rebuildOnce = async () => {
		const network = deps.getNetwork()
		if (!network) return
		await deps.client.rebuildRoute(network.id, shownOf(network)).catch(() => {})
		void refresh()
	}
	const rebuild = serialized(rebuildOnce, stopped)

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
