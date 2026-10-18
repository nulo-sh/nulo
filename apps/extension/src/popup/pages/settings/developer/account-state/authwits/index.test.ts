import { Flex, RowAction } from "@nulo/design"
import { createTestingPinia } from "@pinia/testing"
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../../../tests/helpers/chrome-storage-mock"
import { useAppStore } from "@/stores/app.store"
import type { Authwit } from "@/wallet/services/auth-registry/client"
import AuthwitsIndex from "./index.vue"

const ACCOUNT = `0x${"ab".repeat(32)}`
const SCOPE = { profileId: "p", chainId: 1, account: ACCOUNT }
const row = (id: number, pending: boolean): Authwit =>
	({
		...SCOPE,
		id,
		hash: `0x${id}`,
		txHash: `0x${"cd".repeat(32)}`,
		pending,
		content: { kind: "call", caller: `0x${"1a".repeat(32)}`, contract: `0x${"1b".repeat(32)}`, method: "transfer_in_public", args: [] },
	}) as unknown as Authwit

const client = vi.hoisted(() => ({ current: undefined as undefined | Record<string, unknown> }))

vi.mock("@/wallet/services/auth-registry/client", async () => {
	const { EventHandler } = await import("@nulo/wallet-core/utils")
	return {
		AuthRegistryServiceClient: function AuthRegistryServiceClient() {
			client.current = {
				getAuthwits: vi.fn(async () => [row(1, true)]),
				getRegistryEnabled: vi.fn(async () => true),
				onAuthwitAdded: new EventHandler(),
				onAuthwitUpdated: new EventHandler(),
				onAuthwitDeleted: new EventHandler(),
				onRegistryEnabled: new EventHandler(),
				onRegistryDisabled: new EventHandler(),
				disconnect: vi.fn(),
			}
			return client.current
		},
	}
})

enableAutoUnmount(afterEach)

// The app store reads and watches `chrome.storage.local` when it is created.
beforeEach(() => {
	vi.stubGlobal("chrome", { storage: {} })
	installChromeStorage({}, { persist: false })
})
afterEach(() => {
	vi.unstubAllGlobals()
})

function emit(event: string, payload: Authwit): void {
	const handler = client.current?.[event] as { invoke: (p: Authwit) => void } | undefined
	if (!handler) throw new Error(`the page built no client with ${event}`)
	handler.invoke(payload)
}

async function mountPage() {
	const pinia = createTestingPinia({ createSpy: vi.fn })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.profile = { id: SCOPE.profileId } as never
	appStore.network = { id: "n", chainId: SCOPE.chainId } as never
	appStore.account = { address: ACCOUNT } as never
	const wrapper = mount(AuthwitsIndex, {
		attachTo: document.body,
		global: {
			plugins: [pinia],
			components: { Flex, RowAction },
			stubs: {
				SubPageHeader: { template: "<div><slot name='trailing' /></div>" },
				Dropdown: { template: "<div />" },
				AsyncListStatus: true,
				ListStatusMessage: true,
				Tooltip: { template: "<span><slot /></span>" },
				Icon: true,
				Text: { template: "<span><slot /></span>" },
				Input: {
					props: ["modelValue"],
					emits: ["update:modelValue"],
					template: `<input data-testid="search" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
				},
			},
		},
	})
	await flushPromises()
	return wrapper
}

const chips = (w: Awaited<ReturnType<typeof mountPage>>) => w.findAll('[data-testid="authwit-pending-chip"]')

test("a grant proven while the page is open loses its Pending chip in place, and keeps its title", async () => {
	const w = await mountPage()
	expect(chips(w)).toHaveLength(1)
	expect(w.text()).toContain("Call")

	emit("onAuthwitUpdated", row(1, false))
	await flushPromises()
	expect(chips(w)).toHaveLength(0)
	expect(w.text()).toContain("Call")
	expect(w.text()).not.toContain("Custom Authwit")
})

test("a grant added while the page is open reads its kind, and a search that misses it filters it out", async () => {
	const w = await mountPage()
	emit("onAuthwitAdded", { ...row(2, true), content: { kind: "intent", consumer: `0x${"2c".repeat(32)}`, intent: [] } } as never)
	await flushPromises()
	expect(w.text()).toContain("Intent")
	expect(chips(w)).toHaveLength(2)

	await w.find('[data-testid="search"]').setValue("transfer_in_public")
	expect(chips(w)).toHaveLength(1)
	expect(w.text()).not.toContain("Intent")
})
