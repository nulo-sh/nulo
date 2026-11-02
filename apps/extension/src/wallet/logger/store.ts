// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { ConfigProp, IConfig } from "@/wallet/config"
import { EventHandler, createSerialQueue } from "@nulo/wallet-core/utils"
import { type ILoggerStore, type Log, LogLevel, CircularBufferIterable, print, trim } from "."

export class LoggerStore implements ILoggerStore {
	public readonly onLog = new EventHandler<Log>()
	/** Fires with the new minimum level each time `debugMode` moves it. */
	public readonly onLevel = new EventHandler<LogLevel>()

	private logLevel: LogLevel
	private logs: CircularBufferIterable<Log>
	private nextId = 1
	private rehydration?: Promise<void>
	/** The highest id `rehydrate()` imported: with retention off, the lines up to it go. */
	private importedThroughId = 0
	private flushTimer?: ReturnType<typeof setTimeout>
	/**
	 * FIFO chain of every session-storage operation this store performs.
	 *
	 * A single "in-flight write" slot is not enough: the timer is cleared the moment a flush
	 * STARTS, so a later log can schedule and fire a second flush while the first is still
	 * pending, and a purge awaiting only the latest promise can still be overtaken by the earlier
	 * write. Chaining every `set` and `remove` through one queue makes the ordering total.
	 */
	private readonly storageOps = createSerialQueue()
	private persistEnabled: boolean

	private readonly config: IConfig

	public constructor(config: IConfig) {
		this.config = config
		this.logLevel = config.get("debugMode") ? LogLevel.Debug : LogLevel.Info
		this.logs = new CircularBufferIterable(ringSize(this.logLevel))
		// The persisted config has NOT loaded at construction — this store is built at module
		// scope, while `config.load()` runs later inside `runtime.start()` (after migrations, an
		// ordering that must not change). So this is the schema default, not the user's choice;
		// `applyRetentionPolicy()` is what settles it once the real value is known.
		this.persistEnabled = config.get("developerMode") === true
		config.onUpdate.add(this.onConfigUpdate)
	}

	/** The minimum level a line needs to be kept; anything below it is dropped on arrival. */
	public get level(): LogLevel {
		return this.logLevel
	}

	public get(count: number, fromId?: number): Log[] {
		return this.logs.get(count, fromId ?? 0)
	}

	/**
	 * Clearing must drop the persisted copy too. Emptying only the ring buffer left `nulo:logs`
	 * intact, so the next worker restart rehydrated everything the user had just cleared — the
	 * "Clear logs" button appeared to work and didn't.
	 */
	public clear(): Promise<void> {
		this.logs.clear()
		// Returned with its failure: `clearLogs()` must not acknowledge success while the persisted
		// copy is still on disk, where a worker restart resurrects it.
		return this.purgePersisted()
	}

	public log(source: string, level: LogLevel, ...data: unknown[]): void {
		this.logWithContext(undefined, source, level, ...data)
	}

	/** Log with explicit context (used by LoggerService for offscreen/popup forwarding). */
	public logWithContext(context: string | undefined, source: string, level: LogLevel, ...data: unknown[]): void {
		if (level < this.logLevel) {
			return
		}
		const log: Log = {
			id: this.nextId++,
			timestamp: Date.now(),
			source,
			level,
			context: (context as Log["context"]) ?? "sw",
			data: trim(data) as unknown[],
		}
		this.logs.add(log)
		this.scheduleFlush()
		this.onLog.invoke(log)
		print(log)
	}

	/**
	 * Rehydrate logs from chrome.storage.session, once per worker. The saved lines go first and this
	 * worker's lines follow, renumbered after the saved ids (ids rise in buffer order, which paging and
	 * the log viewer's links rely on), in a ring that holds both.
	 *
	 * Deliberately unconditional. It runs BEFORE the persisted config loads, so gating it on
	 * `persistEnabled` would read the schema default and wipe a developer's logs on every worker
	 * restart — the exact continuity the retention opt-in exists to preserve.
	 * `applyRetentionPolicy()` undoes this if the loaded config turns out to disable retention.
	 */
	public rehydrate(): Promise<void> {
		this.rehydration ??= this.importSaved()
		return this.rehydration
	}

	private async importSaved(): Promise<void> {
		let saved: Log[] | undefined
		try {
			saved = (await chrome.storage.session.get("nulo:logs"))["nulo:logs"] as Log[] | undefined
		} catch {
			// Session storage may not be available (e.g., in tests)
			return
		}
		if (!saved?.length) return
		// Read after the await: a line logged while the read was in flight is this worker's too.
		const live = this.logs.items()
		let id = 0
		for (const log of saved) id = Math.max(id, log.id)
		this.importedThroughId = id
		this.logs.clear(Math.max(ringSize(this.logLevel), saved.length + live.length))
		for (const log of saved) this.logs.add(log)
		for (const log of live) this.logs.add({ ...log, id: ++id })
		this.nextId = id + 1
	}

	/**
	 * Debounced flush of recent logs to chrome.storage.session for crash recovery.
	 *
	 * Retention is opt-in with developer mode. Without it a normal user's logs live only in this
	 * worker's memory and die with it, so no captured line survives to be read back or exported —
	 * which is the bulk of the exposure, since the capture surface is far wider than the redactor
	 * can cover. Developers accept retention in exchange for diagnosis across worker restarts.
	 */
	private scheduleFlush(): void {
		if (!this.persistEnabled) return
		if (this.flushTimer) return
		this.flushTimer = setTimeout(() => {
			this.flushTimer = undefined
			// Queued, not fire-and-forget: cancelling the TIMER cannot stop a write that has already
			// begun, and an unqueued `set()` landing after a purge would recreate the very key the
			// purge just removed.
			void this.enqueueStorageOp(async () => {
				const items = this.logs.items().slice(-2000)
				await chrome.storage.session.set({ "nulo:logs": items })
			}).catch(() => {})
		}, 2000)
	}

	/**
	 * Append a session-storage operation to the serialized chain and return its outcome.
	 *
	 * The queue only orders: a failed operation never wedges it, and its rejection reaches this
	 * caller, which decides. Session storage is unavailable in tests and can throw at runtime.
	 */
	private enqueueStorageOp(op: () => Promise<void>): Promise<void> {
		return this.storageOps.run(op)
	}

	/**
	 * Settle retention once the persisted config has actually loaded. MUST be called after
	 * `config.load()` resolves. It first waits for the import in flight: the boot holds its service
	 * wiring behind this call, so no reader holds an id before the import renumbers this worker's
	 * lines, and retention never settles before the lines it governs arrive.
	 *
	 * Two cases the config-update event alone cannot cover: `apply()` only emits when a value
	 * CHANGES, so a stored `developerMode: false` matching the default emits nothing; and the flag
	 * can be turned off while this worker is dead, so the disable-time purge never ran. Either way
	 * the rehydrated entries and the stored copy must go — retention-off means nothing outlives the
	 * worker that wrote it. This worker's own lines stay.
	 */
	public async applyRetentionPolicy(): Promise<void> {
		await this.rehydration
		this.persistEnabled = this.config.get("developerMode") === true
		this.logs.resize(ringSize(this.logLevel))
		if (this.persistEnabled) return
		const kept = this.logs.items().filter((log) => log.id > this.importedThroughId)
		this.logs.clear()
		for (const log of kept) this.logs.add(log)
		// Best effort: this runs inside the boot's config leg, which a rejection would veto.
		await this.purgePersisted().catch(() => {})
	}

	/**
	 * Drop the persisted copy. Cancels a pending flush and queues the removal behind every write
	 * already in flight, so no `set()` can land on top of it and resurrect the key.
	 */
	private purgePersisted(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = undefined
		}
		return this.enqueueStorageOp(async () => {
			await chrome.storage.session.remove("nulo:logs")
		})
	}

	private readonly onConfigUpdate = (prop: ConfigProp) => {
		if (prop.key === "debugMode") {
			const level = prop.value ? LogLevel.Debug : LogLevel.Info
			const moved = level !== this.logLevel
			this.logLevel = level
			this.logs.resize(ringSize(this.logLevel))
			if (moved) this.onLevel.invoke(level)
		}
		if (prop.key === "developerMode") {
			this.persistEnabled = prop.value === true
			// Turning retention off must PURGE, not merely stop writing: entries captured while it
			// was on otherwise survive in session storage and are re-imported by rehydrate() on the
			// next worker restart, so the setting would appear to do nothing.
			if (!this.persistEnabled) void this.purgePersisted().catch(() => {})
		}
	}
}

function ringSize(level: LogLevel): number {
	return level === LogLevel.Debug ? 10_000 : 1000
}
