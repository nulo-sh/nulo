/**
 * What the execute window says a transaction's fee costs the account, against an `aztec_sendTx`
 * shaped as the wire carries it: full-length addresses and 32-byte hex fields. The real fee card
 * and its "You pay" readout are mounted; the service clients and the price feed are fakes.
 */
import { config, flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { createPinia } from "pinia"
import { Skeleton } from "@nulo/design"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import DottedTerm from "@/components/composite/DottedTerm.vue"
import { GLOSSARY } from "@/utils/glossary"
import OperationCard from "./OperationCard.vue"

const mocks = vi.hoisted(() => ({
	getGasBalances: vi.fn(),
	getFpcs: vi.fn(),
	storageSet: vi.fn(async (_items: Record<string, unknown>) => {}),
	saveFeePick: vi.fn(async () => true),
	feeJuiceUsd: undefined as number | undefined,
}))

vi.mock("@/utils/core", () => ({ managers: { profile: { saveFeePick: mocks.saveFeePick } } }))

// Vitest 4 requires `function` expressions for mocks instantiated with `new`.
vi.mock("@/wallet/services/execution/client", () => ({
	ExecutionServiceClient: vi.fn().mockImplementation(function () {
		return { connect: vi.fn(), disconnect: vi.fn(), getGasBalances: mocks.getGasBalances }
	}),
}))
vi.mock("@/wallet/services/token-balance/client", () => ({
	TokenBalanceServiceClient: vi.fn().mockImplementation(function () {
		return {
			onTokenBalanceAdded: { add: vi.fn(), remove: vi.fn() },
			onTokenBalanceUpdated: { add: vi.fn(), remove: vi.fn() },
			onTokenBalanceDeleted: { add: vi.fn(), remove: vi.fn() },
			connect: vi.fn(),
			disconnect: vi.fn(),
			getTokenBalances: vi.fn(async () => []),
		}
	}),
}))
vi.mock("@/wallet/services/fpc/client", () => ({
	FpcServiceClient: vi.fn().mockImplementation(function () {
		return {
			onFpcDeleted: { add: vi.fn(), remove: vi.fn() },
			onFpcUpdated: { add: vi.fn(), remove: vi.fn() },
			connect: vi.fn(),
			disconnect: vi.fn(),
			getFpcs: mocks.getFpcs,
		}
	}),
	FpcType: { DefaultSponsoredFpc: 1, PrivateFpc: 2 },
}))
vi.mock("@/wallet/services/transaction/client", () => ({
	TransactionServiceClient: vi.fn().mockImplementation(function () {
		return {
			connect: vi.fn(),
			disconnect: vi.fn(),
			onTransactionAdded: { add: vi.fn(), remove: vi.fn() },
			onTransactionUpdated: { add: vi.fn(), remove: vi.fn() },
		}
	}),
}))
vi.mock("@/composables/usePrices", async () => {
	const { computed } = await import("vue")
	return {
		usePrices: () => ({
			feeJuiceQuote: computed(() => (mocks.feeJuiceUsd === undefined ? undefined : { usd: mocks.feeJuiceUsd })),
			dispose: vi.fn(),
		}),
	}
})
// The real store's setup opens chrome.storage; the card reads only these.
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ accounts: [], profile: undefined }) }))

/** An `Fr` as the wire carries it. */
const field = (n: bigint): string => `0x${n.toString(16).padStart(64, "0")}`
const OWNER = field(0x1e5c41d4b7e6f8a9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3n)
const TOKEN = field(0x2b8f00c6d7e1a9b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1n)
const RECIPIENT = field(0x0c3d5e7f91a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4n)
const NULO_SPONSOR = { id: "s1", type: 1, name: "Sponsored", isProtocol: true }
const HAND_ADDED = { id: "s2", type: 1, name: "Dev sponsor", isProtocol: false }

/** 3.577824 FJ; at $0.06 per FJ, $0.215. */
const ESTIMATE = {
	maxFee: "3577824000000000000",
	maxFeeFormatted: "3.577824",
	gasDetails: { l2GasLimit: 1, daGasLimit: 1, teardownL2GasLimit: 0, teardownDaGasLimit: 0, feePerL2Gas: "1", feePerDaGas: "1" },
}

const sendTx = (exec: Record<string, unknown> = {}) => ({
	kind: "aztec_sendTx" as const,
	networkId: "net-1",
	accountAddress: OWNER,
	account: { name: "Account 1", address: OWNER, profileId: "p1", chainId: 11155111, index: 0, type: 0, visible: true },
	network: { id: "net-1", chainId: 11155111, name: "Testnet" },
	exec: {
		calls: [
			{
				name: "transfer_in_public",
				to: TOKEN,
				selector: "0x3a4b5c6d",
				type: "public",
				isStatic: false,
				hideMsgSender: false,
				args: [OWNER, RECIPIENT, field(25_000_000n), field(0n)],
			},
		],
		...exec,
	},
	opts: { from: OWNER },
})

const stubs = {
	AddressDisplay: { props: ["address"], template: "<span>{{ address }}</span>" },
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: true,
	Tooltip: { template: "<div><slot /></div>" },
	Dropdown: { template: '<div><slot name="trigger" /><slot name="popup" /></div>' },
	DropdownRoot: { template: '<div><slot name="trigger" /><slot name="popup" /></div>' },
	DropdownItem: { template: '<button v-bind="$attrs"><slot /></button>', inheritAttrs: false },
	FeePriorityRow: true,
}

let mounted: VueWrapper | undefined
const mountCard = async (op: unknown, dapp?: { name: string }) => {
	const w = mount(OperationCard, {
		props: { op: op as never, index: 0, profile: { id: "p1", name: "Main" } as never, feeEstimate: ESTIMATE, dapp },
		global: { stubs },
	})
	mounted = w
	await flushPromises()
	return w
}
/** The fee settings the card last handed the window. */
const lastSettings = (w: VueWrapper) => w.emitted<[number, unknown]>("updateFeeSettings")?.at(-1)?.[1]

/** The text a screen reader reaches in `el`: every text node outside an `aria-hidden` subtree. */
function spokenText(el: Element): string {
	const clone = el.cloneNode(true) as Element
	for (const node of clone.querySelectorAll('[aria-hidden="true"]')) node.remove()
	const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT)
	const parts: string[] = []
	while (walker.nextNode()) {
		const text = walker.currentNode.textContent?.trim()
		if (text) parts.push(text)
	}
	return parts.join(" ")
}

/** The text a sighted person reads in `el`: a dotted term's always-mounted definition is `hidden`. */
function shownText(el: Element): string {
	const clone = el.cloneNode(true) as Element
	for (const node of clone.querySelectorAll("[hidden]")) node.remove()
	return clone.textContent?.replace(/\s+/g, " ").trim() ?? ""
}

const fee = (w: VueWrapper) => w.find('[data-testid="fee-settings-card"]')

beforeEach(() => {
	config.global.plugins = [createPinia()]
	// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
	;(globalThis as any).chrome = {
		// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
		...(globalThis as any).chrome,
		storage: { local: { get: async () => ({}), set: mocks.storageSet, remove: async () => {}, getKeys: async () => [] } },
	}
	mocks.storageSet.mockClear()
	mocks.getGasBalances.mockReset().mockResolvedValue({ publicFeeJuice: "5000000000000000000", privateFeeJuice: null })
	mocks.getFpcs.mockReset().mockResolvedValue([NULO_SPONSOR])
	mocks.feeJuiceUsd = 0.06
})

afterEach(() => {
	mounted?.unmount()
	mounted = undefined
	config.global.plugins = []
})

describe("OperationCard — who pays a wire-shaped transaction's fee", () => {
	test("the app names the account as payer: locked to Public Fee Juice, and the account pays the fee", async () => {
		const w = await mountCard(sendTx({ feePayer: OWNER }))
		const locked = w.find('[data-testid="send-fee-locked"]')
		expect(locked.findAll("span").map((n) => n.text())).toEqual(["Fee", "Public Fee Juice · set by the app"])
		expect(fee(w).text()).toContain("You pay")
		expect(fee(w).text()).toContain("~3.577824 FJ")
		expect(w.find('[data-testid="fee-estimate-usd"]').text()).toBe("($0.215)")
		expect(fee(w).find("s").exists()).toBe(false)
		expect(fee(w).text()).not.toContain("Nothing")
	})

	test("Nulo's sponsor pays: Nothing, the fee struck through, and one sentence for a screen reader", async () => {
		const w = await mountCard(sendTx())
		expect(w.find('[data-testid="send-fee-method-trigger"]').text()).toContain("Sponsored")
		expect(fee(w).text()).toContain("Nothing")
		expect(fee(w).find("s").text()).toBe("~3.577824 FJ ($0.215)")
		expect(spokenText(fee(w).element)).toContain("You pay nothing. The sponsor covers about $0.215.")
		expect(spokenText(fee(w).element)).not.toContain("3.577824")
	})

	test("a sponsor added by hand is never chosen for the person; once picked it pays: a dash, never Nothing, and no amount", async () => {
		mocks.getFpcs.mockResolvedValue([HAND_ADDED])
		const w = await mountCard(sendTx())
		const trigger = () => w.find('[data-testid="send-fee-method-trigger"]')
		expect(trigger().text()).toContain("Select method")
		await w.find('[data-testid="send-fee-method-sponsored"]').trigger("click")
		await flushPromises()
		expect(trigger().text()).toContain("Dev sponsor")
		expect(fee(w).text()).toContain("—")
		expect(fee(w).text()).not.toContain("Nothing")
		expect(fee(w).text()).not.toContain("3.577824")
		expect(spokenText(fee(w).element)).toContain("Nulo can't tell what this fee contract charges you.")
	})
})

describe("OperationCard — the sponsor a wire-shaped transaction defaults to", () => {
	test.each([
		["listed after one added by hand", [HAND_ADDED, NULO_SPONSOR], {}, undefined],
		[
			"with an app and a hand-added row named like it, and extra payload fields",
			[{ ...HAND_ADDED, name: "Sponsored" }, NULO_SPONSOR],
			{ authWitnesses: [], capsules: [], extraHashedArgs: [] },
			{ name: "Nulo Sponsored" },
		],
	])("Nulo's sponsor, %s, and no pick is saved", async (_case, fpcs, exec, dapp) => {
		mocks.getFpcs.mockResolvedValue(fpcs)
		const w = await mountCard(sendTx(exec), dapp)
		expect(lastSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		expect(mocks.saveFeePick).not.toHaveBeenCalled()
	})
})

describe("OperationCard — a sponsor that can't cover a wire-shaped transaction's fee", () => {
	const SPONSOR_AT = field(0x0a11ce5c0ffeen)
	const NULO_ROW = { ...NULO_SPONSOR, address: SPONSOR_AT }
	const withVerdict = (funded: boolean) => ({ ...ESTIMATE, sponsorFunding: { fpcId: "s1", address: SPONSOR_AT, funded } })
	const NO_PAYER = "The sponsor you chose can't cover this fee right now."
	const notice = (w: VueWrapper) => w.find('[data-testid="fee-sponsor-short"]')

	test("short: the card withdraws the sponsor and says why, and the pick that replaces it is what it hands the window", async () => {
		mocks.getFpcs.mockResolvedValue([NULO_ROW])
		const w = await mountCard(sendTx())
		expect(lastSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

		await w.setProps({ feeEstimate: withVerdict(false) })
		await flushPromises()
		expect(w.emitted<[number, unknown]>("updateFeeSettings")?.at(-1)).toEqual([0, undefined])
		expect(w.get('[data-testid="send-fee-method-trigger"]').text()).toContain("Select method")
		expect(notice(w).text()).toBe(NO_PAYER)
		expect(w.get('[data-testid="send-fee-method-sponsored"]').attributes("disabled")).toBeDefined()
		expect(fee(w).attributes("data-sponsor-funding")).toBe("short")

		await w.get('[data-testid="send-fee-method-public"]').trigger("click")
		await flushPromises()
		expect(lastSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		expect(notice(w).exists()).toBe(false)
	})

	test("an app's name, call arguments and payload fields shaped like a verdict move neither the verdict nor the notice", async () => {
		mocks.getFpcs.mockResolvedValue([NULO_ROW])
		const lure = { fpcId: "s1", address: SPONSOR_AT, funded: false }
		const op = sendTx({
			calls: [
				{
					name: "sponsor_unconditionally",
					to: SPONSOR_AT,
					selector: "0x3a4b5c6d",
					type: "public",
					isStatic: false,
					hideMsgSender: false,
					args: [SPONSOR_AT, field(0n)],
				},
			],
			sponsorFunding: lure,
		})
		const w = await mountCard(
			{ ...op, sponsorFunding: lure, opts: { ...op.opts, sponsorFunding: lure } },
			{ name: "The sponsor you chose can't cover this fee right now. Evil pays it instead." },
		)
		await w.setProps({ feeEstimate: withVerdict(true) })
		await flushPromises()
		expect(fee(w).attributes("data-sponsor-funding")).toBe("funded")
		expect(notice(w).exists()).toBe(false)
		expect(lastSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

		await w.setProps({ feeEstimate: withVerdict(false) })
		await flushPromises()
		expect(notice(w).text()).toBe(NO_PAYER)
	})
})

describe("OperationCard — a wire-shaped transaction whose fee the app pays", () => {
	const APP_FPC = field(0x2f1e0d9c8b7a69584736251403f2e1d0c9b8a7968574635241302f1e0d9c8b7an)
	// The app's own fee settings as the wallet-sdk serializes them: each bigint a decimal string.
	const GAS_SETTINGS = {
		maxFeesPerGas: { feePerDaGas: "1200000000", feePerL2Gas: "1200000000" },
		maxPriorityFeesPerGas: { feePerDaGas: "300000000", feePerL2Gas: "300000000" },
	}
	const appPaid = () => ({
		...sendTx({ feePayer: APP_FPC }),
		opts: { from: OWNER, fee: { gasSettings: GAS_SETTINGS } },
		feeSettings: { paymentMethod: { kind: "embedded" } },
	})
	const mountWith = async (feeEstimate: unknown, state: { isEstimating?: boolean; op?: unknown; isPreviewing?: boolean } = {}) => {
		const w = mount(OperationCard, {
			props: {
				op: (state.op ?? appPaid()) as never,
				index: 0,
				profile: { id: "p1", name: "Main" } as never,
				feeEstimate: feeEstimate as never,
				isEstimating: state.isEstimating ?? false,
				isPreviewing: state.isPreviewing ?? false,
				dapp: { name: "Swap" },
			},
			// The real term, so the test reads its markup: the key, the Tab stop, the hidden definition.
			global: { stubs, components: { DottedTerm, Skeleton } },
		})
		mounted = w
		await flushPromises()
		return w
	}
	const region = (w: VueWrapper) => w.get('[data-testid="execute-op-app-payer-live"]')
	const row = (w: VueWrapper) => w.get('[data-testid="execute-op-fee-set-badge"]')
	const legend = (w: VueWrapper) => w.get('[data-testid="execute-op-app-legend"]').text()
	const figure = (w: VueWrapper) => w.find('[data-testid="execute-op-app-fee"]')
	const waiting = (w: VueWrapper) => w.find('[data-testid="execute-op-app-fee-estimating"]')
	const covered = { address: APP_FPC, funded: true, provenShort: false }

	test("estimating: the legend stays, the second line reads Fee up to with the loading bar, and the row is busy", async () => {
		const w = await mountWith(undefined, { isEstimating: true })
		expect(legend(w)).toBe("Fee payment method set by Swap")
		expect(waiting(w).text()).toBe("Fee up to")
		expect(waiting(w).findComponent(Skeleton).exists()).toBe(true)
		expect(figure(w).exists()).toBe(false)
		expect(row(w).attributes("aria-busy")).toBe("true")
		expect(region(w).attributes()).toMatchObject({ role: "status", "aria-live": "polite" })
		expect(region(w).text()).toBe("")
		expect(fee(w).exists()).toBe(false)
	})

	test("the estimate lands: the legend stays above the fee limit, the row no longer busy, and no priority part when the app set none", async () => {
		const w = await mountWith({ ...ESTIMATE, appPayerFunding: covered })
		expect(legend(w)).toBe("Fee payment method set by Swap")
		expect(figure(w).text()).toBe("Fee up to 3.577824 FJ")
		expect(waiting(w).exists()).toBe(false)
		expect(row(w).attributes("aria-busy")).toBeUndefined()
		expect(region(w).text()).toBe("")
		expect(w.findAllComponents(DottedTerm)).toHaveLength(0)
	})

	test("a failed estimate, and an operation the wallet never estimates while its preview runs: the legend alone", async () => {
		const failed = await mountWith(undefined)
		expect(row(failed).text()).toBe("Fee payment method set by Swap")
		expect(waiting(failed).exists()).toBe(false)
		expect(row(failed).attributes("aria-busy")).toBeUndefined()
		failed.unmount()

		const noFrom = { ...appPaid(), executionMode: "default_entrypoint" }
		const previewing = await mountWith(undefined, { op: noFrom, isPreviewing: true })
		expect(row(previewing).text()).toBe("Fee payment method set by Swap")
		expect(waiting(previewing).exists()).toBe(false)
		expect(row(previewing).attributes("aria-busy")).toBeUndefined()
	})

	// An approval window carries one operation and nothing else on it is dotted, so the card's
	// dotted terms are the screen's, which the glossary rule caps at two.
	test("the app asked for a priority fee: one sentence under the legend, its priority fee the screen's one dotted term, defined by the glossary", async () => {
		const w = await mountWith({
			...ESTIMATE,
			maxFee: "16000000000000000",
			maxFeeFormatted: "0.016",
			priorityFee: "4000000000000000",
			priorityFeeFormatted: "0.004",
			appPayerFunding: covered,
		})
		expect(legend(w)).toBe("Fee payment method set by Swap")
		expect(shownText(figure(w).element)).toBe("Fee up to 0.016 FJ, includes a 0.004 FJ priority fee the app asked for")
		expect(w.findAllComponents(DottedTerm).map((t) => t.props("term"))).toEqual(["priority-fee"])
		const term = w.get('[data-testid="execute-op-priority-term"]')
		expect(term.text()).toBe("priority fee")
		expect(term.attributes("tabindex")).toBe("0")
		const description = row(w).element.querySelector(`[id="${term.attributes("aria-describedby")}"]`)
		expect(description?.hasAttribute("hidden")).toBe(true)
		expect(description?.textContent).toBe(GLOSSARY["priority-fee"].definition)
	})

	test.each([true, false])(
		"the app's fee contract reads short (proven: %s): the figure stays and the hedged notice shows under the row",
		async (provenShort) => {
			const w = await mountWith({ ...ESTIMATE, appPayerFunding: { address: APP_FPC, funded: false, provenShort } })
			expect(figure(w).text()).toBe("Fee up to 3.577824 FJ")
			expect(region(w).text()).toBe("This app's fee contract may not cover this fee right now.")
		},
	)
})

describe("OperationCard — a window that only reads the request draws its own fee block", () => {
	const mountWithFee = async (op: unknown) => {
		const w = mount(OperationCard, {
			props: { op: op as never, index: 0, profile: { id: "p1", name: "Main" } as never },
			slots: { fee: '<div data-testid="own-fee-block" />' },
			global: { stubs },
		})
		mounted = w
		await flushPromises()
		return w
	}

	test.each([
		["a fee the person picks", sendTx()],
		["a fee the app pays", { ...sendTx({ feePayer: `0x${"2f".repeat(32)}` }), feeSettings: { paymentMethod: { kind: "embedded" } } }],
	])("%s: the slot stands in for the choice and the app's row, the payload unchanged", async (_case, op) => {
		const w = await mountWithFee(op)
		expect(w.find('[data-testid="own-fee-block"]').exists()).toBe(true)
		expect(fee(w).exists()).toBe(false)
		expect(w.find('[data-testid="execute-op-fee-set-badge"]').exists()).toBe(false)
		await w.get('[data-testid="execute-op-details-toggle"]').trigger("click")
		expect(w.findAll('[data-testid="execute-op-payload-row"]')).toHaveLength(1)
		expect(mocks.getGasBalances).not.toHaveBeenCalled()
	})
})
