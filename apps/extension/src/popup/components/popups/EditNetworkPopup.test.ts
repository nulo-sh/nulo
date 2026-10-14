import { afterEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { useFormState } from "@/composables/useFormState"
import { usePopupEntity } from "@/composables/usePopupEntity"

vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: vi.fn() }),
}))
const appStoreState = vi.hoisted(() => ({
	networks: [{ id: "net-1", chainId: 1, name: "Local" }] as Array<{ id: string; chainId: number; name: string }>,
	renameNetwork: (() => Promise.resolve()) as (id: string, name: string) => Promise<void>,
}))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => appStoreState }))
vi.mock("@/stores/cache.store", () => ({
	useCacheStore: () => ({ networkToEditIdx: "net-1" }),
}))
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({ len: 1, popups: { edit_network: { order: 1 } } }),
}))

const STUBS = {
	FormPopup: {
		props: ["show", "submitDisabled"],
		emits: ["submit"],
		template: `<div><slot /><slot name='belowSubmit' /><button data-testid="form-submit" :disabled="submitDisabled" @click="$emit('submit')">go</button></div>`,
	},
	ItemsContainer: { template: "<div><slot /></div>" },
	SettingItem: { props: ["title"], template: "<div>{{ title }}</div>" },
	Input: {
		props: ["modelValue", "label"],
		emits: ["update:modelValue"],
		template: `<label><input :data-input-label="label" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></label>`,
	},
	Button: { template: "<button><slot /></button>" },
	Text: { template: "<span><slot /></span>" },
	Transition: { template: "<div><slot /></div>" },
}

import EditNetworkPopup from "./EditNetworkPopup.vue"

let w: VueWrapper | undefined

afterEach(() => {
	w?.unmount()
	vi.unstubAllGlobals()
})

test("opening fills the rename form with the network's name and throws nothing", async () => {
	vi.stubGlobal("useFormState", useFormState)
	vi.stubGlobal("usePopupEntity", usePopupEntity)
	const errors: unknown[] = []
	w = mount(EditNetworkPopup, {
		props: { show: false },
		global: { stubs: STUBS, config: { errorHandler: (err) => errors.push(err) } },
	})
	await w.setProps({ show: true })
	await flushPromises()
	expect(errors).toEqual([])
	expect((w.find('[data-input-label="New name"]').element as HTMLInputElement).value).toBe("Local")
})

describe("EditNetworkPopup — names compare and save without their outer spaces", () => {
	async function mountShown(): Promise<VueWrapper> {
		vi.stubGlobal("useFormState", useFormState)
		vi.stubGlobal("usePopupEntity", usePopupEntity)
		appStoreState.networks = [
			{ id: "net-1", chainId: 1, name: "Local" },
			{ id: "net-2", chainId: 2, name: "Testnet" },
		]
		const mounted = mount(EditNetworkPopup, { props: { show: false }, global: { stubs: STUBS } })
		await mounted.setProps({ show: true })
		await flushPromises()
		return mounted
	}
	async function typeName(mounted: VueWrapper, name: string) {
		await mounted.find('input[data-input-label="New name"]').setValue(name)
		await flushPromises()
		return {
			warns: mounted.text().includes("Already exists"),
			disabled: mounted.find('[data-testid="form-submit"]').attributes("disabled") !== undefined,
		}
	}

	test("another network's name with outer spaces warns and blocks Update; another case does not", async () => {
		w = await mountShown()
		expect(await typeName(w, "Testnet ")).toEqual({ warns: true, disabled: true })
		expect(await typeName(w, " Testnet")).toEqual({ warns: true, disabled: true })
		expect(await typeName(w, "testnet")).toEqual({ warns: false, disabled: false })
	})

	test("its own name with outer spaces is unchanged, not a duplicate, and a name of only spaces is empty", async () => {
		w = await mountShown()
		expect(await typeName(w, "Local ")).toEqual({ warns: false, disabled: true })
		expect(await typeName(w, "   ")).toEqual({ warns: false, disabled: true })
	})

	test("a new name is saved without its outer spaces", async () => {
		const rename = vi.fn(async (_id: string, _name: string) => {})
		appStoreState.renameNetwork = rename
		w = await mountShown()
		await typeName(w, "  Renamed  ")
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()
		expect(rename).toHaveBeenCalledExactlyOnceWith("net-1", "Renamed")
	})
})
