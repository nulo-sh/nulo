/**
 * The stack position each registry popup hands its shell: `Popup` takes the popup's order (its
 * z-index), `PopupCard` the depth `len - order` (whether it sits back), and a `FormPopup` consumer
 * hands its one value, the raw order, to both. Pinned for all 25 live popups against a store whose
 * order and depth are distinct numbers, so a swapped pair, a wrong key or a consumer handed the
 * wrong value reds.
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { type Component, reactive } from "vue"
import { beforeEach, describe, expect, test, vi } from "vitest"

const H = vi.hoisted(() => ({
	popups: {} as Record<string, { order: number }>,
	len: 0,
	/** A service client whose events accept listeners and whose methods resolve empty. */
	fakeClientModule: async (importOriginal: () => Promise<Record<string, unknown>>) => {
		const original = await importOriginal()
		const FakeClient = vi.fn(function () {
			return new Proxy({} as Record<PropertyKey, unknown>, {
				get(target, prop) {
					if (prop in target || prop === "then" || typeof prop !== "string") return target[prop]
					target[prop] = prop.startsWith("on") ? { add: () => {}, remove: () => {} } : vi.fn(async () => [])
					return target[prop]
				},
			})
		})
		const out: Record<string, unknown> = { ...original }
		for (const key of Object.keys(original)) if (key.endsWith("Client")) out[key] = FakeClient
		return out
	},
}))

vi.mock("@/wallet/services/contact/client", H.fakeClientModule)
vi.mock("@/wallet/services/token/client", H.fakeClientModule)
vi.mock("@/wallet/services/token-balance/client", H.fakeClientModule)
vi.mock("@/wallet/services/profile/client", H.fakeClientModule)
vi.mock("@/wallet/services/fpc/client", H.fakeClientModule)
vi.mock("@/wallet/services/auth-registry/client", H.fakeClientModule)
vi.mock("@/wallet/services/account/client", H.fakeClientModule)
vi.mock("@/wallet/services/account-state/client", H.fakeClientModule)
vi.mock("@/wallet/services/task/client", H.fakeClientModule)
vi.mock("@/wallet/services/price/client", H.fakeClientModule)
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/utils/core", () => ({ managers: {} }))
vi.mock("@/stores/app.store", () => ({
	useAppStore: () =>
		reactive({
			profile: { id: "p1", name: "Main" },
			network: { id: "n1", chainId: 1 },
			account: { address: `0x${"0a".repeat(32)}` },
			accounts: [],
			// EditEndpointPopup renders only for an endpoint it can find.
			networks: [{ id: "n1", chainId: 1, endpoints: [{ id: "e1", rpcUrl: "http://127.0.0.1:1" }] }],
			isLogined: true,
		}),
}))
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({
		get popups() {
			return H.popups
		},
		get len() {
			return H.len
		},
		open: vi.fn(),
		close: vi.fn(),
		closeAll: vi.fn(),
		isOpened: (key: string) => key in H.popups,
	}),
}))

import { useFormState } from "@/composables/useFormState"
import { usePopupEntity } from "@/composables/usePopupEntity"
import { useCacheStore } from "@/stores/cache.store"
import AccountsPopup from "./AccountsPopup.vue"
import ChangeAuthwitsRegistryPopup from "./ChangeAuthwitsRegistryPopup.vue"
import ConfirmPopup from "./ConfirmPopup.vue"
import DataViewerPopup from "./DataViewerPopup.vue"
import EditAccountPopup from "./EditAccountPopup.vue"
import EditContactPopup from "./EditContactPopup.vue"
import EditEndpointPopup from "./EditEndpointPopup.vue"
import EditFpcPopup from "./EditFpcPopup.vue"
import EditNetworkPopup from "./EditNetworkPopup.vue"
import EditProfilePopup from "./EditProfilePopup.vue"
import ForgotPasswordPopup from "./ForgotPasswordPopup.vue"
import ImportContactsPopup from "./ImportContactsPopup.vue"
import IncomingTrustPopup from "./IncomingTrustPopup.vue"
import NewAccountPopup from "./NewAccountPopup.vue"
import NewContactPopup from "./NewContactPopup.vue"
import NewEndpointPopup from "./NewEndpointPopup.vue"
import NewFpcPopup from "./NewFpcPopup.vue"
import NewNetworkPopup from "./NewNetworkPopup.vue"
import NewSenderPopup from "./NewSenderPopup.vue"
import NewTokenPopup from "./NewTokenPopup.vue"
import ReceivePopup from "./ReceivePopup.vue"
import RevokeAuthwitsPopup from "./RevokeAuthwitsPopup.vue"
import SelectProfilePopup from "./SelectProfilePopup.vue"
import SelectTokenPopup from "./SelectTokenPopup.vue"
import TokenMetadataPopup from "./TokenMetadataPopup.vue"

const DEPTH_POPUPS: [string, unknown][] = [
	["accounts", AccountsPopup],
	["change_authwits_registry", ChangeAuthwitsRegistryPopup],
	["confirm", ConfirmPopup],
	["data_viewer", DataViewerPopup],
	["edit_profile", EditProfilePopup],
	["forgot_password", ForgotPasswordPopup],
	["import_contacts", ImportContactsPopup],
	["incoming_trust", IncomingTrustPopup],
	["new_sender", NewSenderPopup],
	["receive", ReceivePopup],
	["revoke_authwits", RevokeAuthwitsPopup],
	["select_profile", SelectProfilePopup],
	["select_token", SelectTokenPopup],
	["token_metadata", TokenMetadataPopup],
]

const FORM_POPUPS: [string, unknown][] = [
	["new_account", NewAccountPopup],
	["edit_account", EditAccountPopup],
	["new_contact", NewContactPopup],
	["edit_contact", EditContactPopup],
	["new_network", NewNetworkPopup],
	["edit_network", EditNetworkPopup],
	["new_endpoint", NewEndpointPopup],
	["edit_endpoint", EditEndpointPopup],
	["new_fpc", NewFpcPopup],
	["edit_fpc", EditFpcPopup],
	["new_token", NewTokenPopup],
]

// The shells record what they were handed; nothing inside a card renders.
const STUBS = {
	Popup: { props: ["show", "displaceIdx"], template: '<div data-shell="popup" :data-value="String(displaceIdx)"><slot /></div>' },
	PopupCard: { props: ["displaceIdx"], template: '<div data-shell="card" :data-value="String(displaceIdx)" />' },
	FormPopup: { props: ["show", "displaceIdx"], template: '<div data-shell="form" :data-value="String(displaceIdx)" />' },
}

function shells(component: unknown): Record<string, string | undefined> {
	const wrapper = mount(component as Component, { props: { show: false }, global: { stubs: STUBS } })
	const read = (shell: string) => {
		const el = wrapper.find(`[data-shell="${shell}"]`)
		return el.exists() ? el.attributes("data-value") : undefined
	}
	const out = { popup: read("popup"), card: read("card"), form: read("form") }
	wrapper.unmount()
	return out
}

/** Order 1 of a stack of 3: depth 2. */
function stackAt(key: string) {
	H.popups = { [key]: { order: 1 }, other: { order: 0 }, third: { order: 2 } }
	H.len = 3
}

describe("popup stack position", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.spyOn(console, "warn").mockImplementation(() => {})
		// Auto-imported in the build; the test config auto-imports only vue and vue-router.
		vi.stubGlobal("useFormState", useFormState)
		vi.stubGlobal("usePopupEntity", usePopupEntity)
		Object.assign(useCacheStore(), { endpointEditNetworkId: "n1", endpointEditId: "e1" })
		const storageArea = { get: async () => ({}), set: async () => {}, remove: async () => {} }
		vi.stubGlobal("chrome", {
			...globalThis.chrome,
			storage: { local: storageArea, session: storageArea, onChanged: { addListener: () => {}, removeListener: () => {} } },
		})
	})

	test.each(DEPTH_POPUPS)("%s: Popup gets the order, PopupCard the depth", (key, component) => {
		stackAt(key)
		expect(shells(component)).toEqual({ popup: "1", card: "2", form: undefined })
	})

	test.each(FORM_POPUPS)("%s: FormPopup gets the raw order", (key, component) => {
		stackAt(key)
		expect(shells(component)).toEqual({ popup: undefined, card: undefined, form: "1" })
	})

	test.each(DEPTH_POPUPS)("%s: a closed key hands undefined and NaN", (_key, component) => {
		H.popups = { other: { order: 0 } }
		H.len = 1
		expect(shells(component)).toEqual({ popup: "undefined", card: "NaN", form: undefined })
	})
})
