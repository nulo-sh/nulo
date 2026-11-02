import { Flex, Input } from "@nulo/design"
import { createTestingPinia } from "@pinia/testing"
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../../../tests/helpers/chrome-storage-mock"
import { useAppStore } from "@/stores/app.store"
import NotesIndex from "./index.vue"

// Wire-shaped: 0x + 64 hex, below the field modulus.
const note = (type: string, contract: string) => ({ type, contract, storageSlot: "0x1", txHash: `0x${"cd".repeat(32)}`, location: "" })
const NOTES = [note("UintNote", `0x${"0a".repeat(32)}`), note("FieldNote", `0x${"1b".repeat(32)}`)]

vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/wallet/services/note/client", () => ({
	NoteServiceClient: function NoteServiceClient() {
		return { getNotes: vi.fn(async () => NOTES.map((n) => ({ ...n }))), disconnect: vi.fn() }
	},
}))

enableAutoUnmount(afterEach)

// The app store reads and watches `chrome.storage.local` when it is created.
beforeEach(() => {
	vi.stubGlobal("chrome", { storage: {} })
	installChromeStorage({}, { persist: false })
})
afterEach(() => {
	vi.unstubAllGlobals()
})

async function mountPage() {
	const pinia = createTestingPinia({ createSpy: vi.fn })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.network = { id: "n", chainId: 1 } as never
	appStore.account = { address: `0x${"ab".repeat(32)}` } as never
	const w = mount(NotesIndex, {
		attachTo: document.body,
		global: {
			plugins: [pinia],
			components: { Flex, Input },
			stubs: {
				SettingsPageShell: { template: "<div><slot /></div>" },
				AsyncListStatus: true,
				ListStatusMessage: { props: ["variant"], template: '<p data-testid="status" :data-variant="variant" />' },
				RowTarget: true,
				Icon: true,
			},
		},
	})
	await flushPromises()
	return w
}

test.each([
	{ case: "with a zero-width space", pasted: "Uint\u200BNote", shown: 1, status: undefined },
	{ case: "with a visible wrong character", pasted: "UintNotg", shown: 0, status: "no-results" },
])("a note type pasted $case shows $shown note", async ({ pasted, shown, status }) => {
	const w = await mountPage()
	expect(w.findAll('[data-testid="note-contract"]')).toHaveLength(2)
	await w.get("input").setValue(pasted)
	expect(w.findAll('[data-testid="note-contract"]')).toHaveLength(shown)
	const line = w.find('[data-testid="status"]')
	expect(line.exists() ? line.attributes("data-variant") : undefined).toBe(status)
})
