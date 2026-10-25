/**
 * Terminal-record GC sweep for the operation journal.
 *
 * The journal keeps terminal records (succeeded / failed /
 * cancelled) instead of auto-deleting them — tombstones serve idempotency
 * checks and the activity card history. With no bound, those tombstones
 * accumulate forever in `chrome.storage.local`. The UI caps the home-tab
 * preview at 5 rows, so the bloat is visually invisible up to thousands of
 * records, but the storage quota is finite.
 *
 * The GC sweep mirrors {@link JournalReaper} but watches the *terminal*
 * subset: it groups records by `(profileId, accountAddress ?? null)` and
 * enforces a per-scope cap, evicting the oldest by `terminalAt`. The
 * reaper handles non-terminal stuck records; the two paths never touch the
 * same record set.
 *
 * **Eviction policy**: two classes are evictable, each under its own cap, so
 * neither pushes the other out. `succeeded` records correspond to confirmed
 * on-chain transactions; their history is re-derivable from PXE + the tx
 * hash. A request the wallet refused before sending it (a refusal kind on a
 * record `wasNeverSent` holds for) records only that refusal, and an app
 * files them at its own pace. Every other failed or cancelled record has NO
 * on-chain truth elsewhere, so it is never evicted, and neither is any record
 * that carries a transaction hash without having succeeded.
 *
 * `accountAddress`-less terminal records (a failed token-import before the
 * account scope was set, for instance) cluster under a synthetic
 * `(profileId, null)` bucket with the same cap.
 */

import type { KnownJobErrorKind } from "@nulo/wallet-core/jobs"
import type { AlarmsPort } from "@nulo/wallet-core/ports"
import { AlarmDispatcher } from "@nulo/wallet-core/utils"
import { LogLevel } from "@nulo/wallet-core/logger"
import type { ILogger } from "@/wallet/logger"
import type { OperationJournalService } from "./service"
import { OPERATION_JOURNAL_SERVICE_NAME, wasNeverSent } from "./spec"

export const JOURNAL_GC_ALARM_NAME = "nulo:journal:gc"

/** Run hourly — bloat is slow, and a separate alarm avoids coupling to the
 *  reaper's 1-min cadence. */
export const JOURNAL_GC_PERIOD_MINUTES = 60

/** Per-(profile, accountAddress) cap for each evictable class. 10× the home-tab UI
 *  budget; ample headroom for "I want to scroll back" while still bounding
 *  session storage. */
export const DEFAULT_TERMINAL_CAP_PER_SCOPE = 50

const LOG_SOURCE = OPERATION_JOURNAL_SERVICE_NAME

/** Synthetic key for the "no account address" bucket. */
const NO_ACCOUNT = "<no-account>"

/** The kinds of a request refused before anything was signed or sent. */
const REFUSED_BEFORE_SENDING: ReadonlySet<string> = new Set([
	"scope_refused",
	"registry_refused",
	"malformed_request",
	"terms_refused",
	"wallet_refused",
	"too_many_pending",
] satisfies readonly KnownJobErrorKind[])

type TerminalRecord = Awaited<ReturnType<OperationJournalService["getOperations"]>>[number]

const isSucceeded = (op: TerminalRecord): boolean => op.progress?.stage === "succeeded"

const isRefusedBeforeSending = (op: TerminalRecord): boolean => wasNeverSent(op) && REFUSED_BEFORE_SENDING.has(op.error?.kind ?? "")

/**
 * Watches the operation journal for terminal records that exceed the
 * per-scope cap and deletes the oldest entries via
 * `OperationJournalService.deleteOperation` (which emits `onOperationDeleted`,
 * so any live subscribers — `RecentActivityView`, future tokens-view rows —
 * see the eviction the same way they see chain-purge deletes).
 *
 * Not a Service — pure SW-internal runtime component. Wired by
 * `runtime.ts` after `services.start()` alongside `JournalReaper`.
 */
export class JournalGC {
	private readonly journal: OperationJournalService
	private readonly logger: ILogger
	private readonly capPerScope: number
	// The name-guarded create/clear/dispatch ritual is owned by the shared
	// AlarmDispatcher; the boot-time sweep + its cadence stay local (they differ
	// per alarm consumer, so the wrapper deliberately doesn't own them).
	private readonly dispatcher: AlarmDispatcher

	public constructor(journal: OperationJournalService, alarms: AlarmsPort, logger: ILogger, opts?: { capPerScope?: number }) {
		this.journal = journal
		this.logger = logger
		this.capPerScope = opts?.capPerScope ?? DEFAULT_TERMINAL_CAP_PER_SCOPE
		this.dispatcher = new AlarmDispatcher(JOURNAL_GC_ALARM_NAME, alarms)
	}

	/**
	 * Register the periodic alarm + boot-time sweep. Idempotent within a
	 * single SW lifetime — calling twice replaces the alarm registration
	 * (chrome.alarms.create semantics) and stacks the listener.
	 */
	public async start(): Promise<void> {
		// The caller owns the diagnostic, so this stays byte-identical to the
		// pre-extraction `sweep().catch(err => log("sweep tick threw", …))`.
		this.dispatcher.listen(
			() => this.sweep(),
			(err) => this.logger.log(LOG_SOURCE, LogLevel.Error, "sweep tick threw", err),
		)
		await this.dispatcher.create({ periodInMinutes: JOURNAL_GC_PERIOD_MINUTES })
		try {
			await this.sweep()
		} catch (err) {
			this.logger.log(LOG_SOURCE, LogLevel.Error, "boot-sweep threw; continuing", err)
		}
	}

	public async stop(): Promise<void> {
		await this.dispatcher.stop()
	}

	/**
	 * Single sweep pass. Reads all terminal records via
	 * `getOperations({ isTerminal: true })`, groups by
	 * `(profileId, accountAddress ?? null)`, and deletes the oldest entries
	 * in any group whose size exceeds `capPerScope`.
	 *
	 * Per-record errors are logged but do not abort the pass (a record
	 * deleted by another flow between read and delete is expected).
	 */
	public async sweep(): Promise<void> {
		const terminal = await this.journal.getOperations({ isTerminal: true })
		if (terminal.length === 0) return

		const groups = new Map<string, typeof terminal>()
		for (const op of terminal) {
			const key = `${op.profileId}::${op.accountAddress ?? NO_ACCOUNT}`
			const bucket = groups.get(key)
			if (bucket) bucket.push(op)
			else groups.set(key, [op])
		}

		let evicted = 0
		for (const bucket of groups.values()) {
			evicted += await this.evictBeyondCap(bucket.filter(isSucceeded))
			evicted += await this.evictBeyondCap(bucket.filter(isRefusedBeforeSending))
		}

		if (evicted > 0) {
			this.logger.log(LOG_SOURCE, LogLevel.Info, `evicted ${evicted} terminal record(s); cap=${this.capPerScope}/scope`)
		}
	}

	/** Deletes the oldest of `evictable` by `terminalAt` past the cap; returns how many went. */
	private async evictBeyondCap(evictable: TerminalRecord[]): Promise<number> {
		if (evictable.length <= this.capPerScope) return 0
		evictable.sort((a, b) => (b.terminalAt ?? 0) - (a.terminalAt ?? 0))
		let evicted = 0
		for (const victim of evictable.slice(this.capPerScope)) {
			try {
				await this.journal.deleteOperation(victim.id)
				evicted++
			} catch (error) {
				this.logger.log(LOG_SOURCE, LogLevel.Debug, "evict skipped", { id: victim.id, error })
			}
		}
		return evicted
	}
}
