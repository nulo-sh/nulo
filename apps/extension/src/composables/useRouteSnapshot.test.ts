import { deferred, EventHandler } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import type { Network, RouteEndpoint, RouteSnapshot } from "@/wallet/services/network/client"
import { useRouteSnapshot } from "./useRouteSnapshot"

/** As stored: 8-hex endpoint ids, the primary first in the route. */
const ROW: Network = {
	id: "a1b2c3d4",
	profileId: "p1",
	name: "Local Network",
	chainId: 0,
	l1ChainId: 31337,
	kind: "local",
	primaryEndpointId: "3f9a1c2e",
	endpoints: [
		{ id: "3f9a1c2e", rpcUrl: "http://127.0.0.1:8080" },
		{ id: "b07d44a1", rpcUrl: "http://127.0.0.1:8081" },
	],
}
const SNAPSHOT: RouteSnapshot = {
	activeId: "3f9a1c2e",
	endpoints: [
		{ id: "3f9a1c2e", state: "ready", since: 5 },
		{ id: "b07d44a1", state: "unknown", since: 5 },
	],
}

function setup(row: Network | null = ROW) {
	const client = {
		getRouteSnapshot: vi.fn(async (_id: string, _shown: readonly RouteEndpoint[]): Promise<RouteSnapshot | null> => SNAPSHOT),
		rebuildRoute: vi.fn(async (_id: string, _shown: readonly RouteEndpoint[]): Promise<void> => {}),
		onRouteChanged: new EventHandler<{ profileId: string; chainId: number }>(),
		onConnected: new EventHandler<void>(),
	}
	const state: { row: Network | undefined } = { row: row ?? undefined }
	const route = useRouteSnapshot({ client, getNetwork: () => state.row, now: () => 1_000 })
	return { client, state, route }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("useRouteSnapshot", () => {
	test("a refresh reads the route of the list it shows, in route order, and keeps when it was read", async () => {
		const { client, state, route } = setup()
		await route.refresh()
		expect(client.getRouteSnapshot).toHaveBeenCalledWith(ROW.id, ROW.endpoints)
		state.row = { ...ROW, primaryEndpointId: "b07d44a1" }
		await route.refresh()
		expect(client.getRouteSnapshot).toHaveBeenLastCalledWith(ROW.id, [ROW.endpoints[1], ROW.endpoints[0]])
		expect(route.view.value).toEqual({ networkId: ROW.id, snapshot: SNAPSHOT, readAt: 1_000 })
	})

	test("no route yet is a view with no snapshot, every dot grey; a read never ran is no view", async () => {
		const { client, route } = setup()
		expect(route.view.value).toBeNull()
		client.getRouteSnapshot.mockResolvedValueOnce(null)
		await route.refresh()
		expect(route.view.value).toEqual({ networkId: ROW.id, snapshot: null, readAt: 1_000 })
	})

	test("a route change for the row's profile and chain reads again; another chain's or profile's does not", async () => {
		const { client, route } = setup()
		await route.refresh()
		client.onRouteChanged.invoke({ profileId: "p1", chainId: 7 })
		client.onRouteChanged.invoke({ profileId: "p2", chainId: 0 })
		await settle()
		expect(client.getRouteSnapshot).toHaveBeenCalledTimes(1)
		client.onRouteChanged.invoke({ profileId: "p1", chainId: 0 })
		await settle()
		expect(client.getRouteSnapshot).toHaveBeenCalledTimes(2)
	})

	test("a reconnect reads again: an event sent while the port was down is not replayed", async () => {
		const { client, route } = setup()
		await route.refresh()
		client.onConnected.invoke()
		await settle()
		expect(client.getRouteSnapshot).toHaveBeenCalledTimes(2)
	})

	test("a failed read changes nothing", async () => {
		const { client, route } = setup()
		await route.refresh()
		client.getRouteSnapshot.mockRejectedValueOnce(new Error("port closed"))
		await route.refresh()
		expect(route.view.value?.snapshot).toEqual(SNAPSHOT)
	})

	test("reads never overlap: signals during one ask for one more after it, whose answer is shown", async () => {
		const { client, route } = setup()
		const slow = deferred<RouteSnapshot | null>()
		client.getRouteSnapshot.mockReturnValueOnce(slow.promise)
		const first = route.refresh()
		const second = route.refresh()
		void route.refresh()
		expect(client.getRouteSnapshot).toHaveBeenCalledTimes(1)
		slow.resolve({ activeId: null, endpoints: [] })
		await Promise.all([first, second])
		expect(client.getRouteSnapshot).toHaveBeenCalledTimes(2)
		expect(route.view.value?.snapshot).toEqual(SNAPSHOT)
	})

	test("a signal landing just after a run's last read starts a new run", async () => {
		const { client, state, route } = setup(null)
		void route.refresh()
		await Promise.resolve()
		state.row = ROW
		await route.refresh()
		expect(client.getRouteSnapshot).toHaveBeenCalledTimes(1)
		expect(route.view.value?.snapshot).toEqual(SNAPSHOT)
	})

	test("an answer is kept when the read a signal asked for after it fails", async () => {
		const { client, route } = setup()
		const down: RouteSnapshot = {
			activeId: "b07d44a1",
			endpoints: [{ id: "3f9a1c2e", state: "down", since: 4, failure: "unreachable" }],
		}
		const slow = deferred<RouteSnapshot | null>()
		client.getRouteSnapshot.mockReturnValueOnce(slow.promise).mockRejectedValueOnce(new Error("port closed"))
		const first = route.refresh()
		void route.refresh()
		slow.resolve(down)
		await first
		expect(route.view.value?.snapshot).toEqual(down)
	})

	test("an edited endpoint list clears the view at once, and a read of the old list landing after is dropped", async () => {
		const { client, state, route } = setup()
		await route.refresh()
		const slow = deferred<RouteSnapshot | null>()
		client.getRouteSnapshot.mockReturnValueOnce(slow.promise)
		const old = route.refresh()
		state.row = { ...ROW, primaryEndpointId: "b07d44a1" }
		const next = deferred<RouteSnapshot | null>()
		client.getRouteSnapshot.mockReturnValueOnce(next.promise)
		void route.refresh()
		expect(route.view.value).toBeNull()
		slow.resolve({ activeId: "3f9a1c2e", endpoints: [{ id: "3f9a1c2e", state: "down", since: 1 }] })
		await settle()
		expect(route.view.value).toBeNull()
		next.resolve(null)
		await old
		expect(route.view.value).toEqual({ networkId: ROW.id, snapshot: null, readAt: 1_000 })
	})

	test("a read that lands after the list changed, with no newer read begun, is dropped too", async () => {
		const { client, state, route } = setup()
		const slow = deferred<RouteSnapshot | null>()
		client.getRouteSnapshot.mockReturnValueOnce(slow.promise)
		const old = route.refresh()
		state.row = { ...ROW, endpoints: [...ROW.endpoints, { id: "c1d2e3f4", rpcUrl: "http://127.0.0.1:8082" }] }
		slow.resolve(SNAPSHOT)
		await old
		expect(route.view.value).toBeNull()
	})

	test("a rename keeps what is shown while it reads again", async () => {
		const { client, state, route } = setup()
		await route.refresh()
		state.row = { ...ROW, name: "Renamed" }
		client.getRouteSnapshot.mockReturnValueOnce(new Promise(() => {}))
		void route.refresh()
		expect(route.view.value?.snapshot).toEqual(SNAPSHOT)
	})

	test("with no row it reads nothing and shows nothing", async () => {
		const { client, route } = setup(null)
		await route.refresh()
		expect(client.getRouteSnapshot).not.toHaveBeenCalled()
		expect(route.view.value).toBeNull()
	})

	test("an edit landing under the open page asks once for the route over the new list, then reads it", async () => {
		const { client, state, route } = setup()
		await route.refresh()
		expect(client.rebuildRoute, "a first read is no edit").not.toHaveBeenCalled()
		const rebuilt = deferred<void>()
		client.rebuildRoute.mockReturnValueOnce(rebuilt.promise)
		state.row = { ...ROW, primaryEndpointId: "b07d44a1" }
		await route.refresh()
		await route.refresh()
		const moved = [ROW.endpoints[1], ROW.endpoints[0]]
		expect(client.rebuildRoute).toHaveBeenCalledTimes(1)
		expect(client.rebuildRoute).toHaveBeenCalledWith(ROW.id, moved)
		const reads = client.getRouteSnapshot.mock.calls.length
		rebuilt.resolve()
		await settle()
		expect(client.getRouteSnapshot, "the read after the rebuild, should its route event be lost").toHaveBeenCalledTimes(reads + 1)
		expect(route.view.value?.snapshot).toEqual(SNAPSHOT)
		expect(client.rebuildRoute).toHaveBeenCalledTimes(1)
	})

	test("edits during a rebuild ask for one more after it, over the list then current, never two at once", async () => {
		const { client, state, route } = setup()
		await route.refresh()
		const rebuilt = deferred<void>()
		client.rebuildRoute.mockReturnValueOnce(rebuilt.promise)
		state.row = { ...ROW, primaryEndpointId: "b07d44a1" }
		await route.refresh()
		state.row = { ...ROW, endpoints: [...ROW.endpoints, { id: "c1d2e3f4", rpcUrl: "http://127.0.0.1:8082" }] }
		await route.refresh()
		state.row = {
			...ROW,
			primaryEndpointId: "c1d2e3f4",
			endpoints: [...ROW.endpoints, { id: "c1d2e3f4", rpcUrl: "http://127.0.0.1:8082" }],
		}
		await route.refresh()
		expect(client.rebuildRoute).toHaveBeenCalledTimes(1)
		rebuilt.resolve()
		await settle()
		expect(client.rebuildRoute).toHaveBeenCalledTimes(2)
		expect(client.rebuildRoute).toHaveBeenLastCalledWith(ROW.id, [
			{ id: "c1d2e3f4", rpcUrl: "http://127.0.0.1:8082" },
			...ROW.endpoints,
		])
	})

	test("another network's row, another profile or chain, a row that goes away, a rename and a failed rebuild ask for nothing more", async () => {
		const { client, state, route } = setup()
		await route.refresh()
		state.row = { ...ROW, name: "Renamed" }
		await route.refresh()
		state.row = { ...ROW, id: "e5f6a7b8" }
		await route.refresh()
		state.row = { ...ROW, profileId: "p2", primaryEndpointId: "b07d44a1" }
		await route.refresh()
		state.row = { ...ROW, profileId: "p2", chainId: 7 }
		await route.refresh()
		state.row = undefined
		await route.refresh()
		state.row = ROW
		await route.refresh()
		expect(client.rebuildRoute).not.toHaveBeenCalled()
		client.rebuildRoute.mockRejectedValueOnce(new Error("port closed"))
		state.row = { ...ROW, primaryEndpointId: "b07d44a1" }
		await route.refresh()
		await settle()
		expect(client.rebuildRoute, "a failure is not retried").toHaveBeenCalledTimes(1)
		expect(route.view.value?.snapshot).toEqual(SNAPSHOT)
	})

	test("a rebuild still asked for when the page moves to another network is dropped, not sent for that one", async () => {
		const { client, state, route } = setup()
		await route.refresh()
		const rebuilt = deferred<void>()
		client.rebuildRoute.mockReturnValueOnce(rebuilt.promise)
		state.row = { ...ROW, primaryEndpointId: "b07d44a1" }
		await route.refresh()
		state.row = ROW
		await route.refresh()
		state.row = { ...ROW, id: "e5f6a7b8", primaryEndpointId: "b07d44a1" }
		await route.refresh()
		rebuilt.resolve()
		await settle()
		expect(client.rebuildRoute.mock.calls).toEqual([[ROW.id, [ROW.endpoints[1], ROW.endpoints[0]]]])
	})

	test("with the page gone, a rebuild in flight starts no other and an edit asks for none", async () => {
		const { client, state, route } = setup()
		await route.refresh()
		const rebuilt = deferred<void>()
		client.rebuildRoute.mockReturnValueOnce(rebuilt.promise)
		state.row = { ...ROW, primaryEndpointId: "b07d44a1" }
		await route.refresh()
		state.row = ROW
		await route.refresh()
		route.dispose()
		const reads = client.getRouteSnapshot.mock.calls.length
		rebuilt.resolve()
		await settle()
		state.row = { ...ROW, primaryEndpointId: "b07d44a1" }
		await route.refresh()
		expect(client.rebuildRoute).toHaveBeenCalledTimes(1)
		expect(client.getRouteSnapshot).toHaveBeenCalledTimes(reads)
	})

	test("dispose stops listening, and a read in flight lands nowhere", async () => {
		const { client, route } = setup()
		const slow = deferred<RouteSnapshot | null>()
		client.getRouteSnapshot.mockReturnValueOnce(slow.promise)
		const pending = route.refresh()
		route.dispose()
		slow.resolve(SNAPSHOT)
		await pending
		client.onRouteChanged.invoke({ profileId: "p1", chainId: 0 })
		client.onConnected.invoke()
		await settle()
		expect(route.view.value).toBeNull()
		expect(client.getRouteSnapshot).toHaveBeenCalledTimes(1)
	})
})
