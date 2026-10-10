import { randomUUID } from "node:crypto"
import { type Server, createServer } from "node:http"
import type { Page } from "puppeteer"
import { afterAll, beforeAll, describe, expect, inject, test } from "vitest"
import { evaluateInBackground, newPage, openScratchPage } from "./fixtures/browser"
import {
	EGRESS_CANARY_HOST,
	EGRESS_LINK_LOCAL_HOST,
	EGRESS_PROBE_HOST,
	type EgressCanary,
	type EgressGuard,
	canaryUrl,
	guardArmed,
	listenClaimed,
} from "./fixtures/egress-guard"
import { type ExtensionContext, launchExtension } from "./fixtures/extension"

const PROBE_BUDGET_MS = 10_000

/** A loopback site this spec owns: an ordinary page no extension CSP governs, and a record of what reached it. */
interface Site {
	port: number
	/** Whether the same port also answers on `[::1]`; a host without IPv6 loopback has no such case. */
	ipv6: boolean
	hits: string[]
	stop(): Promise<void>
}

async function startSite(): Promise<Site> {
	const hits: string[] = []
	const handle: Parameters<typeof createServer>[1] = (req, res) => {
		hits.push(req.url ?? "")
		res.writeHead(200, { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" })
		res.end("<!doctype html><title>egress probe</title>")
	}
	const { port, server, release } = await listenClaimed(() => createServer(handle), "egress-site")
	const v6 = createServer(handle)
	const ipv6 = await new Promise<boolean>((resolve) => {
		v6.once("error", () => resolve(false))
		v6.listen(port, "::1", () => resolve(true))
	})
	const close = (s: Server) => new Promise<void>((resolve) => s.close(() => resolve()))
	return {
		port,
		ipv6,
		hits,
		stop: async () => {
			server.closeAllConnections()
			v6.closeAllConnections()
			await Promise.all([close(server), ipv6 ? close(v6) : undefined])
			await release()
		},
	}
}

/**
 * Starts a request for `url` in the background, under the extension's CSP, and reads its outcome
 * from a scratch page: Firefox's background evaluation cannot await, so the request writes it to
 * `storage.session` itself. A request still pending after the budget fails the case.
 */
async function backgroundFetch(ctx: ExtensionContext, url: string): Promise<string> {
	const key = `nulo:e2e:egress-probe:${randomUUID()}`
	await evaluateInBackground(
		ctx,
		`const key = ${JSON.stringify(key)};
		fetch(${JSON.stringify(url)}, { mode: "no-cors", cache: "no-store" }).then(
			() => chrome.storage.session.set({ [key]: "resolved" }),
			() => chrome.storage.session.set({ [key]: "rejected" }),
		);
		return true;`,
	)
	const page = await openScratchPage(ctx.browser, ctx.extensionId)
	try {
		const outcome = await page.waitForFunction(
			async (k: string) => (await chrome.storage.session.get(k))[k] ?? false,
			{ timeout: PROBE_BUDGET_MS, polling: 200 },
			key,
		)
		return String(await outcome.jsonValue())
	} catch (err) {
		throw new Error(`the background's request for ${url} was still pending after ${PROBE_BUDGET_MS / 1000}s`, { cause: err })
	} finally {
		await page.close().catch(() => {})
	}
}

/** Each request's outcome from the ordinary page: `resolved`/`rejected` for a fetch, `open`/`failed` for a socket. */
function pageRequests(page: Page, requests: Record<string, string>): Promise<Record<string, string>> {
	return page.evaluate(
		async (all: Record<string, string>, budgetMs: number) => {
			const fetched = (url: string) =>
				fetch(url, { mode: "no-cors", cache: "no-store" }).then(
					() => "resolved",
					() => "rejected",
				)
			const socket = (url: string) =>
				new Promise<string>((resolve) => {
					const ws = new WebSocket(url)
					ws.onopen = () => {
						ws.close()
						resolve("open")
					}
					ws.onerror = () => resolve("failed")
				})
			const pending = new Promise<string>((resolve) => setTimeout(() => resolve("pending"), budgetMs))
			const entries = await Promise.all(
				Object.entries(all).map(async ([name, url]) => {
					const outcome = url.startsWith("ws") ? socket(url) : fetched(url)
					return [name, await Promise.race([outcome, pending])] as const
				}),
			)
			return Object.fromEntries(entries)
		},
		requests,
		PROBE_BUDGET_MS,
	)
}

const countFor = (guard: EgressGuard, host: string, port: number): number =>
	guard.attempts().find((attempt) => attempt.host === host && attempt.port === port)?.count ?? 0

/** The canary's count at the guard once no earlier request's retry is still arriving, so the next
 *  request's increase is its own. */
async function settledCount(guard: EgressGuard, canaryPort: number): Promise<number> {
	let last = countFor(guard, EGRESS_CANARY_HOST, canaryPort)
	for (let polls = 0; polls < 20; polls++) {
		await new Promise((resolve) => setTimeout(resolve, 500))
		const now = countFor(guard, EGRESS_CANARY_HOST, canaryPort)
		if (now === last) return now
		last = now
	}
	throw new Error("requests for the canary kept arriving at the guard for 10s")
}

describe.skipIf(!guardArmed(inject("egressGuard")))("the smoke launch's egress guard", () => {
	let ctx: ExtensionContext
	let site: Site
	let page: Page
	let guard: EgressGuard
	let canary: EgressCanary

	beforeAll(async () => {
		site = await startSite()
		ctx = await launchExtension()
		if (!ctx.egress) throw new Error("the smoke setup armed the guard, but the launch carries none")
		;({ guard, canary } = ctx.egress)
		page = await newPage(ctx.browser)
		await page.goto(`http://127.0.0.1:${site.port}/page`, { waitUntil: "domcontentloaded" })
	})

	afterAll(async () => {
		try {
			await page?.close().catch(() => {})
			await ctx?.close()
		} finally {
			await site?.stop()
		}
	})

	test("the background's request for an outside host is refused at the guard", async () => {
		expect(await backgroundFetch(ctx, `https://${EGRESS_PROBE_HOST}/`)).toBe("rejected")
		expect(countFor(guard, EGRESS_PROBE_HOST, 443)).toBeGreaterThan(0)
	})

	test("success control: the background reaches loopback directly", async () => {
		expect(await backgroundFetch(ctx, `http://127.0.0.1:${site.port}/background-ip`)).toBe("resolved")
		expect(await backgroundFetch(ctx, `http://localhost:${site.port}/background-name`)).toBe("resolved")
		expect(site.hits).toEqual(expect.arrayContaining(["/background-ip", "/background-name"]))
	})

	test("an ordinary page's plain-HTTP and WebSocket requests each reach the guard, never the canary", async () => {
		for (const scheme of ["http", "ws", "wss"]) {
			const before = await settledCount(guard, canary.port)
			const { outcome } = await pageRequests(page, { outcome: canaryUrl(canary.port, scheme) })
			// A plain-HTTP proxy answers in the origin's place, so that fetch may settle on the guard's 403.
			expect(outcome, scheme).toMatch(scheme === "http" ? /^(resolved|rejected)$/ : /^failed$/)
			expect(countFor(guard, EGRESS_CANARY_HOST, canary.port), `${scheme} at the guard`).toBeGreaterThan(before)
		}
		expect(canary.connections()).toBe(0)
	})

	test("success control: the page reaches IPv6 loopback directly", async (testCtx) => {
		if (!site.ipv6) testCtx.skip()
		expect(await pageRequests(page, { v6: `http://[::1]:${site.port}/page-ipv6` })).toEqual({ v6: "resolved" })
		expect(site.hits).toContain("/page-ipv6")
	})

	test("a link-local address is sent to the guard, not to the network", async () => {
		expect(await pageRequests(page, { linkLocal: `https://${EGRESS_LINK_LOCAL_HOST}/` })).toEqual({ linkLocal: "rejected" })
		expect(countFor(guard, EGRESS_LINK_LOCAL_HOST, 443)).toBeGreaterThan(0)
	})

	// Last: it stops the guard for the rest of the launch.
	test("with the guard stopped, neither the background nor the page falls back to a direct path", async () => {
		await guard.stop()
		expect(await backgroundFetch(ctx, canaryUrl(canary.port))).toBe("rejected")
		expect(await pageRequests(page, { http: canaryUrl(canary.port, "http"), wss: canaryUrl(canary.port, "wss") })).toEqual({
			http: "rejected",
			wss: "failed",
		})
		expect(canary.connections()).toBe(0)
	})
})
