import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const profileApi = vi.hoisted(() => ({
	getProfiles: vi.fn(async () => [{ name: "Daily" }]),
	importPasskey: vi.fn(),
}))
vi.mock("@/utils/core", () => ({ managers: { profile: profileApi } }))
vi.mock("@/composables/useProfileBootstrap", () => ({ useProfileBootstrap: () => ({ hydrateKnownProfile: vi.fn() }) }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn(), toast: { value: undefined }, closeToast: vi.fn() }) }))
vi.mock("@/wallet/utils/onboarding-tab", () => ({ redirectToOnboardingTabIfNeeded: vi.fn() }))
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: () => false }))
vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))

import { Flex, Input, Text } from "@nulo/design"
import { PasskeyProfileExistsError, walletErrorFromPayload } from "@nulo/extension-messaging/errors"
import NotificationManager from "@/components/NotificationManager.vue"
import PasskeyCeremonyDialog from "@/components/passkey/PasskeyCeremonyDialog.vue"
import ImportMethodPicker from "@/components/composite/import/ImportMethodPicker.vue"
import SubPageHeader from "@/components/ui/SubPageHeader.vue"
import ImportPage from "./import.vue"

const wrappers: VueWrapper[] = []

/** The import page and the notice layer the popup shell mounts beside it, on one store. */
function mountPopup() {
	const global = {
		plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false })],
		components: { Flex, Input, SubPageHeader, Text },
		stubs: {
			Button: { template: "<button><slot /></button>" },
			Icon: true,
			ItemsContainer: { template: "<div><slot /></div>" },
			SettingItem: true,
			PasskeyCeremonyDialog: true,
		},
	}
	const page = mount(ImportPage, { attachTo: document.body, global })
	const notices = mount(NotificationManager, { attachTo: document.body, global })
	wrappers.push(page, notices)
	return page
}

async function importWithPasskey(page: VueWrapper): Promise<void> {
	await flushPromises()
	page.findComponent(ImportMethodPicker).vm.$emit("passkey")
	await flushPromises()
	page.findComponent(PasskeyCeremonyDialog).vm.$emit("resolve", { id: "cred-daily", prf: "AAAA", userHandle: "aa" })
	await flushPromises()
}

const shownNotice = () => document.body.querySelector('[data-testid="notification-description"]')?.textContent?.trim()

beforeEach(() => {
	vi.clearAllMocks()
	vi.stubGlobal("chrome", {
		storage: {
			local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) },
			onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
		},
		runtime: { connect: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
	})
})
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	vi.unstubAllGlobals()
})

describe("popup import — a passkey whose profile is already here", () => {
	test("the refusal, rebuilt from its wire payload, shows the notice that names the profile", async () => {
		const sent = new PasskeyProfileExistsError(undefined, { existingProfileName: "Daily" })
		profileApi.importPasskey.mockRejectedValueOnce(walletErrorFromPayload(sent.toPayload()))
		await importWithPasskey(mountPopup())

		expect(profileApi.importPasskey).toHaveBeenCalledOnce()
		expect(shownNotice()).toBe(
			"“Daily” already uses this passkey in this wallet. Click the profile name on the lock screen and choose “Daily”.",
		)
	})

	test("any other failure, even one with the same message, keeps today's notice", async () => {
		profileApi.importPasskey.mockRejectedValueOnce(new Error("Passkey profile already exists"))
		await importWithPasskey(mountPopup())

		expect(profileApi.importPasskey).toHaveBeenCalledOnce()
		expect(shownNotice()).toBe(
			"An error occurred while importing the profile. This authenticator may not be supported or encountered an issue. Try again or use another one.",
		)
	})
})
