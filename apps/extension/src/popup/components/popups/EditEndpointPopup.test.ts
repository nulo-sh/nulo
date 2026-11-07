/**
 * The RPC URL field's error copy in EditEndpointPopup, byte for byte, per rejection of
 * `updateEndpoint`, including a rejection that lands after the network has left the store.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { useFormState } from "@/composables/useFormState"
import { usePopupEntity } from "@/composables/usePopupEntity"

const updateEndpointMock = vi.fn()
const getNetworksMock = vi.fn()

vi.mock("@/utils/core", () => ({
	managers: {
		network: {
			updateEndpoint: (...args: unknown[]) => updateEndpointMock(...args),
			getNetworks: (...args: unknown[]) => getNetworksMock(...args),
		},
	},
}))

vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: vi.fn() }),
}))

type Row = { id: string; chainId: number; name: string; endpoints: { id: string; rpcUrl: string; label?: string }[] }
const { app, cache, NETWORKS } = vi.hoisted(() => ({
	app: { store: undefined as unknown as { networks: Row[] } },
	cache: { store: undefined as unknown as { endpointEditNetworkId: string; endpointEditId: string; endpointRoute: unknown } },
	NETWORKS: [{ id: "net-1", chainId: 1, name: "Local", endpoints: [{ id: "ep-1", rpcUrl: "https://one.example" }] }] as Row[],
}))
vi.mock("@/stores/app.store", async () => {
	const { reactive } = await import("vue")
	app.store = reactive({ networks: [...NETWORKS] })
	return { useAppStore: () => app.store }
})
vi.mock("@/stores/cache.store", async () => {
	const { reactive } = await import("vue")
	cache.store = reactive({ endpointEditNetworkId: "net-1", endpointEditId: "ep-1", endpointRoute: null })
	return { useCacheStore: () => cache.store }
})
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({ len: 1, popups: { edit_endpoint: { order: 1 } } }),
}))

/** The submit button routes the handler's own rejection to the app error handler, as Vue does for
 *  a component event. */
const STUBS = {
	FormPopup: {
		props: ["show", "submitLabel", "submitDisabled", "submitLoading", "displaceIdx", "submitTestId"],
		emits: ["onClose", "submit"],
		template: `<div><slot name="title" /><slot /><button data-testid="submit" :data-loading="String(!!submitLoading)" @click="$emit('submit')">go</button></div>`,
	},
	Input: {
		props: ["modelValue", "label"],
		emits: ["update:modelValue"],
		template: `<label><input :data-input-label="label" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></label>`,
	},
	Button: { template: "<button><slot /></button>" },
	Text: { template: "<span><slot /></span>" },
	Transition: { template: "<div><slot /></div>" },
}

import EditEndpointPopup from "./EditEndpointPopup.vue"

const wrappers: VueWrapper[] = []

async function mountEditing(): Promise<{ w: VueWrapper; errors: unknown[] }> {
	const errors: unknown[] = []
	const w = mount(EditEndpointPopup, {
		props: { show: false },
		global: { stubs: STUBS, config: { errorHandler: (err) => errors.push(err) } },
	})
	wrappers.push(w)
	await w.setProps({ show: true })
	await flushPromises()
	const rpc = w.findAll("input").find((i) => i.attributes("data-input-label") === "RPC URL")
	if (!rpc) throw new Error("RPC input not rendered")
	await rpc.setValue("https://two.example")
	return { w, errors }
}

const fieldText = (w: VueWrapper) =>
	w
		.findAll("label")
		.find((l) => l.find("input").attributes("data-input-label") === "RPC URL")
		?.text() ?? ""

beforeEach(() => {
	vi.stubGlobal("useFormState", useFormState)
	vi.stubGlobal("usePopupEntity", usePopupEntity)
	updateEndpointMock.mockResolvedValue(undefined)
	getNetworksMock.mockResolvedValue([])
	app.store.networks = [...NETWORKS]
	cache.store.endpointRoute = null
})

afterEach(() => {
	for (const w of wrappers.splice(0)) {
		try {
			w.unmount()
		} catch {
			/* already unmounted by the test */
		}
	}
	vi.clearAllMocks()
	vi.unstubAllGlobals()
	document.body.innerHTML = ""
})

describe("EditEndpointPopup: the RPC URL field's error copy", () => {
	test.each([
		["ENDPOINT_CHAIN_MISMATCH: This RPC reports chainId 5, but this network is chain 1.", "Wrong chain. This network is chain 1."],
		["ENDPOINT_CHAIN_MISMATCH: This RPC reports L1 chain 2, but this network is L1 chain 0.", "Wrong chain. This network is chain 1."],
		["DUPLICATE_ENDPOINT: This URL is already an endpoint of this network.", "Another endpoint of this network uses that URL."],
		["Failed to fetch node info", "RPC didn't respond. Check the URL."],
		["Failed to fetch node info.", "Something went wrong."],
		["DUPLICATE_ENDPOINT then ENDPOINT_CHAIN_MISMATCH", "Wrong chain. This network is chain 1."],
		["Invalid params for updateEndpoint: RPC URL must use https://", "Something went wrong."],
		[
			"Invalid params for updateEndpoint: 3: Invalid URL; 3: RPC URL can't contain spaces or hidden characters.",
			"RPC URL can't contain spaces or hidden characters.",
		],
		[
			"Invalid params for updateEndpoint: 3: Use http://localhost instead of http://[::1].",
			"Use http://localhost instead of http://[::1].",
		],
	])("a rejection %j shows %j", async (message, copy) => {
		updateEndpointMock.mockRejectedValueOnce(new Error(message))
		const { w, errors } = await mountEditing()
		await w.find('[data-testid="submit"]').trigger("click")
		await flushPromises()
		expect(updateEndpointMock).toHaveBeenCalledWith("net-1", "ep-1", undefined, "https://two.example")
		expect(fieldText(w)).toBe(copy)
		expect(errors).toEqual([])
	})

	describe("the network leaves the store while the request is in flight", () => {
		/** The form unmounts with the network, so the copy is read once the network is back. */
		async function rejectAfterNetworkLeaves(message: string) {
			let reject!: (e: Error) => void
			updateEndpointMock.mockImplementationOnce(
				() =>
					new Promise((_resolve, rej) => {
						reject = rej
					}),
			)
			const ctx = await mountEditing()
			await ctx.w.find('[data-testid="submit"]').trigger("click")
			await flushPromises()
			app.store.networks = []
			await flushPromises()
			reject(new Error(message))
			await flushPromises()
			const errorsWhileGone = [...ctx.errors]
			app.store.networks = [...NETWORKS]
			await flushPromises()
			return { ...ctx, errorsWhileGone }
		}

		test("a duplicate reads no chain id and shows its copy", async () => {
			const { w, errorsWhileGone } = await rejectAfterNetworkLeaves("DUPLICATE_ENDPOINT: x")
			expect(errorsWhileGone).toEqual([])
			expect(fieldText(w)).toBe("Another endpoint of this network uses that URL.")
			expect(w.find('[data-testid="submit"]').attributes("data-loading")).toBe("false")
		})

		test("a chain mismatch reads the chain id strictly: the access throws, no copy is set, the latch clears", async () => {
			const { w, errorsWhileGone } = await rejectAfterNetworkLeaves("ENDPOINT_CHAIN_MISMATCH: x")
			expect(errorsWhileGone).toHaveLength(1)
			expect(errorsWhileGone[0]).toBeInstanceOf(TypeError)
			expect(fieldText(w)).toBe("")
			expect(w.find('[data-testid="submit"]').attributes("data-loading")).toBe("false")
		})
	})
})

describe("EditEndpointPopup: the endpoint's state, as the list last read the account engine's route", () => {
	const OPENED_AT = 1_762_480_000_000
	/** As the wire carries it: the router's state names and failure kinds, epoch ms. */
	const route = (entry: Record<string, unknown>, networkId = "net-1", activeId: string | null = "ep-1") => ({
		networkId,
		readAt: OPENED_AT - 30_000,
		snapshot: { activeId, endpoints: [{ id: "ep-1", since: OPENED_AT - 90_000, ...entry }] },
	})
	const status = (w: VueWrapper) => ({
		tone: w.get('[data-testid="endpoint-edit-status"]').attributes("data-tone"),
		word: w.get('[data-testid="endpoint-edit-status-word"]').text(),
		detail: w.find('[data-testid="endpoint-edit-status-detail"]').exists()
			? w.get('[data-testid="endpoint-edit-status-detail"]').text()
			: null,
	})

	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(OPENED_AT)
	})

	test("a down endpoint: the red dot, its word and the error line, counted from when the sheet opened", async () => {
		cache.store.endpointRoute = route({ state: "down", failure: "unreachable" })
		const { w } = await mountEditing()
		expect(status(w)).toEqual({ tone: "red", word: "Not answering", detail: "No answer since 1 min ago. The connection failed." })
		expect(w.get('[data-testid="endpoint-edit-status-detail"]').attributes("color")).toBe("txt-danger")
	})

	test("the error line names each failure kind, and none when the router kept no kind", async () => {
		const lines = []
		for (const failure of ["timeout", "server", "malformed", undefined]) {
			cache.store.endpointRoute = route({ state: "down", failure })
			const { w } = await mountEditing()
			lines.push(status(w).detail)
		}
		expect(lines).toEqual([
			"No answer since 1 min ago. It did not answer in time.",
			"No answer since 1 min ago. It returned a server error.",
			"No answer since 1 min ago. Its reply could not be read.",
			"No answer since 1 min ago.",
		])
	})

	test("the other states carry their word and no error line", async () => {
		const seen = []
		for (const [entry, activeId] of [
			[{ state: "ready" }, "ep-1"],
			[{ state: "ready" }, "other"],
			[{ state: "behind" }, "other"],
			[{ state: "wrong-chain" }, "other"],
			[{ state: "unknown" }, "other"],
		] as const) {
			cache.store.endpointRoute = route(entry, "net-1", activeId)
			const { w } = await mountEditing()
			seen.push(status(w))
		}
		expect(seen).toEqual([
			{ tone: "green", word: "In use", detail: null },
			{ tone: "green", word: "Answering", detail: null },
			{ tone: "amber", word: "Behind", detail: null },
			{ tone: "amber", word: "Wrong network", detail: null },
			{ tone: "gray", word: "Not asked yet", detail: null },
		])
	})

	test("another network's read, or none yet, reads as not asked; a read landing while open shows at once", async () => {
		cache.store.endpointRoute = route({ state: "down", failure: "unreachable" }, "net-2")
		const { w } = await mountEditing()
		expect(status(w)).toEqual({ tone: "gray", word: "Not asked yet", detail: null })
		cache.store.endpointRoute = route({ state: "ready" })
		await flushPromises()
		expect(status(w)).toEqual({ tone: "green", word: "In use", detail: null })
	})
})
