#!/usr/bin/env bun
/**
 * Renders the changelog's Open Graph cards into `content/changelog/` with Puppeteer: each card that is
 * missing or stale, so a run on another machine leaves current cards as they are. Local only; the
 * cards are committed and og-card.test.ts refuses a missing or stale one.
 *
 * Usage: `bun run --cwd apps/landing og:cards`
 */

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import puppeteer, { type Browser } from "puppeteer"
import { CARD_HEIGHT, CARD_WIDTH } from "./changelog-pages"
import { SAFE, STAMP_KEYWORD, checkCard, planCards, readCardFonts } from "./og-card"
import { withPngText } from "./png"

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../content/changelog")
const read = (file: string) => (existsSync(resolve(dir, file)) ? new Uint8Array(readFileSync(resolve(dir, file))) : undefined)

/** In the page: each `[data-fit]` box that takes more than its `data-lines`, is wider than its column or
 *  leaves the safe rectangle, and each face that failed. Nothing is clipped, so a box grows instead. */
function layoutProblems(safe: typeof SAFE): string[] {
	const boxes = [...document.querySelectorAll<HTMLElement>("[data-fit]")].flatMap((box) => {
		const r = box.getBoundingClientRect()
		const lines = Math.round(r.height / Number.parseFloat(getComputedStyle(box).lineHeight))
		const name = `the ${box.dataset.fit} "${box.textContent?.trim()}"`
		return [
			lines > Number(box.dataset.lines) ? `${name} takes ${lines} lines, at most ${box.dataset.lines}` : "",
			box.scrollWidth > box.clientWidth ? `${name} is ${box.scrollWidth - box.clientWidth}px wider than its column` : "",
			r.left < safe.left || r.top < safe.top || r.right > safe.right || r.bottom > safe.bottom ? `${name} leaves the safe area` : "",
		].filter(Boolean)
	})
	const faces = [...document.fonts].filter((face) => face.status !== "loaded").map((face) => `the face ${face.family} did not load`)
	return [...boxes, ...faces]
}

async function render(browser: Browser, html: string): Promise<Uint8Array> {
	const page = await browser.newPage()
	try {
		await page.setViewport({ width: CARD_WIDTH, height: CARD_HEIGHT, deviceScaleFactor: 1 })
		const outside: string[] = []
		await page.setRequestInterception(true)
		page.on("request", (request) => {
			// Puppeteer reports the document's own `data:` fonts too, but cannot intercept them.
			if (request.url().startsWith("data:")) return
			outside.push(request.url())
			void request.abort()
		})
		await page.setContent(html, { waitUntil: "load" })
		await page.evaluate(() => document.fonts.ready)
		const problems = [...outside.map((url) => `the card asked for ${url}`), ...(await page.evaluate(layoutProblems, SAFE))]
		if (problems.length > 0) throw new Error(problems.join("; "))
		return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } })
	} finally {
		await page.close()
	}
}

const sources = readdirSync(dir).flatMap((file) => {
	const version = /^(\d+\.\d+\.\d+)\.toml$/.exec(file)?.[1]
	return version === undefined ? [] : [{ version, toml: readFileSync(resolve(dir, file), "utf8") }]
})
const planned = planCards(sources, readCardFonts())

for (const file of readdirSync(dir).filter((f) => f.endsWith(".og.png") && !planned.some((card) => card.file === f))) {
	rmSync(resolve(dir, file))
	console.log(`[og-cards] removed ${file}: no release names it`)
}

const due = planned.filter((card) => checkCard(card.file, read(card.file), card.hash) !== undefined)
if (due.length > 0) {
	const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] })
	try {
		for (const card of due) {
			const png = await render(browser, card.document).catch((error: Error) => {
				throw new Error(`[og-cards] ${card.file}: ${error.message}`)
			})
			writeFileSync(resolve(dir, card.file), withPngText(png, STAMP_KEYWORD, card.hash))
			console.log(`[og-cards] wrote ${card.file}`)
		}
	} finally {
		await browser.close()
	}
}
console.log(`[og-cards] ${planned.length} card(s), ${due.length} rendered`)
