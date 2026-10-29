/**
 * The Send page with its cards stubbed: what the footer does with a click, what the review sheet
 * authorises, and what the submit tail does with the promise. The fee card's real behaviour, and
 * the tag ⇔ gate ⇔ strip equivalence it feeds, is `send.integration.test.ts`.
 */
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ImportedAccountUnusableError, JobCancelledError, TermsAcceptanceRequiredError } from "@nulo/extension-messaging/errors"
import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest"
import { nextTick, reactive } from "vue"
import { flaggedKeysOf } from "@/utils/token-flag"
import { TEST_FLAGGED } from "@/wallet/services/token-list/list.fixture"

const ACCOUNT = "0xacct"
const DESTINATION = `0x2${"b".repeat(63)}`
const HASH = `0x${"e".repeat(64)}`
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
	executionDisconnect: vi.fn(),
	getTokens: vi.fn(),
	getTokenBalances: vi.fn(),
	getContacts: vi.fn(async (): Promise<unknown[]> => []),
	openToast: vi.fn(),
	routerBack: vi.fn(),
	routerReplace: vi.fn(),
	routerPush: vi.fn(),
	legalStatus: vi.fn(async () => "current"),
	refreezeQuote: vi.fn(),
	focusAmount: vi.fn(),
	flagged: { current: [] as string[] },
}))

vi.mock("@/wallet/services/execution/client", () => ({
	ExecutionServiceClient: vi.fn(function () {
		return {
			connect: vi.fn(),
			disconnect: mocks.executionDisconnect,
			executeTransfer: mocks.executeTransfer,
			estimateTransferFee: mocks.estimateTransferFee,
			cancelEstimate: mocks.cancelEstimate,
			onEstimateStarted: { add: vi.fn(), remove: vi.fn() },
		}
	}),
}))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onTokenAdded: liveBus(),
			onTokenUpdated: liveBus(),
			onTokenDeleted: liveBus(),
			getTokens: mocks.getTokens,
		}
	}),
}))
vi.mock("@/wallet/services/token-balance/client", () => ({
	TokenBalanceServiceClient: vi.fn(function () {
		return {
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
			onContactAdded: liveBus(),
			onContactUpdated: liveBus(),
			onContactDeleted: liveBus(),
			getContacts: mocks.getContacts,
		}
	}),
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: new EventHandler(),
			onConnected: new EventHandler(),
			getQuotes: vi.fn(async () => ({ quotes: {}, pricedTokens: {}, flaggedTokens: mocks.flagged.current })),
			refreshIfStale: vi.fn(async () => ({ quotes: {}, pricedTokens: {}, flaggedTokens: mocks.flagged.current })),
		}
	}),
}))
vi.mock("@/wallet/services/transaction/client", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/wallet/services/transaction/client")>()),
	TransactionServiceClient: vi.fn(function () {
		return { connect: vi.fn(), disconnect: vi.fn(), onTransactionAdded: new EventHandler(), onTransactionUpdated: new EventHandler() }
	}),
}))
vi.mock("@/utils/core", () => ({
	managers: {
		legal: {
			onAcceptanceChanged: new EventHandler(),
			onConnected: new EventHandler(),
			getStatus: mocks.legalStatus,
			accept: vi.fn(),
		},
	},
}))
vi.mock("@/composables/toast.js", () => ({
	useToast: () => ({ openToast: mocks.openToast }),
}))
const route = reactive({ name: "popup-send", path: "/popup/send", query: {} as Record<string, string>, meta: {} })
vi.mock("vue-router", () => ({
	useRoute: () => route,
	useRouter: () => ({ back: mocks.routerBack, replace: mocks.routerReplace, push: mocks.routerPush }),
	RouterLink: { template: "<a><slot /></a>" },
}))

import { REVIEW_ARM_MS } from "@/composables/useSendReview"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"
import { TRANSFER_STATUS_UNKNOWN_COPY, TRANSFER_TERMS_COPY } from "@/popup/utils/transfer-failure-copy"
import { IMPORTED_UNUSABLE_TOAST } from "@/components/stale-network/copy"
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
import { ContactServiceClient } from "@/wallet/services/contact/client"
import { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"
import { TokenServiceClient } from "@/wallet/services/token/client"
import { TransferType } from "@/wallet/services/transaction/client"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"
import { held, holdReads, liveBus } from "../../../tests/helpers/held-read"
import Send from "./send.vue"

const STUBS = {
	Flex: { template: '<div v-bind="$attrs"><slot /></div>', inheritAttrs: false },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i />" },
	SubPageHeader: { template: "<header />" },
	Banner: { template: '<div data-testid="stub-banner"><slot /></div>' },
	Button: {
		template: '<button v-bind="$attrs" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>',
		props: ["variant", "size", "disabled", "loading", "wide"],
		emits: ["click"],
		inheritAttrs: false,
	},
	SelectTokenCard: {
		name: "SelectTokenCard",
		template:
			"<div data-testid=\"stub-token-card\" :data-loading=\"loading ? 'true' : 'false'\" :data-failed=\"failed ? 'true' : 'false'\" :data-symbol=\"token?.symbol\" @click=\"$emit('retry')\" />",
		props: ["token", "loading", "failed", "onTokenAdded"],
		emits: ["retry"],
	},
	RecipientField: {
		template: '<input data-testid="stub-recipient" :value="searchTerm" @input="$emit(\'update:searchTerm\', $event.target.value)" />',
		props: ["searchTerm", "selectedContact", "candidates"],
		emits: ["update:searchTerm", "update:selectedContact"],
	},
	AmountCard: {
		name: "AmountCard",
		template:
			'<input data-testid="stub-amount" :data-token="token?.symbol" :data-balance="tokenBalanceByType" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: [
			"modelValue",
			"fiatMode",
			"fiatGuard",
			"token",
			"tokenBalanceByType",
			"balanceRawByType",
			"liveQuote",
			"proxyTicker",
			"exceedsBalance",
		],
		emits: ["update:modelValue", "update:fiatMode", "update:fiatGuard"],
		methods: { refreezeQuote: mocks.refreezeQuote, focusAmount: mocks.focusAmount },
	},
	FeeSettingsCard: {
		name: "FeeSettingsCard",
		template: '<div data-testid="stub-fee-card" :data-origin="originPrivacy" />',
		props: [
			"profile",
			"network",
			"account",
			"feeEstimate",
			"isEstimating",
			"originPrivacy",
			"payerNoticeShape",
			"amountTyped",
			"modelValue",
			"needsFeeJuice",
			"payer",
			"accountUnusable",
		],
		emits: ["update:modelValue", "update:needsFeeJuice", "update:payer", "update:accountUnusable"],
	},
	// The popup family under the real review sheet: what the sheet hands it, without trap or teleport.
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
/** The account's own Fee Juice: the one payer that names it. */
const FJ = { settings: { paymentMethod: { kind: "fj" } }, payer: { type: "fj", isProtocol: false } }
/** A protocol sponsor: hidden, one tap. */
const SPONSOR = { settings: { paymentMethod: { kind: "fpc", fpcId: "s1" } }, payer: { type: "fpc", fpcId: "s1", isProtocol: true } }

/** The identity the page reads for; a cold tab's settles after mount. */
function setIdentity(appStore: ReturnType<typeof useAppStore>) {
	appStore.profile = { id: "p1" } as never
	appStore.network = { id: "n1", chainId: TOKEN.chainId } as never
	appStore.account = { address: ACCOUNT } as never
}

/** What a landed estimate answers when a test names none. */
const LANDED = { maxFee: "1000", gasDetails: {} }

/** The page debounces its estimate by 800 ms; this lets the current input's estimate land. */
async function estimateLands() {
	await vi.advanceTimersByTimeAsync(800)
	await flushPromises()
}

async function mountSend(
	opts: { errorHandler?: (error: unknown) => void; realTokenCard?: boolean; realAmountCard?: boolean; cold?: boolean } = {},
) {
	vi.useFakeTimers()
	installChromeStorage()
	const pinia = createTestingPinia({ stubActions: false })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	if (!opts.cold) setIdentity(appStore)
	const cacheStore = useCacheStore(pinia)
	const popupStore = usePopupStore(pinia)
	const w = mount(Send, {
		attachTo: document.body,
		global: {
			plugins: [pinia],
			stubs: { ...STUBS, ...(opts.realTokenCard && { SelectTokenCard: false }), ...(opts.realAmountCard && { AmountCard: false }) },
			config: opts.errorHandler ? { errorHandler: opts.errorHandler } : {},
		},
	})
	await flushPromises()
	return { w, appStore, cacheStore, popupStore }
}

/** What the fee card would hand the page for a resolved method. */
async function feeCard(w: W, method: { settings: unknown; payer: unknown } | null) {
	const card = w.findComponent({ name: "FeeSettingsCard" }).vm
	card.$emit("update:payer", method?.payer ?? null)
	card.$emit("update:modelValue", method?.settings ?? null)
	await nextTick()
}

/** A complete, sendable form — a sponsor pays unless told otherwise, so nothing needs review. */
async function fillForm(w: W, method: { settings: unknown; payer: unknown } | null = SPONSOR) {
	await w.get('[data-testid="stub-recipient"]').setValue(DESTINATION)
	await w.get('[data-testid="stub-amount"]').setValue("1.5")
	await feeCard(w, method)
	await estimateLands()
}

const submit = (w: W) => w.get('[data-testid="send-submit"]')
const strip = (w: W) => w.find('[data-testid="send-publish-strip"]')
const sheetOpen = (w: W) => w.get('[data-testid="send-review-sheet"]').attributes("data-open") === "true"
const sendNow = (w: W) => w.get('[data-testid="send-review-submit"]')
const awaitingIds = (store: ReturnType<typeof useAppStore>) => store.awaitingTransactions.map((row) => row.id)
const lastClient = <T>(ctor: unknown) => (ctor as { mock: { results: { value: T }[] } }).mock.results.at(-1)?.value as T
const balanceUpdated = () => lastClient<{ onTokenBalanceUpdated: EventHandler<unknown> }>(TokenBalanceServiceClient).onTokenBalanceUpdated
const balanceAdded = () => lastClient<{ onTokenBalanceAdded: EventHandler<unknown> }>(TokenBalanceServiceClient).onTokenBalanceAdded

/** A transfer the test settles by hand. */
function pendingTransfer() {
	let resolve: (hash: string) => void = () => {}
	let reject: (err: unknown) => void = () => {}
	mocks.executeTransfer.mockImplementation(
		() =>
			new Promise<string>((res, rej) => {
				resolve = res
				reject = rej
			}),
	)
	return { resolve: (hash = HASH) => resolve(hash), reject: (err: unknown) => reject(err) }
}

beforeEach(() => {
	document.body.innerHTML = '<div id="popup"></div>'
	mocks.getTokens.mockResolvedValue([TOKEN])
	mocks.getTokenBalances.mockResolvedValue([BALANCE])
	mocks.executeTransfer.mockResolvedValue(undefined)
	mocks.estimateTransferFee.mockResolvedValue(LANDED)
	mocks.legalStatus.mockResolvedValue("current")
	vi.spyOn(console, "error").mockImplementation(() => {})
	vi.spyOn(console, "debug").mockImplementation(() => {})
})
afterEach(() => {
	mocks.flagged.current = []
	vi.clearAllMocks()
	vi.restoreAllMocks()
	vi.useRealTimers()
	document.body.innerHTML = ""
})

describe("send page — the submit tail", () => {
	test("a click posts the awaiting row, fires the transfer with the snapshotted args, and leaves", async () => {
		const { w, appStore } = await mountSend()
		await fillForm(w)
		expect(submit(w).attributes("disabled")).toBeUndefined()
		expect(submit(w).text()).toBe("Confirm Transaction")

		await submit(w).trigger("click")

		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		expect(mocks.executeTransfer).toHaveBeenCalledWith(
			"n1",
			ACCOUNT,
			TOKEN.id,
			TOKEN.contract,
			TransferType.Private,
			DESTINATION,
			1_500_000n,
			SPONSOR.settings,
			undefined,
			undefined,
			undefined,
		)
		expect(appStore.awaitingTransactions).toHaveLength(1)
		expect(appStore.awaitingTransactions[0]).toMatchObject({ account: ACCOUNT, destination: DESTINATION, contract: TOKEN.contract })
		expect(mocks.routerReplace).toHaveBeenCalledWith("/popup/general")
		expect(submit(w).text()).toBe("CONFIRMING")
		w.unmount()
	})

	test("a token updated after mount is sent with its new decimals", async () => {
		const { w } = await mountSend()
		mocks.getTokens.mockResolvedValue([{ ...TOKEN, decimals: 4 }])
		const client = (TokenServiceClient as unknown as { mock: { results: { value: { onTokenUpdated: EventHandler<unknown> } }[] } }).mock
		client.results.at(-1)?.value.onTokenUpdated.invoke({ ...TOKEN, decimals: 4, profileId: "p1" })
		await flushPromises()
		await fillForm(w)
		await submit(w).trigger("click")
		expect(mocks.executeTransfer.mock.calls[0]?.[6]).toBe(15_000n)
		expect(mocks.executeTransfer.mock.calls[0]?.[4]).toBe(TransferType.Private)
		w.unmount()
	})

	test("a token update that adds private transfers keeps the open page's public choice", async () => {
		const publicOnly = { ...TOKEN, hasPrivateTransfers: false }
		mocks.getTokens.mockResolvedValue([publicOnly])
		const { w, cacheStore } = await mountSend()
		cacheStore.preselectedBalanceType = "private"
		mocks.getTokens.mockResolvedValue([TOKEN])
		const client = (TokenServiceClient as unknown as { mock: { results: { value: { onTokenUpdated: EventHandler<unknown> } }[] } }).mock
		client.results.at(-1)?.value.onTokenUpdated.invoke({ ...TOKEN, profileId: "p1" })
		await flushPromises()
		await fillForm(w)
		await submit(w).trigger("click")
		expect(mocks.executeTransfer.mock.calls[0]?.[4]).toBe(TransferType.Public)
		w.unmount()
	})

	test("a token update that takes away private transfers moves the open page to public", async () => {
		const { w } = await mountSend()
		const publicOnly = { ...TOKEN, hasPrivateTransfers: false }
		mocks.getTokens.mockResolvedValue([publicOnly])
		const client = (TokenServiceClient as unknown as { mock: { results: { value: { onTokenUpdated: EventHandler<unknown> } }[] } }).mock
		client.results.at(-1)?.value.onTokenUpdated.invoke({ ...publicOnly, profileId: "p1" })
		await flushPromises()
		await fillForm(w)
		await submit(w).trigger("click")
		expect(mocks.executeTransfer.mock.calls[0]?.[4]).toBe(TransferType.Public)
		w.unmount()
	})

	test("a grouped amount of a million or more is what the review shows and what is sent", async () => {
		mocks.getTokenBalances.mockResolvedValue([{ ...BALANCE, privateBalance: "2000000000000" }])
		const { w } = await mountSend()
		await fillForm(w)
		await w.get('[data-testid="stub-amount"]').setValue("1,234,567.123456")
		await estimateLands()
		await strip(w).trigger("click")
		expect(w.get('[data-testid="send-review-amount"]').text()).toBe("1,234,567.123456TST")
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).toHaveBeenCalledWith(
			"n1",
			ACCOUNT,
			TOKEN.id,
			TOKEN.contract,
			TransferType.Private,
			DESTINATION,
			1_234_567_123_456n,
			SPONSOR.settings,
			undefined,
			undefined,
			undefined,
		)
		w.unmount()
	})

	test("two activations in the same tick, before the button is patched disabled, send once", async () => {
		const { w } = await mountSend()
		await fillForm(w)
		pendingTransfer()
		;(submit(w).element as HTMLButtonElement).click()
		;(submit(w).element as HTMLButtonElement).click()
		await flushPromises()
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		w.unmount()
	})

	test("resolved: the success snack names the send and its View opens the transaction; the awaiting row stays for the journal to replace", async () => {
		const { w, appStore } = await mountSend()
		await fillForm(w)
		const transfer = pendingTransfer()
		await submit(w).trigger("click")
		transfer.resolve()
		await flushPromises()
		expect(mocks.openToast).toHaveBeenCalledWith({
			kind: "success",
			label: "Transaction submitted",
			sub: "1.5 TST to 0x2bbb…bbbb",
			action: { label: "View", onSelect: expect.any(Function) },
		})
		mocks.openToast.mock.calls[0]?.[0].action.onSelect()
		expect(mocks.routerPush).toHaveBeenCalledWith(`/popup/tx/${HASH}`)
		expect(awaitingIds(appStore)).toHaveLength(1)
		expect(mocks.executionDisconnect).toHaveBeenCalledTimes(1)
		w.unmount()
		expect(mocks.executionDisconnect).toHaveBeenCalledTimes(1)
	})

	test.each([
		["a lock", (store: ReturnType<typeof useAppStore>) => (store.isLogined = false)],
		["a scope change", (store: ReturnType<typeof useAppStore>) => store.scopeEpoch++],
	])("%s while the transfer is in flight: the result opens no snack; the port still closes", async (_name, change) => {
		const { w, appStore } = await mountSend()
		await fillForm(w)
		const transfer = pendingTransfer()
		await submit(w).trigger("click")
		change(appStore)
		transfer.resolve()
		await flushPromises()
		expect(mocks.openToast).not.toHaveBeenCalled()
		expect(mocks.executionDisconnect).toHaveBeenCalledTimes(1)
		w.unmount()
	})

	test("rejected with no record named: exactly this awaiting row is removed and the toast says the status is unknown", async () => {
		const { w, appStore } = await mountSend()
		await fillForm(w)
		appStore.addAwaitingTransaction({ id: "other", account: ACCOUNT, destination: DESTINATION, contract: TOKEN.contract })
		const transfer = pendingTransfer()
		await submit(w).trigger("click")
		expect(awaitingIds(appStore)).toHaveLength(2)
		transfer.reject(new Error("boom"))
		await flushPromises()
		expect(awaitingIds(appStore)).toEqual(["other"])
		expect(mocks.openToast).toHaveBeenCalledWith({ kind: "error", label: "Send status unknown", sub: TRANSFER_STATUS_UNKNOWN_COPY })
		expect(console.error).toHaveBeenCalledWith("[send] executeTransfer failed:", expect.any(Error))
		expect(mocks.executionDisconnect).toHaveBeenCalledTimes(1)
		w.unmount()
	})

	test("rejected by the terms wall: the terms copy, logged at debug", async () => {
		const { w } = await mountSend()
		await fillForm(w)
		const transfer = pendingTransfer()
		await submit(w).trigger("click")
		transfer.reject(new TermsAcceptanceRequiredError())
		await flushPromises()
		expect(mocks.openToast).toHaveBeenCalledWith({ kind: "error", label: "Send failed", sub: TRANSFER_TERMS_COPY })
		expect(console.debug).toHaveBeenCalledWith("[send] executeTransfer refused:", expect.any(TermsAcceptanceRequiredError))
		expect(console.error).not.toHaveBeenCalledWith("[send] executeTransfer failed:", expect.anything())
		w.unmount()
	})

	test("cancelled by the user: the row goes, no toast", async () => {
		const { w, appStore } = await mountSend()
		await fillForm(w)
		const transfer = pendingTransfer()
		await submit(w).trigger("click")
		transfer.reject(new JobCancelledError())
		await flushPromises()
		expect(awaitingIds(appStore)).toHaveLength(0)
		expect(mocks.openToast).not.toHaveBeenCalled()
		w.unmount()
	})

	test("unmounting mid-flight leaves the execution port to the transfer's own teardown", async () => {
		const { w } = await mountSend()
		await fillForm(w)
		const transfer = pendingTransfer()
		await submit(w).trigger("click")
		w.unmount()
		expect(mocks.executionDisconnect).not.toHaveBeenCalled()
		transfer.resolve()
		await flushPromises()
		expect(mocks.executionDisconnect).toHaveBeenCalledTimes(1)
	})

	test("unmounting with nothing in flight disconnects the execution port once", async () => {
		const { w } = await mountSend()
		await fillForm(w)
		w.unmount()
		expect(mocks.executionDisconnect).toHaveBeenCalledTimes(1)
	})
})

describe("send page — the asset section", () => {
	test("renders its label without a render error and names no network", async () => {
		const errors: unknown[] = []
		const { w } = await mountSend({ errorHandler: (error) => errors.push(error) })
		expect(errors).toEqual([])
		expect(w.text()).toContain("Select Asset")
		expect(w.text()).not.toContain("Network:")
		w.unmount()
	})
})

describe("send page — the footer", () => {
	test("no settings from the card: nothing is sendable", async () => {
		const { w } = await mountSend()
		await fillForm(w, null)
		expect(submit(w).attributes("disabled")).toBeDefined()
		await submit(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		w.unmount()
	})

	test("a well-formed recipient off the curve is never estimated or sent; one on it is", async () => {
		const { w } = await mountSend()
		await fillForm(w)
		mocks.estimateTransferFee.mockClear()
		await w.get('[data-testid="stub-recipient"]').setValue("0x24f20fb6e501242936eb1f47e2f51610f15e6c07486ed62012774e5f14ebd583")
		await estimateLands()
		expect(mocks.estimateTransferFee).not.toHaveBeenCalled()
		expect(submit(w).attributes("disabled")).toBeDefined()

		await w.get('[data-testid="stub-recipient"]').setValue(DESTINATION)
		await estimateLands()
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)
		expect(submit(w).attributes("disabled")).toBeUndefined()
		w.unmount()
	})

	test("an account whose imported key does not open closes Send onto Home with the A10 toast, once", async () => {
		const { w } = await mountSend()
		const card = w.findComponent({ name: "FeeSettingsCard" }).vm
		card.$emit("update:accountUnusable", true)
		await nextTick()
		card.$emit("update:accountUnusable", false)
		await nextTick()
		card.$emit("update:accountUnusable", true)
		await nextTick()
		expect(mocks.openToast).toHaveBeenCalledTimes(1)
		expect(mocks.openToast).toHaveBeenCalledWith({ kind: "error", ...IMPORTED_UNUSABLE_TOAST })
		expect(mocks.routerReplace).toHaveBeenCalledTimes(1)
		expect(mocks.routerReplace).toHaveBeenCalledWith("/popup/general")
		w.unmount()
	})

	test("a fee estimate refused for the imported key closes Send the same way, not with the estimate toast", async () => {
		mocks.estimateTransferFee.mockRejectedValue(ImportedAccountUnusableError.because("signing key missing"))
		const { w } = await mountSend()
		await fillForm(w)
		expect(mocks.openToast).toHaveBeenCalledTimes(1)
		expect(mocks.openToast).toHaveBeenCalledWith({ kind: "error", ...IMPORTED_UNUSABLE_TOAST })
		expect(mocks.routerReplace).toHaveBeenCalledWith("/popup/general")
		w.unmount()
	})

	test("needsFeeJuice from the card takes the footer over", async () => {
		const { w } = await mountSend()
		await fillForm(w)
		w.findComponent({ name: "FeeSettingsCard" }).vm.$emit("update:needsFeeJuice", true)
		await nextTick()
		expect(w.find('[data-testid="send-submit"]').exists()).toBe(false)
		expect(w.get('[data-testid="send-get-fee-juice"]').text()).toBe("Get private gas")
		w.unmount()
	})

	test("no sendable token: no strip, and the action is never review, whatever the card says", async () => {
		mocks.getTokens.mockResolvedValue([])
		mocks.getTokenBalances.mockResolvedValue([])
		const { w } = await mountSend()
		await feeCard(w, FJ)
		expect(strip(w).exists()).toBe(false)
		expect(submit(w).attributes("data-action")).toBe("send")
		expect(submit(w).text()).toBe("Confirm Transaction")
		w.unmount()
	})

	test("the strip carries the facts and opens the sheet on an unfinished form", async () => {
		const { w } = await mountSend()
		await feeCard(w, FJ)
		const el = strip(w)
		expect(el.attributes("data-you")).toBe("exposed")
		expect(el.attributes("data-to")).toBe("hidden")
		expect(el.attributes("data-amount")).toBe("hidden")
		await el.trigger("click")
		expect(sheetOpen(w)).toBe(true)
		expect(sendNow(w).attributes("disabled")).toBeDefined()
		expect(w.get('[data-testid="send-review-amount"]').text()).toBe("—")
		w.unmount()
	})

	test("the card's payer reading and the origin flip the action together", async () => {
		const { w } = await mountSend()
		await fillForm(w, FJ)
		expect(submit(w).attributes("data-action")).toBe("review")
		expect(submit(w).text()).toBe("Review send")
		await feeCard(w, SPONSOR)
		expect(submit(w).attributes("data-action")).toBe("send")
		await feeCard(w, FJ)
		await w.get('[data-testid="send-from-type"]').trigger("click")
		expect(submit(w).attributes("data-action")).toBe("send")
		expect(strip(w).attributes("data-you")).toBe("public")
		w.unmount()
	})

	test("the card hears whether the amount field holds an amount, with no recipient needed", async () => {
		const { w } = await mountSend()
		const typed = () => w.findComponent({ name: "FeeSettingsCard" }).props("amountTyped")
		expect(typed()).toBe(false)
		await w.get('[data-testid="stub-amount"]').setValue("1.5")
		expect(typed()).toBe(true)
		await w.get('[data-testid="stub-amount"]').setValue("")
		expect(typed()).toBe(false)
		w.unmount()
	})

	test("the card is handed the tag's shape exactly while the send is gated", async () => {
		const { w } = await mountSend()
		const shape = () => w.findComponent({ name: "FeeSettingsCard" }).props("payerNoticeShape")
		await fillForm(w, FJ)
		expect(shape()).toBe("private-private")
		await w.get('[data-testid="send-to-type"]').trigger("click")
		expect(shape()).toBe("private-public")
		await feeCard(w, SPONSOR)
		expect(shape()).toBeNull()
		await feeCard(w, FJ)
		await w.get('[data-testid="send-from-type"]').trigger("click")
		expect(shape()).toBeNull()
		w.unmount()
	})
})

describe("send page — an amount over the balance says so", () => {
	const line = (w: W) => w.find('[data-testid="send-amount-over-balance"]')
	const amountInput = (w: W) => w.get('[data-testid="send-amount-input"]')

	test("6 typed over private 5 shows the line; the balance rising to cover it takes it away", async () => {
		const { w } = await mountSend({ realAmountCard: true })
		await w.get('[data-testid="stub-recipient"]').setValue(DESTINATION)
		await amountInput(w).setValue("6")
		await feeCard(w, SPONSOR)
		await estimateLands()
		expect(line(w).text()).toBe("More than your balance")
		expect(amountInput(w).attributes("aria-invalid")).toBe("true")

		balanceUpdated().invoke({ ...BALANCE, privateBalance: "10000000", updatedAt: 2 })
		await flushPromises()
		expect(line(w).exists()).toBe(false)
		expect(amountInput(w).attributes("aria-invalid")).toBe("false")
		w.unmount()
	})

	// Tokens are read per profile and chain, balances per account: a switch keeps the typed amount.
	test("an account whose balance is not read yet keeps the amount, and only a synced balance below it shows the line", async () => {
		const { w, appStore } = await mountSend({ realAmountCard: true })
		await amountInput(w).setValue("1.5")
		expect(line(w).exists()).toBe(false)

		mocks.getTokenBalances.mockResolvedValue([])
		appStore.account = { address: "0xbob" } as never
		await flushPromises()
		expect((amountInput(w).element as HTMLInputElement).value).toBe("1.5")
		expect(line(w).exists()).toBe(false)

		// The row a new account gets before its first sync.
		const bob = { ...BALANCE, id: "b2", account: "0xbob", privateBalance: "0", publicBalance: "0", updatedAt: 0 }
		balanceAdded().invoke(bob)
		await flushPromises()
		expect(line(w).exists()).toBe(false)

		balanceUpdated().invoke({ ...bob, privateBalance: "1000000", updatedAt: 2 })
		await flushPromises()
		expect(line(w).text()).toBe("More than your balance")
		w.unmount()
	})
})

describe("send page — the balance beside Max", () => {
	const corner = (w: W) => {
		const figure = w.find('[data-testid="send-amount-balance"]')
		if (figure.exists()) return figure.text()
		return w.find('[data-testid="send-amount-balance-loading"]').exists() ? "skeleton" : "nothing"
	}
	const balanceConnected = () => lastClient<{ onConnected: EventHandler<void> }>(TokenBalanceServiceClient).onConnected
	const FRESH = { ...BALANCE, privateBalance: "0", publicBalance: "0", updatedAt: 0 }

	test("a row walks from unsynced to read: a skeleton, nothing on a failed first sync, then the zero it read, kept past a later failure", async () => {
		mocks.getTokenBalances.mockResolvedValue([])
		const { w } = await mountSend({ realAmountCard: true })
		expect(corner(w)).toBe("skeleton")

		balanceAdded().invoke(FRESH)
		await flushPromises()
		expect(corner(w)).toBe("skeleton")

		const failure = { at: 1, message: "PXE down" }
		balanceUpdated().invoke({ ...FRESH, syncFailure: failure })
		await flushPromises()
		expect(corner(w)).toBe("nothing")

		balanceUpdated().invoke({ ...FRESH, updatedAt: 2 })
		await flushPromises()
		expect(corner(w)).toBe("0 TST")

		balanceUpdated().invoke({ ...FRESH, updatedAt: 2, syncFailure: failure })
		await flushPromises()
		expect(corner(w)).toBe("0 TST")
		w.unmount()
	})

	test("with no row, a refused balance read draws nothing until a read lands", async () => {
		mocks.getTokenBalances.mockResolvedValue([])
		const { w } = await mountSend({ realAmountCard: true })
		balanceConnected().invoke()
		mocks.getTokenBalances.mockRejectedValueOnce(new Error("port closed"))
		balanceConnected().invoke()
		await flushPromises()
		expect(corner(w)).toBe("nothing")

		await vi.advanceTimersByTimeAsync(2_000)
		await flushPromises()
		expect(corner(w)).toBe("skeleton")
		w.unmount()
	})
})

describe("send page — the estimate follows the amount the balance covers", () => {
	const fee = (w: W) => w.findComponent({ name: "FeeSettingsCard" }).props("feeEstimate")
	const estimating = (w: W) => w.findComponent({ name: "FeeSettingsCard" }).props("isEstimating")
	const balanceShown = (w: W) => w.get('[data-testid="stub-amount"]').attributes("data-balance")

	test("public side: an amount over the balance asks nothing; the balance rising to cover it asks for that amount", async () => {
		const { w } = await mountSend()
		await w.get('[data-testid="send-from-type"]').trigger("click")
		await w.get('[data-testid="stub-recipient"]').setValue(DESTINATION)
		await w.get('[data-testid="stub-amount"]').setValue("4")
		await feeCard(w, SPONSOR)
		await estimateLands()
		expect(mocks.estimateTransferFee).not.toHaveBeenCalled()
		expect(submit(w).attributes("disabled")).toBeDefined()

		balanceUpdated().invoke({ ...BALANCE, publicBalance: "6000000", updatedAt: 2 })
		await flushPromises()
		await estimateLands()
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)
		expect(mocks.estimateTransferFee.mock.calls[0]?.[6]).toBe(4_000_000n)
		expect(submit(w).attributes("disabled")).toBeUndefined()
		w.unmount()
	})

	test("a balance change that leaves the amount covered keeps the landed fee and asks nothing", async () => {
		const { w } = await mountSend()
		await fillForm(w)
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)

		balanceUpdated().invoke({ ...BALANCE, privateBalance: "8000000", updatedAt: 2 })
		await flushPromises()
		expect(balanceShown(w)).toBe("8")
		expect(fee(w)).toEqual(LANDED)
		await estimateLands()
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)
		expect(submit(w).attributes("disabled")).toBeUndefined()
		w.unmount()
	})

	test("a balance falling below a landed amount clears the fee and stops its estimate; covering it again asks anew", async () => {
		const { w } = await mountSend()
		await fillForm(w)
		const landed = mocks.estimateTransferFee.mock.calls[0]?.[8]

		balanceUpdated().invoke({ ...BALANCE, privateBalance: "1000000", updatedAt: 2 })
		await flushPromises()
		expect(balanceShown(w)).toBe("1")
		expect(mocks.cancelEstimate).toHaveBeenCalledExactlyOnceWith(landed)
		expect(fee(w)).toBeNull()
		expect(estimating(w)).toBe(false)
		expect(submit(w).attributes("disabled")).toBeDefined()

		await w.get('[data-testid="stub-amount"]').setValue("1.50")
		await estimateLands()
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)

		balanceUpdated().invoke({ ...BALANCE, privateBalance: "5000000", updatedAt: 3 })
		await flushPromises()
		await estimateLands()
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(2)
		expect(mocks.estimateTransferFee.mock.calls[1]?.[6]).toBe(1_500_000n)
		expect(submit(w).attributes("disabled")).toBeUndefined()
		w.unmount()
	})

	test("an estimate running when the balance falls below its amount is stopped, and its late answer never lands", async () => {
		let answer: (value: unknown) => void = () => {}
		mocks.estimateTransferFee.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					answer = resolve
				}),
		)
		const { w } = await mountSend()
		await fillForm(w)
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)
		const started = mocks.estimateTransferFee.mock.calls[0]?.[8]
		expect(estimating(w)).toBe(true)

		balanceUpdated().invoke({ ...BALANCE, privateBalance: "1000000", updatedAt: 2 })
		await flushPromises()
		expect(mocks.cancelEstimate).toHaveBeenCalledExactlyOnceWith(started)
		expect(estimating(w)).toBe(false)
		answer(LANDED)
		await flushPromises()
		expect(fee(w)).toBeNull()

		balanceUpdated().invoke({ ...BALANCE, privateBalance: "5000000", updatedAt: 3 })
		await flushPromises()
		await estimateLands()
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(2)
		expect(fee(w)).toEqual(LANDED)
		w.unmount()
	})
})

describe("send page — consent", () => {
	test("gated: the primary button opens the sheet and sends nothing", async () => {
		const { w } = await mountSend()
		await fillForm(w, FJ)
		await submit(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		expect(sheetOpen(w)).toBe(true)
		expect(w.get('[data-testid="send-review-row-you"]').attributes("data-visibility")).toBe("exposed")
		expect(w.get('[data-testid="send-review-row-you"]').attributes("data-notice-shape")).toBe("private-private")
		w.unmount()
	})

	test("gated: Send now before the wait sends nothing, after it sends once — the slot closed before leaving", async () => {
		vi.useFakeTimers()
		const { w, popupStore } = await mountSend()
		await fillForm(w, FJ)
		await submit(w).trigger("click")
		expect(sendNow(w).attributes("data-ready")).toBe("false")
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()

		vi.advanceTimersByTime(REVIEW_ARM_MS)
		await nextTick()
		expect(sendNow(w).attributes("data-ready")).toBe("true")
		const closeSpy = vi.spyOn(popupStore, "close")
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		expect(mocks.executeTransfer.mock.calls[0]?.[7]).toEqual(FJ.settings)
		expect(closeSpy.mock.invocationCallOrder[0]).toBeLessThan(mocks.routerReplace.mock.invocationCallOrder[0] as number)
		expect(sheetOpen(w)).toBe(false)
		w.unmount()
	})

	test("not gated: the optional sheet, opened from the strip, sends at once", async () => {
		const { w } = await mountSend()
		await fillForm(w)
		await strip(w).trigger("click")
		expect(sendNow(w).attributes("data-ready")).toBe("true")
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		w.unmount()
	})

	test("turning gated while the sheet is open starts the wait; turning back makes it sendable at once", async () => {
		vi.useFakeTimers()
		const { w } = await mountSend()
		await fillForm(w)
		await strip(w).trigger("click")
		await feeCard(w, FJ)
		expect(sendNow(w).attributes("data-ready")).toBe("false")
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		vi.advanceTimersByTime(REVIEW_ARM_MS - 1)
		await nextTick()
		expect(sendNow(w).attributes("data-ready")).toBe("false")

		await feeCard(w, SPONSOR)
		await estimateLands()
		expect(sendNow(w).attributes("data-ready")).toBe("true")
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		w.unmount()
	})

	test.each([
		["gated", FJ],
		["not gated", SPONSOR],
	])("the sheet's send event while its slot is closed sends nothing (%s, wait elapsed)", async (_name, method) => {
		vi.useFakeTimers()
		const { w } = await mountSend()
		await fillForm(w, method)
		await strip(w).trigger("click")
		vi.advanceTimersByTime(REVIEW_ARM_MS)
		await w.get('[data-testid="popup-close-btn"]').trigger("click")
		expect(sheetOpen(w)).toBe(false)
		w.findComponent({ name: "SendReviewSheet" }).vm.$emit("send")
		await flushPromises()
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		w.unmount()
	})

	test("a popup opened over the armed sheet takes its consent; closed again, the wait starts over", async () => {
		vi.useFakeTimers()
		const { w, popupStore } = await mountSend()
		await fillForm(w, FJ)
		await submit(w).trigger("click")
		vi.advanceTimersByTime(REVIEW_ARM_MS)
		await nextTick()
		expect(sendNow(w).attributes("data-ready")).toBe("true")

		popupStore.open("confirm")
		await nextTick()
		expect(sendNow(w).attributes("data-ready")).toBe("false")
		expect(sendNow(w).attributes("disabled")).toBeDefined()
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).not.toHaveBeenCalled()

		popupStore.close("confirm")
		await nextTick()
		expect(sendNow(w).attributes("data-ready")).toBe("false")
		vi.advanceTimersByTime(REVIEW_ARM_MS)
		await nextTick()
		expect(sendNow(w).attributes("data-ready")).toBe("true")
		await sendNow(w).trigger("click")
		expect(mocks.executeTransfer).toHaveBeenCalledTimes(1)
		w.unmount()
	})

	test("the primary button never sends a gated transfer, even with the sheet open and ready", async () => {
		vi.useFakeTimers()
		const { w } = await mountSend()
		await fillForm(w, FJ)
		await strip(w).trigger("click")
		vi.advanceTimersByTime(REVIEW_ARM_MS)
		await nextTick()
		expect(sendNow(w).attributes("data-ready")).toBe("true")
		;(submit(w).element as HTMLButtonElement).click()
		await flushPromises()
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		w.unmount()
	})
})

describe("send page — the sheet on the popup stack", () => {
	test("a popup opened on top gets the higher order; the sheet is displaced behind it", async () => {
		const { w, popupStore } = await mountSend()
		await fillForm(w)
		await strip(w).trigger("click")
		expect(w.get('[data-testid="stub-popup"]').attributes("data-order")).toBe("0")
		expect(w.get('[data-testid="stub-card"]').attributes("data-depth")).toBe("1")
		popupStore.open("confirm")
		await nextTick()
		expect(popupStore.popups.confirm?.order).toBe(1)
		expect(w.get('[data-testid="stub-popup"]').attributes("data-order")).toBe("0")
		expect(w.get('[data-testid="stub-card"]').attributes("data-depth")).toBe("2")
		w.unmount()
	})

	test("closing the sheet underneath a newer popup keeps orders unique; opening twice does not renumber", async () => {
		const { w, popupStore } = await mountSend()
		await fillForm(w)
		await strip(w).trigger("click")
		popupStore.open("confirm")
		await strip(w).trigger("click")
		expect(popupStore.popups.send_review?.order).toBe(0)
		await w.get('[data-testid="popup-close-btn"]').trigger("click")
		expect(popupStore.popups.confirm?.order).toBe(0)
		expect(popupStore.len).toBe(1)
		w.unmount()
	})

	test("closeAll (lock) closes it; unmounting releases the slot; a reopen takes a fresh one", async () => {
		const { w, popupStore } = await mountSend()
		await fillForm(w)
		await strip(w).trigger("click")
		popupStore.closeAll()
		await nextTick()
		expect(sheetOpen(w)).toBe(false)
		await strip(w).trigger("click")
		expect(sheetOpen(w)).toBe(true)
		w.unmount()
		expect(popupStore.isOpened("send_review")).toBe(false)
	})

	test.each([
		["account switch", (store: ReturnType<typeof useAppStore>) => (store.account = { address: "0xother" } as never)],
		["network switch", (store: ReturnType<typeof useAppStore>) => (store.network = { id: "n2", chainId: TOKEN.chainId } as never)],
	])("an %s while the sheet is open closes it and sends nothing", async (_name, switchIdentity) => {
		const { w, appStore } = await mountSend()
		await fillForm(w, FJ)
		await submit(w).trigger("click")
		expect(sheetOpen(w)).toBe(true)
		switchIdentity(appStore)
		await flushPromises()
		expect(sheetOpen(w)).toBe(false)
		expect(mocks.executeTransfer).not.toHaveBeenCalled()
		w.unmount()
	})

	test("a token switch while the sheet is open closes it", async () => {
		const other = { ...TOKEN, id: 8, contract: `0x${"d".repeat(64)}` }
		mocks.getTokens.mockResolvedValue([TOKEN, other])
		const { w, cacheStore } = await mountSend()
		await fillForm(w, FJ)
		await submit(w).trigger("click")
		cacheStore.activeTokenIdx = other.id
		await nextTick()
		expect(sheetOpen(w)).toBe(false)
		// The amount goes with the token, so no amount is read with another token's decimals.
		expect((w.get('[data-testid="stub-amount"]').element as HTMLInputElement).value).toBe("")
		w.unmount()
	})

	test.each([
		["header close", async (w: W) => w.get('[data-testid="popup-close-btn"]').trigger("click")],
		["backdrop / Escape", async (w: W) => w.findComponent({ name: "Popup" }).vm.$emit("onClose")],
	])("closing by %s leaves the form intact", async (_name, close) => {
		const { w } = await mountSend()
		await fillForm(w, FJ)
		await w.get('[data-testid="send-to-type"]').trigger("click")
		await estimateLands()
		await submit(w).trigger("click")
		expect(sheetOpen(w)).toBe(true)
		await close(w)
		await nextTick()
		expect(sheetOpen(w)).toBe(false)
		expect((w.get('[data-testid="stub-amount"]').element as HTMLInputElement).value).toBe("1.5")
		expect((w.get('[data-testid="stub-recipient"]').element as HTMLInputElement).value).toBe(DESTINATION)
		expect(strip(w).attributes("data-to")).toBe("public")
		expect(submit(w).attributes("data-action")).toBe("review")
		w.unmount()
	})
})

describe("send page — a token the picker imported", () => {
	/** Two decimals, so a 6-place amount typed for `TOKEN` is cut on the swap. */
	const NEW = { ...TOKEN, id: 9, contract: `0x${"9".repeat(64)}`, symbol: "NEW", decimals: 2 }
	const NEW_BALANCE = { id: "b9", account: ACCOUNT, token: NEW, privateBalance: "500", publicBalance: "0", updatedAt: 2 }
	const amountInput = (w: W) => w.get('[data-testid="send-amount-input"]')
	const amountText = (w: W) => (amountInput(w).element as HTMLInputElement).value
	const cardSymbol = (w: W) => w.get('[data-testid="stub-token-card"]').attributes("data-symbol")
	const tokenAdded = () => lastClient<{ onTokenAdded: EventHandler<unknown> }>(TokenServiceClient).onTokenAdded
	/** What New token hands the picker's opener once the add is done. */
	const report = (w: W, token: unknown) =>
		(w.findComponent({ name: "SelectTokenCard" }).props("onTokenAdded") as (t: unknown) => Promise<void>)(token)
	/** Mounted on `TOKEN` with an amount typed, every token read held from the next one on. */
	async function heldAfterMount() {
		const { w, appStore, cacheStore } = await mountSend({ realAmountCard: true })
		const reads = holdReads<unknown[]>(mocks.getTokens)
		await amountInput(w).setValue("1.5")
		return { w, appStore, cacheStore, reads }
	}

	test("the swap keeps the recipient and the amount, cut to the new token's places with the hint, and asks the fee again", async () => {
		const { w, cacheStore } = await mountSend({ realAmountCard: true })
		await w.get('[data-testid="stub-recipient"]').setValue(DESTINATION)
		await amountInput(w).setValue("1.123456")
		await feeCard(w, SPONSOR)
		await estimateLands()
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(1)

		mocks.getTokens.mockResolvedValue([TOKEN, NEW])
		balanceAdded().invoke(NEW_BALANCE)
		tokenAdded().invoke(NEW)
		await flushPromises()
		await report(w, NEW)
		await flushPromises()
		expect(cacheStore.activeTokenIdx).toBe(NEW.id)
		expect(amountText(w)).toBe("1.12")
		expect(w.get('[data-testid="send-amount-clamp-hint"]').text()).toBe("NEW supports 2 decimals")
		expect((w.get('[data-testid="stub-recipient"]').element as HTMLInputElement).value).toBe(DESTINATION)

		await estimateLands()
		expect(mocks.estimateTransferFee).toHaveBeenCalledTimes(2)
		const asked = mocks.estimateTransferFee.mock.calls[1]
		expect([asked?.[2], asked?.[3], asked?.[6]]).toEqual([NEW.id, NEW.contract, 112n])
		w.unmount()
	})

	test("a report before the list's own re-read lands still picks the token, once its re-read lands", async () => {
		const { w, cacheStore, reads } = await heldAfterMount()
		tokenAdded().invoke(NEW)
		const picked = report(w, NEW)
		reads[0]?.resolve([TOKEN, NEW])
		await flushPromises()
		expect(cacheStore.activeTokenIdx).toBe(TOKEN.id)
		reads[1]?.resolve([TOKEN, NEW])
		await picked
		await flushPromises()
		expect(cacheStore.activeTokenIdx).toBe(NEW.id)
		expect(cardSymbol(w)).toBe("NEW")
		expect(amountText(w)).toBe("1.5")
		w.unmount()
	})

	test.each([
		[
			"the page closed",
			async ({ w, reads }: Awaited<ReturnType<typeof heldAfterMount>>) => {
				w.unmount()
				reads[0]?.resolve([TOKEN, NEW])
			},
		],
		[
			"the scope moved",
			async ({ appStore, reads }: Awaited<ReturnType<typeof heldAfterMount>>) => {
				appStore.scopeEpoch += 1
				reads[0]?.resolve([TOKEN, NEW])
			},
		],
		[
			"its re-read refused",
			async ({ reads }: Awaited<ReturnType<typeof heldAfterMount>>) => reads[0]?.reject(new Error("port closed")),
		],
		[
			"its re-read superseded by a later one, which lists it",
			async ({ reads }: Awaited<ReturnType<typeof heldAfterMount>>) => {
				tokenAdded().invoke(NEW)
				reads[0]?.resolve([TOKEN, NEW])
				await flushPromises()
				reads[1]?.resolve([TOKEN, NEW])
			},
		],
	])("a report whose token is not listed, with %s, picks nothing and keeps the listed token", async (_, settle) => {
		const page = await heldAfterMount()
		const picked = report(page.w, NEW)
		await settle(page)
		await picked
		await flushPromises()
		expect(page.cacheStore.activeTokenIdx).toBe(TOKEN.id)
		if (page.w.exists()) {
			expect(cardSymbol(page.w)).toBe("TST")
			expect(amountText(page.w)).toBe("1.5")
			page.w.unmount()
		}
	})

	test("a row picked while the report's re-read is out is the later choice: the import is not picked over it", async () => {
		const OTHER = { ...TOKEN, id: 8, contract: `0x${"d".repeat(64)}`, symbol: "OTH" }
		mocks.getTokens.mockResolvedValue([TOKEN, OTHER])
		const { w, cacheStore, reads } = await heldAfterMount()
		const picked = report(w, NEW)
		cacheStore.activeTokenIdx = OTHER.id
		await flushPromises()
		await amountInput(w).setValue("2")
		reads[0]?.resolve([TOKEN, OTHER, NEW])
		await picked
		await flushPromises()
		expect(cacheStore.activeTokenIdx).toBe(OTHER.id)
		expect(cardSymbol(w)).toBe("OTH")
		expect(amountText(w)).toBe("2")
		w.unmount()
	})

	test("a USD session still ends on the swap, its amount cleared", async () => {
		const chainId = CHAIN_IDS.TESTNET
		const priced = { ...TOKEN, chainId, contract: TEST_TOKENS.USDC, symbol: "USDC" }
		const added = { ...NEW, chainId }
		mocks.getTokens.mockResolvedValue([priced])
		mocks.getTokenBalances.mockResolvedValue([{ ...BALANCE, token: priced }])
		const { w, cacheStore } = await mountSend({ realAmountCard: true })
		const price = vi.mocked(PriceServiceClient).mock.results.at(-1)?.value as { onQuotesUpdated: { invoke: (s: unknown) => void } }
		price.onQuotesUpdated.invoke({
			quotes: { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } },
			pricedTokens: TEST_PRICED_TOKENS,
		})
		await nextTick()
		await w.get('[data-testid="send-amount-fiat-toggle"]').trigger("click")
		await w.get('[data-testid="send-amount-fiat-input"]').setValue("2")
		await vi.waitFor(() => expect(w.get('[data-testid="send-amount-derived"]').text()).toBe("≈ 2 USDC"))

		mocks.getTokens.mockResolvedValue([priced, added])
		await report(w, added)
		await flushPromises()
		expect(cacheStore.activeTokenIdx).toBe(added.id)
		expect(w.find('[data-testid="send-amount-fiat-input"]').exists()).toBe(false)
		expect(amountText(w)).toBe("")
		w.unmount()
	})
})

describe("send page — the contact in the URL", () => {
	const ALICE = { id: "c-alice", name: "Alice", address: `0x2${"a".repeat(63)}`, abbr: "AL" }
	const recipient = (w: W) => w.findComponent(STUBS.RecipientField)
	afterEach(() => {
		route.query = {}
	})

	test("?contact=<id> of one of the profile's contacts preselects it, with no store involved", async () => {
		mocks.getContacts.mockResolvedValue([ALICE])
		route.query = { contact: ALICE.id }
		const { w, cacheStore } = await mountSend()
		expect(recipient(w).props("selectedContact")).toEqual(ALICE)
		expect(recipient(w).props("searchTerm")).toBe(ALICE.address)
		expect("preselectedContactToSend" in cacheStore).toBe(false)
		w.unmount()
	})

	test.each([
		["an unknown id", "c-nobody"],
		["another profile's id", "c-bob"],
	])("%s selects nothing", async (_name, id) => {
		mocks.getContacts.mockResolvedValue([ALICE])
		route.query = { contact: id }
		const { w } = await mountSend()
		expect(recipient(w).props("selectedContact")).toBeUndefined()
		expect(recipient(w).props("searchTerm")).toBe("")
		w.unmount()
	})

	test("a cold tab: the contacts arrive once the identity settles after mount, and the id still preselects", async () => {
		mocks.getContacts.mockResolvedValue([ALICE])
		route.query = { contact: ALICE.id }
		const { w, appStore } = await mountSend({ cold: true })
		expect(recipient(w).props("selectedContact")).toBeUndefined()

		setIdentity(appStore)
		await flushPromises()
		expect(recipient(w).props("selectedContact")).toEqual(ALICE)
		expect(recipient(w).props("searchTerm")).toBe(ALICE.address)
		w.unmount()
	})
})

describe("send page — the token card while the tokens load", () => {
	const OTHER = { ...TOKEN, id: 8, contract: `0x${"d".repeat(64)}`, symbol: "OTH" }
	/** Another chain's token that carries the id the page keeps selected. */
	const FOREIGN = { ...TOKEN, chainId: 999, contract: `0x${"f".repeat(64)}`, symbol: "FRN" }

	const holdTokenReads = () => holdReads<unknown[]>(mocks.getTokens)
	const tokenAdded = () => lastClient<{ onTokenAdded: EventHandler<unknown> }>(TokenServiceClient).onTokenAdded
	const balanceDeleted = () =>
		lastClient<{ onTokenBalanceDeleted: EventHandler<unknown> }>(TokenBalanceServiceClient).onTokenBalanceDeleted
	const balanceConnected = () => lastClient<{ onConnected: EventHandler<void> }>(TokenBalanceServiceClient).onConnected
	const card = (w: W) => {
		const el = w.get('[data-testid="stub-token-card"]')
		return { loading: el.attributes("data-loading"), symbol: el.attributes("data-symbol") }
	}
	const failed = (w: W) => w.get('[data-testid="stub-token-card"]').attributes("data-failed")
	const retry = (w: W) => w.get('[data-testid="stub-token-card"]').trigger("click")
	const amount = (w: W) => w.get('[data-testid="stub-amount"]')
	/** A profile switch: another profile's tokens and another account's balances. */
	const toB = async (store: ReturnType<typeof useAppStore>) => {
		store.profile = { id: "p2" } as never
		store.account = { address: "0xbob" } as never
		await flushPromises()
	}
	const refused = () => new Error("port closed")
	afterEach(() => {
		route.query = {}
	})

	test("loading while the mount's read is out; the read ends it and draws the token", async () => {
		const reads = holdTokenReads()
		const { w } = await mountSend()
		expect(card(w)).toEqual({ loading: "true", symbol: undefined })
		reads[0]?.resolve([TOKEN])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "TST" })
		w.unmount()
	})

	test("a superseded read does not end the newer read's loading", async () => {
		const reads = holdTokenReads()
		const { w, appStore } = await mountSend()
		await toB(appStore)
		reads[0]?.resolve([TOKEN])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "true", symbol: undefined })
		reads[1]?.resolve([OTHER])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		w.unmount()
	})

	test("A to B: B's load shows neither A's token nor its balance, and B's refused read ends on the failed card", async () => {
		const reads = holdTokenReads()
		const { w, appStore } = await mountSend()
		reads[0]?.resolve([TOKEN])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "TST" })
		expect(amount(w).attributes("data-balance")).toBe("5")

		await toB(appStore)
		// B's balance for the kept token id lands before B's tokens: the page still renders.
		balanceAdded().invoke({ ...BALANCE, id: "b2", account: "0xbob" })
		await flushPromises()
		expect(card(w)).toEqual({ loading: "true", symbol: undefined })
		expect(amount(w).attributes("data-token")).toBeUndefined()
		expect(amount(w).attributes("data-balance")).toBe("0")

		reads[1]?.reject(refused())
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		expect(failed(w)).toBe("true")
		w.unmount()
	})

	test("after an account switch an add for the previous account never lands; one for the new account does", async () => {
		const { w, appStore } = await mountSend()
		expect(amount(w).attributes("data-balance")).toBe("5")
		mocks.getTokenBalances.mockResolvedValue([])
		appStore.account = { address: "0xbob" } as never
		await flushPromises()
		expect(amount(w).attributes("data-balance")).toBe("0")

		balanceAdded().invoke({ ...BALANCE, id: "b3", privateBalance: "7000000" })
		await flushPromises()
		expect(amount(w).attributes("data-balance")).toBe("0")
		balanceAdded().invoke({ ...BALANCE, id: "b2", account: "0xbob", privateBalance: "9000000" })
		await flushPromises()
		expect(amount(w).attributes("data-balance")).toBe("9")
		w.unmount()
	})

	// A restarted worker can give a listed row's id to another token's row, and that row's add can
	// reach the port before the reconnect's read lands. It is created at zero, and its first update
	// replaces the listed row by id, so each token shows its own amount at every step.
	test("a restart that gives a listed row's id to another token shows each token's own amount at every step", async () => {
		const NEW = { ...TOKEN, id: 9, contract: `0x${"9".repeat(64)}`, symbol: "NEW" }
		mocks.getTokens.mockResolvedValue([TOKEN, NEW])
		const { w, cacheStore } = await mountSend()
		const shown = async (tokenId: number) => {
			cacheStore.activeTokenIdx = tokenId
			await flushPromises()
			return amount(w).attributes("data-balance")
		}
		const created = { ...BALANCE, token: NEW, privateBalance: "0", publicBalance: "0", updatedAt: 0 }
		const projected = { ...created, privateBalance: "4000000", updatedAt: 2 }
		balanceConnected().invoke()
		const reads = holdReads<unknown[]>(mocks.getTokenBalances)
		balanceConnected().invoke()
		await flushPromises()

		balanceAdded().invoke(created)
		await flushPromises()
		expect([await shown(TOKEN.id), await shown(NEW.id)]).toEqual(["5", "0"])
		balanceUpdated().invoke(projected)
		await flushPromises()
		expect([await shown(TOKEN.id), await shown(NEW.id)]).toEqual(["0", "4"])

		reads[0]?.resolve([created])
		await flushPromises()
		reads[1]?.resolve([projected])
		await flushPromises()
		expect(reads).toHaveLength(2)
		expect([await shown(TOKEN.id), await shown(NEW.id)]).toEqual(["0", "4"])
		w.unmount()
	})

	test("a worker restart re-reads the balances: the first connect is the load's own, a later one lands the new amount", async () => {
		const { w } = await mountSend()
		expect(amount(w).attributes("data-balance")).toBe("5")
		mocks.getTokenBalances.mockResolvedValue([{ ...BALANCE, privateBalance: "8000000" }])
		balanceConnected().invoke()
		await flushPromises()
		expect(mocks.getTokenBalances).toHaveBeenCalledTimes(1)
		expect(amount(w).attributes("data-balance")).toBe("5")
		balanceConnected().invoke()
		await flushPromises()
		expect(mocks.getTokenBalances).toHaveBeenCalledTimes(2)
		expect(amount(w).attributes("data-balance")).toBe("8")
		w.unmount()
	})

	test("an account switch drops a re-read still out for the previous account", async () => {
		const { w, appStore } = await mountSend()
		balanceConnected().invoke()
		let release: (rows: unknown[]) => void = () => {}
		mocks.getTokenBalances.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve
				}),
		)
		balanceConnected().invoke()
		await flushPromises()
		mocks.getTokenBalances.mockResolvedValue([])
		appStore.account = { address: "0xbob" } as never
		await flushPromises()
		expect(amount(w).attributes("data-balance")).toBe("0")
		release([{ ...BALANCE, privateBalance: "8000000" }])
		await flushPromises()
		expect(amount(w).attributes("data-balance")).toBe("0")
		w.unmount()
	})

	test("an identity fetch's balance read never lands over a reconnect's read that began after it", async () => {
		const { w, appStore } = await mountSend()
		balanceConnected().invoke()
		const reads = holdTokenReads()
		mocks.getTokenBalances.mockResolvedValueOnce([{ ...BALANCE, id: "b2", account: "0xbob" }])
		appStore.account = { address: "0xbob" } as never
		await flushPromises()
		mocks.getTokenBalances.mockResolvedValueOnce([{ ...BALANCE, id: "b2", account: "0xbob", privateBalance: "8000000" }])
		balanceConnected().invoke()
		await flushPromises()
		expect(mocks.getTokenBalances).toHaveBeenCalledTimes(3)
		reads[0]?.resolve([TOKEN])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "TST" })
		expect(amount(w).attributes("data-balance")).toBe("8")
		w.unmount()
	})

	test("an identity fetch's balance read lands when the reconnect's read that began after it is refused", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const { w, appStore } = await mountSend()
		balanceConnected().invoke()
		// A re-read landed for the previous identity first.
		balanceConnected().invoke()
		await flushPromises()
		const reads = holdTokenReads()
		mocks.getTokenBalances.mockResolvedValueOnce([{ ...BALANCE, id: "b2", account: "0xbob" }])
		appStore.account = { address: "0xbob" } as never
		await flushPromises()
		mocks.getTokenBalances.mockRejectedValue(new Error("port closed"))
		balanceConnected().invoke()
		await flushPromises()
		await vi.advanceTimersByTimeAsync(2_000)
		await flushPromises()
		expect(mocks.getTokenBalances).toHaveBeenCalledTimes(5)
		reads[0]?.resolve([TOKEN])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "TST" })
		expect(amount(w).attributes("data-balance")).toBe("5")
		w.unmount()
	})

	test("a deleted balance row drops its amount; a delete for another row keeps it", async () => {
		const { w } = await mountSend()
		expect(amount(w).attributes("data-balance")).toBe("5")
		balanceDeleted().invoke({ ...BALANCE, id: "b9" })
		await flushPromises()
		expect(amount(w).attributes("data-balance")).toBe("5")
		balanceDeleted().invoke(BALANCE)
		await flushPromises()
		expect(amount(w).attributes("data-balance")).toBe("0")
		w.unmount()
	})

	test("the identity going incomplete mid-load ends the loading on the empty card", async () => {
		const reads = holdTokenReads()
		const { w, appStore } = await mountSend()
		appStore.account = undefined as never
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		reads[0]?.resolve([TOKEN])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		w.unmount()
	})

	test("a token re-read still out when the identity goes incomplete never lands", async () => {
		const reads = holdTokenReads()
		const { w, appStore } = await mountSend()
		reads[0]?.resolve([TOKEN])
		await flushPromises()
		tokenAdded().invoke(OTHER)
		await flushPromises()
		appStore.account = undefined as never
		await flushPromises()
		reads[1]?.resolve([TOKEN, OTHER])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		w.unmount()
	})

	test("after a refused read, the next identity's read draws its token", async () => {
		const reads = holdTokenReads()
		const { w, appStore } = await mountSend()
		reads[0]?.reject(refused())
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		expect(failed(w)).toBe("true")
		await toB(appStore)
		expect(card(w).loading).toBe("true")
		expect(failed(w)).toBe("false")
		reads[1]?.resolve([OTHER])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		w.unmount()
	})

	test("a read that finds no tokens ends on the empty card, not the failed one", async () => {
		mocks.getTokens.mockResolvedValue([])
		const { w } = await mountSend()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		expect(failed(w)).toBe("false")
		w.unmount()
	})

	test("the mount's read refused: logged at debug, nothing unhandled, the failed card", async () => {
		mocks.getTokens.mockRejectedValue(refused())
		const errorHandler = vi.fn()
		const { w } = await mountSend({ errorHandler })
		expect(errorHandler.mock.calls.length).toBe(0)
		expect(console.debug).toHaveBeenCalledWith(expect.any(String), { error: expect.objectContaining({ message: "port closed" }) })
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		expect(failed(w)).toBe("true")
		w.unmount()
	})

	test.each([
		["during B's load, which it does not end", true],
		["after B's read is refused, which it retries", false],
	])("a token added on another chain, with the kept token's id, is never drawn: %s", async (_when, duringLoad) => {
		const reads = holdTokenReads()
		const { w, appStore } = await mountSend()
		reads[0]?.resolve([TOKEN])
		await flushPromises()
		await toB(appStore)
		if (!duringLoad) reads[1]?.reject(refused())
		await flushPromises()

		tokenAdded().invoke(FOREIGN)
		await flushPromises()
		expect(card(w)).toEqual({ loading: "true", symbol: undefined })

		if (duringLoad) reads[1]?.reject(refused())
		for (const read of reads.slice(2)) read.resolve([])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		expect(failed(w)).toBe(duringLoad ? "true" : "false")
		w.unmount()
	})

	test("tokens read and contacts refused: the same failed card", async () => {
		mocks.getContacts.mockRejectedValueOnce(refused())
		const { w } = await mountSend()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		expect(failed(w)).toBe("true")
		w.unmount()
	})

	test("the identity going incomplete after a refused read clears the failure", async () => {
		mocks.getTokens.mockRejectedValueOnce(refused())
		const { w, appStore } = await mountSend()
		expect(failed(w)).toBe("true")
		appStore.account = undefined as never
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		expect(failed(w)).toBe("false")
		w.unmount()
	})

	test("a Retry after a refused read shows loading, then the active token, not the first", async () => {
		const reads = holdTokenReads()
		const { w, cacheStore } = await mountSend()
		cacheStore.activeTokenIdx = OTHER.id
		reads[0]?.reject(refused())
		await flushPromises()
		expect(failed(w)).toBe("true")

		await retry(w)
		await flushPromises()
		expect(card(w)).toEqual({ loading: "true", symbol: undefined })
		expect(failed(w)).toBe("false")
		reads[1]?.resolve([TOKEN, OTHER])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		w.unmount()
	})

	test("opened for the second token, its first read refused: the Retry selects that token", async () => {
		route.query = { tokenId: String(OTHER.id) }
		mocks.getTokens.mockRejectedValueOnce(refused()).mockResolvedValue([TOKEN, OTHER])
		const { w } = await mountSend()
		expect(failed(w)).toBe("true")
		await retry(w)
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		w.unmount()
	})

	test("a cold tab opened for the second token selects it once the identity settles", async () => {
		route.query = { tokenId: String(OTHER.id) }
		mocks.getTokens.mockResolvedValue([TOKEN, OTHER])
		const { w, appStore } = await mountSend({ cold: true })
		setIdentity(appStore)
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		w.unmount()
	})

	test("a Retry refused again ends on the failed card again", async () => {
		mocks.getTokens.mockRejectedValue(refused())
		const { w } = await mountSend()
		await retry(w)
		await flushPromises()
		expect(mocks.getTokens).toHaveBeenCalledTimes(2)
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		expect(failed(w)).toBe("true")
		w.unmount()
	})

	test("a refusal from a superseded fetch leaves the newer fetch's card alone", async () => {
		const reads = holdTokenReads()
		const { w, appStore } = await mountSend()
		await toB(appStore)
		reads[0]?.reject(refused())
		await flushPromises()
		expect(card(w)).toEqual({ loading: "true", symbol: undefined })
		expect(failed(w)).toBe("false")
		reads[1]?.resolve([OTHER])
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		expect(failed(w)).toBe("false")
		w.unmount()
	})

	test("the real card: a second Retry tap while the Retry loads starts no second fetch", async () => {
		const reads = holdTokenReads()
		const { w } = await mountSend({ realTokenCard: true })
		reads[0]?.reject(refused())
		await flushPromises()
		const trigger = () => w.get('[data-testid="send-token-trigger"]')
		expect(trigger().attributes("data-state")).toBe("failed")
		await trigger().trigger("click")
		await trigger().trigger("click")
		await flushPromises()
		expect(mocks.getTokens).toHaveBeenCalledTimes(2)
		reads[1]?.resolve([TOKEN])
		await flushPromises()
		expect(w.get('[data-testid="send-token-symbol"]').text()).toBe("TST")
		w.unmount()
	})

	test("a token added while the load has failed retries the whole load", async () => {
		mocks.getTokens.mockRejectedValueOnce(refused()).mockResolvedValue([OTHER])
		const { w } = await mountSend()
		expect(failed(w)).toBe("true")
		const reads = () => [mocks.getTokens, mocks.getTokenBalances, mocks.getContacts].map((m) => m.mock.calls.length)
		expect(reads()).toEqual([1, 1, 1])
		tokenAdded().invoke(OTHER)
		await flushPromises()
		expect(reads()).toEqual([2, 2, 2])
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		expect(failed(w)).toBe("false")
		w.unmount()
	})

	test("a token added for this identity during the load is in the loaded list", async () => {
		const first = held<unknown[]>()
		mocks.getTokens.mockReturnValueOnce(first.promise).mockResolvedValue([TOKEN, OTHER])
		const { w, cacheStore } = await mountSend()
		tokenAdded().invoke(OTHER)
		await flushPromises()
		expect(card(w).loading).toBe("true")
		first.resolve([TOKEN])
		await flushPromises()
		cacheStore.activeTokenIdx = OTHER.id
		await nextTick()
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		w.unmount()
	})

	const tokenDeleted = () => lastClient<{ onTokenDeleted: EventHandler<unknown> }>(TokenServiceClient).onTokenDeleted
	const listed = (w: W) => (w.vm as unknown as { tokens: { symbol: string }[] }).tokens.map((t) => t.symbol)

	test("(BUG PIN) a token deleted after the token answer, while the contacts read is out, stays listed and active; one deleted after the load is dropped", async () => {
		// Today's behaviour, kept until the owner decides: the delete finds no row in the list the load
		// cleared, and the token answer, applied only once the other reads answer, brings it back.
		mocks.getTokens.mockResolvedValue([TOKEN, OTHER])
		const contactReads = holdReads<unknown[]>(mocks.getContacts)
		onTestFinished(() => {
			mocks.getContacts.mockReset()
		})
		const { w } = await mountSend()
		tokenDeleted().invoke(TOKEN)
		expect(contactReads).toHaveLength(1)
		contactReads[0]?.resolve([])
		await flushPromises()
		expect(listed(w)).toEqual(["TST", "OTH"])
		expect(card(w)).toEqual({ loading: "false", symbol: "TST" })

		tokenDeleted().invoke(OTHER)
		await flushPromises()
		expect(listed(w)).toEqual(["TST"])
		w.unmount()
	})

	const navigations = () => mocks.routerBack.mock.calls.length + mocks.routerReplace.mock.calls.length

	test("deleting the active token selects the first remaining token", async () => {
		mocks.getTokens.mockResolvedValue([TOKEN, OTHER])
		const { w, cacheStore } = await mountSend()
		expect(card(w).symbol).toBe("TST")
		tokenDeleted().invoke(TOKEN)
		await flushPromises()
		expect(listed(w)).toEqual(["OTH"])
		expect(cacheStore.activeTokenIdx).toBe(OTHER.id)
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		expect(mocks.openToast).not.toHaveBeenCalled()
		expect(navigations()).toBe(0)
		w.unmount()
	})

	test("deleting the last token toasts once and leaves Send", async () => {
		mocks.getTokens.mockResolvedValue([TOKEN])
		const { w } = await mountSend()
		expect(card(w).symbol).toBe("TST")
		tokenDeleted().invoke(TOKEN)
		await flushPromises()
		expect(listed(w)).toEqual([])
		expect(mocks.openToast).toHaveBeenCalledExactlyOnceWith({ kind: "success", label: "The last token has just been deleted" })
		expect(navigations()).toBe(1)
		w.unmount()
	})

	test("deleting another token keeps the selection", async () => {
		mocks.getTokens.mockResolvedValue([TOKEN, OTHER])
		const { w, cacheStore } = await mountSend()
		const selected = cacheStore.activeTokenIdx
		expect(card(w).symbol).toBe("TST")
		tokenDeleted().invoke(OTHER)
		await flushPromises()
		expect(listed(w)).toEqual(["TST"])
		expect(cacheStore.activeTokenIdx).toBe(selected)
		expect(card(w)).toEqual({ loading: "false", symbol: "TST" })
		expect(mocks.openToast).not.toHaveBeenCalled()
		expect(navigations()).toBe(0)
		w.unmount()
	})

	test("after an empty load, a token added for this identity becomes the active token", async () => {
		mocks.getTokens.mockResolvedValueOnce([]).mockResolvedValue([OTHER])
		const { w } = await mountSend()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		tokenAdded().invoke(OTHER)
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		w.unmount()
	})

	test.each([
		["a cold tab whose identity settles on no tokens", true],
		["a switch to an identity with no tokens", false],
	])("%s: a token added becomes the active token", async (_path, cold) => {
		if (!cold) mocks.getTokens.mockResolvedValueOnce([TOKEN])
		mocks.getTokens.mockResolvedValueOnce([]).mockResolvedValue([OTHER])
		const { w, appStore } = await mountSend({ cold })
		if (cold) setIdentity(appStore)
		else await toB(appStore)
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: undefined })
		tokenAdded().invoke(OTHER)
		await flushPromises()
		expect(card(w)).toEqual({ loading: "false", symbol: "OTH" })
		w.unmount()
	})
})

describe("send page — the contact list reducers", () => {
	type Row = { id: string; name: string; address: string }
	const row = (id: string, name: string, c: string): Row => ({ id, name, address: `0x2${c.repeat(63)}` })
	const contactClient = () => {
		const results = vi.mocked(ContactServiceClient).mock.results
		return results[results.length - 1].value as {
			onContactAdded: EventHandler<Row>
			onContactUpdated: EventHandler<Row>
			onContactDeleted: EventHandler<Row>
		}
	}
	const vmContacts = (w: W) => (w.vm as unknown as { contacts: Row[] }).contacts
	const candidateNames = (w: W) => (w.findComponent(STUBS.RecipientField).props("candidates") as Row[]).map((c) => c.name)

	test("update replaces the first listed match in place, or appends; delete filters every match into a new array", async () => {
		mocks.getContacts.mockResolvedValue([row("c1", "Alice", "a"), row("c1", "Bob", "b")])
		const { w } = await mountSend()
		const before = vmContacts(w)
		contactClient().onContactUpdated.invoke(row("c1", "Carol", "c"))
		contactClient().onContactUpdated.invoke(row("c9", "Dave", "d"))
		await flushPromises()
		expect(vmContacts(w)).toBe(before)
		expect(candidateNames(w).slice(0, 3)).toEqual(["Carol", "Bob", "Dave"])
		contactClient().onContactDeleted.invoke(row("c1", "Carol", "c"))
		await flushPromises()
		expect(vmContacts(w)).not.toBe(before)
		expect(vmContacts(w).map((c) => c.name)).toEqual(["Dave"])
		expect(candidateNames(w)[0]).toBe("Dave")
		w.unmount()
	})

	test("(BUG PIN) a contact added after the contacts answer, while the token read is out, is dropped; one added after the load is kept", async () => {
		// Today's behaviour, kept until the owner decides: the contacts answer is applied only once the
		// token and balance reads answer too, and it replaces the list an add already reached.
		mocks.getContacts.mockResolvedValueOnce([row("c1", "Alice", "a")])
		const tokenReads = holdReads<unknown[]>(mocks.getTokens)
		const { w } = await mountSend()
		contactClient().onContactAdded.invoke(row("c2", "Bob", "b"))
		expect(tokenReads).toHaveLength(1)
		tokenReads[0]?.resolve([TOKEN])
		await flushPromises()
		expect(vmContacts(w).map((c) => c.name)).toEqual(["Alice"])

		contactClient().onContactAdded.invoke(row("c2", "Bob", "b"))
		await flushPromises()
		expect(vmContacts(w).map((c) => c.name)).toEqual(["Alice", "Bob"])
		w.unmount()
	})
})

describe("send page — Refresh quote by keyboard", () => {
	/** In fiat mode with no live quote: the gate asks for a requote, which a re-freeze cannot answer. */
	async function showRequote(w: W) {
		const amount = w.findComponent({ name: "AmountCard" })
		amount.vm.$emit("update:fiatMode", true)
		amount.vm.$emit("update:fiatGuard", { frozenUsd: 1, frozenAt: Date.now(), converting: false })
		await nextTick()
		return w.get('[data-testid="send-fiat-requote"]')
	}
	const asKeyboardFocus = (el: Element) => {
		const matches = el.matches.bind(el)
		vi.spyOn(el, "matches").mockImplementation((selector) => selector === ":focus-visible" || matches(selector))
	}

	test("Refresh quote is a button; a pointer press re-freezes the quote and moves no focus", async () => {
		const { w } = await mountSend()
		const requote = await showRequote(w)
		expect(requote.element.tagName).toBe("BUTTON")
		expect(requote.attributes("type")).toBe("button")
		await requote.trigger("click")
		expect(mocks.refreezeQuote).toHaveBeenCalledTimes(1)
		expect(mocks.focusAmount).not.toHaveBeenCalled()
		w.unmount()
	})

	test("with no live quote a keyboard press leaves the focus on Refresh quote, which stays", async () => {
		const { w } = await mountSend()
		const requote = await showRequote(w)
		asKeyboardFocus(requote.element)
		await requote.trigger("click")
		expect(mocks.refreezeQuote).toHaveBeenCalledTimes(1)
		expect(mocks.focusAmount).not.toHaveBeenCalled()
		expect(w.find('[data-testid="send-fiat-requote"]').exists()).toBe(true)
		w.unmount()
	})

	test("the notice says the price moved only when the live quote differs from the snapshot", async () => {
		const chainId = CHAIN_IDS.TESTNET
		const priced = { ...TOKEN, chainId, contract: TEST_TOKENS.USDC, symbol: "USDC" }
		mocks.getTokens.mockResolvedValue([priced])
		mocks.getTokenBalances.mockResolvedValue([{ ...BALANCE, token: priced }])
		const { w } = await mountSend()
		const price = vi.mocked(PriceServiceClient).mock.results.at(-1)?.value as { onQuotesUpdated: { invoke: (s: unknown) => void } }
		const quote = (usd: number) => ({
			quotes: { "usd-coin": { coingeckoId: "usd-coin", usd, fetchedAt: Date.now(), providerUpdatedAt: null } },
			pricedTokens: TEST_PRICED_TOKENS,
		})
		const notice = () => w.get('[data-testid="send-fiat-requote"]').element.parentElement?.textContent ?? ""

		price.onQuotesUpdated.invoke(quote(1))
		const amount = w.findComponent({ name: "AmountCard" })
		amount.vm.$emit("update:fiatMode", true)
		// Frozen at today's price, but past the snapshot's age limit.
		amount.vm.$emit("update:fiatGuard", { frozenUsd: 1, frozenAt: Date.now() - 16 * 60_000, converting: false })
		await nextTick()
		expect(notice()).toContain("The price quote went stale.")
		expect(notice()).not.toContain("moved")

		price.onQuotesUpdated.invoke(quote(1.05))
		await nextTick()
		expect(notice()).toContain("The price moved since you started typing.")
		w.unmount()
	})

	test("on the real card a moved quote is refreshed by keyboard: the amount re-derives and the USD field holds the focus", async () => {
		const chainId = CHAIN_IDS.TESTNET
		const priced = { ...TOKEN, chainId, contract: TEST_TOKENS.USDC, symbol: "USDC" }
		mocks.getTokens.mockResolvedValue([priced])
		mocks.getTokenBalances.mockResolvedValue([{ ...BALANCE, token: priced }])
		const { w } = await mountSend({ realAmountCard: true })
		const price = vi.mocked(PriceServiceClient).mock.results.at(-1)?.value as { onQuotesUpdated: { invoke: (s: unknown) => void } }
		const quote = (usd: number) => ({
			quotes: { "usd-coin": { coingeckoId: "usd-coin", usd, fetchedAt: Date.now(), providerUpdatedAt: null } },
			pricedTokens: TEST_PRICED_TOKENS,
		})

		price.onQuotesUpdated.invoke(quote(1))
		await nextTick()
		await w.get('[data-testid="send-amount-fiat-toggle"]').trigger("click")
		await w.get('[data-testid="send-amount-fiat-input"]').setValue("2")
		await vi.waitFor(() => expect(w.get('[data-testid="send-amount-derived"]').text()).toBe("≈ 2 USDC"))

		price.onQuotesUpdated.invoke(quote(1.05))
		await nextTick()
		const requote = w.get('[data-testid="send-fiat-requote"]')
		;(requote.element as HTMLButtonElement).focus()
		asKeyboardFocus(requote.element)
		await requote.trigger("click")

		await vi.waitFor(() => expect(w.get('[data-testid="send-amount-derived"]').text()).toBe("≈ 1.904761 USDC"))
		expect(w.find('[data-testid="send-fiat-requote"]').exists()).toBe(false)
		expect(document.activeElement).toBe(w.get('[data-testid="send-amount-fiat-input"]').element)
		w.unmount()
	})
})

describe("send page — a token the signed list flags", () => {
	test("the banner sits above the token card while the active token is flagged, and leaves with it", async () => {
		// Wire-shaped, in the upper case a restored row may keep.
		const scam = { ...TOKEN, id: 8, symbol: "SCAM", contract: `0x${TEST_FLAGGED.address.slice(2).toUpperCase()}` }
		mocks.flagged.current = flaggedKeysOf([{ chainId: TOKEN.chainId, address: TEST_FLAGGED.address }])
		mocks.getTokens.mockResolvedValue([TOKEN, scam])
		const { w, cacheStore } = await mountSend()
		expect(w.find('[data-testid="token-flagged-banner"]').exists()).toBe(false)

		cacheStore.activeTokenIdx = scam.id
		await flushPromises()
		const banner = w.get('[data-testid="token-flagged-banner"]')
		expect(banner.element.nextElementSibling?.getAttribute("data-testid")).toBe("stub-token-card")

		cacheStore.activeTokenIdx = TOKEN.id
		await flushPromises()
		expect(w.find('[data-testid="token-flagged-banner"]').exists()).toBe(false)
		w.unmount()
	})
})
