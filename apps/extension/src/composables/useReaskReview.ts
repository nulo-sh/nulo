import { computed, type Ref, ref, watch } from "vue"
import { useSendReview } from "@/composables/useSendReview"
import { type ReaskReview, reaskReview } from "@/popup/components/modules/general/reask-review"
import { usePopupStore } from "@/stores/popup.store"
import { isQueuedTransfer } from "@/utils/journal-state"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"

interface ReaskReviewDeps {
	/** Accepts `fee` for the queued send `jobId`; a rejection changes nothing. */
	acceptQueuedFee: (jobId: string, fee: string) => Promise<unknown>
	/** The in-flight record the feed shows under `jobId`, if any. */
	findOp: (jobId: string) => OperationRecord | undefined
	/** The Fee Juice quote in USD the sheet prices its figures with when it opens. */
	usdRate: () => number | undefined
	amountOf: (op: OperationRecord) => string | null
	symbolOf: (op: OperationRecord) => string | null
}

/** What the sheet opened with: it draws this, never the live record. */
export type OpenedReask = {
	id: string
	fee: string
	sheet: ReaskReview
	amount: string | undefined
	symbol: string | undefined
	recipientAddress: string | undefined
}

const REASK_KEY = "send_reask_review"

/**
 * The review sheet a queued send that asked again is answered from. It draws the figures it opened
 * with and stays mounted after it closes, so it leaves the way it came and focus returns to its row;
 * a changed or withdrawn fee closes it rather than move under the finger. Its button arms after the
 * usual pause, whatever the facts say, since its subject is a higher fee. One send is out at a time.
 */
export function useReaskReview(deps: ReaskReviewDeps) {
	const { acceptQueuedFee, findOp, usdRate, amountOf, symbolOf } = deps
	const popupStore = usePopupStore()
	const isOpen = computed(() => popupStore.isOpened(REASK_KEY))
	const order = computed(() => popupStore.popups[REASK_KEY]?.order ?? 0)
	const depth = computed(() => popupStore.len - order.value)
	const opened: Ref<OpenedReask | null> = ref(null)
	const sending = ref(false)

	const { ready } = useSendReview({
		isGated: () => true,
		isOpen: () => isOpen.value,
		isTop: () => order.value === popupStore.len - 1,
	})

	/** The fee a queued send asks again with, while its record still asks. */
	const askedFee = (op: OperationRecord | undefined) => (isQueuedTransfer(op) ? op.progress.reask?.fee : undefined)

	function open(jobId: string) {
		const op = findOp(jobId)
		const sheet = op && reaskReview(op, usdRate())
		const fee = askedFee(op)
		if (!op || !sheet || fee === undefined) return
		opened.value = {
			id: jobId,
			fee,
			sheet,
			amount: amountOf(op) ?? undefined,
			symbol: symbolOf(op) ?? undefined,
			recipientAddress: op.recipientAddress,
		}
		if (!isOpen.value) popupStore.open(REASK_KEY)
	}

	const close = () => popupStore.close(REASK_KEY)

	async function send() {
		const current = opened.value
		if (!current || !isOpen.value || sending.value) return
		sending.value = true
		try {
			await acceptQueuedFee(current.id, current.fee)
		} catch {
			// A refusal changes nothing; the row goes on reading the record.
		} finally {
			sending.value = false
			close()
		}
	}

	/** Closes the sheet and forgets what it opened with; a send still out keeps `sending`. */
	function reset() {
		close()
		opened.value = null
	}

	watch(
		() => opened.value && askedFee(findOp(opened.value.id)),
		(fee) => {
			if (opened.value && fee !== opened.value.fee) close()
		},
	)

	return { opened, isOpen, order, depth, ready, sending, open, send, close, reset }
}
