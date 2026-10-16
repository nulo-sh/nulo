import { MessageType } from "@nulo/extension-messaging/messages"
import { wrapParams } from "@nulo/extension-messaging/utils"
import type { Page } from "puppeteer"

/** The persisted session row's public fields: the unlocked profile, the last refresh, and when auto-lock is due. */
export type SessionRow = { profile: string; since: number; lockedAt?: number }

/** The persisted session row, or `undefined` while the wallet is locked. */
export async function readSessionRow(page: Page): Promise<SessionRow | undefined> {
	// Parsed and projected in the page, so the row's restore secret never leaves it, not even in an error.
	return page.evaluate(async () => {
		const raw = (await chrome.storage.session.get("nulo:core:session"))["nulo:core:session"]
		if (typeof raw !== "string") return undefined
		type Row = { profile?: unknown; since?: unknown; lockedAt?: unknown } | null
		const row = ((): Row => {
			try {
				return JSON.parse(raw)
			} catch {
				return null
			}
		})()
		if (typeof row?.profile !== "string" || typeof row.since !== "number") throw new Error("readSessionRow: unreadable session row")
		return { profile: row.profile, since: row.since, lockedAt: typeof row.lockedAt === "number" ? row.lockedAt : undefined }
	})
}

/** Poll the session row until `predicate` accepts it. */
export async function waitForSessionRow(page: Page, predicate: (row: SessionRow) => boolean, timeoutMs = 15_000): Promise<SessionRow> {
	const deadline = Date.now() + timeoutMs
	let row = await readSessionRow(page)
	while (!row || !predicate(row)) {
		if (Date.now() > deadline)
			throw new Error(`waitForSessionRow: no matching row within ${timeoutMs}ms (last: ${JSON.stringify(row)})`)
		await new Promise((resolve) => setTimeout(resolve, 200))
		row = await readSessionRow(page)
	}
	return row
}

/** Call one background service method over a port of its own, as the popup's clients do. Unlike a
 *  popup interaction, it navigates nowhere, so it never refreshes the session. */
async function callService<T>(page: Page, service: string, method: string, params: unknown[] = [], timeoutMs = 15_000): Promise<T> {
	const envelope = { type: MessageType.Request, content: { requestId: 1, method, params: wrapParams(params) } }
	return (await page.evaluate(
		(name: string, request: typeof envelope, responseType: number, waitMs: number) =>
			new Promise((resolve, reject) => {
				const port = chrome.runtime.connect({ name })
				const fail = (reason: string) => {
					clearTimeout(timer)
					reject(new Error(`${name}.${request.content.method}: ${reason}`))
				}
				const timer = setTimeout(() => {
					port.disconnect()
					fail(`no response within ${waitMs}ms`)
				}, waitMs)
				port.onDisconnect.addListener(() => fail("port closed before a response"))
				port.onMessage.addListener(
					(message: { type?: number; content?: { requestId?: number; result?: unknown; error?: string } }) => {
						if (message?.type !== responseType || message.content?.requestId !== request.content.requestId) return
						port.disconnect()
						if (message.content.error !== undefined) return fail(message.content.error)
						clearTimeout(timer)
						resolve(message.content.result)
					},
				)
				port.postMessage(request)
			}),
		service,
		envelope,
		MessageType.Response,
		timeoutMs,
	)) as T
}

/** The active profile as the profile service reports it. A navigation would refresh the session
 *  first; this read runs only the service's own expiry check, as the popup's periodic poll does. */
export async function peekSession(page: Page): Promise<{ id: string } | undefined> {
	return callService(page, "profile", "getActiveProfile")
}

/** Locks the wallet as another window's Lock does: through the profile service, so this page learns
 *  of it only from the lock event. */
export async function lockFromAnotherWindow(page: Page): Promise<void> {
	await callService(page, "profile", "lockActiveProfile")
}

/** Every sender the active profile has registered on its active networks, as the PXE reports them. */
export async function registeredSenders(page: Page): Promise<string[]> {
	return callService(page, "account-state", "getSendersAcrossActiveNetworks", [], 60_000)
}

/** Set the auto-lock TTL in milliseconds through the config service (the settings page offers whole
 *  minutes only), and return the session row once it carries the new deadline. The deadline is
 *  recomputed from `since`, and one older than `ms` would lock the wallet on the spot, so the
 *  session is refreshed first, as any popup navigation would. */
export async function setSessionTtlMs(page: Page, ms: number): Promise<SessionRow & { lockedAt: number }> {
	await callService(page, "profile", "refreshSession")
	await callService(page, "config", "setValue", ["sessionTtl", ms])
	const row = await waitForSessionRow(page, ({ since, lockedAt }) => lockedAt === since + ms)
	return { ...row, lockedAt: row.since + ms }
}

/** The heartbeat the worker writes to `chrome.storage.session` (`nulo:liveness`), read from an
 *  extension page. Throws unless the read succeeds with a finite positive value: a failed read
 *  turned into 0 would let ANY retained timestamp satisfy a strictly-newer gate. */
export async function readLivenessBaseline(page: Page): Promise<number> {
	const value = await page.evaluate(async () => {
		const r = await chrome.storage.session.get("nulo:liveness")
		return Number(r["nulo:liveness"] ?? Number.NaN)
	})
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`readLivenessBaseline: no usable heartbeat on this page (read ${String(value)})`)
	}
	return value
}

/**
 * Wait until a worker writes a heartbeat STRICTLY NEWER than `afterTs`. The dead worker's value
 * survives in `chrome.storage.session`, so a truthy check passes before any replacement boots.
 *
 * Take `afterTs` from `readLivenessBaseline` AFTER `stopBackground` resolved: the old instance
 * is gone by then, so anything newer came from a replacement. That read may already be the
 * replacement's first write, which costs one more tick (`HEARTBEAT_INTERVAL_MS`, 10s) — fine for
 * a recovery gate, wrong for a test that TIMES the first heartbeat, which keeps a pre-kill
 * baseline on purpose.
 */
export async function waitForWorkerLiveness(page: Page, afterTs: number, opts: { timeoutMs?: number } = {}): Promise<void> {
	await page.waitForFunction(
		async (priorTs: number) => {
			try {
				const result = await chrome.storage.session.get("nulo:liveness")
				return Number(result["nulo:liveness"] ?? 0) > priorTs
			} catch {
				return false
			}
		},
		{ timeout: opts.timeoutMs ?? 30_000, polling: 500 },
		afterTs,
	)
}
