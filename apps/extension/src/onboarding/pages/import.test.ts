import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const profileApi = vi.hoisted(() => ({
	getProfiles: vi.fn(async () => [] as Array<{ name: string }>),
	importMnemonic: vi.fn(async () => ({ id: "p1", name: "Main", type: "password" })),
}))
vi.mock("@/utils/core", () => ({ managers: { profile: profileApi } }))
const bootstrap = vi.hoisted(() => ({ bootstrapActiveProfile: vi.fn(), hydrateKnownProfile: vi.fn() }))
vi.mock("@/composables/useProfileBootstrap", () => ({ useProfileBootstrap: () => bootstrap }))
vi.mock("@/composables/usePasskeyCeremony", () => ({
	usePasskeyCeremony: () => ({ request: { value: null }, runCeremony: vi.fn(), onResolve: vi.fn(), onReject: vi.fn() }),
}))
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("vue-router", () => ({ useRouter: () => router, useRoute: () => ({ meta: {} }) }))
const importFlow = vi.hoisted(() => ({
	api: undefined as ReturnType<typeof import("@/composables/useProfileImportFlow").useProfileImportFlow> | undefined,
}))
const backupImport = vi.hoisted(() => ({
	api: undefined as ReturnType<typeof import("@/composables/useFullBackupImport").useFullBackupImport> | undefined,
}))
// The real composable, with a Retry that stays pending: reaching a retryable state for real
// takes a whole restore, which this page test does not own.
vi.mock("@/composables/useFullBackupImport", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@/composables/useFullBackupImport")>()
	const { computed, ref } = await import("vue")
	return {
		...mod,
		useFullBackupImport: (opts: Parameters<typeof mod.useFullBackupImport>[0]) => {
			const real = mod.useFullBackupImport(opts)
			const isRetryingAccountState = ref(false)
			backupImport.api = {
				...real,
				canRetryAccountState: computed(() => real.restoreStatus.value === "finished"),
				unrestoredNetworkNames: computed(() => (real.restoreStatus.value === "finished" ? ["Alpha V5"] : [])),
				hasOtherRestoreErrors: computed(() => false),
				isRetryingAccountState,
				retryAccountState: vi.fn(() => {
					isRetryingAccountState.value = true
					return new Promise<void>(() => {})
				}),
			}
			return backupImport.api
		},
	}
})
const ctaReads = vi.hoisted(() => ({ log: [] as string[] }))
// The page gets delegating refs that log each read of what the CTA predicates read; the tests
// write through the real refs on `importFlow.api`.
vi.mock("@/composables/useProfileImportFlow", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@/composables/useProfileImportFlow")>()
	const { customRef } = await import("vue")
	const logged = <T>(key: string, inner: { value: T }) =>
		customRef<T>(() => ({
			get() {
				ctaReads.log.push(key)
				return inner.value
			},
			set(v) {
				inner.value = v
			},
		}))
	return {
		...mod,
		useProfileImportFlow: (opts: Parameters<typeof mod.useProfileImportFlow>[0]) => {
			const api = mod.useProfileImportFlow(opts)
			importFlow.api = api
			return {
				...api,
				selectedBackup: logged("selectedBackup", api.selectedBackup),
				restoreStatus: logged("restoreStatus", api.restoreStatus),
				isAllowedToImportBackup: logged("isAllowedToImportBackup", api.isAllowedToImportBackup),
				isRestoreHasErrors: logged("isRestoreHasErrors", api.isRestoreHasErrors),
				isRetryingAccountState: logged("isRetryingAccountState", api.isRetryingAccountState),
			}
		},
	}
})

import { BrutalistTitle, Flex, Input, Text } from "@nulo/design"
import { useToast } from "@/composables/toast"
import { enterOn, nativeInput } from "../../../tests/helpers/credential-pins"
import type { BackupSelection } from "@/utils/full-backup-helpers"
import OnboardingProfileNameField from "../components/OnboardingProfileNameField.vue"
import Import from "./import.vue"

const wrappers: VueWrapper[] = []

async function mountImport() {
	const wrapper = mount(Import, {
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			components: { BrutalistTitle, Flex, Input, OnboardingProfileNameField, Text },
			stubs: {
				OnboardingPage: { template: "<main><slot /></main>" },
				OnboardingBackLink: true,
				StepIndicator: true,
				ImportMethodPicker: true,
				PasskeyCeremonyDialog: true,
			},
		},
	})
	wrappers.push(wrapper)
	await flushPromises()
	return wrapper
}

const page = (w: VueWrapper) => w.get('[data-testid="onboarding-import-page"]')

beforeEach(() => {
	vi.clearAllMocks()
	profileApi.getProfiles.mockResolvedValue([])
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

describe("onboarding import", () => {
	test("a first-run import has no name field and reads Import / Wallet", async () => {
		const w = await mountImport()
		expect(page(w).attributes("data-name-field")).toBe("hidden")
		expect(w.find('[data-testid="onboarding-name-input"]').exists()).toBe(false)
		expect(w.text()).toContain("Import")
		expect(w.text()).toContain("Wallet")
		expect(w.text()).not.toContain("Profile")
		expect(w.text()).toContain("Restore from a recovery phrase, passkey, or full backup.")
	})

	test("with a profile already there, the field shows prefilled Profile 2", async () => {
		profileApi.getProfiles.mockResolvedValue([{ name: "Main" }])
		const w = await mountImport()
		expect(page(w).attributes("data-name-field")).toBe("shown")
		expect((w.get('[data-testid="onboarding-name-input"] input').element as HTMLInputElement).value).toBe("Profile 2")
	})

	// Onboarding is a web page, not the wallet: a finished import opens no snack there, while the
	// popup's import keeps its own.
	test.each([
		["activates", true],
		["is left locked", false],
	])("a phrase import that %s goes on to /onboarding/learn and opens no snack", async (_, activates) => {
		bootstrap.bootstrapActiveProfile.mockResolvedValue(activates)
		bootstrap.hydrateKnownProfile.mockResolvedValue(undefined)
		useToast().closeToast()
		await mountImport()
		const flow = importFlow.api!
		flow.seedPhrase.value = "abandon ".repeat(24).trim()
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"

		await flow.handleImportSeed()

		expect(profileApi.importMnemonic).toHaveBeenCalledTimes(1)
		expect(router.push).toHaveBeenCalledWith("/onboarding/learn")
		expect(useToast().toast.value).toBeNull()
	})

	test("while a Retry runs it reads Retrying..., and Continue, View errors and Back are disabled", async () => {
		const w = await mountImport()
		importFlow.api!.selectedImportOption.value = "full_backup"
		const backup = backupImport.api!
		backup.restoreStatus.value = "finished"
		backup.restoreErrorLog.value = {
			"account-state": [
				{ networkId: "M2", senders: [], contracts: [], restoreError: "Skipped: ran out of time reaching the network" },
			],
		}
		await flushPromises()
		const button = (testid: string) => w.get(`[data-testid="${testid}"]`)
		const back = () => {
			const found = w.findAll("button").find((b) => b.text() === "Back to methods")
			if (!found) throw new Error("no Back to methods button")
			return found
		}
		expect(w.get('[data-testid="import-full-backup-warning"]').text()).toContain(
			"Alpha V5 didn't answer in time, so what was saved for it may not be restored. You can retry or continue.",
		)
		expect(button("import-full-backup-retry-btn").text()).toBe("Retry")
		expect(button("import-full-backup-continue-btn").attributes("disabled")).toBeUndefined()
		expect(back().attributes("disabled")).toBeUndefined()

		await button("import-full-backup-retry-btn").trigger("click")
		await flushPromises()

		expect(backup.retryAccountState).toHaveBeenCalledTimes(1)
		expect(button("import-full-backup-retry-btn").text()).toBe("Retrying...")
		expect(button("import-full-backup-continue-btn").attributes("disabled")).toBeDefined()
		expect(button("import-full-backup-view-errors-btn").attributes("disabled")).toBeDefined()
		expect(back().attributes("disabled")).toBeDefined()
	})

	test("Continue on the errors screen completes the imported profile and goes on to /onboarding/learn", async () => {
		bootstrap.bootstrapActiveProfile.mockResolvedValue(true)
		const w = await mountImport()
		importFlow.api!.selectedImportOption.value = "full_backup"
		const backup = backupImport.api!
		backup.importedProfile.value = { id: "p9", name: "Imported", type: "password" }
		backup.restoreStatus.value = "finished"
		backup.restoreErrorLog.value = {
			"account-state": [
				{ networkId: "M2", senders: [], contracts: [], restoreError: "Skipped: ran out of time reaching the network" },
			],
		}
		await flushPromises()

		await w.get('[data-testid="import-full-backup-continue-btn"]').trigger("click")
		await flushPromises()

		expect(bootstrap.bootstrapActiveProfile).toHaveBeenCalledWith({ id: "p9", name: "Imported", type: "password" })
		expect(router.push).toHaveBeenCalledWith("/onboarding/learn")
	})
})

describe("onboarding import — no Enter shortcut", () => {
	test("Enter in the full-backup password fields, with a restore ready, starts nothing", async () => {
		const w = await mountImport()
		const flow = importFlow.api!
		flow.selectedImportOption.value = "full_backup"
		flow.selectedBackup.value = {
			name: "b.json",
			type: "plain",
			profileType: "password",
			backup: { data: { profile: { type: "password" } } },
		}
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await flushPromises()
		for (const id of ["import-full-backup-password-input", "import-full-backup-password-confirm-input"]) {
			const ev = enterOn(nativeInput(w, id))
			expect(ev.defaultPrevented).toBe(false)
		}
		await flushPromises()
		expect(backupImport.api!.restoreStatus.value).toBe("")
	})
})

type OnboardingCta = [text: string, testid: string | null, disabled: boolean, loading: string | null, variant: string, size: string]

/** Every button in the CTA bar, in order. No component is registered for `Button` here, so each
 *  renders as a native button carrying its props as attributes. */
function onboardingCtas(w: VueWrapper): OnboardingCta[] {
	const back = w.findAll("button").find((b) => b.text() === "Back to methods")
	if (!back?.element.parentElement) throw new Error("no CTA bar")
	return [...back.element.parentElement.querySelectorAll(":scope > button")].map((b) => [
		b.textContent?.trim() ?? "",
		b.getAttribute("data-testid"),
		(b as HTMLButtonElement).disabled,
		b.getAttribute("loading"),
		b.getAttribute("variant") ?? "",
		b.getAttribute("size") ?? "",
	])
}

const ENCRYPTED: BackupSelection = { name: "backup.txt", type: "encrypted", profileType: null, backup: "ciphertext" }
const DECRYPTED: BackupSelection = {
	name: "backup.txt",
	type: "encrypted",
	profileType: "password",
	backup: { data: { profile: { name: "Main" } } },
}
const PASSKEY_BACKUP: BackupSelection = {
	name: "backup.json",
	type: "plain",
	profileType: "passkey",
	backup: { data: { profile: { name: "Main" } } },
}
const ACCOUNT_STATE_ERRORS = {
	"account-state": [{ networkId: "M2", senders: [], contracts: [], restoreError: "Skipped: ran out of time reaching the network" }],
}
const BACK: OnboardingCta = ["Back to methods", null, false, null, "cta_outline", "large"]
const BACK_OFF: OnboardingCta = ["Back to methods", null, true, null, "cta_outline", "large"]
const IMPORT: OnboardingCta = ["Import profile", "onboarding-submit-import", false, "false", "cta", "large"]
const IMPORT_OFF: OnboardingCta = ["Import profile", "onboarding-submit-import", true, "false", "cta", "large"]
const IMPORTING: OnboardingCta = ["Importing...", "onboarding-submit-import", true, "true", "cta", "large"]
const RETRY: OnboardingCta = ["Retry", "import-full-backup-retry-btn", false, "false", "cta_outline", "large"]
const CONTINUE: OnboardingCta = ["Continue", "import-full-backup-continue-btn", false, null, "cta", "large"]
const VIEW_ERRORS: OnboardingCta = ["View errors", "import-full-backup-view-errors-btn", false, null, "cta_outline", "large"]

type Apis = { flow: NonNullable<typeof importFlow.api>; backup: NonNullable<typeof backupImport.api> }
type ApisPatch = (a: Apis) => void

const validPair = ({ flow }: Apis) => {
	flow.password.value = "password123"
	flow.repeatedPassword.value = "password123"
}

/** Mounts, opens Full backup, then applies `patch` to the live flow. */
async function mountFullBackup(patch: ApisPatch): Promise<VueWrapper> {
	const w = await mountImport()
	const apis = { flow: importFlow.api!, backup: backupImport.api! }
	apis.flow.selectedImportOption.value = "full_backup"
	await flushPromises()
	patch(apis)
	await flushPromises()
	return w
}

const ONBOARDING_CTA_STATES: Array<[string, ApisPatch, OnboardingCta[]]> = [
	[
		"encrypted, no decryption password",
		({ backup }) => {
			backup.selectedBackup.value = { ...ENCRYPTED }
		},
		[["Decrypt backup", "onboarding-submit-import", true, null, "cta", "large"], BACK],
	],
	[
		"encrypted, decryption password typed",
		({ backup }) => {
			backup.selectedBackup.value = { ...ENCRYPTED }
			backup.decryptionPassword.value = "pw"
		},
		[["Decrypt backup", "onboarding-submit-import", false, null, "cta", "large"], BACK],
	],
	[
		"decrypted, valid new password",
		(a) => {
			a.backup.selectedBackup.value = DECRYPTED
			validPair(a)
		},
		[IMPORT, BACK],
	],
	[
		"decrypted, status null",
		(a) => {
			a.backup.selectedBackup.value = DECRYPTED
			a.backup.restoreStatus.value = null
			validPair(a)
		},
		[IMPORT, BACK],
	],
	[
		"decrypted passkey backup (no new password needed)",
		({ backup }) => {
			backup.selectedBackup.value = PASSKEY_BACKUP
		},
		[IMPORT, BACK],
	],
	[
		"not allowed alone (mismatched new password)",
		({ flow, backup }) => {
			backup.selectedBackup.value = DECRYPTED
			flow.password.value = "password123"
			flow.repeatedPassword.value = "password124"
		},
		[IMPORT_OFF, BACK],
	],
	[
		"failed alone",
		(a) => {
			a.backup.selectedBackup.value = DECRYPTED
			validPair(a)
			a.backup.restoreStatus.value = "failed"
		},
		[IMPORT_OFF, BACK],
	],
	[
		"progress alone",
		(a) => {
			a.backup.selectedBackup.value = DECRYPTED
			validPair(a)
			a.backup.restoreStatus.value = "progress"
		},
		[IMPORTING, BACK_OFF],
	],
	[
		"progress with errors already logged",
		(a) => {
			a.backup.selectedBackup.value = DECRYPTED
			validPair(a)
			a.backup.restoreStatus.value = "progress"
			a.backup.restoreErrorLog.value = { ...ACCOUNT_STATE_ERRORS }
		},
		[IMPORTING, BACK_OFF],
	],
	[
		// This file's composable offers Retry whenever a restore has finished.
		"finished clean",
		({ backup }) => {
			backup.selectedBackup.value = DECRYPTED
			backup.restoreStatus.value = "finished"
		},
		[RETRY, BACK],
	],
	[
		"finished with errors",
		({ backup }) => {
			backup.selectedBackup.value = DECRYPTED
			backup.restoreStatus.value = "finished"
			backup.restoreErrorLog.value = { ...ACCOUNT_STATE_ERRORS }
		},
		[RETRY, CONTINUE, VIEW_ERRORS, BACK],
	],
	[
		"finished with errors, retrying",
		({ backup }) => {
			backup.selectedBackup.value = DECRYPTED
			backup.restoreStatus.value = "finished"
			backup.restoreErrorLog.value = { ...ACCOUNT_STATE_ERRORS }
			backup.isRetryingAccountState.value = true
		},
		[
			["Retrying...", "import-full-backup-retry-btn", true, "true", "cta_outline", "large"],
			["Continue", "import-full-backup-continue-btn", true, null, "cta", "large"],
			["View errors", "import-full-backup-view-errors-btn", true, null, "cta_outline", "large"],
			BACK_OFF,
		],
	],
	["no backup chosen", () => {}, [BACK]],
]

describe("onboarding import — the CTA bar in each state", () => {
	test.each(ONBOARDING_CTA_STATES)("%s", async (_, patch, expected) => {
		const w = await mountFullBackup(patch)
		expect(onboardingCtas(w)).toEqual(expected)
	})

	test("seed: disabled until allowed, then disabled and loading while the import runs", async () => {
		profileApi.importMnemonic.mockReturnValueOnce(new Promise(() => {}))
		const w = await mountImport()
		const flow = importFlow.api!
		flow.selectedImportOption.value = "seed"
		await flushPromises()
		expect(onboardingCtas(w)).toEqual([["Import profile", "onboarding-submit-import", true, "false", "cta", "large"], BACK])

		flow.seedPhrase.value = "abandon ".repeat(24).trim()
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await flushPromises()
		expect(onboardingCtas(w)).toEqual([IMPORT, BACK])

		void flow.handleImportSeed()
		await flushPromises()
		expect(profileApi.importMnemonic).toHaveBeenCalledTimes(1)
		expect(onboardingCtas(w)).toEqual([["Import profile", "onboarding-submit-import", true, "true", "cta", "large"], BACK])
	})
})

// A branch the inline expression skips must stay unread: an eager read adds a render dependency.
describe("onboarding import — the CTA predicates read only what each branch reaches", () => {
	const FORM_PROPS = ["selectedBackup", "restoreStatus", "isRestoreHasErrors"]
	const DECRYPT_SHOWN = ["selectedBackup", "selectedBackup"]
	// Continue and View errors each read the status; neither reaches the error flag unfinished.
	const UNFINISHED_ERROR_CTAS = ["restoreStatus", "restoreStatus"]
	// Restore blocked (failed, then progress), its loading flag and its label each read the status.
	const RESTORE_SHOWN_AND_ALLOWED = ["isAllowedToImportBackup", "restoreStatus", "restoreStatus", "restoreStatus", "restoreStatus"]
	test.each<[string, ApisPatch, string[]]>([
		[
			"encrypted, not decrypted (no profile type)",
			({ backup }) => {
				backup.selectedBackup.value = { ...ENCRYPTED }
			},
			[
				...FORM_PROPS,
				...DECRYPT_SHOWN,
				"selectedBackup", // restore shown: no profile type, so the status stays unread
				...UNFINISHED_ERROR_CTAS,
				"restoreStatus", // back blocked: not in progress, so the Retry flag is read
				"isRetryingAccountState",
			],
		],
		[
			"decrypted, not finished",
			(a) => {
				a.backup.selectedBackup.value = DECRYPTED
				validPair(a)
			},
			[
				...FORM_PROPS,
				...DECRYPT_SHOWN,
				"selectedBackup", // restore shown
				"restoreStatus",
				...RESTORE_SHOWN_AND_ALLOWED,
				...UNFINISHED_ERROR_CTAS,
				"restoreStatus", // back blocked
				"isRetryingAccountState",
			],
		],
		[
			"in progress",
			(a) => {
				a.backup.selectedBackup.value = DECRYPTED
				validPair(a)
				a.backup.restoreStatus.value = "progress"
			},
			[
				...FORM_PROPS,
				...DECRYPT_SHOWN,
				"selectedBackup", // restore shown
				"restoreStatus",
				...RESTORE_SHOWN_AND_ALLOWED,
				...UNFINISHED_ERROR_CTAS,
				"restoreStatus", // back blocked: in progress, so the Retry flag stays unread
			],
		],
	])("%s", async (_, patch, expected) => {
		await mountFullBackup(() => {})
		ctaReads.log.length = 0
		patch({ flow: importFlow.api!, backup: backupImport.api! })
		await flushPromises()
		expect(ctaReads.log).toEqual(expected)
	})
})
