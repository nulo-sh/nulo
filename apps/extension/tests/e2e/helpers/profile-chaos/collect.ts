/**
 * What the profile chaos oracles read from a live wallet. Storage is read in the page: a value never
 * leaves it, only its key, a digest, its envelope's owner and the names of the needles it holds.
 * Errors are collected append-only from every extension page as it appears, so no helper that
 * resets a context's error lists can hide one.
 */
import type { Browser, Page, Target } from "puppeteer"
import { LogLevel } from "@nulo/wallet-core/logger"
import { EXTENSION_SCHEME } from "../../fixtures/browser"
import { callService } from "../../fixtures/session"
import { isPrestoProbeNoise } from "../../fixtures/wallet-pages"
import { readFace } from "./page-face"
import {
	type ErrorEntry,
	FAMILY_GROUPS,
	type FamilyEntry,
	type LeakHit,
	MIN_NEEDLE,
	type Needle,
	pageErrorText,
	type ProfileReading,
	type SessionReading,
	type StoredEntry,
	type StructureReading,
} from "./checkers"

/** A page the run holds open; the anchor is the one it drives. */
export interface RunPage {
	label: string
	page: Page
	anchor: boolean
}

// ── storage ─────────────────────────────────────────────────────────────

/** Every `storage.local` entry as a digest, with a sealed envelope's owner, or the `profileId` a
 *  plaintext row names. */
export async function readCensus(page: Page): Promise<StoredEntry[]> {
	return page.evaluate(async () => {
		const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
		const parse = (value: unknown): Record<string, unknown> | undefined => {
			if (typeof value !== "string") return undefined
			try {
				const parsed = JSON.parse(value)
				return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined
			} catch {
				return undefined
			}
		}
		const entry = async (key: string, value: unknown) => {
			const text = typeof value === "string" ? value : JSON.stringify(value)
			const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).slice(0, 24)
			const row = parse(value)
			const named = typeof row?.profileId === "string" ? row.profileId : undefined
			if (
				named !== undefined &&
				Object.keys(row as object)
					.sort()
					.join() === "profileId,sealed"
			)
				return { key, digest, envelope: true, envelopeOwner: named }
			return named === undefined ? { key, digest, envelope: false } : { key, digest, envelope: false, plainOwner: named }
		}
		const all = await chrome.storage.local.get(null)
		return Promise.all(Object.entries(all).map(([key, value]) => entry(key, value)))
	})
}

/** The roots whose rows must be seal envelopes. */
export const SEALED_PREFIXES: readonly string[] = (Object.values(FAMILY_GROUPS) as FamilyEntry[])
	.filter((e) => e.sealed && e.ref.startsWith("root:"))
	.map((e) => `${e.ref.slice("root:".length)}@`)

/** Each kind of profile row's sealed fields, a base64 frame of a fixed version byte and length: a
 *  password row's slots and DEK are `EncryptionKey` frames, a passkey row's `sealFrame`s under its
 *  unlock key, and a retired row holds only its DEK's. A passkey row is retired when it holds no
 *  `prfSalt`, as the wallet's classifier reads it. */
const SLOT_FRAMES: Record<string, Record<string, { version: number; length: number }>> = {
	password: {
		guard: { version: 0, length: 37 },
		secret: { version: 0, length: 61 },
		entropy: { version: 0, length: 61 },
		dekSealed: { version: 0, length: 61 },
	},
	passkey: {
		guard: { version: 1, length: 37 },
		secret: { version: 1, length: 61 },
		entropy: { version: 1, length: 61 },
		dekSealed: { version: 1, length: 61 },
	},
	retired: { dekSealed: { version: 1, length: 61 } },
}

/**
 * Every needle found in `storage.local` and `storage.session`, by where and which, and the
 * structural reads: sealed roots outside an envelope, profile slots that are no frame, and every
 * place `prfSalt` occurs. Runs in the page; the needles go in and only their names come out.
 */
export async function scanStorage(
	page: Page,
	needles: readonly Needle[],
	legacy: Readonly<Record<string, string>> = {},
): Promise<{ hits: LeakHit[]; structure: Omit<StructureReading, "exports"> }> {
	return page.evaluate(
		async (
			needleList: Needle[],
			sealedPrefixes: readonly string[],
			frames: typeof SLOT_FRAMES,
			released: Record<string, string>,
			minNeedle: number,
		) => {
			const hits: { where: string; needle: string }[] = []
			const structure = { unsealedRows: [] as string[], unframedSlots: [] as string[], prfSalt: [] as string[] }
			/** Why `value` is no frame of `spec`, or undefined when it is one; the reason names no byte. */
			const notFrame = (value: unknown, spec: { version: number; length: number }): string | undefined => {
				if (typeof value !== "string") return typeof value
				let bytes: Uint8Array
				try {
					bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
				} catch {
					return "not base64"
				}
				return bytes[0] === spec.version && bytes.length === spec.length ? undefined : `version ${bytes[0]}, ${bytes.length} bytes`
			}
			const scan = (where: string, text: string) => {
				for (const n of needleList) if (n.value.length >= minNeedle && text.includes(n.value)) hits.push({ where, needle: n.name })
				if (text.includes("prfSalt")) structure.prfSalt.push(where)
			}
			const kindOf = (row: Record<string, unknown>) => (row.type === "passkey" && !("prfSalt" in row) ? "retired" : String(row.type))
			const checkProfileRow = (key: string, text: string) => {
				const row = JSON.parse(text) as Record<string, unknown>
				const label = String(row.id ?? key)
				const fields = frames[kindOf(row)]
				if (!fields) {
					structure.unframedSlots.push(`${label}.type (${String(row.type)})`)
					return
				}
				for (const [field, spec] of Object.entries(fields)) {
					const why = notFrame(row[field], spec)
					if (why) structure.unframedSlots.push(`${label}.${field} (${why})`)
				}
			}
			// A release's plaintext row in a root sealed since stays plain until its profile next opens.
			const sealedOrKept = (key: string, text: string) =>
				/^\{"profileId":"[^"]+","sealed":"[^"]+"\}$/.test(text) || released[key] === text
			const checkLocal = (key: string, text: string) => {
				if (sealedPrefixes.some((p) => key.startsWith(p)) && !sealedOrKept(key, text)) structure.unsealedRows.push(key)
				if (key.startsWith("nulo:core:profiles@")) checkProfileRow(key, text)
			}
			const text = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value))
			for (const [key, value] of Object.entries(await chrome.storage.local.get(null))) {
				scan(`local:${key}`, `${key}\n${text(value)}`)
				checkLocal(key, text(value))
			}
			for (const [key, value] of Object.entries(await chrome.storage.session.get(null)))
				scan(`session:${key}`, `${key}\n${text(value)}`)
			return { hits, structure }
		},
		[...needles],
		SEALED_PREFIXES,
		SLOT_FRAMES,
		{ ...legacy },
		MIN_NEEDLE,
	)
}

// ── session and profiles ────────────────────────────────────────────────

/** The session row projected in the page, so its bearer never leaves it. */
async function readSessionRow(page: Page): Promise<SessionReading["row"]> {
	return page.evaluate(async () => {
		const raw = (await chrome.storage.session.get("nulo:core:session"))["nulo:core:session"]
		if (typeof raw !== "string") return undefined
		const row = JSON.parse(raw) as Record<string, unknown>
		return { profile: String(row.profile), hasBearer: row.bearer != null, hasPasshash: row.passhash != null }
	})
}

/** Whether a read only an open session is served is refused as locked (`requireActiveProfile`'s
 *  "Profile locked"); any other failure is the probe's, not an answer. */
async function protectedCallRefused(page: Page): Promise<boolean> {
	try {
		await callService(page, "contact", "getContactByAddress", [`0x${"0".repeat(64)}`])
		return false
	} catch (err) {
		if (err instanceof Error && err.message.includes("Profile locked")) return true
		throw err
	}
}

export async function readSession(probe: Page, pages: readonly RunPage[], locked: boolean): Promise<SessionReading> {
	const row = await readSessionRow(probe)
	const active = await callService<{ id: string } | undefined>(probe, "profile", "getActiveProfile")
	const routes = await Promise.all(
		pages.map(async (p) => {
			// The lock screen hides its form until it knows the selected profile; it is read once it shows
			// one of its two faces, or as it stands after the wait.
			await p.page
				.waitForFunction(
					() => {
						const shown = (id: string) => {
							const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
							return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
						}
						return !location.hash.startsWith("#/popup/auth") || shown("auth-setup-again") || shown("auth-submit")
					},
					{ timeout: 5_000, polling: 100 },
				)
				.catch(() => {})
			const face = await readFace(p.page)
			if (!face) return undefined
			const { hash, lockScreen } = face
			const route = hash.replace(/^#/, "").split("?")[0]
			return { label: p.label, anchor: p.anchor, route, ...(lockScreen ? { lockScreen } : {}) }
		}),
	)
	return {
		row,
		active: active?.id,
		pages: routes.filter((r) => r !== undefined),
		...(locked ? { protectedCallRefused: await protectedCallRefused(probe) } : {}),
	}
}

export async function readProfiles(page: Page): Promise<ProfileReading> {
	const listed = await callService<{ id: string; name: string; type: string; retired?: boolean }[]>(page, "profile", "getProfiles")
	const rows = await page.evaluate(async () => {
		const all = await chrome.storage.local.get(null)
		return Object.entries(all)
			.filter(([key]) => key.startsWith("nulo:core:profiles@"))
			.map(([key, value]) => {
				const row = JSON.parse(value as string) as Record<string, unknown>
				return {
					keyId: key.slice("nulo:core:profiles@".length),
					id: String(row.id),
					name: String(row.name),
					type: String(row.type),
					fields: Object.keys(row),
					...(typeof row.credentialId === "string" ? { credentialId: row.credentialId } : {}),
				}
			})
	})
	return { listed: listed.map(({ id, name, type, retired }) => ({ id, name, type, retired: retired === true })), rows }
}

// ── logs ────────────────────────────────────────────────────────────────

export interface DrainedLog {
	id: number
	level: LogLevel
	source: string
	context?: string
	text: string
}

/** Every log line after `fromId`, oldest first, until the ring has no more. */
export async function drainLogs(page: Page, fromId: number): Promise<DrainedLog[]> {
	const out: DrainedLog[] = []
	let last = fromId
	for (;;) {
		const batch = await callService<{ id: number; level: LogLevel; source: string; context?: string; data: unknown[] }[]>(
			page,
			"log-viewer",
			"getLogs",
			[1000, last],
		)
		if (!batch.length) return out
		for (const log of batch)
			out.push({ id: log.id, level: log.level, source: log.source, context: log.context, text: JSON.stringify(log.data) })
		last = batch[batch.length - 1].id
	}
}

/** The drained lines O4 reads: warn and error levels. */
export function logErrors(logs: readonly DrainedLog[]): ErrorEntry[] {
	return logs.flatMap((l): ErrorEntry[] => {
		if (l.level === LogLevel.Warn) return [{ kind: "log", level: "warn", source: l.source, context: l.context, text: l.text }]
		if (l.level === LogLevel.Error) return [{ kind: "log", level: "error", source: l.source, context: l.context, text: l.text }]
		return []
	})
}

// ── errors from every extension page ────────────────────────────────────

/** Page and console errors from every extension page, appended as they happen. A refused Presto
 *  health probe is the suite's one exemption, read from the message's URL as `recordPageErrors`
 *  does: a box without Presto refuses the probe the wallet expects to fail. */
export class ErrorCollector {
	private readonly entries: ErrorEntry[] = []
	private readonly watched = new WeakSet<Page>()
	private pageCount = 0
	private readonly onTarget = (target: Target) => {
		void this.attach(target)
	}

	public constructor(private readonly browser: Browser) {}

	public async start(): Promise<void> {
		this.browser.on("targetcreated", this.onTarget)
		for (const target of this.browser.targets()) await this.attach(target)
	}

	public stop(): void {
		this.browser.off("targetcreated", this.onTarget)
	}

	/** Watches a page the run opened itself, before its first navigation can throw. */
	public watch(page: Page, label?: string): void {
		if (this.watched.has(page)) return
		this.watched.add(page)
		const name = label ?? `page${++this.pageCount}`
		page.on("pageerror", (error: unknown) => {
			this.entries.push({ kind: "page-error", page: name, text: pageErrorText(error) })
		})
		page.on("console", (message) => {
			if (message.type() === "error" && !isPrestoProbeNoise(message))
				this.entries.push({ kind: "console-error", page: name, text: message.text() })
		})
	}

	/** Every entry from index `mark` on: the runner advances its mark past what it read. */
	public since(mark: number): ErrorEntry[] {
		return this.entries.slice(mark)
	}

	private async attach(target: Target): Promise<void> {
		if (target.type() !== "page" || !target.url().startsWith(EXTENSION_SCHEME)) return
		const page = await target.page().catch(() => null)
		if (page) this.watch(page)
	}
}
