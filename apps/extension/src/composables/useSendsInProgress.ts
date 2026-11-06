import { computed, type InjectionKey, nextTick, type Ref, shallowRef, watch } from "vue"
import type { EventHandler } from "@nulo/wallet-core/utils"
import type { ToastOptions, ToastState } from "@/composables/toast"
import { useJournalMirror } from "@/composables/useJournalMirror"
import { journalRecordInScope } from "@/utils/activity-rows"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { isInFlightActivityOp } from "@/utils/journal-state"
import { sendRecipient, sendSummary } from "@/utils/send-summary"
import { knownDecimals, parseSide } from "@/utils/token-amount"
import type { OperationFilter, OperationRecord } from "@/wallet/services/operation-journal/spec"
import type { TokenDeleted } from "@/wallet/services/token/spec"

export type SendsScope = { profileId: string; networkId: string; account: string }
export type SendToken = { symbol: string; decimals: number; hasDecimals: boolean }

export interface SendsJournalService {
	getOperations(filter?: OperationFilter): Promise<OperationRecord[]>
	onOperationAdded: EventHandler<OperationRecord>
	onOperationUpdated: EventHandler<OperationRecord>
	onOperationDeleted: EventHandler<OperationRecord>
	onConnected: EventHandler<void>
}

export interface UseSendsInProgressOptions {
	/** Its own client: the parent connects and disconnects it. */
	journalService: SendsJournalService
	/** The unlocked session's complete scope in a popup document; undefined while locked, incomplete
	 *  or in a dApp window, where nothing is read and no toast opens. */
	scope: () => SendsScope | undefined
	/** Rejects or answers undefined for a token the scope no longer holds. */
	lookupToken: (tokenId: number) => Promise<SendToken | undefined>
	/** A removal drops every label read so far, so a send whose token went names its recipient alone. */
	tokenEvents: { onTokenDeleted: EventHandler<TokenDeleted> }
	/** The unlocked session's handle, undefined while locked; read once per scope, at its reset. */
	session: () => Promise<string | undefined>
	toast: Readonly<Ref<ToastState | null | undefined>>
	openToast: (options: ToastOptions) => number
	updateToast: (id: number, label: string) => void
	closeToast: () => void
}

/** The shell's one read of the operations in flight, for every view that lists them. */
export interface SendsInProgress {
	/** The active scope's sends and dApp operations still in flight, newest first. */
	records: Readonly<Ref<readonly OperationRecord[]>>
}

export const SENDS_IN_PROGRESS_KEY: InjectionKey<SendsInProgress> = Symbol("sends-in-progress")

const scopeKey = (s: SendsScope | undefined) => (s ? `${s.profileId} ${s.networkId} ${s.account}` : "")
const inScope = (op: OperationRecord, s: SendsScope) =>
	journalRecordInScope(op, { accountAddress: s.account, profileId: s.profileId, networkId: s.networkId })
const newestFirst = (a: OperationRecord, b: OperationRecord) => b.createdAt - a.createdAt
const isPopupSend = (op: OperationRecord) => op.kind === "transfer" && op.origin === "popup"

/**
 * The Sending toast's text for a popup send, or null when its recipient is not an address the wallet
 * could have sent to. A token the wallet cannot read, or an amount it cannot parse, names the
 * recipient alone.
 */
export function sendingLabel(op: OperationRecord, token: SendToken | undefined): string | null {
	const to = op.recipientAddress
	if (typeof to !== "string" || !isValidAztecAddress(to)) return null
	const amount = op.amountRaw ? parseSide(op.amountRaw) : undefined
	const decimals = knownDecimals(token)
	if (!token || amount === undefined || decimals === null) return `Sending to ${sendRecipient(to)}`
	return `Sending ${sendSummary({ amount, decimals, symbol: token.symbol, destination: to })}`
}

/** A label still being looked up: the toast waits rather than name an older send first. */
const PENDING = Symbol("pending")

/** Per send, the session handle under which the person closed its toast. A lock or a worker restart
 *  changes the handle, so a stored dismissal never outlives its session and nothing removes it. */
const DISMISSED_PREFIX = "nulo:sending:dismissed:"

async function storedDismissal(id: string): Promise<unknown> {
	const key = `${DISMISSED_PREFIX}${id}`
	return (await chrome.storage.session.get(key))[key]
}

/** The dismissals stored under one scope's session handle, which `reset` reads once: a token deletion
 *  re-asks labels, not the handle, and a × writes under the handle its scope began with. */
function sessionDismissals(session: () => Promise<string | undefined>) {
	let handle: Promise<string | undefined> = Promise.resolve(undefined)
	return {
		reset(active: boolean) {
			handle = active
				? Promise.resolve()
						.then(session)
						.catch(() => undefined)
				: Promise.resolve(undefined)
		},
		/** The handle this scope began with; undefined while locked or unreadable. */
		current: () => handle,
		/** Written blind, one key per send: two documents dismissing at once cannot erase each other's. A
		 *  document whose session has already ended writes nothing, so a lock it hears late cannot overwrite
		 *  the next session's dismissal of a send that outlived the lock. */
		record(ids: readonly string[]) {
			if (ids.length === 0) return
			const live = Promise.resolve()
				.then(session)
				.catch(() => undefined)
			void Promise.all([handle, live])
				.then(([began, now]) => {
					if (began === undefined || began !== now) return
					return chrome.storage.session.set(Object.fromEntries(ids.map((id) => [`${DISMISSED_PREFIX}${id}`, began])))
				})
				.catch(() => undefined)
		},
	}
}

type ToastDeps = Pick<UseSendsInProgressOptions, "lookupToken" | "session" | "toast" | "openToast" | "updateToast" | "closeToast">

/**
 * The one Sending toast over a list of sends in progress. It names the newest popup send the person
 * has not dismissed and closes when none is left; another message replacing it is not a dismissal,
 * so it opens again once that message closes. Its × dismisses every send running then, until
 * `reset()`, which closes it first.
 */
function sendingToast(records: Readonly<Ref<readonly OperationRecord[]>>, deps: ToastDeps) {
	/** Bumped on every reset: a lookup begun before one lands nothing. */
	let generation = 0
	let dismissed = new Set<string>()
	const asked = new Set<string>()
	const labels = shallowRef(new Map<string, string | null>())
	let own: { id: number; record: string } | undefined
	const stored = sessionDismissals(deps.session)
	/** Set while this opens or closes its own toast, which `onToastChange` must not read as the person's. */
	let quiet = false
	let live = false

	async function resolveLabel(op: OperationRecord, mine: number) {
		const [token, dismissal, session] = await Promise.all([
			op.tokenId === undefined ? undefined : deps.lookupToken(op.tokenId).catch(() => undefined),
			storedDismissal(op.id).catch(() => undefined),
			stored.current(),
		])
		if (mine !== generation) return
		// An unreadable key or session reads as not dismissed.
		if (session !== undefined && dismissal === session) dismissed.add(op.id)
		labels.value = new Map(labels.value).set(op.id, sendingLabel(op, token))
	}

	function labelOf(op: OperationRecord): string | null | typeof PENDING {
		if (labels.value.has(op.id)) return labels.value.get(op.id) ?? null
		if (!asked.has(op.id)) {
			asked.add(op.id)
			void resolveLabel(op, generation)
		}
		return PENDING
	}

	function wanted(): { record: string; label: string } | typeof PENDING | undefined {
		for (const op of records.value) {
			if (!isPopupSend(op) || dismissed.has(op.id)) continue
			const label = labelOf(op)
			if (label === PENDING) return PENDING
			if (label !== null) return { record: op.id, label }
		}
		return undefined
	}

	function withQuiet(act: () => void) {
		quiet = true
		try {
			act()
		} finally {
			quiet = false
		}
	}

	function closeOwn() {
		const mine = own
		own = undefined
		if (mine && deps.toast.value?.id === mine.id) withQuiet(deps.closeToast)
	}

	function show(want: { record: string; label: string }) {
		if (own) {
			if (own.record !== want.record || deps.toast.value?.label !== want.label) deps.updateToast(own.id, want.label)
			own = { id: own.id, record: want.record }
			return
		}
		// Another message is up: this one opens again once it closes.
		if (deps.toast.value) return
		withQuiet(() => {
			own = { id: deps.openToast({ kind: "info", label: want.label }), record: want.record }
		})
	}

	function reconcile() {
		if (!live) return
		const want = wanted()
		if (want === PENDING) {
			// Waiting on a label never keeps naming a send that has ended.
			if (own && !records.value.some((op) => op.id === own?.record)) closeOwn()
			return
		}
		if (want) show(want)
		else closeOwn()
	}

	/** Watched synchronously, so a message that replaced this one and closed in the same tick is still
	 *  told apart from the ×. */
	function onToastChange(next: ToastState | null | undefined, prev: ToastState | null | undefined) {
		if (quiet) return
		if (ownLeft(next, prev)) {
			own = undefined
			// Closed rather than replaced: the ×, or a lock, whose reset drops the set and whose ended
			// session writes nothing.
			if (!next) dismissRunning()
		} else if (!next && prev) void nextTick(reconcile)
	}

	function ownLeft(next: ToastState | null | undefined, prev: ToastState | null | undefined): boolean {
		return own !== undefined && prev?.id === own.id && next?.id !== own.id
	}

	function dismissRunning() {
		const ids = records.value.filter(isPopupSend).map((op) => op.id)
		for (const id of ids) dismissed.add(id)
		stored.record(ids)
	}

	/** Every label is read again, and a lookup already out lands nothing. */
	function forgetLabels() {
		generation++
		asked.clear()
		labels.value = new Map()
	}

	/** A lock, a scope change or a teardown: its own toast closes before its state goes. */
	function reset(active: boolean) {
		closeOwn()
		forgetLabels()
		dismissed = new Set()
		stored.reset(active)
		live = active
	}

	return { labels, reconcile, onToastChange, forgetLabels, reset }
}

/**
 * The popup's sends in progress for the active scope, and the one Sending toast that follows them
 * (`sendingToast`). The parent provides the result, and calls `dispose()` in its teardown.
 */
export function useSendsInProgress(options: UseSendsInProgressOptions) {
	const { journalService, scope, tokenEvents } = options
	let current: SendsScope | undefined

	const mirror = useJournalMirror({
		read: async () => {
			const asked = current
			if (!asked) return undefined
			const ops = await journalService.getOperations({ accountAddress: asked.account, isTerminal: false })
			if (asked !== current) return undefined
			return ops.filter((op) => inScope(op, asked)).sort(newestFirst)
		},
		accept: (op) => current !== undefined && inScope(op, current),
		place: "front",
	})
	const resnapshot = () => void mirror.resnapshot().catch(() => undefined)
	journalService.onOperationAdded.add(mirror.onOperationAdded)
	journalService.onOperationUpdated.add(mirror.onOperationUpdated)
	journalService.onOperationDeleted.add(mirror.onOperationDeleted)
	journalService.onConnected.add(resnapshot)

	const records = computed(() => mirror.rows.value.filter(isInFlightActivityOp).sort(newestFirst))
	const sending = sendingToast(records, options)
	const onTokenDeleted = () => sending.forgetLabels()
	tokenEvents.onTokenDeleted.add(onTokenDeleted)

	watch([records, sending.labels], sending.reconcile)
	watch(options.toast, sending.onToastChange, { flush: "sync" })
	watch(
		() => scopeKey(scope()),
		(key) => {
			const run = mirror.begin()
			current = key ? scope() : undefined
			sending.reset(current !== undefined)
			mirror.rows.value = []
			if (current) void mirror.resnapshot(run).catch(() => undefined)
		},
		{ immediate: true, flush: "sync" },
	)

	function dispose() {
		current = undefined
		sending.reset(false)
		journalService.onOperationAdded.remove(mirror.onOperationAdded)
		journalService.onOperationUpdated.remove(mirror.onOperationUpdated)
		journalService.onOperationDeleted.remove(mirror.onOperationDeleted)
		journalService.onConnected.remove(resnapshot)
		tokenEvents.onTokenDeleted.remove(onTokenDeleted)
		mirror.dispose()
	}

	return { records, dispose }
}
