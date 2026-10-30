import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { nextTick, ref } from "vue"
import { boundAttr, declarationsOf, elementByTestid, parseSource } from "../../../scripts/type-roles/source-scan"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"

const fakes = vi.hoisted(() => ({
	pickBackupFile: vi.fn(async () => undefined),
	leavePanelFor: vi.fn(async (_route: string) => false),
	cardWindow: false,
	returnToPanel: vi.fn(async (..._args: unknown[]) => false),
	closeOwnWindow: vi.fn(async () => true),
	replace: vi.fn(),
	/** What the page handed `useRestoreAgain`. */
	options: undefined as undefined | { leave: (outcome?: unknown) => void; fillError: (type: string, title: string) => void },
	selectedBackup: undefined as unknown as { value: unknown },
}))
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: class {
		disconnect() {}
	},
}))
vi.mock("@/wallet/services/network/client", () => ({
	NetworkServiceClient: class {
		disconnect() {}
	},
}))
vi.mock("@/composables/useRestoreAgain", () => ({
	useRestoreAgain: (options: typeof fakes.options) => {
		fakes.options = options
		return {
			selectedBackup: fakes.selectedBackup,
			decryptionPassword: ref(""),
			restoreStatus: ref("idle"),
			networkNames: ref([]),
			isAllowedToRestore: ref(false),
			isRestoreHasErrors: ref(false),
			canRetry: ref(false),
			isRetrying: ref(false),
			retryFailedAgain: ref(false),
			warningText: ref(""),
			retryResult: ref(""),
			start: vi.fn(async () => undefined),
			pickBackupFile: fakes.pickBackupFile,
			decryptBackup: vi.fn(),
			restoreBackup: vi.fn(),
			retryRestore: vi.fn(),
			continueHome: vi.fn(),
			showRestoreErrorLog: vi.fn(),
			dispose: vi.fn(),
		}
	},
}))
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	leavePanelFor: fakes.leavePanelFor,
	isCardWindow: () => fakes.cardWindow,
	returnToPanel: fakes.returnToPanel,
	closeOwnWindow: fakes.closeOwnWindow,
}))
vi.mock("vue-router", () => ({
	useRouter: () => ({ replace: fakes.replace }),
	useRoute: () => ({ path: "/popup/restore-again", meta: {} }),
}))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))

import RestoreAgain from "./restore-again.vue"

const wrappers: VueWrapper[] = []

function mountPage() {
	const w = mount(RestoreAgain, {
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			stubs: {
				CollapsingHeroLayout: { template: "<div><slot /><slot name='bottom' /></div>" },
				ImportFullBackupForm: {
					emits: ["pickFile"],
					template: `<button data-testid="import-full-backup-pick-file" @click="$emit('pickFile')" />`,
				},
				Button: true,
				Flex: true,
				Text: true,
			},
		},
	})
	wrappers.push(w)
	return w
}

async function pressChooseFile() {
	await mountPage().get('[data-testid="import-full-backup-pick-file"]').trigger("click")
	await flushPromises()
}

beforeEach(() => {
	vi.clearAllMocks()
	fakes.leavePanelFor.mockResolvedValue(false)
	fakes.cardWindow = false
	fakes.returnToPanel.mockResolvedValue(false)
	fakes.selectedBackup = ref(null)
	installChromeStorage({}, { persist: false })
})

afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

describe("restore again — the file pick from Firefox's toolbar panel", () => {
	test("a press the panel hands to the page's own window opens no picker", async () => {
		fakes.leavePanelFor.mockResolvedValue(true)
		await pressChooseFile()
		expect(fakes.leavePanelFor).toHaveBeenCalledWith("/popup/restore-again")
		expect(fakes.pickBackupFile).not.toHaveBeenCalled()
	})

	test("a press that stays on the page opens the picker", async () => {
		await pressChooseFile()
		expect(fakes.leavePanelFor).toHaveBeenCalledWith("/popup/restore-again")
		expect(fakes.pickBackupFile).toHaveBeenCalledTimes(1)
	})
})

describe("restore again — the hand-off window", () => {
	const OUTCOME = { snack: { kind: "success", label: "Testnet restored" }, profileId: "p1" }

	beforeEach(() => {
		fakes.cardWindow = true
		fakes.returnToPanel.mockResolvedValue(true)
	})

	test("shows only the card until a backup is picked; Choose file picks here", async () => {
		const w = mountPage()
		expect(w.get('[data-testid="handoff-card"]').text()).toContain("Pick the backup file")
		expect(w.find('[data-testid="restore-again-page"]').exists()).toBe(false)

		await w.get('[data-testid="handoff-card-choose"]').trigger("click")
		await flushPromises()
		expect(fakes.pickBackupFile).toHaveBeenCalledTimes(1)
		expect(fakes.leavePanelFor).not.toHaveBeenCalled()

		fakes.selectedBackup.value = { name: "b.json", kind: "plain" }
		await nextTick()
		expect(w.find('[data-testid="handoff-card"]').exists()).toBe(false)
	})

	test("a refused backup file shows the page with its error", async () => {
		const w = mountPage()
		fakes.options?.fillError("full_backup", "Backup file is too large")
		await nextTick()
		expect(w.find('[data-testid="handoff-card"]').exists()).toBe(false)
		expect(w.find('[data-testid="import-full-backup-pick-file"]').exists()).toBe(true)
	})

	test("every end hands back to Home, a full restore with its outcome; nothing routes in the window", async () => {
		mountPage()
		fakes.options?.leave(OUTCOME)
		fakes.options?.leave()
		await flushPromises()
		expect(fakes.returnToPanel.mock.calls).toEqual([
			["/popup/general", OUTCOME],
			["/popup/general", undefined],
		])
		expect(fakes.replace).not.toHaveBeenCalled()
	})

	test("Cancel closes the window through the own window's way back", async () => {
		const w = mountPage()
		await w.get('[data-testid="handoff-card-cancel"]').trigger("click")
		await flushPromises()
		expect(fakes.closeOwnWindow).toHaveBeenCalledTimes(1)
		expect(fakes.pickBackupFile).not.toHaveBeenCalled()
	})
})

/** A network name here is one word of up to 25 characters, as the person typed it. */
describe("restore again — a long name stays inside its texts", () => {
	const parsed = parseSource("apps/extension/src/popup/pages/restore-again.vue")

	test.each(["restore-again-intro", "restore-again-retry-result"])("%s breaks a word wider than itself anywhere", (testid) => {
		const text = elementByTestid(parsed, testid)?.node
		expect(text && boundAttr(text, "class")).toBe("$style.names")
		expect(declarationsOf(parsed, ".names")).toEqual({ "overflow-wrap": "anywhere" })
		expect(declarationsOf(parsed, ".intro")).toEqual({ "padding-bottom": "12px" })
	})
})

test("outside a hand-off window, an end routes Home", async () => {
	mountPage()
	fakes.options?.leave()
	await flushPromises()
	expect(fakes.replace).toHaveBeenCalledWith("/popup/general")
})
