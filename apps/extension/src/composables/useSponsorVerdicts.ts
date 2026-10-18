import { computed, type ComputedRef, reactive, ref, type Ref, watch, type WatchSource } from "vue"
import { sameFieldAddress } from "@nulo/wallet-bridge"
import type { FeeMethodOption } from "@/popup/components/modules/send/fee-helpers"

/** The worker's reading of whether a sponsor can cover this estimate's fee. */
export interface SponsorFundingVerdict {
	fpcId: string
	address: string
	funded: boolean
}

/** The fee card's sponsor verdicts, never stored. */
export interface SponsorVerdicts {
	/** Sponsors the estimate found short, by FPC id: `short` holds while the verdict still describes
	 *  this transaction (its row is disabled), `setAside` for the rest of the card's identity (the row
	 *  is not chosen again unless picked). */
	shortSponsorIds: Set<string>
	setAsideSponsorIds: Set<string>
	/** The last verdict the card accepted. */
	lastVerdict: Ref<{ fpcId: string; funded: boolean } | null>
	/** Outside Send: the sponsor a short verdict dropped the selection of, until the person picks. */
	droppedForVerdictId: Ref<string | null>
	/** The sponsor paying when the transaction last changed, while it still pays and until the estimate
	 *  for the new transaction ends: its earlier verdict was for another fee limit. Only the paying
	 *  sponsor is read, so no other row can have a read in flight. */
	recheckFpcId: Ref<string | null>
	verifyingSponsorId: ComputedRef<string | null>
	/** The person picked `m`: a sponsor they pick again is no longer set aside. */
	picked(m: FeeMethodOption): void
	/** Clears the short of a sponsor whose address changed. */
	addressEdited(fpcId: string): void
	/** A new identity: no verdict carries over. */
	forget(): void
}

export interface SponsorVerdictSources {
	verdict: WatchSource<SponsorFundingVerdict | null | undefined>
	txShape: WatchSource<string>
	priority: WatchSource<string>
	isEstimating: () => boolean
	/** The rows a verdict must name. */
	rows: Ref<FeeMethodOption[]>
	/** The method that pays. */
	payer: Ref<FeeMethodOption | undefined>
	/** A short verdict for `fpcId` landed; true when it dropped the selection. */
	onShort: (fpcId: string) => boolean
}

export function useSponsorVerdicts({ isEstimating }: { isEstimating: () => boolean }): SponsorVerdicts {
	const shortSponsorIds = reactive(new Set<string>())
	const setAsideSponsorIds = reactive(new Set<string>())
	const lastVerdict = ref<{ fpcId: string; funded: boolean } | null>(null)
	const droppedForVerdictId = ref<string | null>(null)
	const recheckFpcId = ref<string | null>(null)
	const verifyingSponsorId = computed(() => (isEstimating() ? recheckFpcId.value : null))
	return {
		shortSponsorIds,
		setAsideSponsorIds,
		lastVerdict,
		droppedForVerdictId,
		recheckFpcId,
		verifyingSponsorId,
		picked: (m) => {
			if (m.type === "fpc" && m.fpc) setAsideSponsorIds.delete(m.fpc.id)
			droppedForVerdictId.value = null
		},
		addressEdited: (fpcId) => {
			shortSponsorIds.delete(fpcId)
		},
		forget: () => {
			shortSponsorIds.clear()
			setAsideSponsorIds.clear()
			lastVerdict.value = null
			droppedForVerdictId.value = null
			recheckFpcId.value = null
		},
	}
}

/**
 * A verdict counts only for a sponsor row this card lists, at the address it was read for: an
 * estimate landing after the row's address was edited describes a contract the row no longer names.
 */
function applyVerdict(v: SponsorVerdicts, verdict: SponsorFundingVerdict | null | undefined, src: SponsorVerdictSources) {
	if (typeof verdict?.funded !== "boolean") return
	const row = src.rows.value.find((m) => m.type === "fpc" && m.fpc?.id === verdict.fpcId)
	if (!row || !sameFieldAddress(verdict.address, row.fpc?.address ?? "")) return
	v.lastVerdict.value = { fpcId: verdict.fpcId, funded: verdict.funded }
	if (v.recheckFpcId.value === verdict.fpcId) v.recheckFpcId.value = null
	if (verdict.funded) {
		v.shortSponsorIds.delete(verdict.fpcId)
		v.setAsideSponsorIds.delete(verdict.fpcId)
		return
	}
	v.shortSponsorIds.add(verdict.fpcId)
	v.setAsideSponsorIds.add(verdict.fpcId)
	if (src.onShort(verdict.fpcId)) v.droppedForVerdictId.value = verdict.fpcId
}

/** The verdicts' watchers, created in this order: the shorts clear on a new transaction before the
 *  paying sponsor is armed for its re-check, since a cleared short can make it the payer again. */
export function watchSponsorVerdicts(v: SponsorVerdicts, src: SponsorVerdictSources): void {
	watch(src.verdict, (verdict) => applyVerdict(v, verdict, src))
	// A short verdict holds for one fee limit, so a new priority or transaction offers its row again;
	// the fallback's own re-estimate changes neither.
	watch([src.priority, src.txShape], () => v.shortSponsorIds.clear())
	watch(src.payer, (m) => {
		if (m?.fpc?.id !== v.recheckFpcId.value) v.recheckFpcId.value = null
	})
	watch(src.txShape, () => {
		const m = src.payer.value
		v.recheckFpcId.value = m?.type === "fpc" ? (m.fpc?.id ?? null) : null
	})
	watch(src.isEstimating, (estimating) => {
		if (!estimating) v.recheckFpcId.value = null
	})
}
