import { describe, expect, test, vi } from "vitest"
import type { Network } from "@/wallet/services/network/client"
import { useNetworkArrival } from "./useNetworkArrival"

const network = (id: string, profileId = "p1") => ({ id, profileId, name: id, kind: "mainnet" }) as unknown as Network

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function spyLevels() {
	const spies = {
		debug: vi.spyOn(console, "debug").mockImplementation(() => undefined),
		warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
		error: vi.spyOn(console, "error").mockImplementation(() => undefined),
	}
	const restore = () => {
		for (const spy of Object.values(spies)) spy.mockRestore()
	}
	return { ...spies, restore }
}

function setup(over: { profileId?: string | undefined } = {}) {
	const client = {
		getNetworkArrival: vi.fn(async (): Promise<Network | null> => network("mn")),
		answerNetworkArrival: vi.fn(async (_id: string) => {}),
	}
	let profileId: string | undefined = "profileId" in over ? over.profileId : "p1"
	let connected = true
	const onAnswerFailed = vi.fn()
	const state = useNetworkArrival({
		client: () => (connected ? client : undefined),
		profileId: () => profileId,
		onAnswerFailed,
	})
	return {
		client,
		state,
		onAnswerFailed,
		setProfile: (id: string | undefined) => {
			profileId = id
		},
		disconnect: () => {
			connected = false
		},
	}
}

describe("useNetworkArrival", () => {
	test("starts with no arrival and reads the unanswered one", async () => {
		const { state } = setup()
		expect(state.arrived.value).toBeNull()
		await state.refresh()
		expect(state.arrived.value?.id).toBe("mn")
	})

	test("reads it again at every refresh until it is answered", async () => {
		const { state, client } = setup()
		await state.refresh()
		await state.refresh()
		expect(client.getNetworkArrival).toHaveBeenCalledTimes(2)
		expect(state.arrived.value?.id).toBe("mn")
	})

	test("with no open profile or no client it reads nothing and clears", async () => {
		const closed = setup({ profileId: undefined })
		await closed.state.refresh()
		expect(closed.client.getNetworkArrival).not.toHaveBeenCalled()

		const open = setup()
		await open.state.refresh()
		open.disconnect()
		await open.state.refresh()
		expect(open.state.arrived.value).toBeNull()
	})

	test("a profile lock clears it", async () => {
		const { state, setProfile } = setup()
		await state.refresh()
		setProfile(undefined)
		await state.refresh()
		expect(state.arrived.value).toBeNull()
	})

	test("drops an arrival of another profile than the open one", async () => {
		const { state, client } = setup()
		client.getNetworkArrival.mockResolvedValueOnce(network("mn", "p2"))
		await state.refresh()
		expect(state.arrived.value).toBeNull()
	})

	test("a read that returns after a newer one is dropped", async () => {
		const { state, client } = setup()
		const slow = deferred<Network | null>()
		client.getNetworkArrival.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(null)
		const first = state.refresh()
		await state.refresh()
		slow.resolve(network("mn"))
		await first
		expect(state.arrived.value).toBeNull()
	})

	test("a failed read shows no arrival, logged at error", async () => {
		const { state, client } = setup()
		await state.refresh()
		const failure = new Error("worker restarting")
		client.getNetworkArrival.mockRejectedValueOnce(failure)
		const { error, warn, restore } = spyLevels()
		await state.refresh()
		expect(state.arrived.value).toBeNull()
		expect(error).toHaveBeenCalledExactlyOnceWith("network arrival read failed", { error: failure })
		expect(warn).not.toHaveBeenCalled()
		restore()
	})

	test("a superseded read's refusal logs at debug and leaves the newer read's arrival", async () => {
		const { state, client } = setup()
		const slow = deferred<Network | null>()
		client.getNetworkArrival.mockReturnValueOnce(slow.promise)
		const first = state.refresh()
		await state.refresh()
		const { debug, error, warn, restore } = spyLevels()
		const refusal = new Error("Profile locked")
		slow.reject(refusal)
		await first
		expect(debug).toHaveBeenCalledExactlyOnceWith("network arrival read superseded", { error: refusal })
		expect(warn).not.toHaveBeenCalled()
		expect(error).not.toHaveBeenCalled()
		expect(state.arrived.value?.id).toBe("mn")
		restore()
	})

	test("staying answers it and clears it, and a read begun before the answer cannot bring it back", async () => {
		const { state, client } = setup()
		await state.refresh()
		const stale = deferred<Network | null>()
		client.getNetworkArrival.mockReturnValueOnce(stale.promise)
		const read = state.refresh()

		await state.stay("mn")
		stale.resolve(network("mn"))
		await read

		expect(client.answerNetworkArrival).toHaveBeenCalledWith("mn")
		expect(state.arrived.value).toBeNull()
	})

	test("a failed answer keeps the arrival and reports it", async () => {
		const { state, client, onAnswerFailed } = setup()
		await state.refresh()
		client.answerNetworkArrival.mockRejectedValueOnce(new Error("quota"))
		await state.stay("mn")
		expect(state.arrived.value?.id).toBe("mn")
		expect(onAnswerFailed).toHaveBeenCalledOnce()
		expect(state.answering.value).toBe(false)
	})

	test("one answer at a time: a second press while the first is written does nothing", async () => {
		const { state, client } = setup()
		await state.refresh()
		const write = deferred<void>()
		client.answerNetworkArrival.mockReturnValueOnce(write.promise)
		const first = state.stay("mn")
		expect(state.answering.value).toBe(true)
		await state.stay("mn")
		write.resolve()
		await first
		expect(client.answerNetworkArrival).toHaveBeenCalledOnce()
	})

	test("after dispose, a read in flight lands nowhere", async () => {
		const { state, client } = setup()
		const slow = deferred<Network | null>()
		client.getNetworkArrival.mockReturnValueOnce(slow.promise)
		const read = state.refresh()
		state.dispose()
		slow.resolve(network("mn"))
		await read
		expect(state.arrived.value).toBeNull()
	})
})
