/**
 * What the fixtures' `pageErrors` and `consoleErrors` hold, on both browsers: every uncaught throw,
 * unhandled rejection and native console error of an extension page the suite opened, once, and
 * nothing from the background, a web page or a page the fixtures do not watch. A page's own
 * `pageerror` listener hears only that page. On Firefox these arrive through the driver's relay
 * (FIREFOX.md), so this file fails if the relay drops, duplicates, misroutes or delays them.
 */
import { randomUUID } from "node:crypto"
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { evaluateInBackground, extensionUrl, gotoExtensionPage, newPage, reloadExtensionPage } from "./fixtures/browser"
import { openPopup, test } from "./fixtures/extension"
import { pageErrorOf } from "./fixtures/page-errors"

const DEADLINE_MS = 10_000

const nonce = (label: string) => `NULO-PAGE-ERROR-${label}-${randomUUID()}`
const literal = (value: string) => JSON.stringify(value)

/** A page script that raises in one task and settles in a later one, so the page has reported the
 *  error before it answers. Page scripts, not evaluated functions: Chrome drops the thrown value of
 *  a function `evaluate` defines. */
const raiseThenSettle = (raise: string) =>
	`new Promise((settle) => { setTimeout(() => { ${raise} }, 0); setTimeout(() => setTimeout(settle, 0), 0) })`
const throwing = (n: string) => `throw new Error(${literal(n)})`
const rejecting = (n: string) => `void Promise.reject(new Error(${literal(n)}))`
const rejectingPrimitive = (n: string) => `void Promise.reject(${literal(n)})`
/** The native method the console sniffer keeps beside the one it reroutes to the background. */
const nativeConsoleError = (n: string) => `console._error(${literal(n)})`

async function until(condition: () => boolean | Promise<boolean>, what: string): Promise<void> {
	const deadline = Date.now() + DEADLINE_MS
	while (!(await condition())) {
		if (Date.now() > deadline) throw new Error(`${what} within ${DEADLINE_MS} ms`)
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
}

const count = (texts: readonly string[], n: string) => texts.filter((text) => text.includes(n)).length

function expectExactly(texts: readonly string[], nonces: readonly string[], what: string): void {
	const seen = JSON.stringify(texts)
	expect(
		nonces.map((n) => count(texts, n)),
		`${what}: each expected error once, got ${seen}`,
	).toEqual(nonces.map(() => 1))
	expect(texts, `${what}: nothing else, got ${seen}`).toHaveLength(nonces.length)
}

/** What `page`'s own listeners hear: its page errors as the fixtures read them, and its console errors. */
function hear(page: Page): { errors: string[]; console: string[] } {
	const heard = { errors: [] as string[], console: [] as string[] }
	page.on("pageerror", (payload) => {
		const err = pageErrorOf(payload)
		if (err) heard.errors.push(err.message)
	})
	page.on("console", (msg) => {
		if (msg.type() === "error") heard.console.push(msg.text())
	})
	return heard
}

test("an extension page's errors reach the launch's arrays once, and no other context's do", async ({ registeredExtension: ctx }) => {
	// Each `openPopup` resets the arrays, so both pages exist before anything is raised.
	const a = await openPopup(ctx)
	const b = await openPopup(ctx)
	const heardA = hear(a)
	const heardB = hear(b)
	const pageTexts = () => ctx.pageErrors.map((err) => err.message)
	const n = {
		aThrow: nonce("A-THROW"),
		aConsole: nonce("A-CONSOLE"),
		bReject: nonce("B-REJECT"),
		bPrimitive: nonce("B-PRIMITIVE"),
		aAfterReload: nonce("A-AFTER-RELOAD"),
		cSelfClose: nonce("C-SELF-CLOSE"),
		background: nonce("BACKGROUND"),
		web: nonce("WEB"),
	}

	await a.evaluate(raiseThenSettle(throwing(n.aThrow)))
	expect(count(pageTexts(), n.aThrow), "a throw the page reported before answering is in the array when the call returns").toBe(1)

	await a.evaluate(raiseThenSettle(nativeConsoleError(n.aConsole)))
	expect(count(ctx.consoleErrors, n.aConsole), "and so is a console error").toBe(1)

	await b.evaluate(raiseThenSettle(rejecting(n.bReject)))
	await b.evaluate(raiseThenSettle(rejectingPrimitive(n.bPrimitive)))
	// A rejection is reported once the browser finds it unhandled, after the task that dropped it.
	await until(() => count(pageTexts(), n.bReject) > 0 && count(pageTexts(), n.bPrimitive) > 0, "both rejections arrived")

	await reloadExtensionPage(a)
	await a.evaluate(raiseThenSettle(throwing(n.aAfterReload)))
	await until(() => count(pageTexts(), n.aAfterReload) > 0, "the reloaded page's throw arrived")

	const c = await newPage(ctx.browser)
	await gotoExtensionPage(c, extensionUrl(ctx.extensionId, "/src/popup/index.html#/popup/general"))
	const heardC = hear(c)
	await c.evaluate(`setTimeout(() => { window.close(); ${throwing(n.cSelfClose)} }, 0)`)
	await until(() => heardC.errors.length > 0, "a page that throws in the task that closes it was heard")

	const thrownKey = `nulo:e2e:page-error-capture:${randomUUID()}`
	await evaluateInBackground(
		ctx,
		`setTimeout(() => { void chrome.storage.session.set({ ${literal(thrownKey)}: true }); ${throwing(n.background)} }, 0); return null;`,
	)
	await until(
		() => b.evaluate(async (key) => (await chrome.storage.session.get(key))[key] === true, thrownKey),
		"the background ran the task that throws",
	)

	const w = await newPage(ctx.browser)
	await w.goto("about:blank")
	const heardW = hear(w)
	await w.evaluate(raiseThenSettle(throwing(n.web)))
	await until(() => heardW.errors.length > 0, "the web page's throw was heard")

	// Each producer delivers a page's errors in order, so a duplicate made on either path, or a
	// background error routed to a page, arrives before that path's sentinel does.
	const s = {
		aThrow: nonce("A-SENTINEL"),
		aConsole: nonce("A-SENTINEL-CONSOLE"),
		bThrow: nonce("B-SENTINEL"),
		bConsole: nonce("B-SENTINEL-CONSOLE"),
	}
	await a.evaluate(raiseThenSettle(`${nativeConsoleError(s.aConsole)}; ${throwing(s.aThrow)}`))
	await b.evaluate(raiseThenSettle(`${nativeConsoleError(s.bConsole)}; ${throwing(s.bThrow)}`))
	await until(
		() =>
			[s.aThrow, s.bThrow].every((x) => count(pageTexts(), x) > 0) &&
			[s.aConsole, s.bConsole].every((x) => count(ctx.consoleErrors, x) > 0),
		"every sentinel arrived",
	)

	expect(count([...pageTexts(), ...ctx.consoleErrors], n.background), "the background's error reached a page's array").toBe(0)
	expectExactly(pageTexts(), [n.aThrow, n.bReject, n.bPrimitive, n.aAfterReload, s.aThrow, s.bThrow], "pageErrors")
	expectExactly(ctx.consoleErrors, [n.aConsole, s.aConsole, s.bConsole], "consoleErrors")
	expectExactly(heardA.errors, [n.aThrow, n.aAfterReload, s.aThrow], "page A's own pageerror listener")
	expectExactly(heardA.console, [n.aConsole, s.aConsole], "page A's own console listener")
	expectExactly(heardB.errors, [n.bReject, n.bPrimitive, s.bThrow], "page B's own pageerror listener")
	expectExactly(heardB.console, [s.bConsole], "page B's own console listener")
	expectExactly(heardC.errors, [n.cSelfClose], "the self-closing page's own listener")
	expectExactly(heardW.errors, [n.web], "the web page's own listener")
	await w.close()
})
