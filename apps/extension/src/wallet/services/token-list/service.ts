import { EnvelopeError, MAX_ENVELOPE_BYTES, PINNED_KEYS, readTokenList, type VerifiedTokenList } from "@nulo/token-list"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import { AlarmDispatcher, EventHandler } from "@nulo/wallet-core/utils"
import type { IService, ServiceCollection } from "@/wallet/base"
import { type ILogger, LogLevel } from "@/wallet/logger"
import { LegalAcceptanceService, type LegalStatus } from "@/wallet/services/legal/service"
import { ValueStorage } from "@/wallet/storage"
import {
	type RefreshOutcome,
	TOKEN_LIST_REFRESH_ALARM_NAME,
	TOKEN_LIST_SERVICE_NAME,
	TOKEN_LIST_URL,
	type TokenListSnapshot,
	type TokenListSource,
} from "./spec"

export * from "./spec"

const STORAGE_KEY = "nulo:core:token-list"
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const JITTER_MS = 2 * HOUR_MS
/** The wait after the Nth consecutive failure; the last step repeats. */
export const FAILURE_BACKOFF_MS: readonly number[] = [5 * 60_000, 30 * 60_000, 2 * HOUR_MS, 6 * HOUR_MS, DAY_MS]
const FETCH_TIMEOUT_MS = 10_000

const FAILED: ReadonlySet<RefreshOutcome> = new Set(["older-sequence", "refused", "oversize", "http-status", "network"])
/** A served list that verifies but cannot be used is worth a line in a bug report; a dead network is not. */
const SUSPECT: ReadonlySet<RefreshOutcome> = new Set(["older-sequence", "refused", "oversize"])

type StoredState = { envelope?: string; lastSuccessAt?: number; nextAttemptAt?: number; failures: number }

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export type TokenListServiceOptions = {
	/** Resolves `undefined` to turn the fetcher off: armed e2e builds with no list key. */
	getSource?: () => Promise<TokenListSource | undefined>
	fetchFn?: FetchLike
	now?: () => number
	random?: () => number
}

/** The one deadline rule: a day plus up to two hours of jitter after a usable answer, the backoff after a failure. */
export function nextAttemptAt(outcome: RefreshOutcome, failures: number, now: number, random: () => number): number {
	if (!FAILED.has(outcome)) return now + DAY_MS + Math.floor(random() * JITTER_MS)
	return now + FAILURE_BACKOFF_MS[Math.min(failures, FAILURE_BACKOFF_MS.length) - 1]
}

class DownloadError extends Error {
	public constructor(public readonly outcome: RefreshOutcome) {
		super(outcome)
	}
}

/**
 * Keeps the signed token list the default tokens and prices come from. Nothing is requested before
 * the Terms acceptance is current; after that, at boot when due, on each acceptance, and at the
 * persisted deadline. A list replaces the kept one only when it verifies against a pinned key and
 * carries a higher sequence, so a host can withhold an update but never swap or roll one back.
 */
export class TokenListService implements IService {
	public static readonly name = TOKEN_LIST_SERVICE_NAME
	public readonly name = TOKEN_LIST_SERVICE_NAME
	public readonly dependencies = [LegalAcceptanceService.name] as const

	public readonly onListChanged = new EventHandler<TokenListSnapshot>()

	/** The boot refresh, observable for tests; startup never awaits it. */
	public booted: Promise<void> = Promise.resolve()

	private readonly storage: ValueStorage<StoredState>
	// Only creates and clears: the module-scope shim in `wallet/index.ts` dispatches the tick, since a
	// waking alarm reaches only listeners registered there.
	private readonly dispatcher: AlarmDispatcher
	private readonly getSource: () => Promise<TokenListSource | undefined>
	private readonly fetchFn: FetchLike
	private readonly now: () => number
	private readonly random: () => number

	private legal!: LegalAcceptanceService
	private snapshot: TokenListSnapshot | undefined
	private inflight: Promise<void> | undefined

	public constructor(
		private readonly logger: ILogger,
		browserApi: BrowserApi,
		options: TokenListServiceOptions = {},
	) {
		this.storage = new ValueStorage<StoredState>(STORAGE_KEY, browserApi.storage.local)
		this.dispatcher = new AlarmDispatcher(TOKEN_LIST_REFRESH_ALARM_NAME, browserApi.alarms)
		this.getSource = options.getSource ?? (async () => ({ url: TOKEN_LIST_URL, keys: PINNED_KEYS }))
		this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init))
		this.now = options.now ?? Date.now
		this.random = options.random ?? Math.random
	}

	public async start(services: ServiceCollection): Promise<void> {
		this.legal = services.get(LegalAcceptanceService.name)
		this.legal.onAcceptanceChanged.add(this.onAcceptanceChanged)
		this.snapshot = await this.loadStored()
		this.booted = this.boot().catch((error) => this.log(LogLevel.Warn, "token list boot failed", { error }))
	}

	/** The kept list, read synchronously by the seeder, the price map and the connect window. */
	public getSnapshot(): TokenListSnapshot | undefined {
		return this.snapshot
	}

	public onAlarmTick(): Promise<void> {
		return this.refresh()
	}

	/** Single-flight. Never rejects: the outcome and the next deadline are stored, or the failure logged. */
	public refresh(): Promise<void> {
		this.inflight ??= this.doRefresh()
			.catch((error) => this.log(LogLevel.Warn, "token list refresh failed", { error }))
			.finally(() => {
				this.inflight = undefined
			})
		return this.inflight
	}

	private readonly onAcceptanceChanged = (status: LegalStatus): void => {
		if (status === "current") void this.refresh()
	}

	private async boot(): Promise<void> {
		if ((await this.legal.getStatus()) !== "current") return this.dispatcher.clear()
		const due = (await this.readState()).nextAttemptAt
		if (due !== undefined && due > this.now()) return this.dispatcher.create({ when: due })
		await this.refresh()
	}

	/** A stored list that no longer verifies, its key unpinned by a release included, is dropped and refetched. */
	private async loadStored(): Promise<TokenListSnapshot | undefined> {
		const state = await this.readState()
		const source = await this.getSource()
		if (state.envelope === undefined || !source) return undefined
		try {
			return toSnapshot(await readTokenList(state.envelope, source.keys))
		} catch (error) {
			const outcome = refusalOutcome(error)
			this.log(LogLevel.Warn, "stored token list discarded", { outcome })
			if (outcome !== "verify-unsupported") await this.storage.set({ ...state, envelope: undefined, nextAttemptAt: undefined })
			return undefined
		}
	}

	private async doRefresh(): Promise<void> {
		if ((await this.legal.getStatus()) !== "current") return
		const source = await this.getSource()
		if (!source) return
		const { outcome, list, envelope } = await this.fetchList(source)
		const state = await this.readState()
		const now = this.now()
		const failures = FAILED.has(outcome) ? state.failures + 1 : 0
		const usable = outcome === "accepted" || outcome === "unchanged"
		const next: StoredState = {
			envelope: envelope ?? state.envelope,
			lastSuccessAt: usable ? now : state.lastSuccessAt,
			nextAttemptAt: nextAttemptAt(outcome, failures, now, this.random),
			failures,
		}
		await this.storage.set(next)
		await this.dispatcher.create({ when: next.nextAttemptAt })
		this.log(SUSPECT.has(outcome) ? LogLevel.Warn : LogLevel.Debug, "token list refresh", { outcome, failures })
		if (!list) return
		this.snapshot = list
		this.onListChanged.invoke(list)
	}

	private async fetchList(source: TokenListSource): Promise<{ outcome: RefreshOutcome; list?: TokenListSnapshot; envelope?: string }> {
		let envelope: string
		try {
			envelope = await this.download(source.url)
		} catch (error) {
			return { outcome: error instanceof DownloadError ? error.outcome : "network" }
		}
		let list: TokenListSnapshot
		try {
			list = toSnapshot(await readTokenList(envelope, source.keys))
		} catch (error) {
			return { outcome: refusalOutcome(error) }
		}
		const held = this.snapshot?.sequence ?? 0
		if (list.sequence < held) return { outcome: "older-sequence" }
		if (list.sequence === held) return { outcome: "unchanged" }
		return { outcome: "accepted", list, envelope }
	}

	private async download(url: string): Promise<string> {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
		try {
			const response = await this.fetchFn(url, {
				credentials: "omit",
				referrerPolicy: "no-referrer",
				redirect: "error",
				cache: "no-cache",
				signal: controller.signal,
			})
			if (!response.ok) throw new DownloadError("http-status")
			return await readCapped(response, MAX_ENVELOPE_BYTES)
		} finally {
			clearTimeout(timeout)
		}
	}

	/** Storage is writable by every extension page: a malformed field reads as absent, and a deadline
	 *  past the longest one this service writes reads as due, so a planted value cannot stop refreshes. */
	private async readState(): Promise<StoredState> {
		let raw: unknown
		try {
			raw = await this.storage.get()
		} catch {
			return { failures: 0 }
		}
		if (!raw || typeof raw !== "object") return { failures: 0 }
		const { envelope, lastSuccessAt, nextAttemptAt: due, failures } = raw as Record<string, unknown>
		const latest = this.now() + DAY_MS + JITTER_MS
		return {
			envelope: typeof envelope === "string" ? envelope : undefined,
			lastSuccessAt: Number.isFinite(lastSuccessAt) ? (lastSuccessAt as number) : undefined,
			nextAttemptAt: Number.isFinite(due) && (due as number) <= latest ? (due as number) : undefined,
			failures: Number.isSafeInteger(failures) && (failures as number) >= 0 ? (failures as number) : 0,
		}
	}

	private log(level: LogLevel, message: string, data: Record<string, unknown>): void {
		this.logger.log(TOKEN_LIST_SERVICE_NAME, level, message, data)
	}
}

function toSnapshot({ sequence, keyId, entries }: VerifiedTokenList): TokenListSnapshot {
	return { sequence, keyId, entries }
}

function refusalOutcome(error: unknown): RefreshOutcome {
	return error instanceof EnvelopeError && error.reason === "verify-unsupported" ? "verify-unsupported" : "refused"
}

/** Reads at most `max` bytes, so a hostile host cannot make the worker buffer an unbounded body. */
async function readCapped(response: Response, max: number): Promise<string> {
	if (Number(response.headers.get("content-length")) > max) throw new DownloadError("oversize")
	const reader = response.body?.getReader()
	if (!reader) return ""
	const chunks: Uint8Array[] = []
	let size = 0
	for (let read = await reader.read(); !read.done; read = await reader.read()) {
		size += read.value.byteLength
		if (size > max) {
			await reader.cancel()
			throw new DownloadError("oversize")
		}
		chunks.push(read.value)
	}
	const bytes = new Uint8Array(size)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.byteLength
	}
	return new TextDecoder().decode(bytes)
}
