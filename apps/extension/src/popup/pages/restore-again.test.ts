import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ref } from "vue"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"

const fakes = vi.hoisted(() => ({
	pickBackupFile: vi.fn(async () => undefined),
	inPanel: vi.fn(() => false),
	moveToOwnWindow: vi.fn(async () => true),
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
	useRestoreAgain: () => ({
		selectedBackup: ref(null),
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
	}),
}))
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: fakes.inPanel }))
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	moveToOwnWindow: fakes.moveToOwnWindow,
}))
vi.mock("vue-router", () => ({ useRouter: () => ({ replace: vi.fn() }), useRoute: () => ({ path: "/popup/restore-again", meta: {} }) }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))

import RestoreAgain from "./restore-again.vue"

const wrappers: VueWrapper[] = []

async function pressChooseFile() {
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
	await w.get('[data-testid="import-full-backup-pick-file"]').trigger("click")
	await flushPromises()
}

beforeEach(() => {
	vi.clearAllMocks()
	fakes.inPanel.mockReturnValue(false)
	fakes.moveToOwnWindow.mockResolvedValue(true)
	installChromeStorage({}, { persist: false })
})

afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

describe("restore again — Firefox's toolbar panel", () => {
	test("a press in the panel moves the page to its own window and opens no picker", async () => {
		fakes.inPanel.mockReturnValue(true)
		await pressChooseFile()
		expect(fakes.moveToOwnWindow).toHaveBeenCalledWith("/popup/restore-again")
		expect(fakes.pickBackupFile).not.toHaveBeenCalled()
	})

	test("outside the panel the press opens the picker", async () => {
		await pressChooseFile()
		expect(fakes.moveToOwnWindow).not.toHaveBeenCalled()
		expect(fakes.pickBackupFile).toHaveBeenCalledTimes(1)
	})

	test("a window that cannot open leaves the pick in the panel", async () => {
		fakes.inPanel.mockReturnValue(true)
		fakes.moveToOwnWindow.mockResolvedValueOnce(false)
		await pressChooseFile()
		expect(fakes.pickBackupFile).toHaveBeenCalledTimes(1)
	})
})
