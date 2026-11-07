import type { EventHandler } from "@nulo/wallet-core/utils"
import { type Ref, shallowRef } from "vue"
import { createRunFence } from "@/composables/runFence"
import type { RouteView } from "@/utils/endpoint-status"
import type { Network, RouteSnapshot } from "@/wallet/services/network/client"

type Subscribable<T> = Pick<EventHandler<T>, "add" | "remove">

export interface UseRouteSnapshotDeps {
	/** The parent's client; the parent owns connect and disconnect. */
	client: {
		getRouteSnapshot(networkId: string): Promise<RouteSnapshot | null>
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
 * value: every signal (event, reconnect, the row changing) reads again, and no timer does. A read
 * that fails changes nothing.
 */
export function useRouteSnapshot(deps: UseRouteSnapshotDeps): UseRouteSnapshot {
	const view = shallowRef<NetworkRouteView | null>(null)
	const fence = createRunFence()
	const now = deps.now ?? Date.now
	let disposed = false
	let shownKey = ""

	const refresh = async () => {
		const isCurrent = fence.begin()
		const network = deps.getNetwork()
		const key = routeKeyOf(network)
		if (key !== shownKey) {
			shownKey = key
			view.value = null
		}
		if (!network) return
		const snapshot = await deps.client.getRouteSnapshot(network.id).catch(() => undefined)
		if (disposed || !isCurrent() || snapshot === undefined || routeKeyOf(deps.getNetwork()) !== key) return
		view.value = { networkId: network.id, snapshot, readAt: now() }
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
		fence.invalidate()
		deps.client.onRouteChanged.remove(onRouteChanged)
		deps.client.onConnected.remove(onConnected)
	}

	return { view, refresh, dispose }
}
