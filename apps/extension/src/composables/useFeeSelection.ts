import { computed, type ComputedRef, reactive, ref, type Ref } from "vue"
import {
	defaultSponsor,
	type FeeMethodOption,
	type LiveFeeIdentity,
	type RegisteredFpc,
	resolveSavedSelection,
	savedSelectionOf,
} from "@/popup/components/modules/send/fee-helpers"
import {
	previewForPick,
	recordOf,
	resolveSendSelection,
	type SendSelection,
	type TransferSide,
} from "@/popup/components/modules/send/fee-privacy"
import type { AppPick, FeePickUpdate, SendSlots } from "@/utils/fee-picks"
import type { BalanceScope } from "@/stores/balances.store"
import type { FeePicks } from "@/wallet/services/ui-preference/spec"
import type { FeeSnapshot, SnapshotSelection } from "./useFeeSnapshot"
import type { SponsorVerdicts } from "./useSponsorVerdicts"

type Baseline = { method: FeeMethodOption | undefined; pick: number }

/** What a selection read hands the snapshot's commit: the app windows' saved picks and the
 *  selection before the read. Send reconciles nothing, so it hands back an empty map and no baseline. */
export interface SelectionLoad {
	saved: Record<string, AppPick>
	baseline: Baseline | null
}

/** A fee card's rule book: Send's or the app windows'. The card picks one when it opens. */
export interface FeeSelection extends SnapshotSelection<SelectionLoad> {
	/** The method that pays. A pending preview is deliberately not one. */
	effectiveMethod: Readonly<Ref<FeeMethodOption | undefined>>
	/** The saved pick's row while the snapshot loads (Send only). */
	previewMethod: Readonly<Ref<FeeMethodOption | undefined>>
	/** The default could not be established on confirmed data (Send only). */
	held: Readonly<Ref<boolean>>
	/** A short verdict set aside the sponsor that would have paid. */
	sponsorShort: Readonly<Ref<boolean>>
	/** The get-fee-juice nudge shows. */
	feeJuiceMissing: Readonly<Ref<boolean>>
	pick(m: FeeMethodOption): void
	fpcUpdated(fpc: RegisteredFpc): void
	/** The paying row was deleted. */
	fpcDeleted(): void
	/** A short verdict for `fpcId` landed; true when it dropped the selection. */
	onShort(fpcId: string): boolean
}

type CardSnapshot = Pick<
	FeeSnapshot<SelectionLoad>,
	"isInitComplete" | "gasBalances" | "committedScope" | "snapshotCommitted" | "scopeIsLiveIdentity"
>

export interface FeeSelectionInput {
	props: LiveFeeIdentity
	snapshot: CardSnapshot
	verdicts: SponsorVerdicts
	knownFpcs: Readonly<Ref<RegisteredFpc[]>>
	methods: Readonly<Ref<FeeMethodOption[]>>
	/** The profile's saved picks, each map re-parsed by the preference service. */
	getFeePicks: (profileId: string) => Promise<FeePicks>
	saveFeePick: (profileId: string, update: FeePickUpdate) => Promise<unknown>
}

const pickSlot = (profileId: string | undefined, address: string | undefined) => `${profileId}\n${address}`

interface SendCtx extends FeeSelectionInput {
	origin: () => TransferSide
	/** Send's picks, `{ [slot]: { private?, public? } }`, one slot per profile and address: each
	 *  profile's picks are kept apart, so an account held by two profiles has two picks. */
	sendPicks: Record<string, SendSlots>
}

const livePicks = (c: SendCtx) => c.sendPicks[pickSlot(c.props.profile?.id, c.props.account?.address)]

/** Not yet committed for the live identity: the snapshot must not resolve another identity's pick. */
const awaitingSnapshot = (c: FeeSelectionInput) =>
	!c.snapshot.isInitComplete.value || !c.snapshot.scopeIsLiveIdentity(c.snapshot.committedScope.value)

/**
 * Send's selection is DERIVED, never assigned: a pure function of the live origin, the live
 * account's pick and the committed snapshot. An origin flip cannot be missed and a late init cannot
 * overwrite a pick, because there is no assignment to race. It resolves only while the committed
 * snapshot belongs to the live identity — account A's balances never meet account B's pick.
 */
function sendSelection(c: SendCtx): SendSelection {
	const pick = livePicks(c)?.[c.origin()]
	if (awaitingSnapshot(c)) {
		return { kind: "pending", preview: previewForPick(pick, c.methods.value) }
	}
	const know = { fpcs: c.knownFpcs.value, balances: c.snapshot.gasBalances.value }
	const { shortSponsorIds, setAsideSponsorIds } = c.verdicts
	return resolveSendSelection(c.origin(), { ...know, shortSponsorIds, setAsideSponsorIds }, pick)
}

/** The sponsor the selection names without the verdicts is the one a short verdict set aside. */
function sendSponsorShort(c: SendCtx): boolean {
	const { shortSponsorIds } = c.verdicts
	if (shortSponsorIds.size === 0 || awaitingSnapshot(c)) return false
	const pick = livePicks(c)?.[c.origin()]
	const know = { fpcs: c.knownFpcs.value, balances: c.snapshot.gasBalances.value }
	const unset = resolveSendSelection(c.origin(), know, pick)
	return unset.kind === "selected" && unset.method.type === "fpc" && unset.method.fpc != null && shortSponsorIds.has(unset.method.fpc.id)
}

/** Profile, address and origin are captured before any await: the pick belongs to the account and
 *  side it was made on. */
function pickForSend(c: SendCtx, m: FeeMethodOption) {
	const profileId = c.props.profile!.id
	const address = c.props.account!.address
	const origin = c.origin()
	const record = recordOf(m)
	const slot = pickSlot(profileId, address)
	c.sendPicks[slot] = { ...c.sendPicks[slot], [origin]: record }
	const update: FeePickUpdate = { kind: "send", address, side: origin, pick: record }
	c.saveFeePick(profileId, update).catch((e) => console.error("Failed to save the send fee selection", { error: e }))
}

/** Send reads its own picks into `sendPicks`, for the address it read for and under any pick
 *  already made in this mount (which is newer). */
async function loadSend(c: SendCtx, { profileId, accountAddress: address }: BalanceScope, isCurrent: () => boolean) {
	const slots = (await c.getFeePicks(profileId)).send[address] ?? {}
	const slot = pickSlot(profileId, address)
	c.sendPicks[slot] = { ...slots, ...c.sendPicks[slot] }
	return isCurrent() ? { saved: {}, baseline: null } : null
}

/** Send's rule book: the selection follows the transfer's origin and its own saved picks. */
export function useSendFeeSelection(
	input: FeeSelectionInput & { origin: () => TransferSide },
): FeeSelection & { selection: ComputedRef<SendSelection> } {
	const c: SendCtx = { ...input, sendPicks: reactive({}) }
	const selection = computed(() => sendSelection(c))
	return {
		selection,
		effectiveMethod: computed(() => (selection.value.kind === "selected" ? selection.value.method : undefined)),
		previewMethod: computed(() => (selection.value.kind === "pending" ? selection.value.preview : undefined)),
		held: computed(() => selection.value.kind === "hold"),
		sponsorShort: computed(() => sendSponsorShort(c)),
		// Only confirmed exhaustion: every applicable payer read, none can pay, whatever is selected.
		feeJuiceMissing: computed(() => selection.value.kind === "none"),
		pick: (m) => pickForSend(c, m),
		fpcUpdated: () => {},
		fpcDeleted: () => {},
		onShort: () => false,
		// A private send defaults to the account's own Fee Juice only on a private balance read as zero,
		// and a zero from the reader's TTL may predate a receipt. The origin can flip to private without
		// another read, so every Send mount reads fresh, whatever its origin is at the time.
		forceRefresh: () => true,
		load: (scope, isCurrent) => loadSend(c, scope, isCurrent),
		// Send's picks were read at load and live in `sendPicks`; a recovery has nothing to read.
		reload: async () => ({ saved: {}, baseline: null }),
		reconcile: () => {},
	}
}

interface AppCtx extends FeeSelectionInput {
	lockedMethod: () => string | null
	fallsBack: () => boolean
	selectedMethod: Ref<FeeMethodOption | undefined>
	/** The selection is the card's own default, not a saved or live pick. */
	chosenUnasked: boolean
	/** Counts explicit picks: a re-pick of the selected row leaves the reference unchanged. */
	pickSeq: number
}

/** The dApp-locked method's fresh row from `methods` (balance-aware), never a saved record. */
const lockedOption = (c: AppCtx) => c.methods.value.find((m) => m.type === c.lockedMethod())

/**
 * Persist the user's explicit selection. Idempotent: re-saving the same
 * selection is safe. Called only from the pick — never from data-refresh paths.
 */
async function persistSelection(c: AppCtx, method: FeeMethodOption) {
	const update: FeePickUpdate = { kind: "app", address: c.props.account!.address, pick: savedSelectionOf(method) }
	await c.saveFeePick(c.props.profile!.id, update)
}

/** The saved pick, resolved against fresh `methods` by semantic key (never the stored `fpc.name`);
 *  one that no longer resolves falls back to Nulo's sponsor, else nothing. Never prune a dangling
 *  pick here: a whole-map write would race `persistSelection` or another mounted card and could
 *  clobber a newer pick. */
function settledSelection(c: AppCtx, savedRecord: AppPick | undefined) {
	const resolved = resolveSavedSelection(savedRecord, c.methods.value)
	if (resolved) return resolved
	const preferred = defaultSponsor(c.methods.value)
	return preferred ? { ...preferred } : undefined
}

/** A selection taken as `baseline` has since been picked, or replaced by an FPC edit or deletion. */
const touchedSince = (c: AppCtx, baseline: Baseline) => c.selectedMethod.value !== baseline.method || c.pickSeq !== baseline.pick

/** A pick made during init stands, read again from the snapshot's rows: their sponsor metadata is
 *  current, and a sponsor the snapshot no longer lists is dropped rather than paid through. */
const snapshotRowFor = (c: AppCtx, m: FeeMethodOption | undefined) =>
	m ? c.methods.value.find((x) => x.type === m.type && x.fpc?.id === m.fpc?.id) : undefined

function reconcileSelection(c: AppCtx, savedRecord: AppPick | undefined, baseline: Baseline) {
	if (c.lockedMethod()) {
		c.selectedMethod.value = lockedOption(c)
		c.chosenUnasked = false
	} else if (touchedSince(c, baseline)) {
		c.selectedMethod.value = snapshotRowFor(c, c.selectedMethod.value)
	} else {
		c.selectedMethod.value = settledSelection(c, savedRecord)
		c.chosenUnasked = !resolveSavedSelection(savedRecord, c.methods.value)
	}
}

/** Shows the last-used method while the fetch is in flight. */
function prefillSelection(c: AppCtx, saved: Record<string, AppPick>) {
	if (c.lockedMethod()) c.selectedMethod.value = lockedOption(c)
	// The stored record stands in for its row until the commit resolves it against fresh rows.
	else if (saved[c.props.account!.address]) c.selectedMethod.value = saved[c.props.account!.address] as FeeMethodOption
	else return
	c.chosenUnasked = false
}

/** Pre-fills from the saved picks BEFORE the slow fetch, so the trigger shows the last-used method while it
 *  runs (the `isInitComplete` gate keeps the pre-fill out of settings derivation). Returns the saved
 *  map and the reconcile baseline, which a later pick moves off. A pick made during the read (an
 *  early sponsor row) is newer than anything saved, so nothing is pre-filled over it and the
 *  baseline stays the one from before the read. Null when a newer run owns the card: re-applying
 *  the pre-fill would clobber that run's reconcile. */
async function loadApp(c: AppCtx, scope: BalanceScope, isCurrent: () => boolean): Promise<SelectionLoad | null> {
	const beforeRead = { method: c.selectedMethod.value, pick: c.pickSeq }
	const saved = (await c.getFeePicks(scope.profileId)).app
	if (!isCurrent()) return null
	if (touchedSince(c, beforeRead)) return { saved, baseline: beforeRead }
	prefillSelection(c, saved)
	return { saved, baseline: { method: c.selectedMethod.value, pick: c.pickSeq } }
}

async function reloadApp(c: AppCtx, scope: BalanceScope): Promise<SelectionLoad> {
	// Baseline BEFORE the await (same rule as the load): a user pick landing
	// while the read is pending moves the selection off this baseline,
	// so the reconcile keeps the pick instead of re-applying a stale
	// snapshot over it.
	const baseline = { method: c.selectedMethod.value, pick: c.pickSeq }
	const saved = (await c.getFeePicks(scope.profileId)).app
	return { saved, baseline }
}

/** The payer Send's public-side walk lands on with this card's verdicts applied, or none. */
function publicFallback(c: AppCtx) {
	const { shortSponsorIds, setAsideSponsorIds } = c.verdicts
	const know = { fpcs: c.knownFpcs.value, balances: c.snapshot.gasBalances.value, shortSponsorIds, setAsideSponsorIds }
	const next = resolveSendSelection("public", know, undefined)
	return next.kind === "selected" ? next.method : undefined
}

/** A pick of a contract that cannot pay is dropped too; its saved record stays. */
function dropShort(c: AppCtx, fpcId: string) {
	if (c.selectedMethod.value?.fpc?.id !== fpcId) return false
	c.selectedMethod.value = c.fallsBack() ? publicFallback(c) : undefined
	c.chosenUnasked = true
	return true
}

/** Send's public-side walk, with this card's pick standing in for Send's saved one: a hand-added
 *  sponsor counts only once picked, and an unread balance never counts as empty. */
function noPayerCanPay(c: AppCtx) {
	if (c.lockedMethod() || !c.snapshot.snapshotCommitted.value) return false
	const { shortSponsorIds, setAsideSponsorIds } = c.verdicts
	const know = { fpcs: c.knownFpcs.value, balances: c.snapshot.gasBalances.value, shortSponsorIds, setAsideSponsorIds }
	const pick = c.selectedMethod.value ? recordOf(c.selectedMethod.value) : undefined
	return resolveSendSelection("public", know, pick).kind === "none"
}

function selectedMethodHasNoGas(c: AppCtx) {
	if (!c.snapshot.isInitComplete.value) return false
	// Unknown balances (failed/timed-out read, silent retry pending) never
	// trigger the nudge — only a confirmed zero does.
	const balances = c.snapshot.gasBalances.value
	if (!balances) return false
	const m = c.selectedMethod.value
	if (!m) return false
	if (m.type === "private_fpc") {
		// Only a CONFIRMED zero triggers the bridge nudge. `null` means the PrivateFPC
		// read failed or isn't registered — an unknown state, not a confirmed empty
		// balance — so we don't tell a possibly-funded user to go bridge.
		return balances.privateFeeJuice === "0"
	}
	if (m.type === "fj") return balances.publicFeeJuice === "0"
	return false
}

function pickForApp(c: AppCtx, m: FeeMethodOption) {
	c.selectedMethod.value = m
	c.pickSeq++
	c.chosenUnasked = false
	persistSelection(c, m).catch((error) => console.error("Failed to save the fee method", { error }))
}

function fpcUpdatedForApp(c: AppCtx, fpc: RegisteredFpc) {
	// A default holds only while its row is the protocol's: an edited address makes the row
	// custom, and a custom FPC pays only once picked.
	if (c.selectedMethod.value?.fpc?.id === fpc.id) {
		c.selectedMethod.value = c.chosenUnasked && !fpc.isProtocol ? undefined : { ...c.selectedMethod.value, fpc }
	}
}

/** The app windows' rule book: one pick per account, saved on an explicit pick, a dApp's lock
 *  over it. */
export function useAppFeeSelection(
	input: FeeSelectionInput & { lockedMethod: () => string | null; fallsBack: () => boolean },
): FeeSelection {
	const c: AppCtx = { ...input, selectedMethod: ref(), chosenUnasked: false, pickSeq: 0 }
	return {
		effectiveMethod: computed(() => c.selectedMethod.value),
		previewMethod: computed(() => undefined),
		held: computed(() => false),
		sponsorShort: computed(() => c.verdicts.droppedForVerdictId.value !== null),
		feeJuiceMissing: computed(() => selectedMethodHasNoGas(c) || noPayerCanPay(c)),
		pick: (m) => pickForApp(c, m),
		fpcUpdated: (fpc) => fpcUpdatedForApp(c, fpc),
		fpcDeleted: () => {
			c.selectedMethod.value = undefined
		},
		onShort: (fpcId) => dropShort(c, fpcId),
		// A dApp locks the method precisely when the balance just moved (a claim made for this
		// account): a snapshot inside the reader's TTL would show the old figure and hold Confirm
		// off, so a locked mount reads fresh.
		forceRefresh: () => Boolean(c.lockedMethod()),
		load: (scope, isCurrent) => loadApp(c, scope, isCurrent),
		reload: (scope) => reloadApp(c, scope),
		reconcile: ({ saved, baseline }, scope) => reconcileSelection(c, saved[scope.accountAddress], baseline!),
	}
}
