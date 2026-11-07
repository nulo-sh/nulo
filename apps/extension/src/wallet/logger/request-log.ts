/**
 * What one dApp request did, keyed by the trace id its error carries: the request's stages, the
 * worker lines tagged with its id, and the error it was answered with. Recorded only while
 * developer mode is on; every string is scrubbed as it is stored, so a persisted capture holds
 * scrubbed text only.
 */
import { z } from "zod"
import type { Log } from "@nulo/wallet-core/logger"
import { formatLogData } from "./format"
import { scrubReportData, scrubReportText } from "./utils"

export type RequestRef = { journalId: string } | { interactionId: string }

export type StageKind = "request" | "task" | "estimate" | "journal" | "prove"

export type RequestStage = { kind: StageKind; stage: string; start: number; end?: number; outcome?: string }

export type CapturedLine = { at: number; context: string; source: string; level: number; text: string }

export type CapturedEnvelope = { code: number; message: string; data?: Readonly<Record<string, string | number | boolean>> }

export type RequestCapture = {
	walletTraceId: string
	method: string
	originHost: string
	chainId: number
	startedAt: number
	endedAt?: number
	journalId?: string
	interactionId?: string
	journalStage?: string
	stages: RequestStage[]
	lines: CapturedLine[]
	dropped: number
	bytes: number
	journalError?: string
	envelope?: CapturedEnvelope
}

/** How a request ended: answered (with the error it was answered, if any), or never answered. */
export type RequestAnswer = { envelope?: { code: number; message: string; data?: Readonly<Record<string, unknown>> } } | "dropped"

/** The journal row fields a capture reads; never `error.normalizedRaw`. */
export type JournalSnapshot = {
	id: string
	progress: { stage: string }
	error: { kind: string; message: string } | null
	terminalAt: number | null
	createdAt: number
	updatedAt: number
}

export const REQUEST_LOG_LIMITS = {
	captures: 50,
	/** Sends held past `captures` until a journal row names them. */
	heldSends: 10,
	lines: 300,
	stages: 100,
	bytes: 64 * 1024,
	/** Ordinary entries stop here; the rest holds the terminal entries, which always land. */
	ordinaryStages: 90,
	ordinaryBytes: 52 * 1024,
	/** The record's own fields, counted once. */
	recordBytes: 2048,
	lineChars: 4000,
	labelChars: 80,
	outcomeChars: 300,
	journalErrorChars: 1000,
	hostChars: 255,
} as const

/** The two methods that can earn a journal alias, after `begin`: a capacity eviction never takes one. */
const SEND_CANDIDATES: ReadonlySet<string> = new Set(["sendTx", "grantPublicAuthwit"])

const utf8 = new TextEncoder()
const sizeOf = (value: unknown): number => utf8.encode(JSON.stringify(value) ?? "").length

/** Cut at `max` UTF-16 units, never inside a surrogate pair. */
function cap(text: string, max: number): string {
	if (text.length <= max) return text
	const end = /[\uD800-\uDBFF]/.test(text[max - 1] ?? "") ? max - 1 : max
	return `${text.slice(0, end)}…`
}

const clean = (text: string, max: number): string => cap(scrubReportText(text), max)

/** What the incremental accounting would hold for `capture`, and never less. */
function accountedBytes(capture: RequestCapture): number {
	const entries: unknown[] = [...capture.stages, ...capture.lines, capture.envelope, capture.journalError]
	return entries.reduce<number>((total, entry) => (entry === undefined ? total : total + sizeOf(entry)), REQUEST_LOG_LIMITS.recordBytes)
}

/** The data properties that tag a worker line with its request: a plain object owning a `walletTraceId`. */
export function traceTag(walletTraceId: string | undefined): [{ walletTraceId: string }] | [] {
	return walletTraceId === undefined ? [] : [{ walletTraceId }]
}

function traceIdOf(data: readonly unknown[]): string | undefined {
	for (const item of data) {
		if (typeof item !== "object" || item === null || Array.isArray(item) || !Object.hasOwn(item, "walletTraceId")) continue
		const id = (item as { walletTraceId: unknown }).walletTraceId
		if (typeof id === "string") return id
	}
	return undefined
}

function envelopeOf(envelope: NonNullable<Exclude<RequestAnswer, "dropped">["envelope"]>): CapturedEnvelope {
	const data: Record<string, string | number | boolean> = {}
	for (const [key, value] of Object.entries(envelope.data ?? {})) {
		if (typeof value === "string") data[clean(key, REQUEST_LOG_LIMITS.labelChars)] = clean(value, REQUEST_LOG_LIMITS.labelChars)
		else if (typeof value === "number" || typeof value === "boolean") data[clean(key, REQUEST_LOG_LIMITS.labelChars)] = value
	}
	return { code: envelope.code, message: clean(envelope.message, REQUEST_LOG_LIMITS.outcomeChars), data }
}

function outcomeOf(answer: RequestAnswer): string {
	if (answer === "dropped") return "dropped"
	if (!answer.envelope) return "ok"
	const code = answer.envelope.data?.walletErrorCode
	return typeof code === "string" ? `failed ${answer.envelope.code} ${code}` : `failed ${answer.envelope.code}`
}

export class RequestLog {
	/** Called on every change, so the owner can schedule its flush. */
	public onChange?: () => void

	private readonly captures = new Map<string, RequestCapture>()
	private readonly aliases = new Map<string, string>()

	public constructor(private readonly capturing: () => boolean) {}

	/** Whether captures are recorded, and so may be read: developer mode. */
	public get enabled(): boolean {
		return this.capturing()
	}

	public has(walletTraceId: string): boolean {
		return this.captures.has(walletTraceId)
	}

	/** Opens the request's capture while developer mode is on; a full store makes room by `makeRoom`'s rule. */
	public begin(walletTraceId: string, meta: { method: string; originHost: string; chainId: number }): void {
		if (!this.capturing() || this.captures.has(walletTraceId) || !this.makeRoom(meta.method)) return
		this.captures.set(walletTraceId, {
			walletTraceId,
			method: clean(meta.method, REQUEST_LOG_LIMITS.labelChars),
			originHost: clean(meta.originHost, REQUEST_LOG_LIMITS.hostChars),
			chainId: meta.chainId,
			startedAt: Date.now(),
			stages: [],
			lines: [],
			dropped: 0,
			bytes: REQUEST_LOG_LIMITS.recordBytes,
		})
		this.changed()
	}

	/** A later ref of the same kind replaces the earlier one, which then finds nothing. */
	public alias(walletTraceId: string, ref: RequestRef): void {
		const capture = this.captures.get(walletTraceId)
		if (!capture) return
		if ("journalId" in ref) {
			if (capture.journalId !== undefined) this.aliases.delete(keyOf({ journalId: capture.journalId }))
			capture.journalId = ref.journalId
		} else {
			if (capture.interactionId !== undefined) this.aliases.delete(keyOf({ interactionId: capture.interactionId }))
			capture.interactionId = ref.interactionId
		}
		this.aliases.set(keyOf(ref), walletTraceId)
		if ("journalId" in ref) this.settle(walletTraceId)
		this.changed()
	}

	public find(ref: RequestRef): string | undefined {
		return this.aliases.get(keyOf(ref))
	}

	public get(walletTraceId: string): RequestCapture | undefined {
		return this.captures.get(walletTraceId)
	}

	public stage(walletTraceId: string, stage: RequestStage): void {
		const capture = this.captures.get(walletTraceId)
		if (capture) this.addStage(capture, stage, false)
	}

	/** A journal row's stage change, once its capture holds the row: its first event also seeds `journal created`. */
	public journalEvent(record: JournalSnapshot): void {
		const capture = this.byJournal(record.id)
		const stage = record.progress.stage
		if (!capture || capture.journalStage === stage) return
		if (capture.journalStage === undefined)
			this.addStage(capture, { kind: "journal", stage: "journal created", start: record.createdAt }, false)
		capture.journalStage = stage
		const terminal = record.terminalAt !== null
		if (terminal && record.error) {
			capture.journalError = clean(record.error.message, REQUEST_LOG_LIMITS.journalErrorChars)
			capture.bytes += sizeOf(capture.journalError)
		}
		const start = record.terminalAt ?? record.updatedAt
		this.addStage(capture, { kind: "journal", stage: `journal ${stage}`, start, outcome: record.error?.kind }, terminal)
	}

	public provePhase(journalId: string, phase: string, backend: string | undefined): void {
		const capture = this.byJournal(journalId)
		if (capture) this.addStage(capture, { kind: "prove", stage: `prove ${phase} (${backend ?? "unknown"})`, start: Date.now() }, false)
	}

	/** A worker line tagged with an open capture's id joins it, rendered and scrubbed. Never throws. */
	public take(log: Log): void {
		try {
			if ((log.context ?? "sw") !== "sw") return
			const walletTraceId = traceIdOf(log.data)
			const capture = walletTraceId === undefined ? undefined : this.captures.get(walletTraceId)
			if (!capture || capture.endedAt !== undefined) return
			const text = cap(scrubReportText(formatLogData(scrubReportData(log.data))), REQUEST_LOG_LIMITS.lineChars)
			const line: CapturedLine = { at: log.timestamp, context: "sw", source: clean(log.source, 40), level: log.level, text }
			if (capture.lines.length >= REQUEST_LOG_LIMITS.lines || !this.fits(capture, line, false)) {
				capture.dropped += 1
			} else {
				capture.lines.push(line)
			}
			this.changed()
		} catch {
			// A capture never fails the line it records.
		}
	}

	/** The first end wins. A capture no journal row names is deleted: no surface opens it once its window is gone. */
	public end(walletTraceId: string, answer: RequestAnswer): void {
		const capture = this.captures.get(walletTraceId)
		if (!capture || capture.endedAt !== undefined) return
		capture.endedAt = Date.now()
		if (!capture.journalId) {
			this.remove(walletTraceId)
			this.changed()
			return
		}
		if (answer !== "dropped" && answer.envelope) {
			capture.envelope = envelopeOf(answer.envelope)
			capture.bytes += sizeOf(capture.envelope)
		}
		const request = { kind: "request" as const, stage: `request ${capture.method}`, start: capture.startedAt, end: capture.endedAt }
		this.addStage(capture, { ...request, outcome: outcomeOf(answer) }, true)
	}

	/** Empties the store at once, so an event for a removed capture finds nothing and creates nothing. */
	public clear(): void {
		this.captures.clear()
		this.aliases.clear()
	}

	public snapshot(): RequestCapture[] {
		return [...this.captures.values()]
	}

	/**
	 * Restores persisted captures ahead of this worker's own, within the same bounds. Only a capture a
	 * journal row names comes back: no handler is left to end any other. Its size is counted again.
	 */
	public restore(saved: unknown): void {
		if (!Array.isArray(saved)) return
		const live = [...this.captures.values()]
		const valid = saved.flatMap((raw) => {
			const parsed = CaptureSchema.safeParse(raw)
			if (!parsed.success || parsed.data.journalId === undefined || this.captures.has(parsed.data.walletTraceId)) return []
			const capture = { ...parsed.data, bytes: accountedBytes(parsed.data as RequestCapture) } as RequestCapture
			return capture.bytes <= REQUEST_LOG_LIMITS.bytes ? [capture] : []
		})
		this.clear()
		for (const capture of [...valid, ...live].slice(-REQUEST_LOG_LIMITS.captures)) {
			this.captures.set(capture.walletTraceId, capture)
			if (capture.journalId) this.aliases.set(keyOf({ journalId: capture.journalId }), capture.walletTraceId)
			if (capture.interactionId) this.aliases.set(keyOf({ interactionId: capture.interactionId }), capture.walletTraceId)
		}
	}

	/**
	 * Room for one more capture. The oldest capture with no alias that is not a send candidate goes
	 * first; with none, a send candidate is held past the cap and any other request is not captured.
	 * A held send evicts only once a journal row names it (`settle`), so neither a run of ordinary
	 * calls nor a burst of sends refused before any row displaces a kept capture.
	 */
	private makeRoom(method: string): boolean {
		if (this.captures.size < REQUEST_LOG_LIMITS.captures) return true
		const victim = this.oldestOrdinary()
		if (victim !== undefined) {
			this.remove(victim)
			return true
		}
		return SEND_CANDIDATES.has(method) && this.captures.size < REQUEST_LOG_LIMITS.captures + REQUEST_LOG_LIMITS.heldSends
	}

	/** A held send just named by a journal row takes a place: the oldest ordinary, else the oldest named capture, goes. */
	private settle(walletTraceId: string): void {
		const held = () => [...this.captures.values()].filter((c) => !c.journalId && SEND_CANDIDATES.has(c.method)).length
		while (this.captures.size - held() > REQUEST_LOG_LIMITS.captures) {
			const victim = this.oldestOrdinary() ?? this.oldestNamed(walletTraceId)
			if (victim === undefined) return
			this.remove(victim)
		}
	}

	private oldestNamed(except: string): string | undefined {
		for (const capture of this.captures.values()) {
			if (capture.journalId && capture.walletTraceId !== except) return capture.walletTraceId
		}
		return undefined
	}

	private oldestOrdinary(): string | undefined {
		for (const capture of this.captures.values()) {
			if (!capture.journalId && !capture.interactionId && !SEND_CANDIDATES.has(capture.method)) return capture.walletTraceId
		}
		return undefined
	}

	private byJournal(journalId: string): RequestCapture | undefined {
		const walletTraceId = this.aliases.get(keyOf({ journalId }))
		return walletTraceId === undefined ? undefined : this.captures.get(walletTraceId)
	}

	private remove(walletTraceId: string): void {
		const capture = this.captures.get(walletTraceId)
		if (!capture) return
		this.captures.delete(walletTraceId)
		if (capture.journalId) this.aliases.delete(keyOf({ journalId: capture.journalId }))
		if (capture.interactionId) this.aliases.delete(keyOf({ interactionId: capture.interactionId }))
	}

	/** A journal or prove entry runs until the next entry of its own kind. */
	private addStage(capture: RequestCapture, stage: RequestStage, terminal: boolean): void {
		const entry: RequestStage = {
			...stage,
			stage: clean(stage.stage, REQUEST_LOG_LIMITS.labelChars),
			...(stage.outcome !== undefined && { outcome: clean(stage.outcome, REQUEST_LOG_LIMITS.outcomeChars) }),
		}
		const stageLimit = terminal ? REQUEST_LOG_LIMITS.stages : REQUEST_LOG_LIMITS.ordinaryStages
		if (capture.stages.length >= stageLimit || !this.fits(capture, entry, terminal)) {
			capture.dropped += 1
			this.changed()
			return
		}
		if (entry.kind === "journal" || entry.kind === "prove") {
			const previous = capture.stages.findLast((s) => s.kind === entry.kind)
			if (previous && previous.end === undefined) previous.end = Math.max(previous.start, entry.start)
		}
		capture.stages.push(entry)
		this.changed()
	}

	private fits(capture: RequestCapture, entry: unknown, terminal: boolean): boolean {
		const size = sizeOf(entry)
		if (capture.bytes + size > (terminal ? REQUEST_LOG_LIMITS.bytes : REQUEST_LOG_LIMITS.ordinaryBytes)) return false
		capture.bytes += size
		return true
	}

	private changed(): void {
		this.onChange?.()
	}
}

function keyOf(ref: RequestRef): string {
	return "journalId" in ref ? `j:${ref.journalId}` : `i:${ref.interactionId}`
}

const L = REQUEST_LOG_LIMITS
const HEX = (n: number) => new RegExp(`^[0-9a-f]{${n}}$`)
const StageSchema = z.object({
	kind: z.enum(["request", "task", "estimate", "journal", "prove"]),
	stage: z.string().max(L.labelChars + 1),
	start: z.number(),
	end: z.number().optional(),
	outcome: z
		.string()
		.max(L.outcomeChars + 1)
		.optional(),
})
const LineSchema = z.object({
	at: z.number(),
	context: z.literal("sw"),
	source: z.string().max(41),
	level: z.number(),
	text: z.string().max(L.lineChars + 1),
})
const CaptureSchema = z.object({
	walletTraceId: z.string().regex(HEX(8)),
	method: z.string().max(L.labelChars + 1),
	originHost: z.string().max(L.hostChars + 1),
	chainId: z.number(),
	startedAt: z.number(),
	endedAt: z.number().optional(),
	journalId: z.string().regex(HEX(16)).optional(),
	interactionId: z.string().regex(HEX(16)).optional(),
	journalStage: z.string().max(40).optional(),
	stages: z.array(StageSchema).max(L.stages),
	lines: z.array(LineSchema).max(L.lines),
	dropped: z.number().int().nonnegative(),
	bytes: z.number(),
	journalError: z
		.string()
		.max(L.journalErrorChars + 1)
		.optional(),
	envelope: z
		.object({
			code: z.number(),
			message: z.string().max(L.outcomeChars + 1),
			data: z.record(z.string(), z.union([z.string().max(L.labelChars + 1), z.number(), z.boolean()])).optional(),
		})
		.optional(),
})
