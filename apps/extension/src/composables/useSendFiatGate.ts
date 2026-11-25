import { computed, type Ref, ref } from "vue"
import type { PricedToken, usePrices } from "@/composables/usePrices"
import { evaluateFiatGate, type FiatGuard, requoteReason } from "@/utils/send-fiat-gate"

interface SendFiatGateDeps {
	/** The page's live pricing, which it connects and disposes. */
	prices: Pick<ReturnType<typeof usePrices>, "quoteFor" | "priceEntryFor">
	token: Readonly<Ref<PricedToken | undefined>>
	/** A ticker: the gate re-evaluates on each tick, so a snapshot's expiry flips it. */
	now: Readonly<Ref<number | undefined>>
}

/**
 * Send's USD-mode gate, fail closed (`evaluateFiatGate`). The amount card writes `fiatMode` and
 * `fiatGuard`, the session quote it froze; the gate holds them against the token's live quote.
 */
export function useSendFiatGate({ prices, token, now }: SendFiatGateDeps) {
	const liveQuote = computed(() => prices.quoteFor(token.value?.chainId, token.value?.contract) ?? null)
	const proxyTicker = computed(() =>
		liveQuote.value ? (prices.priceEntryFor(token.value?.chainId, token.value?.contract)?.ticker ?? null) : null,
	)

	const fiatMode = ref(false)
	const fiatGuard = ref<FiatGuard | null>(null)

	const fiatGate = computed(() =>
		evaluateFiatGate({
			fiatMode: fiatMode.value,
			guard: fiatGuard.value,
			liveUsd: liveQuote.value?.usd ?? null,
			now: now.value ?? Date.now(),
		}),
	)
	const fiatQuoteBlocked = computed(() => !fiatGate.value.ok)
	/** Distinguishes "needs explicit re-confirmation" from "just converting". */
	const fiatNeedsRequote = computed(() => !fiatGate.value.ok && fiatGate.value.requote)
	const fiatQuoteMoved = computed(() => requoteReason(fiatGuard.value?.frozenUsd, liveQuote.value?.usd) === "moved")

	/** The gate at the true wall clock, for the press: the ticker can lag an expiry or a drift by one tick. */
	const allowsSendNow = () =>
		evaluateFiatGate({
			fiatMode: fiatMode.value,
			guard: fiatGuard.value,
			liveUsd: liveQuote.value?.usd ?? null,
			now: Date.now(),
		}).ok

	return { liveQuote, proxyTicker, fiatMode, fiatGuard, fiatQuoteBlocked, fiatNeedsRequote, fiatQuoteMoved, allowsSendNow }
}
