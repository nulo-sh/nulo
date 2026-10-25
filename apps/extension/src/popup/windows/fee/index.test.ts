import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { JobCancelledError } from "@nulo/extension-messaging/errors"
import { flushPromises, mount } from "@vue/test-utils"
import { reactive, ref, type Ref } from "vue"
import { priceFake } from "../../../../tests/helpers/price-client-fake"
import { captureWindowDocument } from "@/utils/window-document"

// ── The request as the dApp's wire carried it: 32-byte hex fields, a CAIP account. ──

const OWNER = `0x${"0a".repeat(32)}`
const TOKEN = `0x${"3d".repeat(32)}`
const NETWORK = { id: "n1", chainId: 1, name: "Testnet" }
const SESSION = { profileId: "p1", dappMetadata: { name: "Aztec Swap", url: "https://swap.example.org" } }
const OPERATION = {
	kind: "aztec_sendTx",
	account: `aztec:1:${OWNER}`,
	exec: {
		calls: [
			{
				name: "swap_tokens",
				to: TOKEN,
				selector: "0x9a3f2c1b",
				type: "private",
				isStatic: false,
				hideMsgSender: false,
				args: [`0x${"2f".repeat(32)}`, `0x${"0".repeat(56)}017d7840`, `0x${"5e".repeat(32)}`],
			},
		],
	},
	opts: { from: OWNER },
}
const question = (over: Record<string, unknown> = {}) => ({
	feeQuestion: {
		fee: "21000000000000000",
		approved: "16000000000000000",
		payer: { type: "private_fpc", fpcId: "pfj-1", isProtocol: true },
		feeSettings: { paymentMethod: { kind: "fpc", fpcId: "pfj-1" } },
		...over,
	},
	operation: OPERATION,
	session: SESSION,
})

// ── Mock state ──

let payloadToLoad: unknown = null
let activeProfile: { id: string } | undefined = { id: "p1" }
const requestIdMock = ref<string | undefined>()
const payloadMock: Ref<unknown> = ref(null)
const dappMock = ref<unknown>(null)
const isCancelledMock = ref(false)
const rejectMock = vi.fn()
const resolveInteractionMock = vi.fn(async () => undefined)
const getGasBalancesMock = vi.fn(async () => ({ publicFeeJuice: "3000000000000000000", privateFeeJuice: "1250000000000000000" }))
const windowsRemoveMock = vi.fn(async () => undefined)
const getTokensMock = vi.fn(async (_profileId: string, _chainId: number): Promise<unknown[]> => [])
const tokenListeners = new Set<(token: { profileId: string }) => void>()
const tokenUpdated = {
	add: vi.fn((handler: (token: { profileId: string }) => void) => void tokenListeners.add(handler)),
	remove: vi.fn((handler: (token: { profileId: string }) => void) => void tokenListeners.delete(handler)),
}
const decodeGrantsMock = vi.fn(async (_interactionId: string): Promise<unknown[]> => [])
/** Set, the request's account read waits on it, so the operation stays unresolved. */
let accountReadGate: Promise<void> | undefined
const appStoreMock = reactive({ isSessionChecked: true, isLogined: true, pageAwaitingAuth: "" })

vi.mock("@/composables/useDappInteractionPayload", () => ({
	useDappInteractionPayload: vi.fn(() => ({
		requestId: requestIdMock,
		payload: payloadMock,
		dapp: dappMock,
		isCancelled: isCancelledMock,
		load: vi.fn(async () => {
			requestIdMock.value = "req-1"
			payloadMock.value = payloadToLoad
			dappMock.value = SESSION.dappMetadata
		}),
		reject: rejectMock,
	})),
}))
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: vi.fn(function () {
		return {
			getActiveProfile: async () => activeProfile,
			connect: vi.fn(),
			disconnect: vi.fn(),
			onActiveProfileChanged: { add: vi.fn() },
		}
	}),
}))
vi.mock("@/wallet/services/dapp-interaction/client", () => ({
	DappInteractionServiceClient: vi.fn(function () {
		return { connect: vi.fn(), disconnect: vi.fn(), resolveInteraction: resolveInteractionMock }
	}),
}))
vi.mock("@/wallet/services/execution/client", () => ({
	ExecutionServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			decodeCallsForDisplay: vi.fn(async () => []),
			decodeQuestionGrantsForDisplay: decodeGrantsMock,
			getGasBalances: getGasBalancesMock,
		}
	}),
}))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return { connect: vi.fn(), disconnect: vi.fn(), getTokens: getTokensMock, onTokenUpdated: tokenUpdated }
	}),
}))
vi.mock("@/wallet/services/account/client", () => ({
	AccountServiceClient: vi.fn(function () {
		return {
			getAccount: vi.fn(async (_p: string, chainId: number, address: string) => {
				await accountReadGate
				return { address, chainId, name: "Main" }
			}),
			disconnect: vi.fn(),
		}
	}),
}))
vi.mock("@/wallet/services/network/client", () => ({
	NetworkServiceClient: vi.fn(function () {
		return { getNetworks: vi.fn(async () => [NETWORK]), disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/price/client", async () => (await import("../../../../tests/helpers/price-client-fake")).priceClientModule())
vi.mock("@/stores/app.store", () => ({ useAppStore: () => appStoreMock }))
vi.mock("vue-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("vue-router")>()),
	useRouter: () => ({
		currentRoute: { value: { fullPath: "/windows/fee?requestId=req-1", query: { requestId: "req-1" } } },
		push: vi.fn(),
	}),
}))

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i />" },
	Skeleton: { template: '<i data-testid="skeleton" />' },
	Tooltip: { template: "<div><slot /></div>" },
	SectionLabel: { template: "<div />" },
	Button: {
		props: ["disabled", "loading"],
		emits: ["click"],
		template: `<button :data-testid="$attrs['data-testid']" :disabled="disabled || loading" @click="$emit('click', $event)"><slot /></button>`,
	},
	// The card's own rendering is pinned in its tests; here it shows which request it read and its fee slot.
	OperationCard: {
		props: ["op", "approvedAuthwits", "decodedAuthwits", "decodedGrants", "tokens"],
		template: `<div data-testid="execute-op-item" :data-op-kind="op.kind" :data-account="op.accountAddress"
			:data-authwits="(approvedAuthwits ?? []).map((a) => a.messageHash).join(',')"
			:data-decoded="[...(decodedAuthwits?.keys() ?? [])].join(',')"
			:data-grants="decodedGrants ? decodedGrants.map((g) => g.kind).join(',') : 'reading'"
			:data-tokens="(tokens ?? []).map((t) => t.symbol).join(',')"><slot name="fee" /></div>`,
	},
	SignerIdentityStrip: { template: '<div data-testid="signer-strip" />', props: ["signerAccounts", "signerNetworks", "status"] },
	DappIdentityBlock: {
		template: '<div data-testid="identity-block" />',
		props: ["dapp", "actionLabel"],
	},
	DappCancelledOverlay: { props: ["message"], template: `<div data-testid="dapp-cancelled-overlay" :data-message="message" />` },
}

import FeeWindow from "./index.vue"

let w: ReturnType<typeof mount> | undefined
const opened = async (payload: unknown = question()) => {
	payloadToLoad = payload
	w = mount(FeeWindow, { global: { stubs: STUBS } })
	await flushPromises()
	await flushPromises()
	return w
}
const byId = (id: string) => w!.find(`[data-testid="${id}"]`)
const confirm = () => byId("fee-confirm-btn")

beforeEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: chrome runtime stub for tests
	;(globalThis as any).chrome = {
		windows: { getCurrent: (_o: unknown, cb: (win: { id?: number }) => void) => cb({ id: 42 }), remove: windowsRemoveMock },
		runtime: { getURL: (p: string) => `chrome-extension://test/${p}` },
	}
	priceFake.reset(undefined)
	captureWindowDocument("#/windows/fee?requestId=r1")
})

afterEach(() => {
	w?.unmount()
	w = undefined
	activeProfile = { id: "p1" }
	requestIdMock.value = undefined
	payloadMock.value = null
	isCancelledMock.value = false
	Object.assign(appStoreMock, { isSessionChecked: true, isLogined: true, pageAwaitingAuth: "" })
	accountReadGate = undefined
	vi.clearAllMocks()
	captureWindowDocument("")
})

describe("the fee question window", () => {
	test("shows the approved request as it was, and only the fee block differs: the two figures, the payer and its balance", async () => {
		await opened()
		expect(byId("execute-op-item").attributes()).toMatchObject({ "data-op-kind": "aztec_sendTx", "data-account": OWNER })
		expect(byId("fee-raised-method").text()).toBe("Private Fee Juice")
		expect(byId("fee-raised-was").text()).toBe("Was ~0.016 FJ")
		expect(byId("fee-raised-now").text()).toBe("Now ~0.021 FJ")
		expect(byId("fee-raised-card").text()).toContain("1.25 FJ")
		expect(byId("fee-raised-priority").text()).toContain("Normal")
		expect(getGasBalancesMock).toHaveBeenCalledExactlyOnceWith("n1", OWNER, true)
		expect(confirm().text()).toBe("Send for ~0.021 FJ")
		expect(byId("dapp-approval-confirm-detail").exists()).toBe(false)
		expect(confirm().attributes("disabled")).toBeUndefined()
	})

	test("with a quote the card prices both figures; Confirm repeats the new one's dollars on its second line", async () => {
		priceFake.reset(2)
		await opened()
		expect(byId("fee-raised-now").text()).toBe("Now ~0.021 FJ ($0.042)")
		expect(confirm().text()).toBe("Send for ~0.021 FJ ($0.042)")
		expect(byId("dapp-approval-confirm-detail").text()).toBe("($0.042)")
		expect([priceFake.reads(), priceFake.refreshes()]).toEqual([1, 0])
		priceFake.reconnect()
		await flushPromises()
		expect([priceFake.reads(), priceFake.refreshes()]).toEqual([2, 0])
	})

	test("while the request's operation resolves, Confirm already names the new fee, off and with no price read", async () => {
		priceFake.reset(2)
		accountReadGate = new Promise(() => {})
		await opened()
		expect(byId("fee-raised-card").exists()).toBe(false)
		expect(confirm().text()).toBe("Send for ~0.021 FJ")
		expect(byId("dapp-approval-confirm-detail").exists()).toBe(false)
		expect(confirm().attributes("disabled")).toBeDefined()
		expect([priceFake.reads(), priceFake.refreshes()]).toEqual([0, 0])
	})

	test.each([
		["still checking its session", { isSessionChecked: false, isLogined: true }],
		["locked", { isSessionChecked: true, isLogined: false }],
	])("a window %s reads no price; one signed in reads the cache once, from its fee card", async (_case, session) => {
		priceFake.reset(2)
		Object.assign(appStoreMock, session)
		await opened()
		expect(byId("fee-raised-card").exists()).toBe(false)
		expect([priceFake.reads(), priceFake.refreshes()]).toEqual([0, 0])

		w!.unmount()
		Object.assign(appStoreMock, { isSessionChecked: true, isLogined: true })
		await opened()
		expect(byId("fee-raised-card").exists()).toBe(true)
		expect([priceFake.reads(), priceFake.refreshes()]).toEqual([1, 0])
	})

	test("the authorizations the approval window listed are listed again, each decoded on its consumer", async () => {
		const hash = `0x${"4c".repeat(32)}`
		const listed = [
			{
				consumer: TOKEN,
				caller: `0x${"7b".repeat(32)}`,
				selector: "0x1f2e3d4c",
				args: [OWNER],
				innerHash: `0x${"9a".repeat(32)}`,
				messageHash: hash,
			},
		]
		await opened(question({ discoveredAuthwits: listed }))
		expect(byId("execute-op-item").attributes()).toMatchObject({ "data-authwits": hash, "data-decoded": hash })

		w!.unmount()
		await opened()
		expect(byId("execute-op-item").attributes("data-authwits")).toBe("")
	})

	test("Send for answers yes and closes the window; nothing is rejected", async () => {
		await opened()
		await confirm().trigger("click")
		await flushPromises()
		expect(resolveInteractionMock).toHaveBeenCalledExactlyOnceWith("req-1", { accepted: true })
		expect(windowsRemoveMock).toHaveBeenCalledTimes(1)
		window.dispatchEvent(new Event("beforeunload"))
		expect(rejectMock).not.toHaveBeenCalled()
	})

	test("Reject answers no and accepts nothing", async () => {
		await opened()
		await byId("fee-reject-btn").trigger("click")
		await flushPromises()
		expect(rejectMock).toHaveBeenCalledExactlyOnceWith("User rejected", "reject")
		expect(resolveInteractionMock).not.toHaveBeenCalled()
		expect(windowsRemoveMock).toHaveBeenCalledTimes(1)
	})

	test("an app's claim to the account pays: no balance is read or shown, and no speed was picked", async () => {
		await opened(question({ payer: { type: "fj", isProtocol: false }, feeSettings: { paymentMethod: { kind: "embedded" } } }))
		expect(byId("fee-raised-method").text()).toBe("Public Fee Juice")
		expect(byId("fee-raised-card").text()).not.toContain("Available")
		expect(byId("fee-raised-priority").exists()).toBe(false)
		expect(getGasBalancesMock).not.toHaveBeenCalled()
		expect(confirm().attributes("disabled")).toBeUndefined()
	})

	test("a failed balance read shows a dash, never a zero", async () => {
		getGasBalancesMock.mockRejectedValueOnce(new Error("node down"))
		await opened()
		expect(byId("fee-raised-card").text()).toContain("— FJ")
	})

	test("a question the send no longer asks: the overlay, and Send for answers nothing", async () => {
		await opened()
		isCancelledMock.value = true
		await flushPromises()
		expect(byId("dapp-cancelled-overlay").exists()).toBe(true)
		expect(confirm().attributes("disabled")).toBeDefined()
		await (w!.vm as unknown as { accept: () => Promise<void> }).accept()
		expect(resolveInteractionMock).not.toHaveBeenCalled()
	})

	test("an accept the service refuses as cancelled shows the overlay, not an error", async () => {
		resolveInteractionMock.mockRejectedValueOnce(new JobCancelledError())
		await opened()
		await confirm().trigger("click")
		await flushPromises()
		expect(byId("dapp-cancelled-overlay").exists()).toBe(true)
		expect(windowsRemoveMock).not.toHaveBeenCalled()
	})

	test("another profile's question: the overlay, no balance read, and Send for stays off", async () => {
		activeProfile = { id: "p2" }
		await opened()
		expect(byId("dapp-cancelled-overlay").attributes("data-message")).toContain("different profile")
		expect(getGasBalancesMock).not.toHaveBeenCalled()
		expect(confirm().attributes("disabled")).toBeDefined()
	})
})

describe("the fee question window — a held send with a public grant", () => {
	const SPENDER = `0x${"1b".repeat(32)}`
	const GRANT = { kind: "call", caller: SPENDER, contract: TOKEN, method: "transfer_public_to_public", args: [OWNER, SPENDER, "1", "7"] }
	const field = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`
	const DECODED = {
		kind: "decoded",
		call: { to: TOKEN, name: "transfer_public_to_public", selector: "0xc47adea0", args: [OWNER, SPENDER, field(1n), field(7n)] },
		decoded: { kind: "decoded", contract: "Token", fn: "transfer_public_to_public", params: [] },
	}
	const granted = () => ({
		...question({ payer: { type: "fj", isProtocol: false }, feeSettings: { paymentMethod: { kind: "fj" } } }),
		operation: { kind: "send_transaction", account: `aztec:1:${OWNER}`, actions: [{ kind: "add_public_authwit", content: GRANT }] },
	})

	test("the card shows the grant as the wallet decoded it from the held request, and Send for answers yes", async () => {
		decodeGrantsMock.mockResolvedValueOnce([DECODED])
		await opened(granted())
		expect(decodeGrantsMock).toHaveBeenCalledExactlyOnceWith("req-1")
		expect(byId("execute-op-item").attributes("data-grants")).toBe("decoded")
		expect(byId("error-text").exists()).toBe(false)
		await confirm().trigger("click")
		await flushPromises()
		expect(resolveInteractionMock).toHaveBeenCalledExactlyOnceWith("req-1", { accepted: true })
	})

	test("while the grant decodes, Send for waits and accepts nothing", async () => {
		let release!: (value: unknown[]) => void
		decodeGrantsMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
		await opened(granted())
		expect(byId("execute-op-item").attributes("data-grants")).toBe("reading")
		expect(confirm().attributes("disabled")).toBeDefined()
		await (w!.vm as unknown as { accept: () => Promise<void> }).accept()
		expect(resolveInteractionMock).not.toHaveBeenCalled()
		release([DECODED])
		await flushPromises()
		expect(confirm().attributes("disabled")).toBeUndefined()
	})

	test.each([
		[
			"the wallet cannot read the grant",
			() => decodeGrantsMock.mockResolvedValueOnce([{ kind: "undecoded", reason: "unknown-contract" }]),
		],
		["the decode fails", () => decodeGrantsMock.mockRejectedValueOnce(new Error("pxe down"))],
	])("%s: the refusal row, and Send for stays off", async (_, arrange) => {
		arrange()
		await opened(granted())
		expect(byId("execute-op-item").attributes("data-grants")).toBe("undecoded")
		expect(byId("error-text").text()).toBe("Can't read the arguments")
		expect(confirm().attributes("disabled")).toBeDefined()
		await (w!.vm as unknown as { accept: () => Promise<void> }).accept()
		expect(resolveInteractionMock).not.toHaveBeenCalled()
	})

	test("a request without a grant decodes none", async () => {
		await opened()
		expect(decodeGrantsMock).not.toHaveBeenCalled()
		expect(confirm().attributes("disabled")).toBeUndefined()
	})
})

describe("the fee question window — the token list", () => {
	test("an update to the profile's tokens reads the list again; the window stops listening when it closes", async () => {
		getTokensMock.mockResolvedValueOnce([])
		await opened()
		expect(getTokensMock).toHaveBeenCalledExactlyOnceWith("p1", 1)
		getTokensMock.mockResolvedValueOnce([{ id: 1, chainId: 1, contract: TOKEN, name: "USD Coin", symbol: "USDC", decimals: 6 }])
		for (const listener of tokenListeners) listener({ profileId: "p1" })
		await flushPromises()
		expect(byId("execute-op-item").attributes("data-tokens")).toBe("USDC")
		w!.unmount()
		w = undefined
		expect(tokenListeners.size).toBe(0)
	})
})
