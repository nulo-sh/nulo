import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"
import { computed, createApp, customRef, h, ref } from "vue"

const holder = vi.hoisted(() => ({
	flow: undefined as unknown as ReturnType<typeof makeFlow>,
	opts: undefined as unknown as {
		completeImport: (profile: { id: string }) => Promise<void>
		showErrorLog: (
			errors: Record<string, unknown[]>,
			networks: { byNetworkId: ReadonlyMap<string, string>; unrestored: string[] },
		) => void
	},
}))
vi.mock("@/composables/useProfileImportFlow", () => ({
	useProfileImportFlow: (opts: typeof holder.opts) => {
		holder.opts = opts
		return holder.flow
	},
}))
vi.mock("@/composables/completeImportWithRecovery", () => ({ completeImportWithRecovery: vi.fn(async () => "active") }))
const boot = vi.hoisted(() => ({ hydrate: vi.fn() }))
vi.mock("@/composables/useProfileBootstrap", () => ({ useProfileBootstrap: () => ({ hydrateKnownProfile: boot.hydrate }) }))
const toast = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: toast.open }) }))
vi.mock("@/utils/lastActiveProfile", () => ({ setLastActiveProfileId: vi.fn(async () => undefined) }))
vi.mock("@/wallet/utils/onboarding-tab", () => ({ redirectToOnboardingTabIfNeeded: vi.fn() }))
const nav = vi.hoisted(() => ({ query: {} as Record<string, string>, push: vi.fn(), back: vi.fn() }))
vi.mock("vue-router", () => ({ useRoute: () => ({ query: nav.query }), useRouter: () => ({ push: nav.push, back: nav.back }) }))
const surface = vi.hoisted(() => ({
	needsOwnWindow: vi.fn(() => false),
	move: vi.fn(async (_route: string) => true),
	close: vi.fn(async () => false),
	release: vi.fn(),
}))
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: () => surface.needsOwnWindow() }))
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	moveToOwnWindow: (route: string) => surface.move(route),
	leavePanelFor: async (route: string) => surface.needsOwnWindow() && (await surface.move(route)),
	closeOwnWindow: () => surface.close(),
	releaseOwnWindow: () => surface.release(),
}))

import { openSearchPanel } from "@codemirror/search"
import { EditorView } from "@codemirror/view"
import { Flex, Icon, Input, Text } from "@nulo/design"
import { pressOn } from "../../../tests/helpers/press-key"
import { enterOn, expectNativeAttrs, IGNORED_ENTERS, nativeInput, pasteInto, typeNow } from "../../../tests/helpers/credential-pins"
import JsonViewer from "@/components/JsonViewer/JsonViewer.vue"
import ImportMethodPicker from "@/components/composite/import/ImportMethodPicker.vue"
import SubPageHeader from "@/components/ui/SubPageHeader.vue"
import { completeImportWithRecovery } from "@/composables/completeImportWithRecovery"
import { endOpeningFlows } from "@/popup/opening-flow"
import { useAppStore } from "@/stores/app.store"
import { deferred } from "@nulo/wallet-core/utils"
import ImportPage from "./import.vue"

/** The flow's surface with a decrypted password-profile backup chosen, its name in the field, and a
 *  valid new password. */
function makeFlow() {
	const profileName = ref("Main")
	return {
		nameFieldState: ref("hidden"),
		profileName,
		trimmedName: computed(() => profileName.value.trim()),
		holdsOwnName: vi.fn(() => false),
		nameError: ref(""),
		shakeName: ref(false),
		nameInputRef: ref(null),
		handleNameInput: vi.fn(),
		ceremonyRequest: ref(null),
		onCeremonyResolve: vi.fn(),
		onCeremonyReject: vi.fn(),
		selectedImportOption: ref<string | null>("full_backup"),
		seedPhrase: ref(undefined),
		password: ref("password123"),
		repeatedPassword: ref("password123"),
		unlockMethod: ref("password"),
		maxPasswordLength: 128,
		isImporting: ref(false),
		error: ref({ type: "", title: "", tooltip: "" }),
		isCopied: ref(false),
		isAllowedToImportBySeedPhrase: ref(false),
		selectedBackup: ref({
			name: "backup.txt",
			kind: "opened",
			profileType: "password",
			backup: { data: { profile: { name: "Main" } } },
		}),
		decryptionPassword: ref(""),
		restoreStatus: ref(""),
		restoreStage: ref(undefined),
		importedProfile: ref<{ id: string } | null>(null),
		isAllowedToImportBackup: ref(true),
		isRestoreHasErrors: ref(false),
		canRetryAccountState: ref(false),
		isRetryingAccountState: ref(false),
		unrestoredNetworkNames: ref<string[]>([]),
		retryFailedAgain: ref(false),
		hasOtherRestoreErrors: ref(false),
		retryAccountState: vi.fn(),
		continueImport: vi.fn(),
		pickBackupFile: vi.fn(),
		decryptBackup: vi.fn(),
		restoreBackup: vi.fn(),
		restoreBackupWithExistingPasskey: vi.fn(),
		showRestoreErrorLog: vi.fn(),
		handleImportSeed: vi.fn(),
		handleImportSeedWithExistingPasskey: vi.fn(),
		handleImportPasskey: vi.fn(),
		handlePasswordInput: vi.fn(),
		handleSecretInput: vi.fn(),
		handleCopyError: vi.fn(),
		handleBack: vi.fn(),
		dispose: vi.fn(),
	}
}

function finishWithErrors() {
	holder.flow.restoreStatus.value = "finished"
	holder.flow.isRestoreHasErrors.value = true
	holder.flow.importedProfile.value = { id: "p9" }
}

const wrappers: VueWrapper[] = []
const cleanups: Array<() => void> = []

async function mountImport() {
	const w = mount(ImportPage, {
		attachTo: document.body,
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			components: { Flex, Input, SubPageHeader, Text, Icon },
			stubs: {
				Button: { template: "<button><slot /></button>" },
				Icon: true,
				ItemsContainer: { template: "<div><slot /></div>" },
				SettingItem: true,
				PasskeyCeremonyDialog: true,
			},
		},
	})
	wrappers.push(w)
	await flushPromises()
	return w
}

/** jsdom lays nothing out and has no `Range.getClientRects`, which CodeMirror's measure pass reads:
 *  ranges get empty rects until the returned restore runs. */
function giveRangesEmptyRects(): () => void {
	const proto = Range.prototype as { getClientRects?: () => DOMRectList }
	if (proto.getClientRects) return () => {}
	proto.getClientRects = () => [] as unknown as DOMRectList
	return () => void Reflect.deleteProperty(proto, "getClientRects")
}

/** Shows the real viewer in an app of its own outside the page, where the shell's popup manager
 *  renders it (a second VTU mount would drop the page's stubs), and returns its editor, which sits
 *  in the viewer's shadow root. */
async function showErrorViewer(data: Record<string, unknown[]>): Promise<EditorView> {
	const restoreRects = giveRangesEmptyRects()
	const app = createApp({ render: () => h(JsonViewer, { data }) })
	app.component("Icon", { render: () => h("i") })
	const host = document.body.appendChild(document.createElement("div"))
	app.mount(host)
	await flushPromises()
	const editor = [...host.querySelectorAll("*")].find((el) => el.shadowRoot)?.shadowRoot?.querySelector<HTMLElement>(".cm-editor")
	const view = editor && EditorView.findFromDOM(editor)
	cleanups.push(() => {
		// Destroying the view cancels its pending measure before the rects go.
		view?.destroy()
		app.unmount()
		restoreRects()
	})
	if (!view) throw new Error("the viewer rendered no editor")
	return view
}

// Composed, as a real key event is: one from inside the viewer's shadow root reaches the document.
const enterKey = () => new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, cancelable: true, composed: true })

beforeEach(() => {
	vi.clearAllMocks()
	nav.query = {}
	surface.needsOwnWindow.mockReturnValue(false)
	surface.move.mockResolvedValue(true)
	surface.close.mockResolvedValue(false)
	holder.flow = makeFlow()
	installChromeStorage({}, { persist: false })
})

afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	for (const c of cleanups.splice(0)) c()
	document.body.innerHTML = ""
})

describe("popup import — the phrase form while an import runs", () => {
	test("the unlock choice takes no input while the import runs, and takes it again after", async () => {
		holder.flow.selectedImportOption.value = "seed"
		const w = await mountImport()
		const disabled = () =>
			["import-method-passkey", "import-method-password"].map(
				(id) => w.get(`[data-testid="${id}"]`).attributes("disabled") !== undefined,
			)
		expect(disabled()).toEqual([false, false])
		holder.flow.isImporting.value = true
		await flushPromises()
		expect(disabled()).toEqual([true, true])
		holder.flow.isImporting.value = false
		await flushPromises()
		expect(disabled()).toEqual([false, false])
	})
})

describe("popup import — full backup, a restore ready", () => {
	test("Enter on Back goes back and restores nothing", async () => {
		const w = await mountImport()
		const back = w.findAll("button").find((b) => b.text() === "Back")
		if (!back) throw new Error("no Back button")
		pressOn(back.element, "Enter")
		await flushPromises()
		expect(holder.flow.handleBack).toHaveBeenCalledTimes(1)
		expect(holder.flow.restoreBackup).not.toHaveBeenCalled()
	})

	test("(preservation) Enter in the repeat-password field restores once", async () => {
		const w = await mountImport()
		enterOn(w.get('[data-testid="import-full-backup-password-confirm-input"] input').element)
		await flushPromises()
		expect(holder.flow.restoreBackup).toHaveBeenCalledTimes(1)
	})
})

describe("popup import — full backup, finished with errors", () => {
	test("Enter on View Errors opens the error log and does not continue", async () => {
		finishWithErrors()
		const w = await mountImport()
		pressOn(w.get('[data-testid="import-full-backup-view-errors-btn"]').element as HTMLElement, "Enter")
		await flushPromises()
		expect(holder.flow.showRestoreErrorLog).toHaveBeenCalledTimes(1)
		expect(holder.flow.continueImport).not.toHaveBeenCalled()
	})

	test("a repeat Enter on Continue continues nothing", async () => {
		finishWithErrors()
		const w = await mountImport()
		pressOn(w.get('[data-testid="import-full-backup-continue-btn"]').element as HTMLElement, "Enter", { repeat: true })
		await flushPromises()
		expect(holder.flow.continueImport).not.toHaveBeenCalled()
	})

	test("Enter in the error viewer's search finds the next match, and on its checkbox does nothing, never continuing", async () => {
		finishWithErrors()
		await mountImport()
		const view = await showErrorViewer({ token: ["t1: network mismatch"], contact: ["c1: network mismatch"] })
		openSearchPanel(view)
		const search = view.dom.querySelector<HTMLInputElement>('input[name="search"]')
		const matchCase = view.dom.querySelector<HTMLInputElement>('input[name="case"]')
		if (!search || !matchCase) throw new Error("the search panel did not open")
		search.value = "mismatch"
		search.dispatchEvent(new Event("change"))

		search.focus()
		search.dispatchEvent(enterKey())
		const { from, to } = view.state.selection.main
		expect(view.state.sliceDoc(from, to)).toBe("mismatch")

		matchCase.focus()
		matchCase.dispatchEvent(enterKey())
		await flushPromises()
		expect(holder.flow.continueImport).not.toHaveBeenCalled()
	})
})

describe("popup import — full backup, finished with a network left to retry", () => {
	beforeEach(() => {
		finishWithErrors()
		holder.flow.canRetryAccountState.value = true
		holder.flow.unrestoredNetworkNames.value = ["Alpha V5"]
	})

	test("Enter on a focused Retry retries once and does not continue", async () => {
		const w = await mountImport()
		pressOn(w.get('[data-testid="import-full-backup-retry-btn"]').element as HTMLElement, "Enter")
		await flushPromises()
		expect(holder.flow.retryAccountState).toHaveBeenCalledTimes(1)
		expect(holder.flow.continueImport).not.toHaveBeenCalled()
	})

	test("Back is disabled while the Retry runs", async () => {
		holder.flow.isRetryingAccountState.value = true
		const w = await mountImport()
		const back = w.findAll("button").find((b) => b.text() === "Back")
		if (!back) throw new Error("no Back button")
		expect((back.element as HTMLButtonElement).disabled).toBe(true)
	})

	test("a Retry that failed again says so above Retry, naming the network", async () => {
		const w = await mountImport()
		expect(w.find('[data-testid="import-full-backup-retry-result"]').exists()).toBe(false)

		holder.flow.retryFailedAgain.value = true
		await flushPromises()

		expect(w.get('[data-testid="import-full-backup-retry-result"]').text()).toBe("Retry didn't work · Alpha V5 still not restored")
		const order = [...w.element.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid"))
		expect(order.indexOf("import-full-backup-retry-result")).toBe(order.indexOf("import-full-backup-retry-btn") - 1)
	})

	test("View Errors names each restored network beside its id, and leaves the log's rows as they were", async () => {
		await mountImport()
		const row = { networkId: "3f2a9c1e", senders: [], contracts: [], restoreError: "Skipped: ran out of time reaching the network" }
		const errors = { "account-state": [row] }

		holder.opts.showErrorLog(errors, { byNetworkId: new Map([["3f2a9c1e", "Testnet"]]), unrestored: ["Testnet"] })

		const { useCacheStore } = await import("@/stores/cache.store")
		expect(useCacheStore().viewerData).toEqual({ "account-state": [{ network: "Testnet", ...row }] })
		expect(errors["account-state"][0]).toBe(row)
	})

	test("the warning names the network the Retry replays", async () => {
		const w = await mountImport()
		expect(w.get('[data-testid="import-full-backup-warning"]').text()).toContain(
			"Alpha V5 didn't answer in time, so what was saved for it may not be restored. You can retry or continue.",
		)
	})
})

/** The method picker, before any method is chosen, in Firefox's toolbar panel. */
async function choosingFullBackupInThePanel() {
	holder.flow.selectedImportOption.value = null
	surface.needsOwnWindow.mockReturnValue(true)
	const w = await mountImport()
	w.findComponent(ImportMethodPicker).vm.$emit("select", "full_backup")
	await flushPromises()
	return w
}

describe("popup import — Full Backup from Firefox's toolbar panel", () => {
	test("moves to its own window with Full Backup chosen and the name the person typed", async () => {
		holder.flow.profileName.value = "Savings"
		holder.flow.holdsOwnName.mockReturnValue(true)
		await choosingFullBackupInThePanel()

		expect(surface.move).toHaveBeenCalledWith("/popup/import?option=full_backup&type=import&from=%2Fpopup%2Fregister&name=Savings")
		expect(holder.flow.selectedImportOption.value).toBeNull()
	})

	test("a name Nulo filled in stays behind, so the backup's own name can still replace it", async () => {
		holder.flow.profileName.value = "Profile 2"
		await choosingFullBackupInThePanel()

		expect(surface.move).toHaveBeenCalledWith("/popup/import?option=full_backup&type=import&from=%2Fpopup%2Fregister")
	})

	test("a window that cannot open keeps the restore in the panel", async () => {
		surface.move.mockResolvedValue(false)
		await choosingFullBackupInThePanel()

		expect(holder.flow.selectedImportOption.value).toBe("full_backup")
	})

	test("a phrase moves to its own window too, since its passkey prompt would close the panel", async () => {
		holder.flow.selectedImportOption.value = null
		surface.needsOwnWindow.mockReturnValue(true)
		const w = await mountImport()
		w.findComponent(ImportMethodPicker).vm.$emit("select", "seed")
		await flushPromises()
		expect(surface.move).toHaveBeenCalledWith("/popup/import?option=seed&type=import&from=%2Fpopup%2Fregister")
		expect(holder.flow.selectedImportOption.value).toBeNull()
	})

	test("outside the panel, Full Backup opens in place", async () => {
		holder.flow.selectedImportOption.value = null
		const w = await mountImport()
		w.findComponent(ImportMethodPicker).vm.$emit("select", "full_backup")
		await flushPromises()

		expect(surface.move).not.toHaveBeenCalled()
		expect(holder.flow.selectedImportOption.value).toBe("full_backup")
	})
})

describe("popup import — in its own window", () => {
	test("opens with Full Backup chosen and the name carried from the panel", async () => {
		nav.query = { option: "full_backup", name: "Savings" }
		holder.flow.selectedImportOption.value = null
		await mountImport()

		expect(holder.flow.selectedImportOption.value).toBe("full_backup")
		expect(holder.flow.profileName.value).toBe("Savings")
	})

	test("the form's Back closes the window instead of showing the methods", async () => {
		surface.close.mockResolvedValue(true)
		const w = await mountImport()
		const back = w.findAll("button").find((b) => b.text() === "Back")
		if (!back) throw new Error("no Back button")
		await back.trigger("click")
		await flushPromises()

		expect(surface.close).toHaveBeenCalled()
		expect(holder.flow.handleBack).not.toHaveBeenCalled()
	})

	test("a finished restore releases the window before it shows the wallet", async () => {
		await mountImport()
		await holder.opts.completeImport({ id: "p1" })

		expect(surface.release).toHaveBeenCalledTimes(1)
		expect(nav.push).toHaveBeenCalledWith("/popup/general")
		expect(surface.release.mock.invocationCallOrder[0]).toBeLessThan(nav.push.mock.invocationCallOrder[0] ?? 0)
	})
})

describe("popup import — a completion the shell took over", () => {
	async function startHeld() {
		const wait = deferred<Awaited<ReturnType<typeof completeImportWithRecovery>>>()
		vi.mocked(completeImportWithRecovery).mockReturnValueOnce(wait.promise)
		const w = await mountImport()
		const done = holder.opts.completeImport({ id: "p1" })
		await flushPromises()
		return { w, wait, done }
	}

	test("a flow the shell ended while the page still shows releases no window, toasts nothing and routes nowhere", async () => {
		const { wait, done } = await startHeld()
		endOpeningFlows()
		wait.resolve("active")
		await done

		expect(surface.release).not.toHaveBeenCalled()
		expect(toast.open).not.toHaveBeenCalled()
		expect(nav.push).not.toHaveBeenCalled()
	})

	test("a page that went before its wait ended does nothing either", async () => {
		const { w, wait, done } = await startHeld()
		wrappers.splice(wrappers.indexOf(w), 1)
		w.unmount()
		wait.resolve("active")
		await done

		expect(surface.release).not.toHaveBeenCalled()
		expect(toast.open).not.toHaveBeenCalled()
		expect(nav.push).not.toHaveBeenCalled()
	})

	test("a page opened after the shell ended a flow completes as usual", async () => {
		endOpeningFlows()
		const { wait, done } = await startHeld()
		wait.resolve("active")
		await done

		expect(surface.release).toHaveBeenCalledTimes(1)
		expect(toast.open).toHaveBeenCalledWith({ kind: "success", label: "Profile imported" })
		expect(nav.push).toHaveBeenCalledWith("/popup/general")
	})
})

describe("popup import — the activation wait", () => {
	async function startImport() {
		const real = await vi.importActual<typeof import("@/composables/completeImportWithRecovery")>(
			"@/composables/completeImportWithRecovery",
		)
		vi.mocked(completeImportWithRecovery).mockImplementationOnce(real.completeImportWithRecovery)
		await mountImport()
		const appStore = useAppStore()
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const done = holder.opts.completeImport({ id: "p1" })
		await vi.advanceTimersByTimeAsync(0)
		return { appStore, done }
	}

	afterEach(() => {
		vi.useRealTimers()
	})

	test("a failure recorded for the imported profile ends the wait at once; another profile's does not", async () => {
		const { appStore, done } = await startImport()
		appStore.bootstrapFailure = { profileId: "p2", message: "theirs" }
		await vi.advanceTimersByTimeAsync(0)
		expect(boot.hydrate).not.toHaveBeenCalled()
		expect(nav.push).not.toHaveBeenCalled()

		appStore.bootstrapFailure = { profileId: "p1", message: "boom" }
		await done

		expect(boot.hydrate).toHaveBeenCalledTimes(1)
		expect(nav.push).toHaveBeenCalledWith("/popup/auth")
	})

	test("an activation of the imported profile shows the wallet with no recovery", async () => {
		const { appStore, done } = await startImport()
		appStore.profile = { id: "p1" } as typeof appStore.profile
		appStore.isLogined = true
		await done

		expect(boot.hydrate).not.toHaveBeenCalled()
		expect(nav.push).toHaveBeenCalledWith("/popup/general")
	})

	test("a page that went before the 30 s bound recovers nothing and routes nowhere", async () => {
		const { done } = await startImport()
		const w = wrappers.pop() as VueWrapper
		w.unmount()
		await vi.advanceTimersByTimeAsync(30_000)
		await done

		expect(boot.hydrate).not.toHaveBeenCalled()
		expect(nav.push).not.toHaveBeenCalled()
	})

	test("with no signal the wait holds to its 30 s bound, then recovers", async () => {
		const { done } = await startImport()
		await vi.advanceTimersByTimeAsync(29_999)
		expect(boot.hydrate).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(1)
		await done

		expect(boot.hydrate).toHaveBeenCalledTimes(1)
		expect(nav.push).toHaveBeenCalledWith("/popup/auth")
	})
})

describe("popup import — the profile-name field", () => {
	const NAME = "import-name-input"
	beforeEach(() => {
		holder.flow.nameFieldState.value = "shown"
		holder.flow.profileName.value = "Profile 2"
	})

	test("the field: testid root, placeholder, text type, no autofill hints, the prefill", async () => {
		const w = await mountImport()
		const input = nativeInput(w, NAME)
		expect(input.placeholder).toBe("My Profile")
		expect(input.type).toBe("text")
		expect(input.value).toBe("Profile 2")
		expectNativeAttrs(w, NAME, { autocomplete: null, autocapitalize: null, autocorrect: null })
	})

	test("typing is sanitized; a real paste is sanitized and capped at 32", async () => {
		const w = await mountImport()
		typeNow(nativeInput(w, NAME), "Bob<>!")
		expect(holder.flow.profileName.value).toBe("Bob")
		typeNow(nativeInput(w, NAME), "")
		expect(pasteInto(nativeInput(w, NAME), `Ali<ce>!${"x".repeat(40)}`)).toBe(true)
		expect(holder.flow.profileName.value).toBe(`Alice${"x".repeat(24)}`)
	})

	test("handleNameInput runs once per keystroke and already sees the typed name", async () => {
		const seen: string[] = []
		holder.flow.handleNameInput.mockImplementation(() => seen.push(holder.flow.profileName.value))
		const w = await mountImport()
		typeNow(nativeInput(w, NAME), "Carol")
		typeNow(nativeInput(w, NAME), "Carol D")
		expect(seen).toEqual(["Carol", "Carol D"])
	})

	test("an error shows the alert and aria-invalid; shakeName shakes the input's wrapper", async () => {
		const w = await mountImport()
		const shaker = () => w.get(`[data-testid="${NAME}"]`).element.parentElement as HTMLElement
		expect(w.find('[role="alert"]').exists()).toBe(false)
		expect(nativeInput(w, NAME).getAttribute("aria-invalid")).toBe("false")
		expect(shaker().className).not.toMatch(/shake/)
		holder.flow.nameError.value = "Profile name is required."
		holder.flow.shakeName.value = true
		await flushPromises()
		const alert = shaker().parentElement?.querySelector('[role="alert"]')
		expect(alert?.textContent?.trim()).toBe("Profile name is required.")
		expect(nativeInput(w, NAME).getAttribute("aria-invalid")).toBe("true")
		expect(shaker().className).toMatch(/shake/)
	})

	test("the flow's nameInputRef focuses the native input", async () => {
		const w = await mountImport()
		;(holder.flow.nameInputRef.value as unknown as { focus: () => void }).focus()
		expect(document.activeElement).toBe(nativeInput(w, NAME))
	})

	test("a name typed then Enter in the same task restores once, with that name already set", async () => {
		const seen: string[] = []
		holder.flow.restoreBackup.mockImplementation(() => seen.push(holder.flow.profileName.value))
		const w = await mountImport()
		typeNow(nativeInput(w, NAME), "Dana")
		enterOn(nativeInput(w, NAME))
		expect(seen).toEqual(["Dana"])
	})

	test.each(IGNORED_ENTERS)("a %s Enter in the name field restores nothing", async (_name, press) => {
		const w = await mountImport()
		press(nativeInput(w, NAME))
		await flushPromises()
		expect(holder.flow.restoreBackup).not.toHaveBeenCalled()
	})
})

type PopupCta = [text: string, testid: string | null, disabled: boolean, loading: string | null, variant: string | null]

/** Every bottom-bar button in order: the scroller holds the forms, so what sits outside it is the CTA bar. */
function popupCtas(w: VueWrapper): PopupCta[] {
	return w
		.findAll("button")
		.filter((b) => !b.element.closest('[data-testid="collapsing-hero-scroller"]'))
		.map((b) => [
			b.text(),
			b.attributes("data-testid") ?? null,
			(b.element as HTMLButtonElement).disabled,
			b.attributes("loading") ?? null,
			b.attributes("variant") ?? null,
		])
}

const ENCRYPTED = { name: "backup.txt", kind: "sealed", profileType: null, backup: "ciphertext" }
const PLAIN = { name: "backup.json", kind: "plain", profileType: "password", backup: { data: { profile: { name: "Main" } } } }
const BACK: PopupCta = ["Back", null, false, null, "cta_outline"]
const BACK_OFF: PopupCta = ["Back", null, true, null, "cta_outline"]
const IMPORT_MAIN: PopupCta = ["Import Main", "import-full-backup-submit-btn", false, null, "cta"]
const IMPORT_MAIN_OFF: PopupCta = ["Import Main", "import-full-backup-submit-btn", true, null, "cta"]
const IMPORTING: PopupCta = ["Importing…", "import-full-backup-submit-btn", true, null, "cta"]
const CONTINUE: PopupCta = ["Continue", "import-full-backup-continue-btn", false, null, "cta"]
const VIEW_ERRORS: PopupCta = ["View Errors", "import-full-backup-view-errors-btn", false, null, "cta_outline"]
const REUSE = (testid: string, disabled = false): PopupCta => ["Use a passkey I already have", testid, disabled, null, null]

type Flow = ReturnType<typeof makeFlow>
type FlowPatch = (f: Flow) => void

const POPUP_CTA_STATES: Array<[string, FlowPatch, PopupCta[]]> = [
	[
		"encrypted, no decryption password",
		(f) => {
			f.selectedBackup.value = ENCRYPTED as never
		},
		[["Decrypt Backup", "import-full-backup-decrypt-btn", true, null, "cta"], BACK],
	],
	[
		"encrypted, decryption password typed",
		(f) => {
			f.selectedBackup.value = ENCRYPTED as never
			f.decryptionPassword.value = "pw"
		},
		[["Decrypt Backup", "import-full-backup-decrypt-btn", false, null, "cta"], BACK],
	],
	["decrypted, status empty", () => {}, [IMPORT_MAIN, BACK]],
	[
		"plain backup, status null",
		(f) => {
			f.selectedBackup.value = PLAIN as never
			f.restoreStatus.value = null as never
		},
		[IMPORT_MAIN, BACK],
	],
	[
		"not allowed alone",
		(f) => {
			f.isAllowedToImportBackup.value = false
		},
		[IMPORT_MAIN_OFF, BACK],
	],
	[
		"failed alone",
		(f) => {
			f.restoreStatus.value = "failed"
		},
		[IMPORT_MAIN_OFF, BACK],
	],
	[
		"progress alone",
		(f) => {
			f.restoreStatus.value = "progress"
		},
		[IMPORTING, BACK_OFF],
	],
	[
		"progress with errors already logged",
		(f) => {
			f.restoreStatus.value = "progress"
			f.isRestoreHasErrors.value = true
		},
		[IMPORTING, BACK_OFF],
	],
	[
		"finished clean",
		(f) => {
			f.restoreStatus.value = "finished"
		},
		[["Finishing import…", null, true, "true", "cta"], BACK],
	],
	[
		"finished with errors",
		(f) => {
			f.restoreStatus.value = "finished"
			f.isRestoreHasErrors.value = true
		},
		[CONTINUE, VIEW_ERRORS, BACK],
	],
	[
		"finished with errors, Retry available",
		(f) => {
			f.restoreStatus.value = "finished"
			f.isRestoreHasErrors.value = true
			f.canRetryAccountState.value = true
		},
		[["Retry", "import-full-backup-retry-btn", false, null, "cta_outline"], CONTINUE, VIEW_ERRORS, BACK],
	],
	[
		"finished with errors, retrying",
		(f) => {
			f.restoreStatus.value = "finished"
			f.isRestoreHasErrors.value = true
			f.canRetryAccountState.value = true
			f.isRetryingAccountState.value = true
		},
		[
			["Retrying…", "import-full-backup-retry-btn", true, null, "cta_outline"],
			["Continue", "import-full-backup-continue-btn", true, null, "cta"],
			["View Errors", "import-full-backup-view-errors-btn", true, null, "cta_outline"],
			BACK_OFF,
		],
	],
	[
		"no backup chosen",
		(f) => {
			f.selectedBackup.value = null as never
		},
		[BACK],
	],
	[
		"seed, not allowed",
		(f) => {
			f.selectedImportOption.value = "seed"
			f.profileName.value = ""
		},
		[["Import Profile", "import-seed-submit-btn", true, null, "cta"], BACK],
	],
	[
		"seed, allowed",
		(f) => {
			f.selectedImportOption.value = "seed"
			f.profileName.value = ""
			f.isAllowedToImportBySeedPhrase.value = true
		},
		[["Import Profile", "import-seed-submit-btn", false, null, "cta"], BACK],
	],
	[
		"seed, importing (the popup's seed CTA has no importing gate)",
		(f) => {
			f.selectedImportOption.value = "seed"
			f.profileName.value = ""
			f.isAllowedToImportBySeedPhrase.value = true
			Object.assign(f, { isImporting: ref(true) })
		},
		[["Import Profile", "import-seed-submit-btn", false, null, "cta"], BACK],
	],
	[
		"seed on Passkey, named: the button names the profile and the link sits under it",
		(f) => {
			f.selectedImportOption.value = "seed"
			f.unlockMethod.value = "passkey"
			f.profileName.value = "Savings"
		},
		[["Import Savings", "import-seed-submit-btn", true, null, "cta"], REUSE("import-seed-passkey-reuse", true), BACK],
	],
	[
		"a backup restored on Passkey",
		(f) => {
			f.unlockMethod.value = "passkey"
		},
		[IMPORT_MAIN, REUSE("import-full-backup-passkey-reuse"), BACK],
	],
	[
		"a backup restored on Passkey, in progress",
		(f) => {
			f.unlockMethod.value = "passkey"
			f.restoreStatus.value = "progress"
		},
		[IMPORTING, REUSE("import-full-backup-passkey-reuse", true), BACK_OFF],
	],
]

describe("popup import — the CTA bar in each state", () => {
	test.each(POPUP_CTA_STATES)("%s", async (_, patch, expected) => {
		patch(holder.flow)
		const w = await mountImport()
		expect(popupCtas(w)).toEqual(expected)
	})

	test.each([
		["seed", "import-seed-passkey-reuse", "handleImportSeedWithExistingPasskey"],
		["full_backup", "import-full-backup-passkey-reuse", "restoreBackupWithExistingPasskey"],
	] as const)("on %s, the link asks a passkey the person already has", async (option, testid, handler) => {
		holder.flow.selectedImportOption.value = option
		holder.flow.unlockMethod.value = "passkey"
		holder.flow.isAllowedToImportBySeedPhrase.value = true
		const w = await mountImport()
		await w.get(`[data-testid="${testid}"]`).trigger("click")
		expect(holder.flow[handler]).toHaveBeenCalledOnce()
		expect(holder.flow.handleImportSeed).not.toHaveBeenCalled()
		expect(holder.flow.restoreBackup).not.toHaveBeenCalled()
	})
})

describe("popup import — the full backup's button names the profile the field holds", () => {
	test.each([
		["the backup's name, suffixed where taken", "Main 1", "Import Main 1"],
		["a name typed over it", "Osprey", "Import Osprey"],
		["an emptied field", "", "Import Profile"],
	])("%s", async (_, field, label) => {
		holder.flow.profileName.value = field
		const w = await mountImport()
		expect(w.get('[data-testid="import-full-backup-submit-btn"]').text()).toBe(label)
	})
})

describe("popup import — Enter runs the action the bar offers", () => {
	const nameInput = (w: VueWrapper) => w.get('[data-testid="import-name-input"] input').element

	test("Enter in the decryption password decrypts", async () => {
		holder.flow.selectedBackup.value = ENCRYPTED as never
		holder.flow.decryptionPassword.value = "pw"
		const w = await mountImport()
		enterOn(w.get('[data-testid="import-full-backup-decrypt-password-input"] input').element)
		await flushPromises()
		expect(holder.flow.decryptBackup).toHaveBeenCalledTimes(1)
		expect(holder.flow.restoreBackup).not.toHaveBeenCalled()
	})

	test("Enter after a failed restore restores nothing, as its button is disabled", async () => {
		holder.flow.nameFieldState.value = "shown"
		holder.flow.restoreStatus.value = "failed"
		const w = await mountImport()
		enterOn(nameInput(w))
		await flushPromises()
		expect(holder.flow.restoreBackup).not.toHaveBeenCalled()
	})

	test("Enter on an incomplete form restores nothing; completed, it restores once", async () => {
		holder.flow.nameFieldState.value = "shown"
		holder.flow.isAllowedToImportBackup.value = false
		const w = await mountImport()
		enterOn(nameInput(w))
		await flushPromises()
		expect(holder.flow.restoreBackup).not.toHaveBeenCalled()

		holder.flow.isAllowedToImportBackup.value = true
		await flushPromises()
		enterOn(nameInput(w))
		await flushPromises()
		expect(holder.flow.restoreBackup).toHaveBeenCalledTimes(1)
	})

	test("Enter during a restore runs nothing", async () => {
		holder.flow.nameFieldState.value = "shown"
		holder.flow.restoreStatus.value = "progress"
		const w = await mountImport()
		enterOn(nameInput(w))
		await flushPromises()
		expect(holder.flow.restoreBackup).not.toHaveBeenCalled()
		expect(holder.flow.decryptBackup).not.toHaveBeenCalled()
		expect(holder.flow.continueImport).not.toHaveBeenCalled()
	})

	test("Enter on the errors screen continues, and not while a Retry runs", async () => {
		holder.flow.nameFieldState.value = "shown"
		finishWithErrors()
		const w = await mountImport()
		enterOn(nameInput(w))
		await flushPromises()
		expect(holder.flow.continueImport).toHaveBeenCalledTimes(1)

		holder.flow.isRetryingAccountState.value = true
		await flushPromises()
		enterOn(nameInput(w))
		await flushPromises()
		expect(holder.flow.continueImport).toHaveBeenCalledTimes(1)
	})
})

const CTA_REFS = ["selectedBackup", "restoreStatus", "isAllowedToImportBackup", "isRestoreHasErrors", "isRetryingAccountState"] as const

/** Swaps the refs the CTA predicates read for delegating refs that log each read, in order. */
function logCtaReads(flow: Flow): string[] {
	const log: string[] = []
	const refs = flow as unknown as Record<string, { value: unknown }>
	for (const key of CTA_REFS) {
		const inner = refs[key]
		refs[key] = customRef(() => ({
			get() {
				log.push(key)
				return inner.value
			},
			set(v: unknown) {
				inner.value = v
			},
		}))
	}
	return log
}

// A branch the inline expression skips must stay unread: an eager read adds a render dependency.
describe("popup import — the CTA predicates read only what each branch reaches", () => {
	const FORM_PROPS = ["selectedBackup", "restoreStatus", "isRestoreHasErrors"]
	const DECRYPT_SHOWN = ["selectedBackup", "selectedBackup"]
	// Finishing, Continue and View Errors each read the status; none reaches the error flag unfinished.
	const UNFINISHED_LADDER_TAIL = ["restoreStatus", "restoreStatus", "restoreStatus"]
	test.each<[string, FlowPatch, string[]]>([
		[
			"encrypted, not decrypted (no profile type)",
			(f) => {
				f.selectedBackup.value = ENCRYPTED as never
			},
			[
				...FORM_PROPS,
				...DECRYPT_SHOWN,
				"selectedBackup", // restore shown: no profile type, so the status stays unread
				...UNFINISHED_LADDER_TAIL,
				"restoreStatus", // back blocked: not in progress, so the Retry flag is read
				"isRetryingAccountState",
			],
		],
		[
			"decrypted, not finished",
			() => {},
			[
				...FORM_PROPS,
				...DECRYPT_SHOWN,
				"selectedBackup", // restore shown
				"restoreStatus",
				"isAllowedToImportBackup", // restore blocked: allowed, so the status is read twice
				"restoreStatus",
				"restoreStatus",
				...UNFINISHED_LADDER_TAIL,
				"restoreStatus", // back blocked
				"isRetryingAccountState",
				"restoreStatus", // the restore label, rendered inside the Button, which reads the name field
			],
		],
		[
			"in progress",
			(f) => {
				f.restoreStatus.value = "progress"
			},
			[
				...FORM_PROPS,
				...DECRYPT_SHOWN,
				"selectedBackup", // restore shown
				"restoreStatus",
				"isAllowedToImportBackup", // restore blocked: stops at progress
				"restoreStatus",
				"restoreStatus",
				...UNFINISHED_LADDER_TAIL,
				"restoreStatus", // back blocked: in progress, so the Retry flag stays unread
				"restoreStatus", // the restore label
			],
		],
	])("%s", async (_, patch, expected) => {
		patch(holder.flow)
		const log = logCtaReads(holder.flow)
		await mountImport()
		expect(log).toEqual(expected)
	})
})
