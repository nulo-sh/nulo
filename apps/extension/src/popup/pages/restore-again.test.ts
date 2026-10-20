import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ref } from "vue"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"

const fakes = vi.hoisted(() => ({
	pickBackupFile: vi.fn(async () => undefined),
	leavePanelFor: vi.fn(async (_route: string) => false),
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
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	leavePanelFor: fakes.leavePanelFor,
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
	fakes.leavePanelFor.mockResolvedValue(false)
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
