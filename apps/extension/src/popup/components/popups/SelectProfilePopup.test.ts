/**
 * The "Select Profile" popup must route its scope switch through
 * `appStore.commitScopeChange`, like every other scope-mutating call site — a
 * raw `appStore.profile = profile` bypasses the in-flight-send guard, letting a
 * send that is mid-build/prove finish against the wrong profile.
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { holdReads, liveBus } from "../../../../tests/helpers/held-read"

const H = vi.hoisted(() => {
	const profiles = [
		{ id: "p1", name: "Alpha" },
		{ id: "p2", name: "Beta" },
	]
	const appStoreState = {
		profile: null as unknown,
		isLogined: false,
		blockSend: false,
		commitScopeChange: vi.fn(),
	}
	appStoreState.commitScopeChange.mockImplementation(async (commit: () => void) => {
		if (appStoreState.blockSend) return false
		commit()
		return true
	})
	return {
		profiles,
		appStoreState,
		openToastMock: vi.fn(),
		setLastActiveProfileIdMock: vi.fn().mockResolvedValue(undefined),
		activating: new Set<string>(),
		client: null as unknown,
	}
})

vi.mock("@/stores/app.store", async () => {
	const { reactive } = await import("vue")
	H.appStoreState = reactive(H.appStoreState)
	return { useAppStore: () => H.appStoreState }
})
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({ len: 1, popups: { select_profile: { order: 0 } }, closeAll: vi.fn() }),
}))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: H.openToastMock }) }))
vi.mock("@/utils/lastActiveProfile", () => ({ setLastActiveProfileId: H.setLastActiveProfileIdMock }))
vi.mock("@/composables/useProfileBootstrap", () => ({
	isActivatingOtherThan: (id: string) => [...H.activating].some((other) => other !== id),
}))
vi.mock("@/utils/string", () => ({ stringCompare: (a: string, b: string) => a.localeCompare(b) }))
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: class {
		onProfileAdded = liveBus()
		onProfileUpdated = liveBus()
		onProfileDeleted = liveBus()
		disconnect = vi.fn()
		getProfiles = vi.fn().mockResolvedValue(H.profiles)
		constructor() {
			H.client = this
		}
	},
}))

const STUBS = {
	Popup: { props: ["show", "displaceIdx"], emits: ["onClose"], template: '<div v-if="show"><slot /></div>' },
	PopupCard: { template: "<div><slot /></div>" },
	Flex: { template: "<div><slot /></div>" },
	ItemsContainer: { template: "<div><slot /></div>" },
	SettingItem: {
		props: ["title"],
		emits: ["click"],
		template: "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></button>",
		inheritAttrs: false,
	},
	Icon: { props: ["name", "size", "color"], template: "<i />" },
	Button: { emits: ["click"], template: "<button @click=\"$emit('click')\"><slot /></button>" },
}

import SelectProfilePopup from "./SelectProfilePopup.vue"

async function mountOpen() {
	const w = mount(SelectProfilePopup, { props: { show: false }, global: { stubs: STUBS } })
	await w.setProps({ show: true }) // the show-watch loads + renders profiles
	await flushPromises()
	return w
}

beforeEach(() => {
	H.openToastMock.mockClear()
	H.setLastActiveProfileIdMock.mockClear()
	H.appStoreState.commitScopeChange.mockClear()
	H.appStoreState.profile = null
	H.appStoreState.isLogined = false
	H.appStoreState.blockSend = false
	H.activating.clear()
})

afterEach(() => vi.restoreAllMocks())

describe("SelectProfilePopup — scope-switch guard", () => {
	test("switches, persists, and closes when no send is in flight", async () => {
		const w = await mountOpen()
		await w.find('[data-testid="select-profile-row"]').trigger("click")
		await flushPromises()

		expect(H.appStoreState.commitScopeChange).toHaveBeenCalledTimes(1)
		expect(H.appStoreState.profile).toEqual(H.profiles[0]) // commit ran → scope changed
		expect(H.setLastActiveProfileIdMock).toHaveBeenCalledWith("p1")
		expect(w.emitted("onClose")?.length).toBe(1)
	})

	test("a double-click switches once — the second is dropped by the submit latch", async () => {
		// Hold the first commit in flight so the second click lands while it's still submitting.
		let releaseCommit!: (v: boolean) => void
		H.appStoreState.commitScopeChange.mockImplementationOnce(
			(commit: () => void) =>
				new Promise((resolve) => {
					releaseCommit = (v: boolean) => {
						if (v) commit()
						resolve(v)
					}
				}),
		)
		const w = await mountOpen()
		const row = w.find('[data-testid="select-profile-row"]')
		await row.trigger("click") // first click → commit pending, latch set
		await row.trigger("click") // second click → dropped by the latch
		expect(H.appStoreState.commitScopeChange).toHaveBeenCalledTimes(1)

		releaseCommit(true)
		await flushPromises()
		expect(w.emitted("onClose")?.length).toBe(1) // exactly one switch completed
	})

	test("refuses the switch when a send is in flight: no scope change, no persist, no close, toast shown", async () => {
		H.appStoreState.blockSend = true
		const w = await mountOpen()
		await w.find('[data-testid="select-profile-row"]').trigger("click")
		await flushPromises()

		expect(H.appStoreState.commitScopeChange).toHaveBeenCalledTimes(1)
		expect(H.appStoreState.profile).toBeNull() // commit was NOT run
		expect(H.setLastActiveProfileIdMock).not.toHaveBeenCalled()
		expect(w.emitted("onClose")).toBeUndefined()
		expect(H.openToastMock).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "error", label: "Finish or cancel your pending transaction first" }),
		)
	})
})

describe("SelectProfilePopup — a session open or opening owns the selection", () => {
	async function pickWhile(arrange: () => void) {
		const w = await mountOpen()
		arrange()
		await w.find('[data-testid="select-profile-row"]').trigger("click")
		await flushPromises()
		return w
	}
	const expectRefused = (w: Awaited<ReturnType<typeof mountOpen>>) => {
		expect(H.appStoreState.profile).toBeNull()
		expect(H.setLastActiveProfileIdMock).not.toHaveBeenCalled()
		expect(w.emitted("onClose")).toBeDefined()
		expect(H.openToastMock).not.toHaveBeenCalled()
	}

	test("an unlocked pick never sets the selection or the last-active profile", async () => {
		expectRefused(
			await pickWhile(() => {
				H.appStoreState.isLogined = true
			}),
		)
	})

	test("a pick while another profile's activation runs is refused", async () => {
		expectRefused(await pickWhile(() => H.activating.add("p2")))
	})

	test("a pick whose commit lands after a session opened is refused", async () => {
		H.appStoreState.commitScopeChange.mockImplementationOnce(async (commit: () => void) => {
			await Promise.resolve()
			H.appStoreState.isLogined = true
			commit()
			return true
		})
		expectRefused(await pickWhile(() => {}))
	})

	test("an unlock that lands while the chooser is open closes it", async () => {
		const w = await mountOpen()
		expect(w.emitted("onClose")).toBeUndefined()
		H.appStoreState.isLogined = true
		await flushPromises()
		expect(w.emitted("onClose")?.length).toBe(1)
	})

	test("a profile deleted while its pick waited is never selected, and the chooser stays", async () => {
		const client = () => H.client as { onProfileDeleted: ReturnType<typeof liveBus> }
		H.appStoreState.commitScopeChange.mockImplementationOnce(async (commit: () => void) => {
			await Promise.resolve()
			client().onProfileDeleted.invoke(H.profiles[0])
			commit()
			return true
		})
		const w = await pickWhile(() => {})
		expect(H.appStoreState.profile).toBeNull()
		expect(H.setLastActiveProfileIdMock).not.toHaveBeenCalled()
		expect(w.emitted("onClose")).toBeUndefined()
	})
})

describe("SelectProfilePopup — the list under a held read", () => {
	test("the read's answer replaces the list: a profile added while it is out is dropped, one added after it is kept", async () => {
		const w = mount(SelectProfilePopup, { props: { show: false }, global: { stubs: STUBS } })
		const client = H.client as { getProfiles: ReturnType<typeof vi.fn>; onProfileAdded: ReturnType<typeof liveBus> }
		const reads = holdReads<unknown[]>(client.getProfiles)
		const names = () => (w.vm as unknown as { profiles: { name: string }[] }).profiles.map((p) => p.name)
		await w.setProps({ show: true })

		client.onProfileAdded.invoke({ id: "p5", name: "Gamma" })
		expect(reads).toHaveLength(1)
		reads[0]?.resolve([
			{ id: "p4", name: "Epsilon" },
			{ id: "p3", name: "Delta" },
		])
		await flushPromises()
		expect(names()).toEqual(["Delta", "Epsilon"])

		client.onProfileAdded.invoke({ id: "p5", name: "Gamma" })
		await flushPromises()
		expect(names()).toEqual(["Delta", "Epsilon", "Gamma"])
		w.unmount()
	})
})
