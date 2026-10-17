/**
 * Frozen-oracle characterization tests for the execute approval window's SHELL
 * lifecycle — the connect/wait/redirect/init/beforeunload skeleton, the unmount
 * disconnect ORDER (4 services + listener last), the lazy execution-transport
 * asymmetry, and the wrong-profile overlay whose rejection is delivered via the
 * beforeunload route. These pin CURRENT behavior verbatim so the planned shell
 * extraction can be graded against them; they must pass unchanged before AND
 * after it. Spec: implementations-plan/archive/harden-quality-arc/window-characterization.md.
 *
 * Pins covered here (spec ids): A1 connect set+order (+ executionService NEVER
 * eager-connected) · A2 session gate · A3 auth redirect · A4 beforeunload-after-
 * init (incl. init-throw) · A5 unmount disconnect order · A6 closeWindow(true)
 * vs closeWindow() · A7 no-double-reject · B8 reject two-layer order · B9-mirror
 * (execute DOES bail on !requestId — the guard capabilities lacks) · C12
 * onActiveProfileChanged guard · D13 wrong-profile init check · D14 wrong-profile
 * rejection delivered on dismiss→unload · D16 connect/disconnect asymmetry.
 *
 * Out of scope (window-specific business pins D15: approve gating stack, fee
 * selection, token-metadata loading) — deferred; the network e2e dApp-execute
 * flow covers them end-to-end today.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { JobCancelledError } from "@nulo/extension-messaging/errors"
import { CLAIM_AND_END_SETUP_SELECTOR, FEE_JUICE_CONTRACT } from "@nulo/wallet-bridge"
import { flushPromises, mount } from "@vue/test-utils"
import { ref, type Ref } from "vue"
import {
	approval,
	beforeunloadAdds,
	beforeunloadRemoves,
	callLog,
	completeInit,
	getActiveProfileMock,
	installWindowSpies,
	onActiveProfileChangedAddMock,
	rejectViaInteractionServiceMock,
	resetWindowHarness,
	routerMock,
	routerPushMock,
	windowsRemoveMock,
} from "../../../../tests/helpers/approval-window-harness"

const approveInteractionMock = vi.fn(async () => undefined)
const executionServiceConnectMock = vi.fn(() => callLog.push("execution.connect"))
const executionServiceDisconnectMock = vi.fn(() => callLog.push("execution.disconnect"))
const tokenServiceConnectMock = vi.fn(() => callLog.push("token.connect"))
const getTokensMock = vi.fn(async (_profileId: string, _chainId: number): Promise<unknown[]> => [])
const tokenUpdatedMock = { add: vi.fn(), remove: vi.fn() }
const tokenServiceDisconnectMock = vi.fn(() => callLog.push("token.disconnect"))

// Transient clients constructed INSIDE init() — the wrong-profile throw happens
// BEFORE their construction, which D13 pins via these constructor spies.
// vi.hoisted: these are referenced DIRECTLY in vi.mock factory bodies (not
// inside closures), so they must initialize before the hoisted mocks evaluate.
const { accountServiceCtorMock, networkServiceCtorMock } = vi.hoisted(() => ({
	accountServiceCtorMock: vi.fn(function () {
		return { getAccount: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }
	}),
	networkServiceCtorMock: vi.fn(function () {
		return { getNetworks: vi.fn(async () => []), connect: vi.fn(), disconnect: vi.fn() }
	}),
}))

/** One entry per composable instance the window creates, in creation order:
 *  [0] fee estimates, [1] authorization previews. */
const feeMapInstances: Array<{
	opts: { estimate: (params: unknown, token: string, flowKey: string) => Promise<unknown>; onError?: (key: number, err: unknown) => void }
	api: { results: Ref<Record<number, unknown>>; estimate: ReturnType<typeof vi.fn>; handoffAll: ReturnType<typeof vi.fn> }
}> = []
vi.mock("@/composables/useFeeEstimationMap", () => ({
	useFeeEstimationMap: vi.fn((opts: unknown) => {
		const api = {
			results: ref({}),
			estimating: ref({}),
			estimate: vi.fn(),
			cancel: vi.fn(),
			cancelAll: vi.fn(),
			handoffAll: vi.fn(() => ({})),
			rearm: vi.fn(),
			dispose: vi.fn(),
		}
		feeMapInstances.push({ opts: opts as never, api: api as never })
		return api
	}),
}))
const estimateOperationFeeMock = vi.fn(async () => undefined)
const decodeGrantsForDisplayMock = vi.fn(async (): Promise<unknown[]> => [])
const previewOperationAuthwitsMock = vi.fn(async () => undefined)

const toastMocks = vi.hoisted(() => ({ openToast: vi.fn() }))
vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: toastMocks.openToast }),
}))

vi.mock("@/wallet/services/execution/client", () => ({
	ExecutionServiceClient: vi.fn(function () {
		return {
			connect: executionServiceConnectMock,
			disconnect: executionServiceDisconnectMock,
			estimateOperationFee: estimateOperationFeeMock,
			previewOperationAuthwits: previewOperationAuthwitsMock,
			decodeCallsForDisplay: vi.fn(async () => []),
			decodeGrantsForDisplay: decodeGrantsForDisplayMock,
			cancelEstimate: vi.fn(async () => undefined),
		}
	}),
}))

vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return {
			connect: tokenServiceConnectMock,
			disconnect: tokenServiceDisconnectMock,
			previewTokenMetadata: vi.fn(async () => undefined),
			getTokens: getTokensMock,
			onTokenUpdated: tokenUpdatedMock,
		}
	}),
}))

vi.mock("@/wallet/services/account/client", () => ({
	AccountServiceClient: accountServiceCtorMock,
}))

vi.mock("@/wallet/services/network/client", () => ({
	NetworkServiceClient: networkServiceCtorMock,
}))

vi.mock("@/wallet/services/transaction/client", () => ({
	OriginType: { UI: "ui", DAPP: "dapp" },
}))

vi.mock(
	"@/composables/useDappInteractionPayload",
	async () => (await import("../../../../tests/helpers/approval-window-harness")).payloadModule,
)
vi.mock("@/composables/useDappHostname", async () => (await import("../../../../tests/helpers/approval-window-harness")).hostnameModule)
vi.mock(
	"@/wallet/services/profile/client",
	async () => (await import("../../../../tests/helpers/approval-window-harness")).profileClientModule,
)
vi.mock("@/wallet/services/dapp-interaction/client", async () =>
	(await import("../../../../tests/helpers/approval-window-harness")).interactionClientModule(() => ({
		approveInteraction: approveInteractionMock,
	})),
)
vi.mock("@/stores/app.store", async () => (await import("../../../../tests/helpers/approval-window-harness")).appStoreModule)
vi.mock("vue-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("vue-router")>()),
	...(await import("../../../../tests/helpers/approval-window-harness")).routerModule,
}))

beforeEach(() => {
	installWindowSpies()
	Object.assign(chrome, { runtime: { getURL: (p: string) => `chrome-extension://test/${p}` } })
})

let w: ReturnType<typeof factory> | undefined

afterEach(() => {
	// Unmount first, so the window's listener removal goes through the spy.
	w?.unmount()
	w = undefined
	resetWindowHarness()
	feeMapInstances.length = 0
})

// ── Stubs (children flattened; overlay stub re-emits dismiss on click) ──

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i />" },
	Tooltip: { template: "<div><slot /></div>" },
	Button: {
		props: ["disabled", "loading"],
		emits: ["click"],
		template: `
			<button
				:data-testid="$attrs['data-testid']"
				:disabled="disabled || loading"
				@click="$emit('click', $event)"
			>
				<slot />
			</button>
		`,
	},
	SectionLabel: { template: "<div />" },
	OperationCard: { template: "<div />" },
	SignerIdentityStrip: { template: '<div data-testid="signer-strip" />', props: ["signerAccounts", "signerNetworks", "status"] },
	DappIdentityBlock: {
		template: '<div data-testid="identity-block" />',
		props: ["dapp", "hostname", "hostnameSuspicious", "actionLabel"],
	},
	DappCancelledOverlay: {
		props: ["message"],
		emits: ["dismiss"],
		template: `<div data-testid="dapp-cancelled-overlay" :data-message="message" @click="$emit('dismiss')" />`,
	},
}

// Lazy import after vi.mock hoist
import Execute from "./index.vue"
import { rawNotice } from "./call-surface"

const factory = () => mount(Execute, { global: { stubs: STUBS } })

type ExecVm = {
	reject: () => Promise<void>
	approve: () => Promise<void>
	closeWindow: (interactionCompleted?: boolean) => void
	isWrongProfile: boolean
	initComplete: boolean
	operations: unknown[]
}

/** One executable operation: fee settled, so neither the fee gate nor the
 *  empty-operations gate trips — the state both cancellation pins need. */
const makeExecutableOp = () => ({
	kind: "send_transaction",
	feeSettings: { paymentMethod: { kind: "sponsored_fpc" } },
	network: { chainId: 1, name: "TestNet" },
	account: { address: "0x1", chainId: 1, name: "TestAccount" },
})

/** Payload whose session belongs to a DIFFERENT profile than the active one. */
const wrongProfilePayload = () => ({
	session: { profileId: "p-OTHER", dappMetadata: { name: "Test DApp", url: "https://example.com" } },
	params: { operations: [] },
})

describe("execute window — shell lifecycle frozen oracle", () => {
	test("A1: onMounted eager-connects exactly profile → interaction → token; execution NEVER", async () => {
		w = factory()
		await flushPromises()
		expect(callLog.filter((c) => c.endsWith(".connect"))).toEqual(["profile.connect", "interaction.connect", "token.connect"])
		// The execution transport opens lazily on first request (fee estimation);
		// an eager connect here would change WHEN that transport opens. D16.
		expect(executionServiceConnectMock).not.toHaveBeenCalled()
	})

	test("A2: session gate — init and beforeunload wait for isSessionChecked", async () => {
		approval.appStore.isSessionChecked = false
		w = factory()
		await flushPromises()
		expect(getActiveProfileMock).not.toHaveBeenCalled()
		expect(beforeunloadAdds()).toBe(0)
		approval.appStore.isSessionChecked = true
		await flushPromises()
		expect(getActiveProfileMock).toHaveBeenCalledTimes(1)
	})

	test("A3: auth redirect short-circuits — pageAwaitingAuth set, no init, no beforeunload", async () => {
		approval.appStore.isLogined = false
		w = factory()
		await flushPromises()
		expect(approval.appStore.pageAwaitingAuth).toBe(routerMock.currentRoute.value.fullPath)
		expect(routerPushMock).toHaveBeenCalledWith({ path: "/popup/auth" })
		expect(getActiveProfileMock).not.toHaveBeenCalled()
		expect(beforeunloadAdds()).toBe(0)
	})

	test("A4: beforeunload is added AFTER init resolves — exactly once", async () => {
		w = factory()
		await flushPromises()
		expect(beforeunloadAdds()).toBe(0)
		approval.resolveProfile?.({ id: "p1" })
		await flushPromises()
		expect(beforeunloadAdds()).toBe(0)
		approval.resolveLoad?.()
		await flushPromises()
		expect(beforeunloadAdds()).toBe(1)
	})

	test("A4: beforeunload is STILL added when init throws internally", async () => {
		w = factory()
		await flushPromises()
		approval.rejectProfile?.(new Error("profile-fetch-failed"))
		await flushPromises()
		expect(beforeunloadAdds()).toBe(1)
		expect(w.find('[data-testid="error-text"]').exists()).toBe(true)
	})

	test("A5/D16: unmount disconnect ORDER verbatim — profile, interaction, execution, token, listener LAST", async () => {
		w = factory()
		await completeInit()
		callLog.length = 0
		w.unmount()
		w = undefined
		// executionService.disconnect IS here even though it was never eager-connected:
		// it tears down a possibly-lazily-opened fee-estimation transport. Not dead code.
		expect(callLog).toEqual([
			"profile.disconnect",
			"interaction.disconnect",
			"execution.disconnect",
			"token.disconnect",
			"removeEventListener:beforeunload",
		])
		expect(executionServiceConnectMock).not.toHaveBeenCalled()
	})

	test("A6: closeWindow(true) removes the beforeunload listener; closeWindow() keeps it; both close", async () => {
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as ExecVm
		vm.closeWindow()
		expect(beforeunloadRemoves()).toBe(0)
		expect(windowsRemoveMock).toHaveBeenCalledTimes(1)
		vm.closeWindow(true)
		expect(beforeunloadRemoves()).toBe(1)
		expect(windowsRemoveMock).toHaveBeenCalledTimes(2)
	})

	test("A7: no double-reject — a decided reject detaches the listener before the window unloads", async () => {
		w = factory()
		await completeInit()
		await (w.vm as unknown as ExecVm).reject()
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledTimes(1)
		window.dispatchEvent(new Event("beforeunload"))
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledTimes(1)
	})

	test("B8: window-local reject() = composable reject THEN closeWindow(true) — order pinned", async () => {
		w = factory()
		await completeInit()
		callLog.length = 0
		await (w.vm as unknown as ExecVm).reject()
		expect(callLog).toEqual(["composableReject:User rejected", "removeEventListener:beforeunload", "windows.remove"])
	})

	test("B9-mirror: reject() with NO requestId is fully inert (the guard capabilities lacks)", async () => {
		// execute's reject() bails on `isInteractionCancelled || !requestId` BEFORE
		// touching the composable or the window — the exact clause capabilities'
		// reject() drops (implementations-plan/archive/harden-quality-arc/window-characterization.md § 6.5). Pinned from both sides.
		w = factory()
		await flushPromises()
		expect(approval.requestId.value).toBeUndefined()
		await (w.vm as unknown as ExecVm).reject()
		expect(rejectViaInteractionServiceMock).not.toHaveBeenCalled()
		expect(beforeunloadRemoves()).toBe(0)
		expect(windowsRemoveMock).not.toHaveBeenCalled()
	})

	test("C12: onActiveProfileChanged — undefined or different id rejects; same id is a no-op", async () => {
		w = factory()
		expect(onActiveProfileChangedAddMock).toHaveBeenCalledTimes(1)
		const handler = onActiveProfileChangedAddMock.mock.calls[0][0] as (p?: { id: string }) => void
		await completeInit({ id: "p1" })
		handler({ id: "p1" })
		await flushPromises()
		expect(rejectViaInteractionServiceMock).not.toHaveBeenCalled()
		expect(windowsRemoveMock).not.toHaveBeenCalled()
		handler({ id: "p-other" })
		await flushPromises()
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledTimes(1)
		handler(undefined)
		await flushPromises()
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledTimes(2)
	})

	test("D13: wrong-profile init check — overlay wins, initComplete stays false, beforeunload still added", async () => {
		approval.payloadToLoad = wrongProfilePayload()
		w = factory()
		await completeInit({ id: "p1" })
		const vm = w.vm as unknown as ExecVm
		expect(vm.isWrongProfile).toBe(true)
		expect(vm.initComplete).toBe(false)
		// The throw happens BEFORE the transient account/network clients are built.
		expect(accountServiceCtorMock).not.toHaveBeenCalled()
		expect(networkServiceCtorMock).not.toHaveBeenCalled()
		// init's catch also set the generic error, but the wrong-profile overlay
		// wins the template precedence chain.
		const overlay = w.find('[data-testid="dapp-cancelled-overlay"]')
		expect(overlay.exists()).toBe(true)
		expect(overlay.attributes("data-message")).toContain("different profile")
		// The request must still be rejectable on close.
		expect(beforeunloadAdds()).toBe(1)
	})

	test("init throwing AFTER the account/network clients are built disconnects both", async () => {
		// Same profile (construction proceeds), then an unknown op kind throws inside
		// the ops loop — after `new AccountServiceClient()` / `new NetworkServiceClient()`.
		// Pre-fix the disconnect ran only on the success path, leaking both ports.
		approval.payloadToLoad = {
			session: { profileId: "p1", dappMetadata: { name: "D", url: "https://x" } },
			params: { operations: [{ kind: "definitely_not_a_valid_kind", chain: "eip155:1" }] },
		}
		w = factory()
		await completeInit({ id: "p1" })

		expect(accountServiceCtorMock).toHaveBeenCalledTimes(1)
		expect(networkServiceCtorMock).toHaveBeenCalledTimes(1)
		const acct = accountServiceCtorMock.mock.results[0]?.value as { disconnect: ReturnType<typeof vi.fn> }
		const net = networkServiceCtorMock.mock.results[0]?.value as { disconnect: ReturnType<typeof vi.fn> }
		expect(acct.disconnect).toHaveBeenCalledTimes(1)
		expect(net.disconnect).toHaveBeenCalledTimes(1)
	})

	test("D14: wrong-profile rejection is delivered on dismiss → unload, not inline", async () => {
		approval.payloadToLoad = wrongProfilePayload()
		w = factory()
		await completeInit({ id: "p1" })
		// No rejection has happened yet — the overlay is just showing.
		expect(rejectViaInteractionServiceMock).not.toHaveBeenCalled()
		callLog.length = 0
		// OK on the overlay → closeWindow() with NO arg → listener stays attached.
		await w.find('[data-testid="dapp-cancelled-overlay"]').trigger("click")
		expect(windowsRemoveMock).toHaveBeenCalledTimes(1)
		expect(beforeunloadRemoves()).toBe(0)
		// The real window would now unload; the still-attached handler delivers
		// the rejection (requestId was set by load() before the profile check).
		window.dispatchEvent(new Event("beforeunload"))
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledWith("User rejected")
		expect(callLog).toEqual(["windows.remove", "composableReject:User rejected", "removeEventListener:beforeunload", "windows.remove"])
	})
})

describe("execute window — dApp cancellation state", () => {
	test("the cancelled state renders the overlay (no error banner)", async () => {
		// The minimal harness keeps Confirm disabled via its other gates, so
		// this pin owns only the overlay half; the raced-approve pin below is
		// what discriminates the cancelled path end to end.
		w = factory()
		await completeInit()
		expect(w!.find('[data-testid="dapp-cancelled-overlay"]').exists()).toBe(false)

		approval.isCancelled.value = true
		await flushPromises()
		expect(w!.find('[data-testid="dapp-cancelled-overlay"]').exists()).toBe(true)
		expect(w!.find('[data-testid="error-text"]').exists()).toBe(false)
	})

	test("cancellation flips a genuinely ENABLED Confirm to disabled (the binding's own term)", async () => {
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as ExecVm
		vm.operations = [makeExecutableOp()]
		vm.initComplete = true
		feeMapInstances[0]!.api.results.value = { 0: { maxFee: "800" } }
		await flushPromises()
		const confirm = () => w!.find('[data-testid="execute-confirm-btn"]')
		expect(confirm().attributes("disabled")).toBeUndefined()

		approval.isCancelled.value = true
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeDefined()
	})

	test("a raced approve refused with JobCancelledError classifies as CANCELLED, not an error", async () => {
		// The dApp cancelled while the click was in flight and the broadcast
		// never reached this popup: the typed service refusal alone must land
		// the window in the cancelled UI — overlay up, no error banner.
		approveInteractionMock.mockRejectedValueOnce(new JobCancelledError())
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as ExecVm
		vm.operations = [makeExecutableOp()]
		vm.initComplete = true
		feeMapInstances[0]!.api.results.value = { 0: { maxFee: "800" } }
		await flushPromises()

		await vm.approve()
		await flushPromises()
		expect(w!.find('[data-testid="dapp-cancelled-overlay"]').exists()).toBe(true)
		expect(w!.find('[data-testid="error-text"]').exists()).toBe(false)
	})
})

// ── Seam pins — pre-extraction, byte-identical
//    across the refactor commits: init resolves operations SEQUENTIALLY (op N+1's
//    lookups start only after op N resolved), commits operations/accounts and
//    flips `initComplete` only AFTER the loop, then prefetches register_token
//    metadata with the loading flag cleared in a `finally` even on failure. ──

describe("execute window — init sequencing pins", () => {
	const NETWORK = { id: "n1", chainId: 1, name: "TestNet" }
	const account = (address: string) => ({ address, chainId: 1, name: `acct-${address}` })
	const twoOpsPayload = () => ({
		session: { profileId: "p1", dappMetadata: { name: "Test DApp", url: "https://example.com" } },
		params: {
			operations: [
				{ kind: "register_token", account: "aztec:1:0xaaa", address: "0xtok" },
				{ kind: "send_transaction", account: "aztec:1:0xbbb", calls: [] },
			],
		},
	})

	test("operations resolve one at a time: the second op's lookups wait for the first to resolve", async () => {
		const order: string[] = []
		let releaseFirstAccount!: () => void
		const firstAccount = new Promise<unknown>((resolve) => {
			releaseFirstAccount = () => resolve(account("0xaaa"))
		})
		accountServiceCtorMock.mockImplementationOnce(function () {
			return {
				getAccount: vi.fn((_p: string, _c: number, address: string) => {
					order.push(`getAccount:${address}`)
					return address === "0xaaa" ? firstAccount : Promise.resolve(account(address))
				}),
				connect: vi.fn(),
				disconnect: vi.fn(),
			}
		})
		networkServiceCtorMock.mockImplementationOnce(function () {
			return { getNetworks: vi.fn(async () => [NETWORK]), connect: vi.fn(), disconnect: vi.fn() }
		} as never)
		approval.payloadToLoad = twoOpsPayload()
		w = factory()
		await completeInit()
		// The first op is parked on its account lookup; the second has not started.
		expect(order).toEqual(["getAccount:0xaaa"])
		const vm = w.vm as unknown as ExecVm
		expect(vm.initComplete).toBe(false)
		releaseFirstAccount()
		await flushPromises()
		expect(order).toEqual(["getAccount:0xaaa", "getAccount:0xbbb"])
		expect(vm.operations).toHaveLength(2)
		expect(vm.initComplete).toBe(true)
	})

	test("register_token metadata is prefetched AFTER the commit, and the loading flag clears in finally on failure", async () => {
		accountServiceCtorMock.mockImplementationOnce(function () {
			return {
				getAccount: vi.fn(async (_p: string, _c: number, address: string) => account(address)),
				connect: vi.fn(),
				disconnect: vi.fn(),
			}
		})
		networkServiceCtorMock.mockImplementationOnce(function () {
			return { getNetworks: vi.fn(async () => [NETWORK]), connect: vi.fn(), disconnect: vi.fn() }
		} as never)
		approval.payloadToLoad = twoOpsPayload()
		const warned = vi.spyOn(console, "warn").mockImplementation(() => {})
		try {
			w = factory()
			await completeInit()
			const vm = w.vm as unknown as ExecVm & { tokenMetadataLoading: boolean; tokenMetadataError: Map<string, string> }
			expect(vm.initComplete).toBe(true)
			// The mocked TokenServiceClient's previewTokenMetadata resolves undefined →
			// the per-op catch records an error; the finally clears the flag.
			expect(vm.tokenMetadataLoading).toBe(false)
			expect(vm.tokenMetadataError.get("0xtok")).toBeDefined()
			const message = "[Execute] previewTokenMetadata failed for 0xtok"
			expect(warned.mock.calls.filter(([m]) => m === message)).toEqual([[message, { error: expect.any(TypeError) }]])
		} finally {
			warned.mockRestore()
		}
	})
})

// ── A dApp-requested self-pay at the popup boundary: the parent drafts it with NO fee
//    settings (the locked card supplies them only once a verified balance can pay), and
//    approve holds until they exist — so an empty, failed or delayed balance read never
//    leaves Confirm live over nothing. ──
describe("execute window — a dApp-requested self-pay", () => {
	const NETWORK = { id: "n1", chainId: 1, name: "TestNet" }
	const OWNER = "0xabc"
	const payloadWith = (exec: Record<string, unknown>) => ({
		session: { profileId: "p1", dappMetadata: { name: "Test DApp", url: "https://example.com" } },
		params: { operations: [{ kind: "aztec_sendTx", account: "aztec:1:0xabc", exec, opts: { from: OWNER } }] },
	})
	const resolvable = () => {
		accountServiceCtorMock.mockImplementationOnce(function () {
			return {
				getAccount: vi.fn(async (_p: string, _c: number, address: string) => ({ address, chainId: 1, name: `acct-${address}` })),
				connect: vi.fn(),
				disconnect: vi.fn(),
			}
		})
		networkServiceCtorMock.mockImplementationOnce(function () {
			return { getNetworks: vi.fn(async () => [NETWORK]), connect: vi.fn(), disconnect: vi.fn() }
		} as never)
	}

	test("drafted with no fee settings; approve executes nothing until the card supplies Fee Juice", async () => {
		resolvable()
		approval.payloadToLoad = payloadWith({ calls: [{ name: "transfer", to: "0xtok", selector: "0x1", args: [] }], feePayer: OWNER })
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as ExecVm & { handleFeeUpdate: (index: number, value: unknown) => void }
		expect(vm.initComplete).toBe(true)
		expect((vm.operations[0] as { feeSettings?: unknown }).feeSettings).toBeUndefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()
		vm.handleFeeUpdate(0, { paymentMethod: { kind: "fj" } })
		feeMapInstances[0]!.api.results.value = { 0: { maxFee: "800" } }
		await vm.approve()
		expect(approveInteractionMock).toHaveBeenCalledTimes(1)
	})

	test("a payer that carries its payment is still pre-filled embedded", async () => {
		resolvable()
		approval.payloadToLoad = payloadWith({ calls: [], feePayer: "0xfpc" })
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as ExecVm
		expect((vm.operations[0] as { feeSettings?: unknown }).feeSettings).toEqual({ paymentMethod: { kind: "embedded" } })
	})
})

// ── Approval binding: the popup sends per-index deltas (fee choice + the SW's own
//    ids), never operations, an origin, a token interface or a hash list; estimates
//    and previews run BY REFERENCE to the stored request. ──
describe("execute window — approval envelope", () => {
	const NETWORK = { id: "n1", chainId: 1, name: "TestNet" }
	const OWNER = "0xabc"
	const resolvable = () => {
		accountServiceCtorMock.mockImplementationOnce(function () {
			return {
				getAccount: vi.fn(async (_p: string, _c: number, address: string) => ({ address, chainId: 1, name: `acct-${address}` })),
				connect: vi.fn(),
				disconnect: vi.fn(),
			}
		})
		networkServiceCtorMock.mockImplementationOnce(function () {
			return { getNetworks: vi.fn(async () => [NETWORK]), connect: vi.fn(), disconnect: vi.fn() }
		} as never)
	}
	const payload = () => ({
		session: { profileId: "p1", dappMetadata: { name: "Test DApp", url: "https://example.com" } },
		params: {
			operations: [
				{ kind: "aztec_sendTx", account: `aztec:1:${OWNER}`, exec: { calls: [] }, opts: { from: OWNER } },
				{
					kind: "aztec_sendTx",
					account: `aztec:1:${OWNER}`,
					exec: { calls: [] },
					opts: { from: OWNER },
					executionMode: "default_entrypoint",
				},
				{ kind: "register_token", account: `aztec:1:${OWNER}`, address: "0xtok" },
			],
		},
	})

	test("approve sends deltas only: feeSettings for send-likes, the SW's estimate/preview ids, nothing else", async () => {
		resolvable()
		approval.payloadToLoad = payload()
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as ExecVm & { handleFeeUpdate: (index: number, value: unknown) => void }
		vm.handleFeeUpdate(0, { paymentMethod: { kind: "fj" } })
		feeMapInstances[0]!.api.results.value = { 0: { maxFee: "800", estimateId: "est-0", previewId: "est-0" } }
		feeMapInstances[1]!.api.results.value = { 1: { previewId: "pv-1", discoveredAuthwits: [] } }
		await vm.approve()
		expect(approveInteractionMock).toHaveBeenCalledTimes(1)
		const [id, deltas] = (approveInteractionMock.mock.calls[0] as unknown[]) ?? []
		expect(id).toBe("req-123")
		expect(deltas).toEqual([
			{ feeSettings: { paymentMethod: { kind: "fj" } }, estimateId: "est-0", previewId: "est-0", feeCeiling: "800" },
			{ feeSettings: { paymentMethod: { kind: "embedded" } }, estimateId: undefined, previewId: "pv-1", feeCeiling: undefined },
			{ feeSettings: undefined, estimateId: undefined, previewId: undefined, feeCeiling: undefined },
		])
		expect((approveInteractionMock.mock.calls[0] as unknown[]).length).toBe(2)
		expect(feeMapInstances[0]!.api.handoffAll).toHaveBeenCalledTimes(1)
		expect(feeMapInstances[1]!.api.handoffAll).toHaveBeenCalledTimes(1)
	})

	test("a fee choice the card withdraws disables Confirm, and the pick that replaces it is what approval sends", async () => {
		resolvable()
		approval.payloadToLoad = payload()
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as ExecVm & { handleFeeUpdate: (index: number, value: unknown) => void }
		const confirm = () => w!.find('[data-testid="execute-confirm-btn"]')
		feeMapInstances[0]!.api.results.value = { 0: { maxFee: "800" } }
		vm.handleFeeUpdate(0, { paymentMethod: { kind: "fpc", fpcId: "s1" } })
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()

		vm.handleFeeUpdate(0, undefined)
		await flushPromises()
		expect((vm.operations[0] as { feeSettings?: unknown }).feeSettings).toBeUndefined()
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()

		vm.handleFeeUpdate(0, { paymentMethod: { kind: "fj" } })
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
		await vm.approve()
		const deltas = (approveInteractionMock.mock.calls[0] as unknown[] | undefined)?.[1] as Array<{ feeSettings?: unknown }>
		expect(deltas[0]?.feeSettings).toEqual({ paymentMethod: { kind: "fj" } })
	})

	test("the preview is scheduled at init for default_entrypoint operations only, and both slots estimate by reference", async () => {
		resolvable()
		approval.payloadToLoad = payload()
		w = factory()
		await completeInit()
		const [fees, previews] = feeMapInstances
		expect(previews!.api.estimate).toHaveBeenCalledExactlyOnceWith(1, { index: 1 })
		expect(fees!.api.estimate).not.toHaveBeenCalled()

		await fees!.opts.estimate({ index: 0, feeSettings: { paymentMethod: { kind: "fj" } } }, "tok-a", "flow-a")
		expect(estimateOperationFeeMock).toHaveBeenCalledExactlyOnceWith("req-123", 0, { paymentMethod: { kind: "fj" } }, "tok-a", "flow-a")
		await previews!.opts.estimate({ index: 1 }, "tok-b", "flow-b")
		expect(previewOperationAuthwitsMock).toHaveBeenCalledExactlyOnceWith("req-123", 1, "tok-b", "flow-b")
	})
})

// ── An operation whose fee the app pays: the window estimates it once, only to check the app's fee
//    contract, and holds Confirm only when that contract is proven unable to pay. ──
describe("execute window — an operation the app pays for", () => {
	const NETWORK = { id: "n1", chainId: 1, name: "TestNet" }
	const OWNER = `0x${"0a".repeat(32)}`
	const APP_FPC = `0x${"0f".repeat(32)}`
	const EMBEDDED = { paymentMethod: { kind: "embedded" } }
	const resolvable = () => {
		accountServiceCtorMock.mockImplementationOnce(function () {
			return {
				getAccount: vi.fn(async (_p: string, _c: number, address: string) => ({ address, chainId: 1, name: `acct-${address}` })),
				connect: vi.fn(),
				disconnect: vi.fn(),
			}
		})
		networkServiceCtorMock.mockImplementationOnce(function () {
			return { getNetworks: vi.fn(async () => [NETWORK]), connect: vi.fn(), disconnect: vi.fn() }
		} as never)
	}
	const appPaid = { kind: "aztec_sendTx", account: `aztec:1:${OWNER}`, exec: { calls: [], feePayer: APP_FPC }, opts: { from: OWNER } }
	async function opened(op: object = appPaid) {
		resolvable()
		approval.payloadToLoad = {
			session: { profileId: "p1", dappMetadata: { name: "Test DApp", url: "https://example.com" } },
			params: { operations: [op] },
		}
		w = factory()
		await completeInit()
		return { vm: w.vm as unknown as ExecVm, fees: feeMapInstances[0]!, confirm: () => w!.find('[data-testid="execute-confirm-btn"]') }
	}
	const verdict = (provenShort: boolean) => ({ 0: { maxFee: "1", appPayerFunding: { address: APP_FPC, funded: false, provenShort } } })

	test("is estimated once at init with the app's own payment", async () => {
		const { fees } = await opened()
		expect(fees.api.estimate).toHaveBeenCalledExactlyOnceWith(0, { index: 0, feeSettings: EMBEDDED })
	})

	test("a fee contract proven unable to pay holds Confirm, and approve sends nothing", async () => {
		const { vm, fees, confirm } = await opened()
		fees.api.results.value = verdict(true)
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()
	})

	test("an estimate whose payer is the account, read short of the fee, holds Confirm the same way", async () => {
		const { vm, fees, confirm } = await opened()
		fees.api.results.value = { 0: { maxFee: "800", feeJuiceShortfall: { maxFee: "800", balance: "799" } } }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()
	})

	test("a shortfall already shown holds Confirm while its replacement estimate runs", async () => {
		const { vm, fees, confirm } = await opened()
		const api = fees.api as typeof fees.api & { estimating: Ref<Record<number, boolean>> }
		api.results.value = { 0: { maxFee: "800", feeJuiceShortfall: { maxFee: "800", balance: "799" } } }
		await flushPromises()
		api.results.value = { 0: null }
		api.estimating.value = { 0: true }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()

		api.results.value = { 0: { maxFee: "700" } }
		api.estimating.value = { 0: false }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
	})

	test("a replacement estimate that fails releases the hold: a failed read is no refusal", async () => {
		const { fees, confirm } = await opened()
		const api = fees.api as typeof fees.api & { estimating: Ref<Record<number, boolean>> }
		api.results.value = verdict(true)
		await flushPromises()
		api.results.value = { 0: null }
		api.estimating.value = { 0: false }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
	})

	test("a short read the transaction could still fund leaves Confirm as today", async () => {
		const { vm, fees, confirm } = await opened()
		fees.api.results.value = verdict(false)
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
		await vm.approve()
		expect(approveInteractionMock).toHaveBeenCalledTimes(1)
	})

	test("a failed check is unknown, never a refusal: no toast", async () => {
		const { fees } = await opened()
		toastMocks.openToast.mockClear()
		fees.opts.onError?.(0, new Error("node down"))
		expect(toastMocks.openToast).not.toHaveBeenCalled()
	})

	// The app's own fee settings as the wallet-sdk serializes them: each bigint a decimal string.
	const withAppFee = (gasSettings: object) => ({ ...appPaid, opts: { from: OWNER, fee: { gasSettings } } })
	const CAP = { feePerDaGas: "1200000000", feePerL2Gas: "1200000000" }

	test.each([
		["its own cap", { maxFeesPerGas: CAP }],
		["its own priority fee", { maxPriorityFeesPerGas: { feePerDaGas: "300000000", feePerL2Gas: "300000000" } }],
	])("an app that set %s: Confirm waits for the figure, and approve sends nothing until it lands", async (_case, gas) => {
		const { vm, fees, confirm } = await opened(withAppFee(gas))
		const api = fees.api as typeof fees.api & { estimating: Ref<Record<number, boolean>> }
		api.estimating.value = { 0: true }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()

		api.results.value = { 0: { maxFee: "16000000000000000", maxFeeFormatted: "0.016" } }
		api.estimating.value = { 0: false }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
		await vm.approve()
		expect(approveInteractionMock).toHaveBeenCalledTimes(1)
	})

	test("an app that set its own cap on a send the person pays: Confirm waits for the figure", async () => {
		const personPaid = { ...withAppFee({ maxFeesPerGas: CAP }), exec: { calls: [] } }
		const { vm, fees, confirm } = await opened(personPaid)
		const api = fees.api as typeof fees.api & { estimating: Ref<Record<number, boolean>> }
		;(vm as unknown as { handleFeeUpdate: (index: number, value: unknown) => void }).handleFeeUpdate(0, {
			paymentMethod: { kind: "fj" },
		})
		api.estimating.value = { 0: true }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()

		api.results.value = { 0: { maxFee: "16000000000000000", maxFeeFormatted: "0.016" } }
		api.estimating.value = { 0: false }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
		await vm.approve()
		expect(approveInteractionMock).toHaveBeenCalledTimes(1)
	})

	test("an app that set its own cap: a failed estimate keeps Confirm off", async () => {
		const { vm, fees, confirm } = await opened(withAppFee({ maxFeesPerGas: CAP }))
		const api = fees.api as typeof fees.api & { estimating: Ref<Record<number, boolean>> }
		api.results.value = { 0: null }
		api.estimating.value = { 0: false }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()
	})

	test("an app that set nothing: Confirm never waits for the figure", async () => {
		const { vm, fees, confirm } = await opened()
		const api = fees.api as typeof fees.api & { estimating: Ref<Record<number, boolean>> }
		api.estimating.value = { 0: true }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
		await vm.approve()
		expect(approveInteractionMock).toHaveBeenCalledTimes(1)
	})

	// The app's own payment claiming Fee Juice to the account, as the wire carries the claim call.
	const CLAIM = {
		name: "claim_and_end_setup",
		to: FEE_JUICE_CONTRACT,
		selector: CLAIM_AND_END_SETUP_SELECTOR,
		type: "private",
		isStatic: false,
		hideMsgSender: false,
		args: [OWNER, "100000000000000000000", `0x${"2a".repeat(32)}`, `0x${"01".repeat(32)}`],
	}
	const claimToAccount = { ...appPaid, exec: { calls: [CLAIM], feePayer: OWNER } }

	test("an app's claim to the account: Confirm waits for the figure, a failed one toasts, and the figure is what approval carries", async () => {
		const { vm, fees, confirm } = await opened(claimToAccount)
		const api = fees.api as typeof fees.api & { estimating: Ref<Record<number, boolean>> }
		toastMocks.openToast.mockClear()
		fees.opts.onError?.(0, new Error("node down"))
		api.results.value = { 0: null }
		await flushPromises()
		expect(toastMocks.openToast).toHaveBeenCalledWith({ kind: "error", label: "Couldn't estimate fee. Try again." })
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()

		api.results.value = { 0: { maxFee: "16000000000000000", maxFeeFormatted: "0.016" } }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
		await vm.approve()
		const deltas = (approveInteractionMock.mock.calls[0] as unknown[] | undefined)?.[1] as Array<{ feeCeiling?: string }>
		expect(deltas[0]?.feeCeiling).toBe("16000000000000000")
	})

	test("a fee the wallet picks: Confirm waits for its figure, and a failed estimate keeps it off until a new one lands", async () => {
		const { vm, fees, confirm } = await opened({ ...appPaid, exec: { calls: [] } })
		const api = fees.api as typeof fees.api & { estimating: Ref<Record<number, boolean>> }
		;(vm as unknown as { handleFeeUpdate: (index: number, value: unknown) => void }).handleFeeUpdate(0, {
			paymentMethod: { kind: "fj" },
		})
		api.estimating.value = { 0: true }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeDefined()

		api.results.value = { 0: null }
		api.estimating.value = { 0: false }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()

		api.results.value = { 0: { maxFee: "21000000000000000", maxFeeFormatted: "0.021" } }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
		await vm.approve()
		expect(approveInteractionMock).toHaveBeenCalledTimes(1)
	})

	test("a sponsor picked in the window pays, not the person: Confirm does not wait, and a failed estimate leaves it on", async () => {
		const { vm, fees, confirm } = await opened({ ...appPaid, exec: { calls: [] } })
		const api = fees.api as typeof fees.api & { estimating: Ref<Record<number, boolean>> }
		const card = w!.findComponent(STUBS.OperationCard)
		;(vm as unknown as { handleFeeUpdate: (index: number, value: unknown) => void }).handleFeeUpdate(0, {
			paymentMethod: { kind: "fpc", fpcId: "s1" },
		})
		card.vm.$emit("updatePayer", 0, { type: "private_fpc" })
		api.results.value = { 0: null }
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeDefined()

		card.vm.$emit("updatePayer", 0, { type: "fpc" })
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
		await vm.approve()
		expect(approveInteractionMock).toHaveBeenCalledTimes(1)
	})
})

// ── The two send kinds as a dApp's wire carries them: 32-byte hex fields, CAIP accounts. Each draft
//    is pinned whole, so neither kind can drop a field or fall through to the unknown-kind throw. ──
describe("execute window — send drafts from wire-shaped requests", () => {
	const NETWORK = { id: "n1", chainId: 1, name: "TestNet" }
	const OWNER = `0x${"0a".repeat(32)}`
	const OTHER = `0x${"0b".repeat(32)}`
	const FPC = `0x${"0f".repeat(32)}`
	const CALL = {
		name: "transfer_in_private",
		to: `0x${"1c".repeat(32)}`,
		selector: "0x9a3b2c1d",
		args: [`0x${"00".repeat(31)}05`, `0x${"2d".repeat(32)}`],
	}
	const acct = (address: string) => ({ address, chainId: 1, name: `acct-${address.slice(0, 6)}` })
	const resolvable = () => {
		accountServiceCtorMock.mockImplementationOnce(function () {
			return {
				getAccount: vi.fn(async (_p: string, _c: number, address: string) => acct(address)),
				connect: vi.fn(),
				disconnect: vi.fn(),
			}
		})
		networkServiceCtorMock.mockImplementationOnce(function () {
			return { getNetworks: vi.fn(async () => [NETWORK]), connect: vi.fn(), disconnect: vi.fn() }
		} as never)
	}
	const EMBEDDED = { paymentMethod: { kind: "embedded" } }
	const REQUESTS = [
		{
			kind: "aztec_sendTx",
			account: `aztec:1:${OWNER}`,
			exec: { calls: [CALL] },
			opts: { from: OWNER },
			executionMode: "default_entrypoint",
		},
		{ kind: "aztec_sendTx", account: `aztec:1:${OWNER}`, exec: { calls: [CALL], feePayer: FPC }, opts: { from: OWNER } },
		{ kind: "aztec_sendTx", account: `aztec:1:${OTHER}`, exec: { calls: [CALL], feePayer: OTHER }, opts: { from: OTHER } },
		{ kind: "send_transaction", account: `aztec:1:${OWNER}`, calls: [CALL], fee: { embeddedFeePayment: { address: FPC } } },
		{ kind: "send_transaction", account: `aztec:1:${OTHER}`, calls: [CALL] },
	]

	test("each request drafts with its network, account and fee settings; the signers are deduplicated", async () => {
		resolvable()
		approval.payloadToLoad = {
			session: { profileId: "p1", dappMetadata: { name: "Test DApp", url: "https://example.com" } },
			params: { operations: REQUESTS },
		}
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as ExecVm & { accounts: unknown[] }
		expect(vm.initComplete).toBe(true)
		const drafted = (request: (typeof REQUESTS)[number], feeSettings: unknown) => {
			const address = request.account.slice("aztec:1:".length)
			return { ...request, network: NETWORK, networkId: "n1", account: acct(address), accountAddress: address, feeSettings }
		}
		expect(vm.operations).toEqual([
			drafted(REQUESTS[0], EMBEDDED),
			drafted(REQUESTS[1], EMBEDDED),
			drafted(REQUESTS[2], undefined),
			drafted(REQUESTS[3], EMBEDDED),
			drafted(REQUESTS[4], undefined),
		])
		expect(vm.accounts).toEqual([acct(OWNER), acct(OTHER)])
	})
})

// ── A public grant: Confirm waits for its decode, and a grant the wallet cannot read refuses the
//    request through the footer's error row. ──
describe("execute window — a public grant", () => {
	const NETWORK = { id: "n1", chainId: 1, name: "TestNet" }
	const OWNER = "0x0a1b2c0000000000000000000000000000000000000000000000000000009c2d"
	const SPENDER = "0x1b5c090000000000000000000000000000000000000000000000000000083d4e"
	const TOKEN = "0x2f4e8100000000000000000000000000000000000000000000000000000077a0"
	const GRANT = {
		kind: "call",
		caller: SPENDER,
		contract: TOKEN,
		method: "transfer_public_to_public",
		args: [OWNER, SPENDER, "1", "7"],
	}
	const field = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`
	const DECODED = {
		kind: "decoded",
		call: { to: TOKEN, name: "transfer_public_to_public", selector: "0xc47adea0", args: [OWNER, SPENDER, field(1n), field(7n)] },
		decoded: {
			kind: "decoded",
			contract: "Token",
			fn: "transfer_public_to_public",
			params: [
				{ name: "from", value: { kind: "address", value: OWNER } },
				{ name: "to", value: { kind: "address", value: SPENDER } },
				{ name: "amount", value: { kind: "integer", value: "1" } },
				{ name: "_nonce", value: { kind: "field", value: field(7n) } },
			],
		},
	}
	async function opened() {
		accountServiceCtorMock.mockImplementationOnce(function () {
			return {
				getAccount: vi.fn(async (_p: string, _c: number, address: string) => ({ address, chainId: 1, name: "Main" })),
				connect: vi.fn(),
				disconnect: vi.fn(),
			}
		})
		networkServiceCtorMock.mockImplementationOnce(function () {
			return { getNetworks: vi.fn(async () => [NETWORK]), connect: vi.fn(), disconnect: vi.fn() }
		} as never)
		approval.payloadToLoad = {
			session: { profileId: "p1", dappMetadata: { name: "Test DApp", url: "https://example.com" } },
			params: {
				operations: [
					{ kind: "send_transaction", account: `aztec:1:${OWNER}`, actions: [{ kind: "add_public_authwit", content: GRANT }] },
				],
			},
		}
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as ExecVm & {
			handleFeeUpdate: (index: number, value: unknown) => void
			grantRefusal?: { title: string; tooltip: string }
		}
		vm.handleFeeUpdate(0, { paymentMethod: { kind: "fj" } })
		feeMapInstances[0]!.api.results.value = { 0: { maxFee: "800" } }
		await flushPromises()
		return { vm, confirm: () => w!.find('[data-testid="execute-confirm-btn"]'), error: () => w!.find('[data-testid="error-text"]') }
	}

	test("a grant that decodes enables Confirm, and approval goes through", async () => {
		decodeGrantsForDisplayMock.mockResolvedValueOnce([DECODED])
		const { vm, confirm, error } = await opened()
		expect(decodeGrantsForDisplayMock).toHaveBeenCalledExactlyOnceWith("req-123", 0)
		expect(confirm().attributes("disabled")).toBeUndefined()
		expect(error().exists()).toBe(false)
		await vm.approve()
		expect(approveInteractionMock).toHaveBeenCalledTimes(1)
	})

	test("an update to the profile's tokens reads the list again; the window stops listening when it closes", async () => {
		decodeGrantsForDisplayMock.mockResolvedValueOnce([DECODED])
		await opened()
		expect(getTokensMock).toHaveBeenCalledExactlyOnceWith("p1", 1)
		const [[listener]] = tokenUpdatedMock.add.mock.calls as [[(token: { profileId: string }) => void]]
		listener({ profileId: "p2" })
		listener({ profileId: "p1" })
		await flushPromises()
		expect(getTokensMock).toHaveBeenCalledTimes(2)
		w!.unmount()
		w = undefined
		expect(tokenUpdatedMock.remove).toHaveBeenCalledExactlyOnceWith(listener)
	})

	test("while the grant decodes, Confirm waits and approve sends nothing", async () => {
		let release!: (value: unknown[]) => void
		decodeGrantsForDisplayMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
		const { vm, confirm } = await opened()
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()
		release([DECODED])
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
	})

	test.each([
		["unknown-contract", () => decodeGrantsForDisplayMock.mockResolvedValueOnce([{ kind: "undecoded", reason: "unknown-contract" }])],
		["unknown-function", () => decodeGrantsForDisplayMock.mockResolvedValueOnce([{ kind: "undecoded", reason: "unknown-function" }])],
		["arguments", () => decodeGrantsForDisplayMock.mockResolvedValueOnce([{ kind: "undecoded", reason: "arguments" }])],
		["unavailable", () => decodeGrantsForDisplayMock.mockRejectedValueOnce(new Error("decoder unreachable"))],
	] as const)("a grant that reads as %s shows the error row, holds Confirm, and approve refuses", async (reason, arrange) => {
		arrange()
		const { vm, confirm, error } = await opened()
		expect(error().text()).toBe("Can't read the arguments")
		expect(vm.grantRefusal?.tooltip).toBe(rawNotice(reason))
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()
	})

	test("a batch that comes back short refuses the grant it left out", async () => {
		decodeGrantsForDisplayMock.mockResolvedValueOnce([])
		const { vm, confirm, error } = await opened()
		expect(error().text()).toBe("Can't read the arguments")
		expect(vm.grantRefusal?.tooltip).toBe(rawNotice("unavailable"))
		expect(confirm().attributes("disabled")).toBeDefined()
	})

	test("a fee change clears the window's error but not the grant's refusal", async () => {
		decodeGrantsForDisplayMock.mockResolvedValueOnce([{ kind: "undecoded", reason: "arguments" }])
		const { vm, confirm, error } = await opened()
		vm.handleFeeUpdate(0, { paymentMethod: { kind: "fpc", fpcId: "s1" } })
		await flushPromises()
		expect(error().text()).toBe("Can't read the arguments")
		expect(confirm().attributes("disabled")).toBeDefined()
		await vm.approve()
		expect(approveInteractionMock).not.toHaveBeenCalled()
	})
})
