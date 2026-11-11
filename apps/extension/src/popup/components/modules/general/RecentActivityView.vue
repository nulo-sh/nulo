<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Components */
import { SectionLabel } from "@nulo/design"
import TransactionAwaitingCard from "@/components/composite/activity/TransactionAwaitingCard.vue"
import ActivityRowCard from "../activity/ActivityRowCard.vue"
import SendReviewSheet from "../send/SendReviewSheet.vue"

/** Vendor */

/** Services */
import { ExecutionServiceClient } from "@/wallet/services/execution/client"
import { OperationJournalServiceClient } from "@/wallet/services/operation-journal/client"
import { IncomingTransferServiceClient } from "@/wallet/services/incoming-transfer/client"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { TaskServiceClient } from "@/wallet/services/task/client"
import { DappInteractionServiceClient } from "@/wallet/services/dapp-interaction/client"
import { ContentKind } from "@/wallet/services/task/spec"
import { TokenServiceClient } from "@/wallet/services/token/client"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { OriginType } from "@/wallet/services/transaction/spec"
import { useJournalMirror } from "@/composables/useJournalMirror"

/** Utils */
import { usePrices } from "@/composables/usePrices"
import { formatListAmount } from "@/utils/amount.js"
import { ROW_AMOUNT_LENGTH } from "@/utils/snack-amount"
import { knownDecimals } from "@/utils/token-amount"
import { dashIfBlank, isBlank } from "@/utils/string"
import { activeAccountScope } from "@/utils/active-scope"
import { filterPendingDoubleRender, journalRecordInScope, txOnToken } from "@/utils/activity-rows"
import {
	ACTIVITY_FEED_KINDS,
	isInFlightActivityOp,
	isQueuedTransfer,
	journalCardAmount,
	journalCardAmountSymbol,
	journalCardDirection,
	journalProgressWord,
	journalCardIcon,
	journalCardOriginLabel,
	journalCardTitle,
	journalCardTitleMark,
	journalCardTitleNamesToken,
	sanitizeJournalSubtitle,
} from "@/utils/journal-state"
import { tokenMarkOf } from "@/utils/token-icon"
import { callTitle, transferDirection } from "@/utils/tx-enrichment"
import { buildCancelHandler, buildFocusHandler, isMatchingTask } from "./recent-activity-handlers"
import { buildRecentActivityRows, remainingRowSlots } from "./recent-activity-rows"

/** Composables */
import { ARRIVALS_KEY } from "@/composables/useArrivals"
import { useIncomingSyncHealth } from "@/composables/useIncomingSyncHealth"
import { useIncomingTransfers } from "@/composables/useIncomingTransfers"
import { useScopedTokens } from "@/composables/useScopedTokens"
import { useExecutingTask } from "@/composables/useExecutingTask"
import { useReaskReview } from "@/composables/useReaskReview"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const props = defineProps({
	token: {
		type: Object,
	},
})

/** Terminal journal records (cancelled / interrupted / failed) have no age
 *  cutoff: like settled chain txs, they persist across browser restarts.
 *
 *  Row budget: 5, counting the in-flight cards, which always render, so the
 *  preview can exceed it. Terminal records, settled txs and incoming
 *  transfers share whatever slots remain, newest first, with none reserved
 *  for any kind (`recentActivityRows`). */
const ROW_BUDGET = 5

const historyRoute = computed(() =>
	props.token ? { path: "/popup/activity", query: { token: String(props.token.id) } } : "/popup/activity",
)

const filteredRecentTransactions = computed(() => {
	const source = props.token ? appStore.transactions.filter((t) => txOnToken(t, props.token.contract)) : appStore.transactions
	// Per-hash pending suppression — journal-first. Suppress a pending
	// chain tx only if its hash matches an in-flight journal record in
	// the `submitting` stage (the one stage carrying a txHash). All
	// pre-submit journal stages (queued / pending / simulating / proving)
	// have no chain tx yet, so they pull nothing through the filter and
	// pending chain txs from prior-but-still-in-flight ops stay visible.
	//
	// Pre-v2 had a blanket fallback that hid ALL pending chain txs while
	// any `executingTask` existed. That regressed T1 → vanish-on-confirm
	// whenever T2 was anywhere past `queued`. Dropped in v2 Layer A: the
	// journal records, now that `submitting.txHash` is populated upstream,
	// fully cover the double-render avoidance the blanket was for.
	return filterPendingDoubleRender(source, inFlightJournalOps.value)
})

/** Chronological merge of terminal journal records + settled chain txs.
 *  In-flight cards render BEFORE this list; this list takes whatever slots
 *  remain after subtracting the count of rendered awaiting cards. With N
 *  concurrent in-flight ops the home-tab preview can exceed ROW_BUDGET —
 *  every in-flight op is visible by design (per user requirement), and
 *  settled overflow goes to the Activity page. */
const recentActivityRows = computed(() => {
	// Count slots only for cards that actually render. The send.vue fallback
	// (`awaitingAccountTxs` / `isTokenAwaitingTx` generic card) is suppressed
	// by the template when ANY journal card or orphan executing task is on
	// screen — counting it in that window would undercount remaining settled
	// slots by 1. Mirror the template's `v-else-if`
	// chain here so the math matches the DOM.
	const journalCount = renderedInFlightOps.value.length
	const orphanCount = hasOrphanExecutingTask.value ? 1 : 0
	const fallbackRendered = journalCount === 0 && orphanCount === 0 && showFallbackAwaiting.value
	const remaining = remainingRowSlots({ journalCount, orphanCount, fallbackRendered, budget: ROW_BUDGET })
	if (remaining === 0) return []
	// Layer-A containment (defense-in-depth): scope tx rows to the active
	// account + chain and incoming rows to the active account + network, exactly
	// as `buildActivityRows` does — so both feed surfaces make identical scope
	// decisions. The store (`syncTransactions`/`onTxAdded`) and the incoming
	// composable already ingest-filter; a foreign-scope row reaching here would
	// be a second missed guard, so it is dropped anyway. Every input is read
	// HERE (inside the computed) so its dependency tracking is unchanged.
	const rows = buildRecentActivityRows({
		journalOps: recentlyTerminalJournalOps.value,
		transactions: filteredRecentTransactions.value,
		incomingTransfers: incomingTransfers.value,
		scope: {
			accountAddress: appStore.account?.address,
			chainId: appStore.network?.chainId,
			networkId: appStore.network?.id,
			profileId: appStore.profile?.id,
		},
		token: props.token,
	})
	return rows.slice(0, remaining)
})
const isTokenAwaitingTx = computed(() => {
	return props.token
		? appStore.awaitingTransactions.findIndex((t) => t.account === appStore.account.address && t.contract === props.token.contract) > -1
		: false
})
const awaitingAccountTxs = computed(() => {
	return appStore.awaitingTransactions.filter((t) => t.account === appStore.account?.address)
})
const showFallbackAwaiting = computed(() => (props.token ? isTokenAwaitingTx.value : awaitingAccountTxs.value.length > 0))

/** The UI transfer in flight (a dApp task names no account, so it is refused); its running step
 *  decorates the matching journal card, or an orphan card. */
const taskService = new TaskServiceClient()
const executing = useExecutingTask({
	taskService,
	accept: isExecutingTask,
	account: () => appStore.account?.address,
	journalRows: () => journalOps.value,
})
const { task: executingTask, subtasks: executingSubtasks, pendingCancels: pendingCancelJobIds } = executing
taskService.onTaskCreated.add(executing.onTaskCreated)
taskService.onTaskUpdated.add(executing.onTaskUpdated)
taskService.onTaskDeleted.add(executing.onTaskDeleted)

/** UI Transfer tasks and journal rows carry a tokenId; the lookup resolves it to symbol + decimals
 *  so the awaiting card mirrors TransactionCard (icon + amount). */
const tokenService = new TokenServiceClient()
const scopedTokens = useScopedTokens({
	tokenService,
	scope: () => (appStore.profile && appStore.network ? { profileId: appStore.profile.id, chainId: appStore.network.chainId } : undefined),
})
const { tokens, tokenById } = scopedTokens

const isUiTransfer = computed(() => executingTask.value?.content?.kind === ContentKind.Transfer)

const executingProgressTitle = computed(() => {
	if (!executingTask.value) return ""
	if (isUiTransfer.value) {
		const token = tokenById(executingTask.value.content.tokenId)
		return dashIfBlank(token?.symbol || "Transfer")
	}
	// Dapp path: title is the method name only — the dApp identity rides
	// in the secondary-row chip (originLabel) so the title position stays
	// stable across the lifecycle into the settled card. The task names no
	// contract, so a movement name reads as its contract spells it.
	const method = executingTask.value.content?.primaryMethod
	if (method) return callTitle(method, undefined, false)
	return "Transaction"
})
// The task starts before its record exists, so only a running step or the record names the stage.
const executingProgressSubtitle = executing.activeStepLabel
/** dApp identity chip for the in-flight card — same chip the settled
 *  `TransactionCard` shows via `getOriginLabel`. UI-initiated transfers
 *  leave this null so the chip is suppressed. */
const executingOriginLabel = computed(() => {
	if (!executingTask.value || isUiTransfer.value) return null
	// `origin.name` is dApp-controlled; bracket schemeful values so a
	// malicious dApp can't make its in-flight label visually read as a link.
	// The orphan-fallback awaiting cards bind this same value, so the wrap
	// here covers both render sites.
	return sanitizeJournalSubtitle(executingTask.value.origin?.name)
})
const executingAmount = computed(() => {
	if (!isUiTransfer.value) return null
	const decimals = knownDecimals(tokenById(executingTask.value.content.tokenId))
	if (decimals === null) return null
	return formatListAmount(String(executingTask.value.content.amount), decimals, ROW_AMOUNT_LENGTH)
})
const executingAmountSymbol = computed(() => {
	if (!isUiTransfer.value) return null
	return tokenById(executingTask.value.content.tokenId)?.symbol || null
})
const executingTitleMark = computed(() => {
	const token = isUiTransfer.value ? tokenById(executingTask.value.content.tokenId) : undefined
	return token ? tokenMarkOf(incomingPrices, token) : null
})
/** The task holds the request's own sender and recipient, as the send's journal record does. */
const executingDirection = computed(() => {
	if (!isUiTransfer.value) return null
	const { transferType, senderAddress, recipientAddress } = executingTask.value.content
	return transferDirection(transferType, senderAddress, recipientAddress)
})

/** Durable journal records. Survives SW restart + popup close/reopen so if
 *  the user starts a send, closes the popup, and reopens, they still see the
 *  progress card. Filtered to in-flight states only — submitted/failed drop
 *  off automatically. */
const journalService = new OperationJournalServiceClient()
const journal = useJournalMirror({
	accept: journalRecordInActiveScope,
	place: "front",
	read: readJournalSnapshot,
	onRecord: (op) => {
		executing.onJournalRecord(op)
		clearAwaitingTransactionFallback(op)
	},
	// A popup closed mid-cancel and reopened, or a worker disconnect mid-cancel, ends the task's
	// record unseen; the snapshot finds it.
	onSnapshot: () => executing.onJournalSnapshot(),
})
const journalOps = journal.rows

/** Third source for the activity-row merge: incoming-receive records from
 *  trusted fungible-token contracts. Filtered at the service layer
 *  (hidden=false only); the merge below adds them to recentActivityRows. */
// Parent owns the client lifecycle (connect/disconnect in onMounted/
// onBeforeUnmount below); useIncomingTransfers wires the listeners + the
// `incomingTransfersVisible` toggle reload.
const incomingTransferService = new IncomingTransferServiceClient()
const configService = new ConfigServiceClient()
const incomingPriceService = new PriceServiceClient()
const incomingPrices = usePrices(incomingPriceService)
/** Whether a re-ask opened now prices its figures: the sheet keeps the quote it opens with. */
const feeQuoteState = computed(() => (incomingPrices.feeJuiceQuote.value ? "ready" : "none"))
const arrivals = inject(ARRIVALS_KEY, undefined)
const { incomingTransfers, dispose: disposeIncomingTransfers } = useIncomingTransfers({
	incomingTransferService,
	configService,
	priceService: incomingPriceService,
	scope: () => activeAccountScope(appStore),
	// Rows are assigned under the state that judges them; the token page's never play, so its reads
	// wait for none.
	afterRead: arrivals && ((scope) => (props.token ? Promise.resolve() : arrivals.load(scope))),
})
/** Account mode only: whether the active network's incoming scan has stalled. Same client as the
 *  receipts above — the parent owns its connect/disconnect. */
const syncHealth = useIncomingSyncHealth({
	client: incomingTransferService,
	getScope: () =>
		!props.token && appStore.profile?.id && appStore.network?.id
			? { profileId: appStore.profile.id, networkId: appStore.network.id }
			: undefined,
})
const showStalledLine = computed(() => !props.token && syncHealth.stalled.value)
const executionService = new ExecutionServiceClient()

/** Each card cancels its own record; the job is marked so its record ending clears the task by id,
 *  not by the kind+tokenId match. */
const onCancelInFlight = buildCancelHandler(executionService, executing.markCancelling)

const dappInteractionService = new DappInteractionServiceClient()
const onFocusInFlight = buildFocusHandler(dappInteractionService)

/** Whether a record belongs to the active account, profile and network.
 *  Journal state holds only such records, and only they run a journal side effect: the task's and
 *  the fallback's clears match on account and token alone, so another scope's terminal record
 *  would remove this scope's card. The scope watcher empties the state synchronously on a switch. */
function journalRecordInActiveScope(op) {
	return journalRecordInScope(op, {
		accountAddress: appStore.account?.address,
		profileId: appStore.profile?.id,
		networkId: appStore.network?.id,
	})
}

function journalRecordOnThisView(op) {
	if (!journalRecordInActiveScope(op)) return false
	if (props.token && op.tokenId !== props.token.id) return false
	return true
}

const inFlightJournalOps = computed(() =>
	// Terminal records surface through `recentlyTerminalJournalOps` below.
	journalOps.value.filter((op) => isInFlightActivityOp(op) && journalRecordOnThisView(op)),
)

/** Terminal journal records (cancelled / failed) in scope, sorted newest-first.
 *  No time window: like the settled chain txs beside them, they persist
 *  across browser restarts. */
const recentlyTerminalJournalOps = computed(() => {
	return journalOps.value
		.filter((op) => {
			if (op.terminalAt === null) return false
			// Filter out succeeded too — those have a TransactionService entry
			// and render via TransactionCard.
			if (op.progress?.stage === "succeeded") return false
			if (!ACTIVITY_FEED_KINDS.has(op.kind)) return false
			return journalRecordOnThisView(op)
		})
		.sort((a, b) => (b.terminalAt ?? 0) - (a.terminalAt ?? 0))
})

/**
 * The journal is the primary source of truth.
 *
 * The popup once preferred the in-memory TaskService over the durable
 * journal, which meant a stale task from before SW restart could mask the
 * journal's truth and never get re-snapshotted. Now: if the journal shows
 * an in-flight op, that's what we render. The executingTask remains as
 * SUBTASK ENRICHMENT — its progress lines decorate the journal card when
 * both exist for the same op — but it no longer gates whether the
 * in-flight card appears.
 *
 * Reconnect handling is via `journalService.onConnected` (registered
 * below): on every port reconnect (SW restart) we re-snapshot the journal
 * list so a record that became terminal during the disconnect window
 * stops surfacing as in-flight.
 */
const showJournalAwaiting = computed(() => inFlightJournalOps.value.length > 0)

/** Stable render order: newest-first (by `createdAt` descending). Matches
 *  how the settled transaction list orders rows (newest on top) and the
 *  user's mental model ("the one I just submitted goes on top; older ones
 *  scroll down"). The disappearance bug being fixed here is about
 *  *rendering all cards*, not about which one sits at index 0 — the order
 *  is independent. */
const renderedInFlightOps = computed(() => [...inFlightJournalOps.value].sort((a, b) => b.createdAt - a.createdAt))

const cardAmountFor = (op) => journalCardAmount(op, tokenById)
const cardAmountSymbolFor = (op) => journalCardAmountSymbol(op, tokenById)

function awaitingSubtitleFor(op) {
	return isQueuedTransfer(op) ? journalProgressWord(op) : cardSubtitleFor(op)
}

const reaskLineFor = (op) => (isQueuedTransfer(op) && op.progress.reask ? "Fee went up. Review" : null)

const reask = useReaskReview({
	acceptQueuedFee: (jobId, fee) => executionService.acceptQueuedFee(jobId, fee),
	findOp: (jobId) => renderedInFlightOps.value.find((x) => x.id === jobId),
	usdRate: () => incomingPrices.feeJuiceQuote.value?.usd,
	amountOf: cardAmountFor,
	symbolOf: cardAmountSymbolFor,
})
const { opened: reaskOpened, isOpen: reaskOpen, order: reaskOrder, depth: reaskDepth, ready: reaskReady, sending: reaskSending } = reask

/** Per-op subtitle. The active executingTask's subtask label decorates
 *  ONLY the matching journal card — and ONLY when the match is unambiguous.
 *
 *  `isMatchingTask` is kind-only for `dapp_execute` and kind+tokenId for
 *  `transfer`. Two concurrent same-token transfers (or any two dapp_execute
 *  ops) would both match the same executingTask. Broadcasting the subtask
 *  label to both cards would attribute progress to the wrong op. When the
 *  match is ambiguous (≥ 2 cards match), every card falls back to the bare
 *  FSM-stage label so we never lie about which op the subtask belongs to. */
function cardSubtitleFor(op) {
	if (!op) return "Processing..."
	// Backend evidence outranks the task label: the label only says a proof is
	// being generated, the journal says where.
	if (op.progress?.stage === "proving" && op.progress.backend) return journalProgressWord(op)
	if (executingTask.value) {
		const account = appStore.account?.address
		if (isMatchingTask(executingTask.value, op, account)) {
			const matches = renderedInFlightOps.value.filter((other) => isMatchingTask(executingTask.value, other, account))
			if (matches.length === 1 && executing.activeStepLabel.value) return executing.activeStepLabel.value
		}
	}
	return journalProgressWord(op)
}

/** True when an executingTask is present but no in-flight journal record
 *  matches it. Drives the orphan-fallback render path: a single executingTask
 *  card renders ALONGSIDE journal cards in the rare case where TaskService
 *  has an active task without a corresponding journal entry (legacy paths,
 *  stragglers after SW restart, etc.). */
const hasOrphanExecutingTask = computed(() => {
	if (!executingTask.value) return false
	// Account-switch containment: only surface an orphan card when the
	// executingTask still belongs in THIS view. `isExecutingTask` re-validates
	// the active account (transfer via senderAddress) and fails closed on
	// uncorrelated dApp tasks, so a task set just before a switch can't render as
	// a foreign-account orphan card under the new account.
	if (!isExecutingTask(executingTask.value)) return false
	const account = appStore.account?.address
	return !renderedInFlightOps.value.some((op) => isMatchingTask(executingTask.value, op, account))
})

/**
 * Cancel-dupe fix, third producer:
 *
 * `send.vue` pushes a fallback row into `appStore.awaitingTransactions`
 * BEFORE `executeTransfer` runs ([send.vue:262]) and only splices it out
 * on the executeTransfer promise's resolve/reject path. On user cancel,
 * the journal goes terminal IMMEDIATELY but the executeTransfer promise
 * doesn't reject until the prove pipeline hits its next AbortSignal
 * checkpoint — which is seconds for a transfer mid-proof. That gap is
 * exactly the dupe window: cancelled terminal card shown alongside the
 * `isTokenAwaitingTx` / `awaitingAccountTxs` fallback card.
 *
 * dApp `aztec_sendTx` doesn't use awaitingTransactions, so the bug was
 * transfer-only.
 *
 * Fix: when a transfer journal record turns terminal, splice the matching
 * fallback entry. Match by (account, destination=recipient, contract via
 * tokenId → token lookup) — same triple `send.vue` pushes. Guard on the
 * carry fields a transfer record holds (amountRaw + recipient).
 */
function clearAwaitingTransactionFallback(op) {
	if (op.kind !== "transfer") return
	if (op.terminalAt === null) return
	const recipient = op.recipientAddress
	if (!recipient || op.tokenId === undefined) return
	const tokenContract = tokenById(op.tokenId)?.contract
	if (!tokenContract) return
	const placeholder = appStore.awaitingTransactions.find(
		(t) => t.account === op.accountAddress && t.destination === recipient && t.contract === tokenContract,
	)
	if (placeholder) appStore.removeAwaitingTransaction(placeholder.id)
}

journalService.onOperationAdded.add(journal.onOperationAdded)
journalService.onOperationUpdated.add(journal.onOperationUpdated)
journalService.onOperationDeleted.add(journal.onOperationDeleted)

async function readJournalSnapshot() {
	const captured = appStore.account?.address
	const ops = await journalService.getOperations({ accountAddress: captured })
	if (captured !== appStore.account?.address) return undefined
	// The read filters by account and profile, not network.
	return ops.filter(journalRecordInActiveScope).sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * SW-restart safety: re-snapshot the full journal list on every port
 * reconnect. Without this, a record that became terminal (succeeded /
 * failed / cancelled — including reaper-driven `stuck_proving`) during
 * the disconnect window would never receive its onOperationUpdated event
 * here and would keep surfacing as in-flight. The reconnect listener
 * registers BEFORE the initial snapshot (same race-closure pattern as
 * `subscribeWithSnapshot`). The durable-job reaper is what generates those
 * terminal transitions during SW down windows.
 */
function resnapshotJournal(isCurrent = journal.begin()) {
	// A refused read is the mirror's to retry, on this run.
	return journal.resnapshot(isCurrent).catch(() => undefined)
}
journalService.onConnected.add(resnapshotJournal)

function isExecutingTask(task) {
	if (task.finishedAt) return false
	// Account-switch containment — fail closed on dApp tasks. A dApp-initiated
	// `ExecuteOperation` task carries NO account/network (`ExecuteOperationContent`
	// in task/spec.ts) so it is UNCORRELATED and cannot be scoped to the active
	// account. Surfacing it would let account A's dApp task render as an in-progress
	// card under account B. We therefore do NOT surface dApp TaskService cards; the
	// durable journal records (`renderedInFlightOps`) remain the dApp progress
	// source. Re-enabled once the Phase-1a task↔journal atomic binding lands.
	//
	// UI-initiated transfer — account-correlated via `senderAddress`, so it stays
	// (matches the active account AND, in token-mode, the page's token).
	if (task.content.kind === ContentKind.Transfer && task.origin?.type === OriginType.UI) {
		if (task.content.senderAddress !== appStore.account?.address) return false
		// Network scoping when the task carries it: same-address profiles/networks
		// otherwise render a foreign network's in-flight card (TaskService clears
		// on PROFILE change only). Tasks minted before the field keep the
		// address-only semantics.
		if (task.content.networkId !== undefined && task.content.networkId !== appStore.network?.id) return false
		if (props.token && task.content.tokenId !== props.token.id) return false
		return true
	}
	return false
}
/** Account-switch containment (Layer A, drop-only). This component holds
 *  view-local state that is NOT remounted on switch (no account `:key` on the
 *  feed root), so a switch A→B must synchronously clear what B could SEE of A's
 *  progress, then reload for B. `flush: 'sync'` clears BEFORE Vue paints the new
 *  account — a default (post-nextTick) watcher would leave a one-tick window
 *  rendering A's journal/task rows under B. Keyed on the FULL scope triple
 *  (profile, network, address): two profiles restored from one phrase share an
 *  address, so an address-only key no-oped on a same-address switch and left
 *  the predecessor's progress card rendering. The key COLLAPSES to "" while any
 *  part is missing (bare interpolation would stringify undefined into a
 *  never-falsy key, killing the not-ready guard and firing throwaway RPCs on
 *  every bootstrap transition). A rename (same triple) still does not reset.
 *  Incoming transfers and tokens are reset separately by their composables' own
 *  sync scope watchers. */
const scopeTripleKey = () => {
	const p = appStore.profile?.id
	const n = appStore.network?.id
	const a = appStore.account?.address
	return p && n && a ? `${p} ${n} ${a}` : ""
}
watch(
	scopeTripleKey,
	(nv, ov) => {
		if (nv === ov) return
		const journalRun = journal.begin()
		journalOps.value = []
		executing.reset()
		reask.reset()
		if (!nv) return
		resnapshotJournal(journalRun)
		executing.snapshot()
	},
	{ flush: "sync" },
)

// Token mode is part of the scope: leaving it changes neither profile nor network, yet the account feed
// it reveals has never fetched its health.
watch(
	() => `${props.token ? "token" : "account"}|${appStore.profile?.id ?? ""}|${appStore.network?.id ?? ""}`,
	() => void syncHealth.refresh(),
)

// After the render that showed them: only rows that rendered are claimed, so one the row budget
// left out plays where it is first shown. The token page's rows never play.
watch(
	recentActivityRows,
	(rows) => {
		if (!props.token) arrivals?.present(rows.filter((row) => row.type === "incoming").map((row) => row.inc))
	},
	{ flush: "post" },
)

/** Exposed for Layer-A containment component tests: assert the switch-reset +
 *  captured-account guards at the STATE level (a render filter alone can mask a
 *  containment gap). Placed after the declarations it references (temporal dead
 *  zone) rather than in the macro block. */
defineExpose({ journalOps, executingTask, executingSubtasks, pendingCancelJobIds, hasOrphanExecutingTask, recentActivityRows, tokens })

onMounted(async () => {
	// Begun before the awaits below, so an unmount during them leaves this run stale.
	const journalRun = journal.begin()
	await scopedTokens.reload()

	// ServiceClient doesn't auto-connect on listener registration — make
	// explicit connects so the onUpdate (visibility toggle) and
	// onConnected (loadIncomingTransfers) listeners fire. Without the
	// incoming connect, the onConnected handler never runs and the
	// widget's incoming-transfer rows stay empty across re-mounts.
	try {
		await configService.connect()
	} catch {
		// Non-fatal; reload-on-toggle just won't fire until next mount.
	}
	try {
		await incomingTransferService.connect()
	} catch {
		// Non-fatal; the widget will still render outgoing rows.
	}
	void syncHealth.refresh()

	// Snapshot the active account's executingTask (captured-account guarded).
	await executing.snapshot()

	// Load persisted in-flight ops for the active account (captured-account
	// guarded). Its landing runs the task's 30 s terminal check (`onJournalSnapshot`).
	await resnapshotJournal(journalRun)
})
onBeforeUnmount(() => {
	reask.close()
	taskService.disconnect()
	tokenService.disconnect()
	journalService.disconnect()
	executionService.disconnect()
	dappInteractionService.disconnect()
	incomingTransferService.disconnect()
	configService.disconnect()
	incomingPrices.dispose()
	incomingPriceService.disconnect()
	disposeIncomingTransfers()
	syncHealth.dispose()
	scopedTokens.dispose()
	journal.dispose()
	executing.dispose()
})
</script>

<template>
	<Flex
		v-if="executingTask || showJournalAwaiting || showFallbackAwaiting || recentActivityRows.length || showStalledLine"
		:key="token ? 'token' : 'account'"
		direction="column"
		gap="16"
		data-testid="activity-feed-root"
		:data-active-account="appStore.account?.address"
		:data-fee-quote="feeQuoteState"
	>
		<Flex align="end" justify="between" :class="$style.section_header">
			<SectionLabel label="Recent activity" />
			<RouterLink :to="historyRoute" :class="$style.archive_link" data-testid="activity-view-all">View history</RouterLink>
		</Flex>

		<div v-if="showStalledLine" :class="$style.stalled_line" data-testid="incoming-sync-stalled">
			<span>Older incoming transfers may be missing</span>
			<span aria-hidden="true">·</span>
			<button
				type="button"
				class="type--label-section"
				:class="$style.stalled_retry"
				:disabled="syncHealth.retrying.value"
				data-testid="incoming-sync-retry"
				@click="syncHealth.retry()"
			>
				Retry
			</button>
		</div>

		<div :class="$style.list">
			<!-- One awaiting card per in-flight journal op, newest-first by
			     createdAt. Cancel is per-card: TransactionAwaitingCard emits
			     `cancel(jobId)` and buildCancelHandler dispatches to that
			     specific record. -->
			<TransactionAwaitingCard
				v-for="op in renderedInFlightOps"
				:key="`awaiting:${op.id}`"
				:title="journalCardTitle(op, { tokenById, tokens })"
				:subtitle="awaitingSubtitleFor(op)"
				:reaskLine="reaskLineFor(op)"
				:icon="journalCardIcon(op)"
				:originLabel="journalCardOriginLabel(op)"
				:amount="cardAmountFor(op)"
				:amountSymbol="cardAmountSymbolFor(op)"
				:titleNamesToken="journalCardTitleNamesToken(op)"
				:titleMark="journalCardTitleMark(op, { tokenById }, incomingPrices)"
				:direction="journalCardDirection(op)"
				:cancellable="true"
				:jobId="op.id"
				:stage="op.progress?.stage ?? null"
				:backend="op.progress?.backend ?? null"
				:hasApprovalWindow="op.kind === 'dapp_execute'"
				:oneLineTitle="op.kind === 'dapp_execute'"
				@cancel="onCancelInFlight"
				@focus="onFocusInFlight"
				@review="reask.open"
			/>
			<!-- Orphan executingTask fallback: an active TaskService entry
			     with no matching journal record (rare; legacy paths /
			     stragglers after SW restart). Renders alongside
			     journal cards, not instead of them. -->
			<TransactionAwaitingCard
				v-if="hasOrphanExecutingTask"
				:title="executingProgressTitle"
				:subtitle="executingProgressSubtitle"
				:icon="isUiTransfer ? 'send' : 'zap'"
				:originLabel="executingOriginLabel"
				:amount="executingAmount"
				:amountSymbol="executingAmountSymbol"
				:titleNamesToken="isUiTransfer"
				:titleMark="executingTitleMark"
				:direction="executingDirection"
				:oneLineTitle="!isUiTransfer"
			/>
			<TransactionAwaitingCard v-else-if="!renderedInFlightOps.length && showFallbackAwaiting" />
			<!-- Chronological merge of terminal journal records + settled chain
			     txs. Branch by row.type. -->
			<ActivityRowCard
				v-for="row in recentActivityRows"
				:key="row.key"
				:row="row"
				:tokens="tokens"
				:tokenById="tokenById"
				:fiatLabel="incomingPrices.tokenFiatLabel"
				:iconFor="incomingPrices.iconFor"
				:isFlagged="incomingPrices.isFlagged"
				:isArriving="token ? undefined : arrivals?.isArriving"
			/>
		</div>
	</Flex>
	<Flex v-else-if="token" direction="column" gap="16" data-testid="activity-feed-root" :data-active-account="appStore.account?.address">
		<Flex align="end" justify="between">
			<SectionLabel label="Recent activity" />
		</Flex>

		<div :class="$style.empty_state">
			<span :class="$style.empty_headline">NOTHING HERE YET</span>
			<span :class="$style.empty_sub">Send or receive {{ isBlank(token.symbol) ? "this token" : token.symbol }} to see activity here.</span>
		</div>
	</Flex>
	<SendReviewSheet
		v-if="reaskOpened"
		:show="reaskOpen"
		:order="reaskOrder"
		:depth="reaskDepth"
		:facts="reaskOpened.sheet.facts"
		:amount="reaskOpened.amount"
		:symbol="reaskOpened.symbol"
		:recipientAddress="reaskOpened.recipientAddress"
		:payerKind="reaskOpened.sheet.payerKind"
		:payerType="reaskOpened.sheet.payerType"
		:canSend="true"
		:sending="reaskSending"
		:ready="reaskReady"
		:reask="reaskOpened.sheet.reask"
		@close="reask.close"
		@send="reask.send"
	/>
</template>

<style module>
@media (width < 359px) {
	.section_header {
		flex-wrap: wrap;
		gap: 4px 12px;
	}
}

.archive_link {
	composes: type--label-section from global;
	user-select: none;
	color: var(--nulo-secondary);

	transition: color 0.2s var(--bezier);

	&:hover {
		color: var(--nulo-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}

.stalled_line {
	composes: type--meta from global;
	display: flex;
	align-items: center;
	gap: 6px;

	padding: 8px 12px;
	border: 1px dashed var(--nulo-border);

	line-height: 1.4;
	color: var(--nulo-secondary);
}

.stalled_retry {
	padding: 0;
	border: 0;
	background: none;

	color: var(--nulo-secondary);
	line-height: inherit;
	cursor: pointer;

	transition: color 0.2s var(--bezier);

	&:hover:not(:disabled),
	&:focus-visible {
		color: var(--nulo-accent);
	}

	&:disabled {
		cursor: default;
		opacity: 0.5;
	}
}

.list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.empty_state {
	composes: empty_state from "../../../../components/composite/list-empty.module.css";
}

.empty_headline {
	composes: empty_headline from "../../../../components/composite/list-empty.module.css";
}

.empty_sub {
	composes: empty_sub from "../../../../components/composite/list-empty.module.css";
}
</style>
