import { flushPromises } from "@vue/test-utils"
import { vi } from "vitest"
import { reactive, ref } from "vue"

/**
 * The world every dApp approval window suite mounts its window in: the interaction payload, the
 * profile client, the app store and the router, one ordered call log, and spies on the window's
 * `beforeunload` listener. A suite mocks each module in one line, with a literal path
 * (a top-level constant is still in its temporal dead zone when the hoisted factory runs):
 *
 * ```ts
 * vi.mock("@/stores/app.store", async () => (await import("<path to this file>")).appStoreModule)
 * ```
 *
 * The interaction client's decision method differs per window, so `interactionClientModule` takes
 * it. `installWindowSpies` runs in `beforeEach`; `resetWindowHarness` runs in `afterEach`, after
 * the suite has unmounted its window, so the window's listener removal goes through the spy.
 */

/** Ordered lifecycle log: the load-bearing pins assert exact sequences on it. */
export const callLog: string[] = []

const appStoreDefaults = () =>
	reactive({
		isSessionChecked: true,
		isLogined: true,
		account: { name: "TestAccount" },
		network: { name: "TestNet" },
		pageAwaitingAuth: "",
	} as {
		isSessionChecked: boolean
		isLogined: boolean
		account: { name: string }
		network: { name: string }
		pageAwaitingAuth: string
		networks?: unknown[]
	})

const freshState = () => ({
	requestId: ref<string | undefined>(undefined),
	dapp: ref<{ name: string; url: string } | null>(null),
	payload: ref<unknown>(null),
	isCancelled: ref(false),
	/** What the next payload load commits. */
	payloadToLoad: null as unknown,
	appStore: appStoreDefaults(),
	/** Settles the pending payload load: commits the request id first, then the payload and the dApp, as the real composable does. */
	resolveLoad: undefined as (() => void) | undefined,
	resolveProfile: undefined as ((profile: unknown) => void) | undefined,
	rejectProfile: undefined as ((error: Error) => void) | undefined,
})

/** The state a test reads and flips; replaced whole by `resetWindowHarness`. */
export const approval = freshState()

const loadInteractionPayloadMock = vi.fn(
	() =>
		new Promise<void>((resolve) => {
			approval.resolveLoad = () => {
				approval.requestId.value = "req-123"
				approval.dapp.value = { name: "Test DApp", url: "https://example.com" }
				approval.payload.value = approval.payloadToLoad
				resolve()
			}
		}),
)
/** Resolves at once, as the wallet taking the window's end. */
export const rejectViaInteractionServiceMock = vi.fn((reason: string, end?: string) => {
	callLog.push(`composableReject:${reason}:${end}`)
	return Promise.resolve()
})
export const getActiveProfileMock = vi.fn(
	() =>
		new Promise<unknown>((resolve, reject) => {
			approval.resolveProfile = resolve
			approval.rejectProfile = reject
		}),
)
const profileServiceConnectMock = vi.fn(() => callLog.push("profile.connect"))
const profileServiceDisconnectMock = vi.fn(() => callLog.push("profile.disconnect"))
const interactionServiceConnectMock = vi.fn(() => callLog.push("interaction.connect"))
const interactionServiceDisconnectMock = vi.fn(() => callLog.push("interaction.disconnect"))
export const onActiveProfileChangedAddMock = vi.fn()
export const windowsRemoveMock = vi.fn(() => callLog.push("windows.remove"))
const routerMock = {
	currentRoute: { value: { fullPath: "/windows/approval?requestId=req-route", query: { requestId: "req-route" } } },
	push: vi.fn(),
}

export const payloadModule = {
	useDappInteractionPayload: vi.fn(() => ({
		requestId: approval.requestId,
		payload: approval.payload,
		dapp: approval.dapp,
		isCancelled: approval.isCancelled,
		load: loadInteractionPayloadMock,
		reject: rejectViaInteractionServiceMock,
	})),
}

// The clients are constructed with `new`, which an arrow cannot be: hence function declarations.
function profileClient() {
	return {
		getActiveProfile: getActiveProfileMock,
		connect: profileServiceConnectMock,
		disconnect: profileServiceDisconnectMock,
		onActiveProfileChanged: { add: onActiveProfileChangedAddMock },
	}
}

export const profileClientModule = { ProfileServiceClient: vi.fn(profileClient) }

/** `decision` is called at each construction, so it may name the suite's own spies. */
export function interactionClientModule(decision: () => Record<string, unknown>) {
	function interactionClient() {
		return { connect: interactionServiceConnectMock, disconnect: interactionServiceDisconnectMock, ...decision() }
	}
	return { DappInteractionServiceClient: vi.fn(interactionClient) }
}

export const appStoreModule = { useAppStore: () => approval.appStore }

/** Spread over the real module (`importOriginal`), so the rest of `vue-router` stays real. */
export const routerModule = { useRouter: () => routerMock }

type WinListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => void
let nativeAdd: WinListener | undefined
let nativeRemove: WinListener | undefined
let addSpy = vi.fn<WinListener>()
let removeSpy = vi.fn<WinListener>()

export const beforeunloadAdds = () => addSpy.mock.calls.filter((c) => c[0] === "beforeunload").length
export const beforeunloadRemoves = () => removeSpy.mock.calls.filter((c) => c[0] === "beforeunload").length

/**
 * Spies on `window`'s listener calls, calling through so a test can deliver a synthetic
 * `beforeunload` to the live listener, and stubs the `chrome.windows` the shell closes through.
 */
export function installWindowSpies(): void {
	const add = window.addEventListener.bind(window)
	const remove = window.removeEventListener.bind(window)
	nativeAdd = add
	nativeRemove = remove
	addSpy = vi.fn<WinListener>((type, listener, options) => {
		if (type === "beforeunload") callLog.push("addEventListener:beforeunload")
		add(type, listener, options)
	})
	removeSpy = vi.fn<WinListener>((type, listener, options) => {
		if (type === "beforeunload") callLog.push("removeEventListener:beforeunload")
		remove(type, listener, options)
	})
	window.addEventListener = addSpy as unknown as typeof window.addEventListener
	window.removeEventListener = removeSpy as unknown as typeof window.removeEventListener
	Object.assign(globalThis, {
		chrome: {
			windows: {
				getCurrent: (_o: unknown, cb: (w: { id?: number }) => void) => cb({ id: 42 }),
				remove: windowsRemoveMock,
			},
		},
	})
}

export function resetWindowHarness(): void {
	if (nativeAdd) window.addEventListener = nativeAdd as unknown as typeof window.addEventListener
	if (nativeRemove) window.removeEventListener = nativeRemove as unknown as typeof window.removeEventListener
	callLog.length = 0
	Object.assign(approval, freshState())
	vi.clearAllMocks()
}

/** Drives init to completion: resolves the profile fetch, then the payload load. */
export async function completeInit(profile: { id: string } = { id: "p1" }): Promise<void> {
	await flushPromises()
	approval.resolveProfile?.(profile)
	await flushPromises()
	approval.resolveLoad?.()
	await flushPromises()
}
