import { type ImportedKeysDek, zeroize } from "@nulo/wallet-crypto"
import { ExpiringStash } from "./expiring-stash"

/** An abandoned restore's rewrap context would otherwise hold two DEKs for the worker's lifetime.
 *  The window comfortably exceeds a slow multi-service backup import; a legitimate import that
 *  runs longer can be expired by a later trigger — accepted. */
export const PENDING_RESTORE_TTL_MS = 30 * 60 * 1000

/** The source→destination DEK pair that rewraps a backup's imported-key rows. */
export type RewrapContext = { sourceDek: ImportedKeysDek; destinationDek: ImportedKeysDek }

/** What a finalize saw before its first await, compared by identity. Opaque: no buffer is read
 *  through it. */
export type FinalizeTicket = Readonly<{ id: string; rewrap: unknown; admission: unknown }>

/**
 * The memory-only state of restores committed and not yet finalized, gone with the worker:
 * - each restore's rewrap context. `restore()` runs BEFORE the imported-keys slice arrives, so the
 *   SOURCE DEK cannot be consumed inside restore itself: `take` hands both buffers to
 *   `AccountService.restoreImportedKeys`. Finalize wipes a LEFTOVER context (the empty-slice case)
 *   and the TTL sweep an abandoned one. An expired or missing context with rows present fails
 *   those rows into the orphan taxonomy — never silently-kept undecryptable rows.
 * - each restore's admission, which lets its finalize open the profile its commit wrote, taken
 *   back by an explicit lock, a deletion or the TTL. Secret-free: the page holds the credential.
 *
 * Every method is synchronous. The profile facade calls them only under its lock, so no sweep
 * zeroizes an entry another op holds a live reference to.
 */
export class PendingRestoreState {
	private readonly rewraps = new ExpiringStash<RewrapContext & { capturedAt: number }>(PENDING_RESTORE_TTL_MS, (entry) => {
		zeroize(entry.sourceDek)
		zeroize(entry.destinationDek)
	})
	private readonly admissions = new ExpiringStash<{ capturedAt: number }>(PENDING_RESTORE_TTL_MS, () => undefined)

	/** Wipes every expired rewrap context but `exceptId`'s, and drops every expired admission. */
	public sweep(exceptId?: string): void {
		this.sweepAt(Date.now(), exceptId)
	}

	/** Takes ownership of both buffers and admits `id`'s finalize. */
	public stash(id: string, context: RewrapContext): void {
		this.sweepAt(Date.now(), id)
		this.rewraps.set(id, { sourceDek: context.sourceDek, destinationDek: context.destinationDek, capturedAt: Date.now() })
		this.admissions.set(id, { capturedAt: Date.now() })
	}

	/** Hands `id`'s rewrap context over once; the caller then owns and zeroizes both buffers.
	 *  `undefined` = expired, already taken or never stashed. */
	public take(id: string): RewrapContext | undefined {
		const now = Date.now()
		this.sweepAt(now, id)
		const entry = this.rewraps.take(id, now)
		if (!entry) return undefined
		return { sourceDek: entry.sourceDek, destinationDek: entry.destinationDek }
	}

	/** Wipes `id`'s rewrap context, aged or not, and takes back its admission. */
	public forget(id: string): void {
		this.rewraps.drop(id)
		this.admissions.drop(id)
	}

	/** Wipes every rewrap context and takes back every admission. */
	public forgetAll(): void {
		this.sweepAt(Number.POSITIVE_INFINITY)
	}

	/** Called before finalize's first await: a same-id successor's commit landing meanwhile then
	 *  never admits this finalize, and this finalize's cleanup spares what that commit stashed. */
	public beginFinalize(id: string): FinalizeTicket {
		return { id, rewrap: this.rewraps.get(id), admission: this.admissions.get(id) }
	}

	/** Whether the admission the ticket saw still stands. */
	public admits(ticket: FinalizeTicket): boolean {
		return ticket.admission !== undefined && this.admissions.get(ticket.id) === ticket.admission
	}

	/** Takes back the ticket's admission once its finalize opened the profile. */
	public spendAdmission(ticket: FinalizeTicket): void {
		if (this.admissions.get(ticket.id) === ticket.admission) this.admissions.drop(ticket.id)
	}

	/** Wipes the rewrap context the ticket saw unless it was replaced: finalize is its last reader. */
	public endFinalize(ticket: FinalizeTicket): void {
		if (this.rewraps.get(ticket.id) === ticket.rewrap) this.rewraps.drop(ticket.id)
	}

	// `ExpiringStash.get` checks no expiry, so this sweep is what expires an admission before
	// finalize compares it; it spares no admission.
	private sweepAt(now: number, exceptId?: string): void {
		this.rewraps.sweep(now, exceptId)
		this.admissions.sweep(now)
	}
}
