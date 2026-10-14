import { ref, type Ref } from "vue"
import { createRunFence } from "@/composables/runFence"
import type { IncomingTransferServiceClient } from "@/wallet/services/incoming-transfer/client"
import type { IncomingTransferRecord } from "@/wallet/services/incoming-transfer/spec"

/** `tap`: a press may look the fee up; `none`: no fee to show (a note receipt, or a failed
 *  automatic lookup). */
export type ReceiptFeeState = "loading" | "shown" | "tap" | "none"

export type ReceiptFeeService = Pick<IncomingTransferServiceClient, "getReceiptFee" | "getCachedReceiptFee">

export interface UseReceiptFeeResult {
	state: Ref<ReceiptFeeState>
	feeJuice: Ref<string | null>
	/** Show `record`'s fee: looked up now, or with `tapOnly` only from what this session already
	 *  fetched, leaving the lookup to `show()`. A later `load` or `dispose` drops an earlier answer. */
	load: (record: IncomingTransferRecord, tapOnly: boolean) => Promise<void>
	/** The tap: looks the fee up, and only from `tap`; a failed lookup returns to `tap`. */
	show: () => Promise<void>
	/** Ends the hook: an answer in flight is dropped, and a later `load` or `show` calls nothing. */
	dispose: () => void
}

/**
 * A received page's network-fee row. Under privacy mode the page passes `tapOnly`, and nothing that
 * names the transaction leaves the device until `show()`. The parent owns the client.
 */
export function useReceiptFee(service: ReceiptFeeService): UseReceiptFeeResult {
	const state = ref<ReceiptFeeState>("loading")
	const feeJuice = ref<string | null>(null)
	const fence = createRunFence()
	let record: IncomingTransferRecord | null = null
	let disposed = false

	async function settle(isCurrent: () => boolean, lookup: Promise<{ feeJuice: string } | null>, onMiss: ReceiptFeeState): Promise<void> {
		const fee = await lookup.catch(() => null)
		if (!isCurrent()) return
		feeJuice.value = fee?.feeJuice ?? null
		state.value = fee ? "shown" : onMiss
	}

	async function load(next: IncomingTransferRecord, tapOnly: boolean): Promise<void> {
		if (disposed) return
		const isCurrent = fence.begin()
		record = next
		feeJuice.value = null
		if (next.kind !== "public-event") {
			state.value = "none"
			return
		}
		state.value = "loading"
		if (tapOnly) await settle(isCurrent, service.getCachedReceiptFee(next.id), "tap")
		else await settle(isCurrent, service.getReceiptFee(next.id), "none")
	}

	async function show(): Promise<void> {
		if (disposed || state.value !== "tap" || !record) return
		const isCurrent = fence.begin()
		state.value = "loading"
		await settle(isCurrent, service.getReceiptFee(record.id), "tap")
	}

	function dispose(): void {
		disposed = true
		fence.invalidate()
	}

	return { state, feeJuice, load, show, dispose }
}
