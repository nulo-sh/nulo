import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { held } from "../../../../tests/helpers/held-read"

const OWNER = `0x${"0a".repeat(32)}`
const PAYLOAD = {
	params: {
		operations: [
			{
				kind: "aztec_sendTx",
				account: `aztec:1:${OWNER}`,
				exec: { calls: [{ name: "transfer_in_private", to: `0x${"1c".repeat(32)}`, args: [`0x${"00".repeat(31)}05`] }] },
				opts: { from: OWNER },
			},
		],
	},
}

const live = new Set<(profile: unknown) => void>()
const emit = (profile: unknown) => {
	for (const fn of live) fn(profile)
}
let snapshot: () => Promise<unknown>
let readPayload: () => Promise<unknown>

vi.mock("@/wallet/services/dapp-interaction/client", () => ({
	DappInteractionServiceClient: vi.fn(function () {
		return { getInteractionPayload: () => readPayload(), disconnect: () => {} }
	}),
}))
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: vi.fn(function () {
		const onActiveProfileChanged = {
			add: (fn: (profile: unknown) => void) => live.add(fn),
			remove: (fn: (profile: unknown) => void) => live.delete(fn),
		}
		let dropReads: (error: Error) => void = () => {}
		const dropped = new Promise<never>((_, reject) => {
			dropReads = reject
		})
		dropped.catch(() => undefined)
		return {
			onActiveProfileChanged,
			connect: async () => {},
			disconnect: () => dropReads(new Error("port closed")),
			subscribeActiveProfile: async (fn: (profile: unknown) => void) => {
				try {
					fn(await Promise.race([snapshot(), dropped]))
				} catch {
					// As the real client: a snapshot the disconnect rejected is dropped.
				}
				onActiveProfileChanged.add(fn)
				return () => onActiveProfileChanged.remove(fn)
			},
		}
	}),
}))

import JsonWindow from "./index.vue"

const STUBS = { Flex: { template: "<div><slot /></div>" }, JsonViewer: { template: "<div />" } }

let currentWindow: { id?: number } | undefined = { id: 7 }
const getCurrent = vi.fn((...args: unknown[]) => (args.at(-1) as (w?: { id?: number }) => void)(currentWindow))
const remove = vi.fn()
const errorHandler = vi.fn()

const wrappers: Array<ReturnType<typeof mount>> = []
async function mountWindow() {
	const wrapper = mount(JsonWindow, { global: { stubs: STUBS, config: { errorHandler } } })
	wrappers.push(wrapper)
	await flushPromises()
	return wrapper
}

beforeEach(() => {
	live.clear()
	snapshot = async () => ({ id: "p1" })
	readPayload = async () => PAYLOAD
	currentWindow = { id: 7 }
	vi.stubGlobal("chrome", { windows: { getCurrent, remove } })
})
afterEach(() => {
	for (const w of wrappers.splice(0)) if (!w.vm.$.isUnmounted) w.unmount()
	vi.clearAllMocks()
})

describe("windows/json — closing when the profile goes away", () => {
	test("a profile keeps the window; no profile removes the current window by its id, inside the event", async () => {
		const wrapper = await mountWindow()
		expect(wrapper.find('[data-testid="json-content"]').exists()).toBe(true)
		emit({ id: "p1" })
		expect(getCurrent).not.toHaveBeenCalled()
		emit(undefined)
		expect(getCurrent).toHaveBeenCalledTimes(1)
		expect(remove.mock.calls).toEqual([[7]])
	})

	test("a current window without an id is not removed", async () => {
		currentWindow = {}
		await mountWindow()
		emit(undefined)
		expect(getCurrent).toHaveBeenCalledTimes(1)
		expect(remove).not.toHaveBeenCalled()
	})

	test("a callback without a window (the lastError path) throws the engine's TypeError naming window.id", async () => {
		currentWindow = undefined
		await mountWindow()
		expect(() => emit(undefined)).toThrow(new TypeError("undefined is not an object (evaluating 'window.id')"))
		expect(remove).not.toHaveBeenCalled()
	})
})

describe("windows/json — a wallet locked before the window subscribed", () => {
	test("a locked snapshot at mount removes the window", async () => {
		snapshot = async () => undefined
		await mountWindow()
		expect(remove.mock.calls).toEqual([[7]])
	})

	test("a payload read that fails still removes the window, and the page reports no error", async () => {
		snapshot = async () => undefined
		readPayload = async () => {
			throw new Error("Interaction not found")
		}
		const wrapper = await mountWindow()
		expect(remove.mock.calls).toEqual([[7]])
		expect(wrapper.find('[data-testid="json-content"]').exists()).toBe(false)
		expect(errorHandler).not.toHaveBeenCalled()
	})

	test("a snapshot that resolves locked after the page unmounted still removes the window", async () => {
		const pending = held<unknown>()
		snapshot = () => pending.promise
		const wrapper = await mountWindow()
		wrapper.unmount()
		pending.resolve(undefined)
		await flushPromises()
		expect(remove.mock.calls).toEqual([[7]])
	})
})
