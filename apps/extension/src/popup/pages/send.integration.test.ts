/**
 * The Send page over the real fee card, its selector and the balances store — the seam
 * `send.test.ts` stubs. Every settled state is read as one whole: the publish line's `you` cell
 * against its warning and the card's own pick, the review's three rows, and then what Send now sends.
 */
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { BUNDLED_TOKEN_CLASS_IDS } from "@nulo/token-list"
import { deferred, EventHandler } from "@nulo/wallet-core/utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { nextTick, reactive, ref } from "vue"

const ACCOUNT = "0xacct"
const DESTINATION = `0x2${"b".repeat(63)}`
/** A payee the journal has paid before, on the curve like `DESTINATION`. */
const ANA = "0x13c29548b3340707017c5d1a457c23d8b6c29548b3340706e39bf608a5aab172"
const TOKEN = {
	id: 7,
	contract: `0x${"c".repeat(64)}`,
	symbol: "TST",
	decimals: 6,
	chainId: 111,
	hasPrivateTransfers: true,
	hasPublicTransfers: true,
	hasPrivateBalances: true,
	hasPublicBalances: true,
}
const BALANCE = { id: "b1", account: ACCOUNT, token: TOKEN, privateBalance: "5000000", publicBalance: "3000000", updatedAt: 1 }

const mocks = vi.hoisted(() => ({
	executeTransfer: vi.fn(),
	estimateTransferFee: vi.fn(),
	cancelEstimate: vi.fn(async () => {}),
	getGasBalances: vi.fn(),
	getFpcs: vi.fn(),
	getTokens: vi.fn(),
	getTokenBalances: vi.fn(),
	getContacts: vi.fn(async () => []),
	getOperations: vi.fn(async (_filter: unknown): Promise<unknown[]> => []),
	openToast: vi.fn(),
	closeToast: vi.fn(),
	routerBack: vi.fn(),
	routerReplace: vi.fn(),
	routerPush: vi.fn(),
	legalStatus: vi.fn(async () => "current"),
}))
/** One pair of FPC events for every client instance, so a test can fire what the wallet would. */
const fpcEvents = await vi.hoisted(async () => {
	const { EventHandler } = await import("@nulo/wallet-core/utils")
	return { onFpcDeleted: new EventHandler<unknown>(), onFpcUpdated: new EventHandler<unknown>() }
})
/** The one snack on screen, with ids that grow on every open, as the design package keeps it. */
const snack = await vi.hoisted(async () => {
	const { ref } = await import("vue")
	return ref<{ id: number; kind: string; label: string } | null>(null)
})
const estimateEvents = await vi.hoisted(async () => {
	const { EventHandler } = await import("@nulo/wallet-core/utils")
	return { onEstimateStarted: new EventHandler<{ estimateToken: string }>() }
})

vi.mock("@/wallet/services/execution/client", () => ({
	ExecutionServiceClient: vi.fn(function () {
		return {
			connect: vi.fn(),
			disconnect: vi.fn(),
			executeTransfer: mocks.executeTransfer,
			estimateTransferFee: mocks.estimateTransferFee,
			cancelEstimate: mocks.cancelEstimate,
			getGasBalances: mocks.getGasBalances,
			peekGasBalances: vi.fn(async () => null),
			onEstimateStarted: estimateEvents.onEstimateStarted,
		}
	}),
}))
vi.mock("@/wallet/services/fpc/client", () => ({
	FpcServiceClient: vi.fn(function () {
		return { connect: vi.fn(), disconnect: vi.fn(), getFpcs: mocks.getFpcs, ...fpcEvents }
	}),
	FpcType: { DefaultSponsoredFpc: 1, PrivateFpc: 2 },
}))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onTokenAdded: new EventHandler(),
			onTokenUpdated: new EventHandler(),
			onTokenDeleted: new EventHandler(),
			getTokens: mocks.getTokens,
		}
	}),
}))
vi.mock("@/wallet/services/token-balance/client", () => ({
	TokenBalanceServiceClient: vi.fn(function () {
		return {
			connect: vi.fn(),
			disconnect: vi.fn(),
			onConnected: new EventHandler(),
			onTokenBalanceAdded: new EventHandler(),
			onTokenBalanceUpdated: new EventHandler(),
			onTokenBalanceDeleted: new EventHandler(),
			getTokenBalances: mocks.getTokenBalances,
		}
	}),
}))
vi.mock("@/wallet/services/contact/client", () => ({
	ContactServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onContactAdded: new EventHandler(),
			onContactUpdated: new EventHandler(),
			onContactDeleted: new EventHandler(),
			getContacts: mocks.getContacts,
		}
	}),
}))
// The app store's in-flight mirror and the page's short-lived reads both build one; every instance
// reads the one journal `mocks.getOperations` answers for.
vi.mock("@/wallet/services/operation-journal/client", () => ({
	OperationJournalServiceClient: vi.fn(function () {
		return {
			connect: vi.fn(async () => {}),
			disconnect: vi.fn(),
			getOperations: vi.fn((filter: unknown) => mocks.getOperations(filter)),
			getOperation: vi.fn(async () => undefined),
			onConnected: new EventHandler(),
			onOperationAdded: new EventHandler(),
			onOperationUpdated: new EventHandler(),
			onOperationDeleted: new EventHandler(),
		}
	}),
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: new EventHandler(),
			onConnected: new EventHandler(),
			getQuotes: vi.fn(async () => ({ quotes: {}, pricedTokens: {}, tokenIcons: {} })),
			refreshIfStale: vi.fn(async () => ({ quotes: {}, pricedTokens: {}, tokenIcons: {} })),
		}
	}),
}))
vi.mock("@/wallet/services/transaction/client", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/wallet/services/transaction/client")>()),
	TransactionServiceClient: vi.fn(function () {
		return { connect: vi.fn(), disconnect: vi.fn(), onTransactionAdded: new EventHandler(), onTransactionUpdated: new EventHandler() }
	}),
}))
const { readFeePicks } = await vi.hoisted(() => import("../../../tests/helpers/ui-preference-fake"))
vi.mock("@/utils/core", () => ({
	managers: {
		uiPreference: {
			getFeePicks: (profileId: string) => readFeePicks(chrome.storage.local, profileId),
			saveFeePick: vi.fn(async () => true),
		},
		legal: {
			onAcceptanceChanged: new EventHandler(),
			onConnected: new EventHandler(),
			getStatus: mocks.legalStatus,
			accept: vi.fn(),
		},
	},
}))
vi.mock("@/composables/toast.js", () => ({
	useToast: () => ({ openToast: mocks.openToast, closeToast: mocks.closeToast, toast: snack }),
}))
const route = reactive({ name: "popup-send", path: "/popup/send", query: {} as Record<string, string>, meta: {} })
vi.mock("vue-router", () => ({
	useRoute: () => route,
	useRouter: () => ({ back: mocks.routerBack, replace: mocks.routerReplace, push: mocks.routerPush }),
	RouterLink: { template: "<a><slot /></a>" },
}))

import type { PayerKind, TransferSide, Visibility } from "@/components/composite/send/publish-facts"
import { REVIEW_ARM_MS } from "@/composables/useSendReview"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { sendFeePicksKey } from "@/utils/profile-ui-keys"
import { useAppStore } from "@/stores/app.store"
import { INIT_RETRY_BACKOFF_MS } from "@/stores/balances.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"
import { TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"
import { TransferType } from "@/wallet/services/transaction/client"
import Popup from "@/components/Popup/Popup.vue"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"
import { sendEvent } from "../../../tests/helpers/send-event"
import Send from "./send.vue"

const STUBS = {
	// Exposes its root as `wrapper`, as the real Flex does: the real `Popup` traps focus inside it.
	Flex: { template: '<div ref="wrapper" v-bind="$attrs"><slot /></div>', inheritAttrs: false, setup: () => ({ wrapper: ref() }) },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i />" },
	Skeleton: { template: "<span />" },
	Tooltip: { template: '<div><slot /><slot name="content" /></div>' },
	Banner: { template: '<div data-testid="stub-banner"><slot /></div>' },
	Button: {
		template: '<button v-bind="$attrs" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>',
		props: ["variant", "size", "disabled", "loading", "wide"],
		emits: ["click"],
		inheritAttrs: false,
	},
	SelectTokenCard: { template: '<div data-testid="stub-token-card" />', props: ["token", "loading"] },
	// The field's own wrapper testid is what the page focuses into on the way back to the person step.
	RecipientField: {
		template:
			'<div data-testid="send-destination-field"><input data-testid="stub-recipient" :value="searchTerm" @input="$emit(\'update:searchTerm\', $event.target.value)" /></div>',
		props: ["searchTerm", "selectedContact", "candidates"],
		emits: ["update:searchTerm", "update:selectedContact"],
	},
	AmountCard: {
		template: '<input data-testid="stub-amount" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: [
			"modelValue",
			"rested",
			"fiatMode",
			"fiatGuard",
			"token",
			"tokenBalanceByType",
			"balanceRawByType",
			"balanceState",
			"liveQuote",
			"proxyTicker",
			"exceedsBalance",
			"side",
		],
		emits: ["update:modelValue", "update:rested", "update:fiatMode", "update:fiatGuard"],
		methods: { refreezeQuote() {}, focusAmount() {}, exitFiat() {} },
	},
	// The card's read-only rows, and the menu chrome around the real selector's items.
	FeeMethodRow: { template: '<div data-testid="stub-fee-method-row" />' },
	FeeCostReadout: {
		props: ["estimate", "isEstimating", "isQueued", "queuedCap", "payer"],
		template:
			'<div data-testid="stub-fee-cost" :data-usd="estimate?.usd" :data-queued="String(Boolean(isEstimating && isQueued))" :data-cap="queuedCap?.cap.amount" :data-payer="payer" />',
	},
	FeePriorityRow: { template: '<div data-testid="stub-fee-priority" />' },
	DropdownRoot: { template: '<div data-testid="stub-dropdown"><slot name="trigger" /><slot name="popup" /></div>' },
	Popup: {
		name: "Popup",
		template: '<div v-if="show" data-testid="stub-popup" :data-order="displaceIdx"><slot /></div>',
		props: { show: Boolean, displaceIdx: Number, closeOnEscape: Boolean, initialFocus: [String, Boolean] },
		emits: ["onClose"],
	},
	PopupCard: { template: '<div data-testid="stub-card" :data-depth="displaceIdx"><slot /></div>', props: ["displaceIdx"] },
	PopupHeader: {
		template:
			'<div><slot name="title" /><button v-if="closable" data-testid="popup-close-btn" @click="$emit(\'onClose\')">x</button></div>',
		props: { closable: { type: Boolean, default: false } },
		emits: ["onClose"],
	},
}

type W = ReturnType<typeof mount>
type Gas = { publicFeeJuice: string | null; privateFeeJuice: string | null }
type Funding = { gas: Gas; fpcs: unknown[]; storage?: Record<string, unknown> }

const HELD = "1000000000000000000"
const PRIVATE_FPC = { id: "p1", type: 2, name: "Private FPC", isProtocol: true }
const SPONSOR = { id: "s1", type: 1, name: "Sponsor", isProtocol: true }
const HAND_ADDED = { id: "s2", type: 1, name: "Mine", isProtocol: false }
const SEND_PICKS = sendFeePicksKey("p1")
/** A hand-added sponsor pays only once picked: saved for both origins. */
const HAND_ADDED_PICKED = { [ACCOUNT]: { private: { type: "fpc", fpc: { id: "s2" } }, public: { type: "fpc", fpc: { id: "s2" } } } }

const FUNDING = {
	"no gas, a sponsor": { gas: { publicFeeJuice: "0", privateFeeJuice: "0" }, fpcs: [PRIVATE_FPC, SPONSOR] },
	"public Fee Juice only": { gas: { publicFeeJuice: HELD, privateFeeJuice: "0" }, fpcs: [PRIVATE_FPC, SPONSOR] },
	"private Fee Juice only": { gas: { publicFeeJuice: "0", privateFeeJuice: HELD }, fpcs: [PRIVATE_FPC, SPONSOR] },
	"both Fee Juices": { gas: { publicFeeJuice: HELD, privateFeeJuice: HELD }, fpcs: [PRIVATE_FPC, SPONSOR] },
	"no gas, a hand-added sponsor picked": {
		gas: { publicFeeJuice: "0", privateFeeJuice: "0" },
		fpcs: [PRIVATE_FPC, HAND_ADDED],
		storage: { [SEND_PICKS]: HAND_ADDED_PICKED },
	},
} satisfies Record<string, Funding>

/** What a landed estimate answers when a test names none. */
const LANDED = { maxFee: "1000", gasDetails: {} }

/** The page debounces its estimate by 800 ms; this lets the current input's estimate land. */
async function estimateLands() {
	await vi.advanceTimersByTimeAsync(800)
	await flushPromises()
}

async function mountSend(
	funding: Funding,
	opts: {
		storage?: Record<string, unknown>
		holdGas?: boolean
		realTokenCard?: boolean
		realFeeRow?: boolean
		realAmountCard?: boolean
		realPopup?: boolean
		chainId?: number
	} = {},
) {
	vi.useFakeTimers()
	installChromeStorage(opts.storage ?? funding.storage ?? {})
	mocks.getFpcs.mockResolvedValue(funding.fpcs)
	const gas = deferred<Gas>()
	if (opts.holdGas) mocks.getGasBalances.mockReturnValue(gas.promise)
	else mocks.getGasBalances.mockResolvedValue(funding.gas)
	const pinia = createTestingPinia({ stubActions: false })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.profile = { id: "p1" } as never
	appStore.network = { id: "n1", chainId: opts.chainId ?? TOKEN.chainId } as never
	appStore.account = { address: ACCOUNT } as never
	const cacheStore = useCacheStore(pinia)
	const popupStore = usePopupStore(pinia)
	// Nothing registers the auto-imported `Popup` here: the real one is handed in by name.
	const { Popup: _popupStub, ...unpopped } = STUBS
	const w = mount(Send, {
		attachTo: document.body,
		global: {
			plugins: [pinia],
			components: opts.realPopup ? { Popup } : {},
			stubs: {
				...(opts.realPopup ? unpopped : STUBS),
				...(opts.realTokenCard && { SelectTokenCard: false }),
				...(opts.realFeeRow && { FeeCostReadout: false }),
				...(opts.realAmountCard && { AmountCard: false }),
			},
		},
	})
	await flushPromises()
	return { w, appStore, cacheStore, popupStore, gas }
}

/** The person step's way to the form for a pasted address: the field takes it, then Pay this address. */
async function toForm(w: W, address = DESTINATION) {
	await w.get('[data-testid="stub-recipient"]').setValue(address)
	await w.get('[data-testid="send-pay-address"]').trigger("click")
	await flushPromises()
}

async function fillForm(w: W) {
	await toForm(w)
	await w.get('[data-testid="stub-amount"]').setValue("1.5")
}

const submit = (w: W) => w.get('[data-testid="send-submit"]')
/** The publish line's region, which carries the facts' `you` cell. */
const publishLine = (w: W) => w.get("[data-you]")
const warning = (w: W) => w.find('[data-testid="send-fee-warning"]')
const sheetOpen = (w: W) => w.get('[data-testid="send-review-sheet"]').attributes("data-open") === "true"
const closeSheet = (w: W) => w.getComponent({ name: "SendReviewSheet" }).get('[data-testid="popup-close-btn"]').trigger("click")
const sendNow = (w: W) => w.get('[data-testid="send-review-submit"]')
/** The review's wait before Send now can send. */
async function armed() {
	vi.advanceTimersByTime(REVIEW_ARM_MS)
	await nextTick()
}
const feeTrigger = (w: W) => w.get('[data-testid="send-fee-payers"]').attributes("data-fee-method")
/** The card's own pick names the account: public Fee Juice paying for a private send. */
const namesAccount = (w: W) =>
	w.get('[data-testid="fee-settings-card"]').attributes("data-origin") === "private" && feeTrigger(w) === "public"
/** A fee picked where a person picks it: its radio in the fee sheet, opened from the fee line, then Done. */
async function pickFee(w: W, subtitle: "public" | "private" | "sponsored") {
	await w.get('[data-testid="send-fee-change"]').trigger("click")
	await w.get(`[data-testid="send-fee-sheet"] [data-testid="send-fee-payer-${subtitle}"]`).setValue(true)
	await w.get('[data-testid="send-fee-sheet"] [data-testid="send-fee-done"]').trigger("click")
}
/** Both sides start private for a token that can do either. */
const setSide = (w: W, side: "from" | "to", want: TransferSide) => w.get(`[data-testid="send-${side}-${want}"]`).setValue(true)
const checkedSide = (w: W, side: "from" | "to") =>
	(["private", "public"] as const).filter((s) => (w.get(`[data-testid="send-${side}-${s}"]`).element as HTMLInputElement).checked)

/** The one reading a settled state must give everywhere at once: the publish line's `you`, its warning
 *  and the card's own pick. */
function settled(w: W) {
	const you = publishLine(w).attributes("data-you")
	expect(warning(w).exists()).toBe(you === "exposed")
	expect(namesAccount(w)).toBe(you === "exposed")
	return you
}
/** The three cells as the open review's rows read them. */
const reviewCells = (w: W) =>
	Object.fromEntries(
		["you", "to", "amount"].map((row) => [row, w.get(`[data-testid="send-review-row-${row}"]`).attributes("data-visibility")]),
	)

function balanceUpdated() {
	const client = vi.mocked(TokenBalanceServiceClient).mock.results.at(-1)?.value as unknown as {
		onTokenBalanceUpdated: EventHandler<unknown>
	}
	return client.onTokenBalanceUpdated
}

const submittedFee = () => (mocks.executeTransfer.mock.calls[0]?.[7] as { paymentMethod: unknown } | undefined)?.paymentMethod
/** The submitted estimate id, queued cap and shown fee, in their positions. */
const submittedFigures = () => mocks.executeTransfer.mock.calls[0]?.slice(8)

beforeEach(() => {
	document.body.innerHTML = '<div id="popup"></div>'
	mocks.getTokens.mockResolvedValue([TOKEN])
	mocks.getTokenBalances.mockResolvedValue([BALANCE])
	mocks.getContacts.mockResolvedValue([])
	mocks.getOperations.mockResolvedValue([])
	mocks.executeTransfer.mockResolvedValue(undefined)
	mocks.estimateTransferFee.mockResolvedValue(LANDED)
	mocks.legalStatus.mockResolvedValue("current")
	snack.value = null
	let snackId = 0
	mocks.openToast.mockImplementation((options) => {
		snack.value = { ...options, id: ++snackId }
		return snackId
	})
	mocks.closeToast.mockImplementation(() => {
		snack.value = null
	})
	vi.spyOn(console, "error").mockImplementation(() => {})
	vi.spyOn(console, "debug").mockImplementation(() => {})
})
afterEach(() => {
	vi.clearAllMocks()
	vi.restoreAllMocks()
	vi.useRealTimers()
	document.body.innerHTML = ""
})

/** Funding × origin: who the wallet resolves as payer, and what that publishes about the account. */
const SWEEP: Array<[keyof typeof FUNDING, TransferSide, Visibility, PayerKind, { kind: string; fpcId?: string }]> = [
	["no gas, a sponsor", "private", "hidden", "contract", { kind: "fpc", fpcId: "s1" }],
	["no gas, a sponsor", "public", "public", "contract", { kind: "fpc", fpcId: "s1" }],
	["public Fee Juice only", "private", "exposed", "account", { kind: "fj" }],
	["public Fee Juice only", "public", "public", "account", { kind: "fj" }],
	["private Fee Juice only", "private", "hidden", "contract", { kind: "fpc", fpcId: "p1" }],
	["private Fee Juice only", "public", "public", "contract", { kind: "fpc", fpcId: "p1" }],
	["both Fee Juices", "private", "hidden", "contract", { kind: "fpc", fpcId: "p1" }],
	["both Fee Juices", "public", "public", "account", { kind: "fj" }],
	["no gas, a hand-added sponsor picked", "private", "unknown", "unvouched", { kind: "fpc", fpcId: "s2" }],
	["no gas, a hand-added sponsor picked", "public", "public", "unvouched", { kind: "fpc", fpcId: "s2" }],
]
const SIDE_CELLS = {
	"private→private": { to: "hidden", amount: "hidden" },
	"private→public": { to: "public", amount: "public" },
	"public→private": { to: "hidden", amount: "public" },
	"public→public": { to: "public", amount: "public" },
} as const

describe.each(SWEEP)("send page with the real fee card — %s, %s origin", (funding, origin, you, payer, fee) => {
	test.each<TransferSide>(["private", "public"])("→ %s destination", async (destination) => {
		const { w } = await mountSend(FUNDING[funding])
		await fillForm(w)
		await setSide(w, "from", origin)
		await setSide(w, "to", destination)
		await estimateLands()
		expect(mocks.getGasBalances).toHaveBeenCalledWith("n1", ACCOUNT, true)

		expect(settled(w)).toBe(you)
		expect(feeTrigger(w)).toBe(fee.kind === "fj" ? "public" : fee.fpcId === "p1" ? "private" : "sponsored")
		const shape = you === "exposed" ? `private-${destination}` : undefined

		await submit(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		expect(sheetOpen(w)).toBe(true)
		expect(reviewCells(w)).toEqual({ you, ...SIDE_CELLS[`${origin}→${destination}`] })
		expect(w.get('[data-testid="send-review-row-you"]').attributes("data-notice-shape")).toBe(shape)
		expect(w.get('[data-testid="send-review-fee"]').attributes("data-payer")).toBe(payer)

		await armed()
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		expect(submittedFee()).toMatchObject(fee)
		// Only a fee the person pays (Fee Juice, or the PrivateFPC `p1`) is held to the figure shown.
		const ownFee = fee.kind === "fj" || fee.fpcId === "p1"
		expect(submittedFigures()).toEqual([undefined, undefined, ownFee ? LANDED.maxFee : undefined])
		expect(sheetOpen(w)).toBe(false)
		w.unmount()
	})
})

describe("send page with the real fee card — nothing to send", () => {
	test("no sendable token with funded Fee Juice: no publish line, and the button stays off", async () => {
		mocks.getTokens.mockResolvedValue([])
		mocks.getTokenBalances.mockResolvedValue([])
		const { w } = await mountSend(FUNDING["public Fee Juice only"])
		await toForm(w)
		expect(w.find("[data-you]").exists()).toBe(false)
		expect(submit(w).attributes("disabled")).toBeDefined()
		await submit(w).trigger("click")
		expect(sheetOpen(w)).toBe(false)
		w.unmount()
	})

	test.each([
		["no sponsor", [PRIVATE_FPC]],
		["only one added by hand, never picked", [PRIVATE_FPC, HAND_ADDED]],
	])("no gas and %s: the footer asks for Fee Juice, and the publish line vouches for nothing", async (_case, fpcs) => {
		const { w } = await mountSend({ gas: { publicFeeJuice: "0", privateFeeJuice: "0" }, fpcs })
		await fillForm(w)
		expect(w.find('[data-testid="send-submit"]').exists()).toBe(false)
		expect(w.get('[data-testid="send-get-fee-juice"]').text()).toBe("Get private Fee Juice")
		expect(settled(w)).toBe("unknown")
		w.unmount()
	})
})

describe("send page — the caveat under the token row for a token outside the validated classes", () => {
	const caveat = (w: W) => w.find('[data-testid="send-token-caveat"]')

	test.each([
		["another class", `0x${"1".repeat(64)}`],
		["no class", undefined],
	])("a token of %s carries the caveat under the token row", async (_case, classId) => {
		mocks.getTokens.mockResolvedValue([{ ...TOKEN, classId }])
		const { w } = await mountSend(FUNDING["public Fee Juice only"])
		await toForm(w)
		expect(w.find("[data-you]").exists()).toBe(true)
		expect(caveat(w).text()).toBe("Nulo can't check this token's contract. What a send publishes depends on its code.")
		expect(caveat(w).element.previousElementSibling?.getAttribute("data-testid")).toBe("stub-token-card")
		w.unmount()
	})

	test("a token of a validated class carries none (control)", async () => {
		mocks.getTokens.mockResolvedValue([{ ...TOKEN, classId: BUNDLED_TOKEN_CLASS_IDS[0] }])
		const { w } = await mountSend(FUNDING["public Fee Juice only"])
		await toForm(w)
		expect(w.find("[data-you]").exists()).toBe(true)
		expect(caveat(w).exists()).toBe(false)
		w.unmount()
	})

	test("the publish line and the caveat sit in the form above the pinned footer, which holds the fee line and the button; the card waits hidden", async () => {
		mocks.getTokens.mockResolvedValue([{ ...TOKEN, classId: undefined }])
		const { w } = await mountSend(FUNDING["public Fee Juice only"])
		await toForm(w)
		const footer = w.get('[data-testid="send-footer"]').element
		for (const el of [publishLine(w).element, caveat(w).element]) {
			expect(footer.contains(el)).toBe(false)
			expect(el.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		}
		expect(
			[...footer.children].map((el) => el.getAttribute("data-testid") ?? el.firstElementChild?.getAttribute("data-testid")),
		).toEqual(["send-fee-line", "send-submit"])
		expect(w.get('[data-testid="fee-settings-card"]').element.closest("[hidden]")).not.toBeNull()
		w.unmount()
	})

	test("a token that cannot send has no publish line and no caveat", async () => {
		mocks.getTokens.mockResolvedValue([{ ...TOKEN, hasPrivateTransfers: false, hasPublicTransfers: false }])
		const { w } = await mountSend(FUNDING["public Fee Juice only"])
		await toForm(w)
		expect(w.find("[data-you]").exists()).toBe(false)
		expect(caveat(w).exists()).toBe(false)
		w.unmount()
	})
})

describe("send page with the real fee card — transitions", () => {
	test("balances still pending: unknown, no pick, nothing sendable; the read landing settles it", async () => {
		const { w, gas } = await mountSend(FUNDING["public Fee Juice only"], { holdGas: true })
		await fillForm(w)
		expect(settled(w)).toBe("unknown")
		expect(submit(w).attributes("disabled")).toBeDefined()
		expect(feeTrigger(w)).toBeUndefined()

		gas.resolve(FUNDING["public Fee Juice only"].gas)
		await flushPromises()
		expect(settled(w)).toBe("exposed")
		await estimateLands()
		expect(submit(w).attributes("disabled")).toBeUndefined()
		w.unmount()
	})

	test("Fee Juice picked by hand under a private origin raises the warning; the private FPC picked back clears it and pays", async () => {
		const { w } = await mountSend(FUNDING["both Fee Juices"])
		await fillForm(w)
		expect(settled(w)).toBe("hidden")

		await pickFee(w, "public")
		expect(feeTrigger(w)).toBe("public")
		expect(settled(w)).toBe("exposed")
		await estimateLands()
		await submit(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		expect(sheetOpen(w)).toBe(true)
		await closeSheet(w)

		await pickFee(w, "private")
		expect(settled(w)).toBe("hidden")
		await estimateLands()
		await submit(w).trigger("click")
		await armed()
		await sendNow(w).trigger("click")
		expect(submittedFee()).toEqual({ kind: "fpc", fpcId: "p1" })
		w.unmount()
	})

	test("the picked sponsor deleted: the walk moves on to the account, and the warning shows", async () => {
		const picks = { [ACCOUNT]: { private: { type: "fpc", fpc: { id: "s1", name: "Sponsor" } } } }
		const { w } = await mountSend(FUNDING["public Fee Juice only"], { storage: { [SEND_PICKS]: picks } })
		await fillForm(w)
		expect(feeTrigger(w)).toBe("sponsored")
		expect(settled(w)).toBe("hidden")

		fpcEvents.onFpcDeleted.invoke(SPONSOR)
		await nextTick()
		expect(mocks.openToast).toHaveBeenCalledWith({ kind: "success", label: "Selected FPC was deleted" })
		expect(feeTrigger(w)).toBe("public")
		expect(settled(w)).toBe("exposed")
		await submit(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		w.unmount()
	})

	test("a failed balance read pays through the sponsor; the store's retry lands and the walk reaches the account", async () => {
		vi.useFakeTimers()
		mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
		const { w } = await mountSend(FUNDING["public Fee Juice only"])
		await fillForm(w)
		expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)
		expect(settled(w)).toBe("hidden")

		await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
		await vi.advanceTimersByTimeAsync(0)
		expect(mocks.getGasBalances).toHaveBeenCalledTimes(2)
		expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(false)
		expect(settled(w)).toBe("exposed")
		w.unmount()
	})

	test("a balance read that recovers after a failed estimate asks the estimate again, with the sponsor paying throughout", async () => {
		mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
		mocks.estimateTransferFee.mockRejectedValueOnce(new Error("node down"))
		const { w } = await mountSend(FUNDING["no gas, a sponsor"], { realFeeRow: true })
		await fillForm(w)
		await estimateLands()
		expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
		await estimateLands()
		expect(mocks.getGasBalances).toHaveBeenCalledTimes(2)
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(2)
		const payers = mocks.estimateTransferFee.mock.calls.map((call) => (call[7] as { paymentMethod: unknown }).paymentMethod)
		expect(payers).toEqual([
			{ kind: "fpc", fpcId: "s1" },
			{ kind: "fpc", fpcId: "s1" },
		])
		expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(false)
		expect(w.find('[data-testid="fee-estimate"]').exists()).toBe(true)
		w.unmount()
	})

	test("the picked protocol sponsor's row updated to a custom address under the same id: HIDDEN is withdrawn", async () => {
		const picks = { [ACCOUNT]: { private: { type: "fpc", fpc: { id: "s1", name: "Sponsor" } } } }
		const { w } = await mountSend(FUNDING["no gas, a sponsor"], { storage: { [SEND_PICKS]: picks } })
		await fillForm(w)
		expect(settled(w)).toBe("hidden")

		fpcEvents.onFpcUpdated.invoke({ ...SPONSOR, isProtocol: false })
		await nextTick()
		expect(settled(w)).toBe("unknown")
		await estimateLands()
		await submit(w).trigger("click")
		expect(w.get('[data-testid="send-review-fee"]').attributes("data-payer")).toBe("unvouched")
		expect(w.get('[data-testid="send-review-row-you"]').text()).toContain("added by hand")
		w.unmount()
	})

	test("the default sponsor's row updated to a custom address under the same id: it no longer pays unasked", async () => {
		const { w } = await mountSend(FUNDING["no gas, a sponsor"])
		await fillForm(w)
		expect(settled(w)).toBe("hidden")

		fpcEvents.onFpcUpdated.invoke({ ...SPONSOR, isProtocol: false })
		await nextTick()
		expect(w.find('[data-testid="send-submit"]').exists()).toBe(false)
		expect(w.get('[data-testid="send-get-fee-juice"]').text()).toBe("Get private Fee Juice")
		expect(settled(w)).toBe("unknown")
		w.unmount()
	})

	test("a network switch reads unknown until the new scope commits, never the old scope's HIDDEN", async () => {
		const { w, appStore } = await mountSend(FUNDING["no gas, a sponsor"])
		await fillForm(w)
		expect(settled(w)).toBe("hidden")

		const gas = deferred<Gas>()
		mocks.getGasBalances.mockReturnValueOnce(gas.promise)
		appStore.network = { id: "n2", chainId: TOKEN.chainId } as never
		await flushPromises()
		expect(settled(w)).toBe("unknown")
		expect(submit(w).attributes("disabled")).toBeDefined()

		gas.resolve(FUNDING["public Fee Juice only"].gas)
		await flushPromises()
		expect(mocks.getGasBalances).toHaveBeenLastCalledWith("n2", ACCOUNT, true)
		expect(settled(w)).toBe("exposed")
		w.unmount()
	})

	test("origin and destination choices move the cells and the warning together, with the same payer", async () => {
		const { w } = await mountSend(FUNDING["public Fee Juice only"])
		await fillForm(w)
		/** The cells as the review reads them, the sheet closed again after. */
		const cells = async () => {
			await estimateLands()
			await submit(w).trigger("click")
			const read = reviewCells(w)
			await closeSheet(w)
			return read
		}
		expect(settled(w)).toBe("exposed")
		expect(await cells()).toEqual({ you: "exposed", to: "hidden", amount: "hidden" })

		await setSide(w, "to", "public")
		expect(settled(w)).toBe("exposed")
		await estimateLands()
		await submit(w).trigger("click")
		expect(w.get('[data-testid="send-review-row-you"]').attributes("data-notice-shape")).toBe("private-public")
		expect(reviewCells(w)).toEqual({ you: "exposed", to: "public", amount: "public" })
		await closeSheet(w)

		await setSide(w, "from", "public")
		expect(settled(w)).toBe("public")
		expect(feeTrigger(w)).toBe("public")
		expect(await cells()).toEqual({ you: "public", to: "public", amount: "public" })

		await setSide(w, "from", "private")
		expect(settled(w)).toBe("exposed")
		expect(await cells()).toEqual({ you: "exposed", to: "public", amount: "public" })
		w.unmount()
	})

	test("a send the person pays that was not queued carries its estimate id and the fee the estimate showed", async () => {
		vi.useFakeTimers()
		mocks.estimateTransferFee.mockResolvedValue({ ...LANDED, estimateId: "est-9" })
		const { w } = await mountSend(FUNDING["public Fee Juice only"])
		await fillForm(w)
		await estimateLands()
		await submit(w).trigger("click")
		vi.advanceTimersByTime(REVIEW_ARM_MS)
		await nextTick()
		await w.get('[data-testid="send-review-submit"]').trigger("click")
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		expect(submittedFigures()).toEqual(["est-9", undefined, LANDED.maxFee])
		w.unmount()
	})

	test("an account switch while the sheet is open closes it, and its send event then sends nothing", async () => {
		vi.useFakeTimers()
		const { w, appStore } = await mountSend(FUNDING["public Fee Juice only"])
		await fillForm(w)
		await estimateLands()
		await submit(w).trigger("click")
		expect(sheetOpen(w)).toBe(true)
		vi.advanceTimersByTime(REVIEW_ARM_MS)
		await nextTick()
		expect(w.get('[data-testid="send-review-submit"]').attributes("data-ready")).toBe("true")

		appStore.account = { address: "0xother" } as never
		await flushPromises()
		expect(sheetOpen(w)).toBe(false)
		w.findComponent({ name: "SendReviewSheet" }).vm.$emit("send")
		await flushPromises()
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		w.unmount()
	})

	test("closing the sheet leaves the hand-picked fee source and the rest of the form in place", async () => {
		const { w } = await mountSend(FUNDING["both Fee Juices"])
		await fillForm(w)
		await pickFee(w, "public")
		await estimateLands()
		await submit(w).trigger("click")
		expect(sheetOpen(w)).toBe(true)
		await closeSheet(w)
		expect(sheetOpen(w)).toBe(false)
		expect(feeTrigger(w)).toBe("public")
		expect((w.get('[data-testid="stub-amount"]').element as HTMLInputElement).value).toBe("1.5")
		expect(w.get('[data-testid="send-payee-address"]').text()).toBe(DESTINATION)
		expect(settled(w)).toBe("exposed")
		w.unmount()
	})
})

describe("send page with the real fee card — the card lives with the page, its sheet only shows it", () => {
	/** The card logs each mount, once per instance. */
	const cardMounts = () => vi.mocked(console.debug).mock.calls.filter(([line]) => /^\[fee:\w+\] mounting$/.test(String(line))).length
	const inSheet = (w: W) => w.find('[data-testid="send-fee-sheet"] [data-testid="fee-settings-card"]').exists()
	const sheetState = (w: W) => w.get('[data-testid="send-fee-change"]').attributes("aria-expanded")

	test("opening and closing the fee sheet twice keeps one card instance, and its models flow while it is closed", async () => {
		const picks = { [ACCOUNT]: { private: { type: "fpc", fpc: { id: "s1", name: "Sponsor" } } } }
		const { w } = await mountSend(FUNDING["public Fee Juice only"], { storage: { [SEND_PICKS]: picks } })
		await fillForm(w)
		const card = w.getComponent({ name: "FeeSettingsCard" }).vm.$.uid
		expect(inSheet(w)).toBe(false)
		const closes = [
			() => w.get('[data-testid="send-fee-sheet"] [data-testid="popup-close-btn"]').trigger("click"),
			// The page's own Popup, the fee sheet's, comes before the review's.
			() => w.getComponent({ name: "Popup" }).vm.$emit("onClose"),
		]
		for (const close of closes) {
			await w.get('[data-testid="send-fee-change"]').trigger("click")
			await nextTick()
			expect(sheetState(w)).toBe("true")
			expect(inSheet(w)).toBe(true)
			await close()
			await nextTick()
			expect(sheetState(w)).toBe("false")
			expect(inSheet(w)).toBe(false)
			expect(w.get('[data-testid="fee-settings-card"]').element.closest("[hidden]")).not.toBeNull()
		}
		expect(cardMounts()).toBe(1)
		expect(w.findAllComponents({ name: "FeeSettingsCard" })).toHaveLength(1)
		expect(w.getComponent({ name: "FeeSettingsCard" }).vm.$.uid).toBe(card)

		// Closed, the card still hears its sponsor deleted and hands the page the account that pays now.
		expect(w.get('[data-testid="send-fee-line"]').attributes("data-payer")).toBe("sponsor")
		fpcEvents.onFpcDeleted.invoke(SPONSOR)
		await nextTick()
		expect(w.get('[data-testid="send-fee-line"]').attributes("data-payer")).toBe("fj")
		expect(settled(w)).toBe("exposed")
		w.unmount()
	})

	test("Escape closes the fee sheet, and the popup hands the focus back to Change", async () => {
		const { w } = await mountSend(FUNDING["both Fee Juices"], { realPopup: true })
		await fillForm(w)
		const change = w.get('[data-testid="send-fee-change"]').element as HTMLButtonElement
		change.focus()
		await w.get('[data-testid="send-fee-change"]').trigger("click")
		await flushPromises()
		await vi.advanceTimersByTimeAsync(0)
		const sheet = document.querySelector('[data-testid="send-fee-sheet"]')
		expect(sheet?.querySelector('[data-testid="fee-settings-card"]')).not.toBeNull()
		expect(document.getElementById("popup")?.contains(document.activeElement)).toBe(true)

		sendEvent(document.activeElement as HTMLElement, "keydown", { key: "Escape" })
		await flushPromises()
		await vi.advanceTimersByTimeAsync(0)
		expect(sheetState(w)).toBe("false")
		expect(document.querySelector('[data-testid="send-fee-sheet"]')).toBeNull()
		expect(document.activeElement).toBe(change)
		w.unmount()
	})
})

describe("send page with the real fee card — a sponsor that can't cover the fee", () => {
	const SPONSOR_AT = `0x${"0a".repeat(32)}`
	const PICKED_SPONSOR: Funding = {
		gas: { publicFeeJuice: HELD, privateFeeJuice: "0" },
		fpcs: [PRIVATE_FPC, { ...SPONSOR, address: SPONSOR_AT }],
		storage: { [SEND_PICKS]: { [ACCOUNT]: { private: { type: "fpc", fpc: { id: "s1" } } } } },
	}
	const ESTIMATE = { maxFee: "1000", gasDetails: {} }
	const SHORT = { ...ESTIMATE, sponsorFunding: { fpcId: "s1", address: SPONSOR_AT, funded: false } }
	const notice = (w: W) => w.find('[data-testid="fee-sponsor-short"]')
	const offered = (w: W, subtitle: "public" | "sponsored") =>
		!(w.get(`[data-testid="send-fee-payer-${subtitle}"]`).element as HTMLInputElement).disabled

	/** The picked sponsor's first estimate, held until `release`. */
	async function heldEstimate() {
		vi.useFakeTimers()
		const held = deferred<unknown>()
		mocks.estimateTransferFee.mockReturnValueOnce(held.promise).mockResolvedValue(ESTIMATE)
		const mounted = await mountSend(PICKED_SPONSOR)
		await fillForm(mounted.w)
		await vi.advanceTimersByTimeAsync(800)
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)
		expect(feeTrigger(mounted.w)).toBe("sponsored")
		const release = async () => {
			held.resolve(SHORT)
			await vi.advanceTimersByTimeAsync(0)
			await flushPromises()
		}
		return { ...mounted, release }
	}

	test("its verdict lands: the sponsor is set aside, the account's Fee Juice pays, and the send goes through review", async () => {
		const { w, release } = await heldEstimate()
		await release()
		expect(notice(w).text()).toBe("The sponsor you chose can't cover this fee right now. Public Fee Juice pays it instead.")
		expect(feeTrigger(w)).toBe("public")
		expect(offered(w, "sponsored")).toBe(false)
		expect(settled(w)).toBe("exposed")
		w.unmount()
	})

	test.each([
		["profile", { profile: { id: "p2" } }],
		["account", { account: { address: "0xother" } }],
		["network", { network: { id: "n2", chainId: TOKEN.chainId } }],
	])("the %s switched while its estimate was out: no notice, and both rows offered", async (_case, identity) => {
		const { w, appStore, release } = await heldEstimate()
		Object.assign(appStore, identity)
		await flushPromises()
		await release()
		expect(notice(w).exists()).toBe(false)
		expect(offered(w, "sponsored")).toBe(true)
		expect(offered(w, "public")).toBe(true)
		w.unmount()
	})
})

describe("send page with the real fee card — its price reads", () => {
	test("the page and its fee card each ask for a stale-on-connect refresh, at mount and after a reconnect", async () => {
		const { w } = await mountSend(FUNDING["public Fee Juice only"])
		const clients = vi.mocked(PriceServiceClient).mock.results.map(({ value }) => value)
		const refreshes = () => clients.map((client) => vi.mocked(client.refreshIfStale).mock.calls.length)
		// The page's own client, then the card's.
		expect(refreshes()).toEqual([1, 1])
		for (const client of clients) client.onConnected.invoke()
		await flushPromises()
		expect(refreshes()).toEqual([2, 2])
		w.unmount()
	})
})

describe("send page with the real fee card — the review sheet's fee", () => {
	test("repeats the card's dollars, never the page's own quote", async () => {
		mocks.estimateTransferFee.mockResolvedValue({ maxFee: HELD, gasDetails: {} })
		const { w } = await mountSend(FUNDING["public Fee Juice only"])
		await fillForm(w)
		await estimateLands()
		// Every price client holds a different quote, as after a reconnect that refreshed only one.
		vi.mocked(PriceServiceClient).mock.results.forEach(({ value }, i) => {
			value.onQuotesUpdated.invoke({
				quotes: { aztec: { coingeckoId: "aztec", usd: 0.01 * (i + 1), fetchedAt: Date.now(), providerUpdatedAt: null } },
				pricedTokens: {},
				tokenIcons: {},
			})
		})
		await flushPromises()
		expect(vi.mocked(PriceServiceClient).mock.results.length).toBeGreaterThan(1)

		const shown = w.get('[data-testid="stub-fee-cost"]').attributes("data-usd")
		expect(shown).toMatch(/^\$0\.0\d0$/)
		await submit(w).trigger("click")
		expect(w.get('[data-testid="send-review-fee"] span').text()).toBe(`Fee · ~1 FJ (${shown})`)
		w.unmount()
	})
})

describe("send page — the real token card while the tokens load", () => {
	test("a tap during the load opens nothing; once the tokens arrive, a tap opens the picker", async () => {
		const tokens = deferred<unknown[]>()
		mocks.getTokens.mockReturnValueOnce(tokens.promise)
		const { w, popupStore } = await mountSend(FUNDING["both Fee Juices"], { realTokenCard: true })
		await toForm(w)
		await w.get('[data-testid="send-token-trigger"]').trigger("click")
		expect(popupStore.isOpened("new_token")).toBe(false)
		expect(popupStore.isOpened("select_token")).toBe(false)

		tokens.resolve([TOKEN])
		await flushPromises()
		await w.get('[data-testid="send-token-trigger"]').trigger("click")
		expect(popupStore.isOpened("select_token")).toBe(true)
		w.unmount()
	})
})

describe("send page — an estimate queued behind an earlier send", () => {
	const ESTIMATE = { maxFee: "1000", gasDetails: {} }
	const QUEUED = { queued: true, tokenSpent: false }
	const queuedRow = (w: W) => w.get('[data-testid="stub-fee-cost"]').attributes("data-queued") === "true"
	const sendDisabled = (w: W) => submit(w).attributes("disabled") !== undefined

	async function filled() {
		vi.useFakeTimers()
		const mounted = await mountSend(FUNDING["both Fee Juices"])
		await fillForm(mounted.w)
		await setSide(mounted.w, "from", "public")
		await setSide(mounted.w, "to", "public")
		return mounted
	}

	test("the fee row reads queued and Send stays disabled until the real estimate lands", async () => {
		mocks.estimateTransferFee.mockResolvedValueOnce(QUEUED).mockResolvedValueOnce(QUEUED).mockResolvedValue(ESTIMATE)
		const { w } = await filled()
		await vi.advanceTimersByTimeAsync(800)
		await flushPromises()
		expect(queuedRow(w)).toBe(true)
		expect(sendDisabled(w)).toBe(true)
		await submit(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(2_000)
		await flushPromises()
		expect(queuedRow(w)).toBe(true)
		await vi.advanceTimersByTimeAsync(2_000)
		await flushPromises()
		expect(queuedRow(w)).toBe(false)
		expect(sendDisabled(w)).toBe(false)
		expect(mocks.openToast).not.toHaveBeenCalled()
		w.unmount()
	})

	const CAPPED = { ...QUEUED, cap: { basis: "3577824000000000000", cap: "4472280000000000000" } }
	const capShown = (w: W) => w.get('[data-testid="stub-fee-cost"]').attributes("data-cap")

	async function queuedPrivately(funding: Funding) {
		vi.useFakeTimers()
		mocks.estimateTransferFee.mockResolvedValue(CAPPED)
		const mounted = await mountSend(funding)
		await fillForm(mounted.w)
		await vi.advanceTimersByTimeAsync(800)
		await flushPromises()
		return mounted
	}

	test("the fee line quotes the queued cap in the card's own dollars, never the page's", async () => {
		const { w } = await queuedPrivately(FUNDING["private Fee Juice only"])
		// Every price client holds a different quote, as after a reconnect that refreshed only one.
		vi.mocked(PriceServiceClient).mock.results.forEach(({ value }, i) => {
			value.onQuotesUpdated.invoke({
				quotes: { aztec: { coingeckoId: "aztec", usd: 0.01 * (i + 1), fetchedAt: Date.now(), providerUpdatedAt: null } },
				pricedTokens: {},
				tokenIcons: {},
			})
		})
		await flushPromises()
		const card = w.getComponent({ name: "FeeSettingsCard" })
		const figures = card.emitted<[{ cap: { usd: string | null } } | null]>("update:queuedCapFigures")?.at(-1)?.[0]
		expect(figures?.cap.usd).toMatch(/^\$/)
		expect(w.get('[data-testid="send-fee-line-note"]').text()).toContain(`${figures?.cap.usd} (4.47228 FJ)`)
		w.unmount()
	})

	test("with a cap and Private Fee Juice: the review offers Queue send, and Send now sends the cap with no estimate to reuse", async () => {
		const { w } = await queuedPrivately(FUNDING["private Fee Juice only"])
		expect(capShown(w)).toBe("4.47228")
		expect(submit(w).text()).toBe("Review send")
		expect(sendDisabled(w)).toBe(false)
		await submit(w).trigger("click")
		expect(w.get('[data-testid="send-review-fee-cap"]').text()).toBe(
			"Fee up to ~4.47228 FJ, based on your last send. If it comes out higher, we ask again.",
		)
		expect(sendNow(w).text()).toBe("Queue send")
		await armed()
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		const args = mocks.executeTransfer.mock.calls[0] as unknown[]
		expect(args[8]).toBeUndefined()
		expect(args[9]).toBe("4472280000000000000")
		expect(args[10]).toBeUndefined()
		w.unmount()
	})

	test("once the wallet reports this estimate's run, the row leaves queued and its cap, and Send waits for the fee", async () => {
		const { w } = await queuedPrivately(FUNDING["private Fee Juice only"])
		expect(capShown(w)).toBe("4.47228")
		const run = deferred<unknown>()
		mocks.estimateTransferFee.mockReturnValueOnce(run.promise)
		await vi.advanceTimersByTimeAsync(2_000)
		await flushPromises()
		const calls = mocks.estimateTransferFee.mock.calls
		const token = (calls.at(-1) as unknown[])[8] as string
		expect((calls.at(-2) as unknown[])[8]).toBe(token)
		estimateEvents.onEstimateStarted.invoke({ estimateToken: "another-window" })
		await flushPromises()
		expect(queuedRow(w)).toBe(true)
		estimateEvents.onEstimateStarted.invoke({ estimateToken: token })
		await flushPromises()
		expect(queuedRow(w)).toBe(false)
		expect(capShown(w)).toBeUndefined()
		expect(sendDisabled(w)).toBe(true)
		run.resolve({ maxFee: "1000", gasDetails: {} })
		await flushPromises()
		expect(sendDisabled(w)).toBe(false)
		w.unmount()
	})

	test("Nulo's sponsor paying: the answered row and the review's Queue send, which sends no cap and no estimate to reuse", async () => {
		// The answer carries a cap, as one for a self-paid shape would: a send nobody caps must not take it.
		const { w } = await queuedPrivately(FUNDING["no gas, a sponsor"])
		expect(queuedRow(w)).toBe(true)
		expect(w.get('[data-testid="stub-fee-cost"]').attributes("data-payer")).toBe("sponsor")
		expect(capShown(w)).toBeUndefined()
		expect(submit(w).text()).toBe("Review send")
		expect(sendDisabled(w)).toBe(false)
		await submit(w).trigger("click")
		expect(w.get('[data-testid="send-review-fee-queued"]').text()).toBe("Fee · Goes out after your earlier send.")
		expect(sendNow(w).text()).toBe("Queue send")
		await armed()
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		const args = mocks.executeTransfer.mock.calls[0] as unknown[]
		expect(args[7]).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		expect(args[8]).toBeUndefined()
		expect(args[9]).toBeUndefined()
		expect(args[10]).toBeUndefined()
		w.unmount()
	})

	test("a sponsor added by hand: the queued row stays, Send stays disabled, nothing is sent", async () => {
		const { w } = await queuedPrivately(FUNDING["no gas, a hand-added sponsor picked"])
		expect(queuedRow(w)).toBe(true)
		expect(w.get('[data-testid="stub-fee-cost"]').attributes("data-payer")).toBe("unvouched")
		// The held estimate is still the one the button waits for.
		expect(submit(w).text()).toBe("Estimating fee")
		expect(sendDisabled(w)).toBe(true)
		await submit(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		w.unmount()
	})

	test("a capped answer to a superseded estimate never offers Queue send", async () => {
		const stale = deferred<unknown>()
		const fresh = deferred<unknown>()
		mocks.estimateTransferFee.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
		vi.useFakeTimers()
		const { w } = await mountSend(FUNDING["private Fee Juice only"])
		await fillForm(w)
		await vi.advanceTimersByTimeAsync(800)
		await w.get('[data-testid="stub-amount"]').setValue("2")
		await vi.advanceTimersByTimeAsync(800)
		await flushPromises()
		stale.resolve(CAPPED)
		await vi.advanceTimersByTimeAsync(0)
		await flushPromises()
		expect(capShown(w)).toBeUndefined()
		expect(submit(w).text()).toBe("Estimating fee")
		expect(sendDisabled(w)).toBe(true)
		w.unmount()
	})

	test("a queued answer to a superseded estimate never marks the new one queued", async () => {
		const stale = deferred<unknown>()
		mocks.estimateTransferFee.mockReturnValueOnce(stale.promise).mockResolvedValue(ESTIMATE)
		const { w } = await filled()
		await vi.advanceTimersByTimeAsync(800)
		await w.get('[data-testid="stub-amount"]').setValue("2")
		await vi.advanceTimersByTimeAsync(800)
		await flushPromises()
		stale.resolve(QUEUED)
		await vi.advanceTimersByTimeAsync(0)
		await flushPromises()
		expect(queuedRow(w)).toBe(false)
		expect(sendDisabled(w)).toBe(false)
		w.unmount()
	})
})

describe("send page — an estimate that runs long", () => {
	const PRIVATE_FJ = FUNDING["both Fee Juices"]
	const slowRow = (w: W) => w.find('[data-testid="fee-estimate-slow"]')
	const neverAnswers = () => mocks.estimateTransferFee.mockImplementation(() => new Promise(() => {}))

	test("the button reads Estimating fee; at 20 s the bar gives way to the sentence and Try again, which asks again and restarts the clock", async () => {
		neverAnswers()
		const { w } = await mountSend(PRIVATE_FJ, { realFeeRow: true })
		await fillForm(w)
		expect(submit(w).text()).toBe("Estimating fee")
		await vi.advanceTimersByTimeAsync(19_900)
		expect(slowRow(w).exists()).toBe(false)
		await vi.advanceTimersByTimeAsync(100)
		expect(slowRow(w).text()).toBe("You payTaking longer than usual.Try again")
		expect(submit(w).text()).toBe("Estimating fee")

		await w.get('[data-testid="fee-estimate-retry"]').trigger("click")
		expect(slowRow(w).exists()).toBe(false)
		await vi.advanceTimersByTimeAsync(800)
		const [first, retry] = mocks.estimateTransferFee.mock.calls
		expect(retry?.slice(0, 8)).toEqual(first?.slice(0, 8))
		expect(retry?.[8]).not.toBe(first?.[8])
		await vi.advanceTimersByTimeAsync(19_000)
		expect(slowRow(w).exists()).toBe(false)
		await vi.advanceTimersByTimeAsync(200)
		expect(slowRow(w).exists()).toBe(true)
		w.unmount()
	})

	test("an estimate that lands first shows its figure and Review send, and its clock never fires", async () => {
		const held = deferred<unknown>()
		mocks.estimateTransferFee.mockReturnValueOnce(held.promise)
		const { w } = await mountSend(PRIVATE_FJ, { realFeeRow: true })
		await fillForm(w)
		await vi.advanceTimersByTimeAsync(5_000)
		held.resolve(LANDED)
		await flushPromises()
		await vi.advanceTimersByTimeAsync(30_000)
		expect(slowRow(w).exists()).toBe(false)
		expect(w.find('[data-testid="fee-estimate"]').exists()).toBe(true)
		expect(submit(w).text()).toBe("Review send")
		w.unmount()
	})

	test("the review open when its estimate is asked again: Send now reads Estimating fee, and at 20 s its fee line says so with Try again", async () => {
		const { w } = await mountSend(PRIVATE_FJ, { realFeeRow: true })
		await fillForm(w)
		await estimateLands()
		await submit(w).trigger("click")
		expect(sheetOpen(w)).toBe(true)
		const asked = mocks.estimateTransferFee.mock.calls.length
		neverAnswers()
		// The picked PrivateFPC deleted while the review is open: the card's walk moves on, and the fee is asked again.
		fpcEvents.onFpcDeleted.invoke(PRIVATE_FPC)
		await nextTick()
		expect(sheetOpen(w)).toBe(true)
		const fee = () => w.get('[data-testid="send-review-fee"]')
		expect(sendNow(w).text()).toBe("Estimating fee")
		expect(fee().text()).toContain("Fee · —")
		await vi.advanceTimersByTimeAsync(20_000)
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(asked + 1)
		expect(fee().text()).toContain("Fee · Taking longer than usual. Try again")
		await w.get('[data-testid="send-review-fee-retry"]').trigger("click")
		await vi.advanceTimersByTimeAsync(800)
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(asked + 2)
		expect(fee().text()).toContain("Fee · —")
		w.unmount()
	})
})

describe("send page — the button waits for the current input's estimate", () => {
	const sendDisabled = (w: W) => submit(w).attributes("disabled") !== undefined
	const PUBLIC_FJ = FUNDING["public Fee Juice only"]
	const failedRow = (w: W) => w.find('[data-testid="fee-estimate-failed"]')

	test("off until the estimate lands; a press during the debounce sends nothing; a new input turns it off again", async () => {
		const { w } = await mountSend(FUNDING["both Fee Juices"])
		await fillForm(w)
		expect(sendDisabled(w)).toBe(true)
		await submit(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()

		await estimateLands()
		expect(sendDisabled(w)).toBe(false)
		await w.get('[data-testid="stub-amount"]').setValue("2")
		expect(sendDisabled(w)).toBe(true)
		await estimateLands()
		expect(sendDisabled(w)).toBe(false)
		await submit(w).trigger("click")
		await armed()
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		w.unmount()
	})

	test("two presses of the button in one task open one review; two of Send now in one task send once", async () => {
		const { w, popupStore } = await mountSend(FUNDING["both Fee Juices"])
		await fillForm(w)
		await estimateLands()
		expect(sendDisabled(w)).toBe(false)
		expect(sendEvent(submit(w).element, "click")).toBeDefined()
		expect(sendEvent(submit(w).element, "click")).toBeDefined()
		await flushPromises()
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		expect([popupStore.len, popupStore.popups.send_review?.order]).toEqual([1, 0])
		await armed()
		expect(sendEvent(sendNow(w).element, "click")).toBeDefined()
		expect(sendEvent(sendNow(w).element, "click")).toBeDefined()
		await flushPromises()
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		w.unmount()
	})

	test("a failed estimate keeps it off and says so; the next input estimates again, and an emptied amount reads the hint", async () => {
		mocks.estimateTransferFee.mockRejectedValueOnce(new Error("node down"))
		const { w } = await mountSend(PUBLIC_FJ, { realFeeRow: true })
		await fillForm(w)
		await estimateLands()
		expect(mocks.openToast).toHaveBeenCalledWith({ kind: "error", label: "Couldn't estimate fee. Try again." })
		expect(failedRow(w).exists()).toBe(true)
		expect(sendDisabled(w)).toBe(true)
		await submit(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()

		// A later snack is someone else's: the next question leaves it on screen.
		mocks.openToast({ kind: "success", label: "Address is copied" })
		await w.get('[data-testid="stub-amount"]').setValue("2")
		expect(snack.value?.label).toBe("Address is copied")
		await estimateLands()
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(2)
		expect(sendDisabled(w)).toBe(false)

		mocks.estimateTransferFee.mockRejectedValueOnce(new Error("node down"))
		await w.get('[data-testid="stub-amount"]').setValue("3")
		await estimateLands()
		expect(failedRow(w).exists()).toBe(true)
		await w.get('[data-testid="stub-amount"]').setValue("")
		expect(failedRow(w).exists()).toBe(false)
		expect(w.getComponent({ name: "FeeCostReadout" }).text()).toBe("Fee estimated after simulation")
		w.unmount()
	})

	test("a failed estimate offers Try again on the fee row, which asks the same estimate and closes the failure's snack", async () => {
		mocks.estimateTransferFee.mockRejectedValueOnce(new Error("node down"))
		const { w } = await mountSend(PUBLIC_FJ, { realFeeRow: true })
		await fillForm(w)
		await estimateLands()
		expect(snack.value).toMatchObject({ kind: "error", label: "Couldn't estimate fee. Try again." })
		expect(failedRow(w).text()).toBe("You payCouldn't estimate fee.Try again")
		expect(sendDisabled(w)).toBe(true)

		await w.get('[data-testid="fee-estimate-retry"]').trigger("click")
		expect(snack.value).toBeNull()
		await estimateLands()
		const [first, retry] = mocks.estimateTransferFee.mock.calls
		expect(retry?.slice(0, 8)).toEqual(first?.slice(0, 8))
		expect(retry?.[8]).not.toBe(first?.[8])
		expect(w.find('[data-testid="fee-estimate"]').exists()).toBe(true)
		expect(sendDisabled(w)).toBe(false)
		w.unmount()
	})

	test("an estimate the account's own Fee Juice cannot cover keeps it off, and the card says by how much", async () => {
		mocks.estimateTransferFee.mockResolvedValueOnce({
			...LANDED,
			feeJuiceShortfall: { maxFee: "2100000000000000", balance: "1500000000000000" },
		})
		const { w } = await mountSend(PUBLIC_FJ)
		await fillForm(w)
		await estimateLands()
		expect(w.get('[data-testid="fee-juice-shortfall"]').text()).toBe("This send can cost up to ~0.0021 FJ. You have 0.0015 FJ.")
		expect(sendDisabled(w)).toBe(true)
		await submit(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()

		await w.get('[data-testid="stub-amount"]').setValue("2")
		await estimateLands()
		expect(w.find('[data-testid="fee-juice-shortfall"]').exists()).toBe(false)
		expect(sendDisabled(w)).toBe(false)
		w.unmount()
	})

	test("an amount over the balance asks nothing; the balance rising to cover it asks for that amount and turns it on", async () => {
		const { w } = await mountSend(FUNDING["no gas, a sponsor"])
		await toForm(w)
		await w.get('[data-testid="stub-amount"]').setValue("6")
		await estimateLands()
		expect(mocks.estimateTransferFee).not.toHaveBeenCalled()
		expect(sendDisabled(w)).toBe(true)

		balanceUpdated().invoke({ ...BALANCE, privateBalance: "10000000", updatedAt: 2 })
		await flushPromises()
		await estimateLands()
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)
		expect(mocks.estimateTransferFee.mock.calls[0]?.[6]).toBe(6_000_000n)
		expect(sendDisabled(w)).toBe(false)
		w.unmount()
	})

	test("the fee row reads the same hint for an amount typed over the balance and for a landed amount the balance falls below", async () => {
		const { w } = await mountSend(FUNDING["no gas, a sponsor"], { realFeeRow: true })
		const row = () => w.getComponent({ name: "FeeCostReadout" })
		await toForm(w)
		await w.get('[data-testid="stub-amount"]').setValue("6")
		await estimateLands()
		expect(row().text()).toBe("Fee estimated after simulation")

		await w.get('[data-testid="stub-amount"]').setValue("1.5")
		await estimateLands()
		expect(row().find('[data-testid="fee-estimate"]').exists()).toBe(true)

		balanceUpdated().invoke({ ...BALANCE, privateBalance: "1000000", updatedAt: 2 })
		await flushPromises()
		expect(row().find('[data-testid="fee-estimate"]').exists()).toBe(false)
		expect(row().text()).toBe("Fee estimated after simulation")
		w.unmount()
	})

	test("an estimate for the network just left never enables it", async () => {
		const held = deferred<unknown>()
		mocks.estimateTransferFee.mockReturnValueOnce(held.promise)
		const next = deferred<unknown>()
		mocks.estimateTransferFee.mockReturnValueOnce(next.promise)
		const { w, appStore } = await mountSend(PUBLIC_FJ)
		await fillForm(w)
		await vi.advanceTimersByTimeAsync(800)
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)

		appStore.network = { id: "n2", chainId: TOKEN.chainId } as never
		await flushPromises()
		held.resolve(LANDED)
		await flushPromises()
		expect(sendDisabled(w)).toBe(true)
		await estimateLands()
		expect(mocks.estimateTransferFee.mock.calls.at(-1)?.[0]).toBe("n2")
		next.resolve(LANDED)
		await flushPromises()
		expect(sendDisabled(w)).toBe(false)
		w.unmount()
	})
})

describe("send page — Same as last time, over the real amount card", () => {
	/** Two decimals, so its amount reads in places of its own. */
	const OTHER = { ...TOKEN, id: 8, contract: `0x${"d".repeat(64)}`, symbol: "OTH", decimals: 2 }
	/** A succeeded popup transfer to `ANA`, as the journal keeps it. */
	const sent = (overrides: Record<string, unknown> = {}) => ({
		id: "op-1",
		kind: "transfer",
		origin: "popup",
		profileId: "p1",
		networkId: "n1",
		accountAddress: ACCOUNT,
		recipientAddress: ANA,
		amountRaw: "2500000",
		tokenId: TOKEN.id,
		transferType: TransferType.PrivateToPublic,
		progress: { stage: "succeeded" },
		error: null,
		terminalAt: 1_000,
		attempts: 0,
		createdAt: 900,
		updatedAt: 1_000,
		...overrides,
	})
	const amountText = () => (document.querySelector('[data-testid="send-amount-input"]') as HTMLInputElement | null)?.value
	const again = (w: W) => w.find('[data-testid="send-again"]')
	const payRecent = (w: W) => w.get('[data-testid="send-recent"]').trigger("click")

	test("a recent payee's last send fills its token, its amount in the token's places with no grouping, and its arrival, then goes", async () => {
		mocks.getTokens.mockResolvedValue([TOKEN, OTHER])
		mocks.getTokenBalances.mockResolvedValue([BALANCE, { ...BALANCE, id: "b8", token: OTHER, privateBalance: "500000000" }])
		mocks.getOperations.mockResolvedValue([sent({ tokenId: OTHER.id, amountRaw: "123456750" })])
		const { w, cacheStore } = await mountSend(FUNDING["both Fee Juices"], { realAmountCard: true })
		expect(w.get('[data-testid="send-recent"]').attributes("data-address")).toBe(ANA)
		await payRecent(w)
		expect(w.get('[data-testid="send-payee-address"]').text()).toBe(ANA)
		expect(w.find('[data-testid="send-payee-check"]').exists()).toBe(false)
		expect(again(w).text()).toBe("Same as last time: 1,234,567.5 OTH, publicly")
		expect(document.activeElement).toBe(again(w).element)

		await again(w).trigger("click")
		await flushPromises()
		expect(cacheStore.activeTokenIdx).toBe(OTHER.id)
		expect(amountText()).toBe("1234567.5")
		expect(checkedSide(w, "to")).toEqual(["public"])
		expect(again(w).exists()).toBe(false)
		expect(document.activeElement?.getAttribute("data-testid")).toBe("send-amount-input")
		w.unmount()
	})

	describe("in USD mode", () => {
		const PRICED = { ...TOKEN, chainId: CHAIN_IDS.TESTNET, contract: TEST_TOKENS.USDC, symbol: "USDC" }
		const PLAIN = { ...OTHER, chainId: CHAIN_IDS.TESTNET }

		test.each([
			["the same token, its conversion landed", PRICED, "2500000", true],
			["another token, its conversion landed", PLAIN, "250", true],
			["the same token, its conversion still pending", PRICED, "2500000", false],
		])("%s: a press ends the USD session and the amount it sets survives", async (_name, last, amountRaw, landed) => {
			mocks.getTokens.mockResolvedValue([PRICED, PLAIN])
			mocks.getTokenBalances.mockResolvedValue([
				{ ...BALANCE, token: PRICED },
				{ ...BALANCE, id: "b8", token: PLAIN, privateBalance: "500" },
			])
			mocks.getOperations.mockResolvedValue([sent({ tokenId: last.id, amountRaw })])
			const { w, cacheStore } = await mountSend(FUNDING["both Fee Juices"], { realAmountCard: true, chainId: CHAIN_IDS.TESTNET })
			for (const { value } of vi.mocked(PriceServiceClient).mock.results) {
				value.onQuotesUpdated.invoke({
					quotes: { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } },
					pricedTokens: TEST_PRICED_TOKENS,
					tokenIcons: {},
				})
			}
			await payRecent(w)
			expect(cacheStore.activeTokenIdx).toBe(PRICED.id)
			await w.get('[data-testid="send-amount-fiat-toggle"]').trigger("click")
			await w.get('[data-testid="send-amount-fiat-input"]').setValue("2")
			if (landed) await vi.waitFor(() => expect(w.get('[data-testid="send-amount-derived"]').text()).toBe("≈ 2 USDC"))
			else expect(w.find('[data-testid="send-amount-converting"]').exists()).toBe(true)

			await again(w).trigger("click")
			await flushPromises()
			// Past the conversion's 250 ms debounce, so a pending one would have landed by now.
			await vi.advanceTimersByTimeAsync(300)
			expect(w.find('[data-testid="send-amount-fiat-input"]').exists()).toBe(false)
			expect(cacheStore.activeTokenIdx).toBe(last.id)
			expect(amountText()).toBe("2.5")
			expect(checkedSide(w, "to")).toEqual(["public"])
			expect(again(w).exists()).toBe(false)
			w.unmount()
		})
	})

	test("the words keep every place of the last amount, past eight", async () => {
		const FINE = { ...TOKEN, id: 9, contract: `0x${"e".repeat(64)}`, symbol: "FIN", decimals: 18 }
		mocks.getTokens.mockResolvedValue([TOKEN, FINE])
		mocks.getTokenBalances.mockResolvedValue([BALANCE, { ...BALANCE, id: "b9", token: FINE, privateBalance: "5000000000" }])
		mocks.getOperations.mockResolvedValue([sent({ tokenId: FINE.id, amountRaw: "1000000001" })])
		const { w } = await mountSend(FUNDING["both Fee Juices"], { realAmountCard: true })
		expect(w.get('[data-testid="send-recent"]').text()).toContain("0.000000001000000001 FIN")
		await payRecent(w)
		expect(again(w).text()).toBe("Same as last time: 0.000000001000000001 FIN, publicly")
	})

	test("a send recorded before the journal kept its sides lists in Recent, with no side, and offers no Same as last time", async () => {
		mocks.getOperations.mockResolvedValue([sent({ transferType: undefined })])
		const { w } = await mountSend(FUNDING["both Fee Juices"], { realAmountCard: true })
		const recent = w.get('[data-testid="send-recent"]')
		expect(recent.attributes("data-address")).toBe(ANA)
		expect(recent.text()).toContain("Last: 2.5 TST")
		expect(recent.text()).not.toMatch(/privately|publicly/)
		await payRecent(w)
		expect(w.get('[data-testid="send-payee-address"]').text()).toBe(ANA)
		expect(w.find('[data-testid="send-payee-check"]').exists()).toBe(false)
		expect(again(w).exists()).toBe(false)
		w.unmount()
	})
})
