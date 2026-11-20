/**
 * `pointerClick` when its control changes between the aim and the press, in a real browser. The stage
 * changes the control inside the aim's own hit test, so the change always lands in the round trip
 * before the press, the window in which Send's fee line moves Change.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { newPage } from "./fixtures/browser"
import { test } from "./fixtures/extension"
import { pointerClick } from "./helpers/legal-drivers"

type Change = "moves" | "covered" | "refuses" | "scripted" | "label"

/** A 14 px control 30 px into its ground; each trusted click's target is logged by testid. */
async function stage(page: Page, change: Change): Promise<void> {
	await page.goto("about:blank")
	await page.evaluate((how: Change) => {
		const ground = how === "label" ? "label" : "div"
		const control =
			how === "label"
				? '<input type="checkbox" data-testid="pc-target" style="display:block;margin:30px 0 0;width:14px;height:14px">'
				: '<button data-testid="pc-target" style="display:block;margin:30px 0 0;padding:0;border:0;height:14px;width:60px">Change</button>'
		document.body.innerHTML = `<${ground} data-testid="pc-ground" style="display:block;position:fixed;left:20px;top:100px;width:200px;height:90px">${control}</${ground}>`
		const groundEl = document.querySelector('[data-testid="pc-ground"]') as HTMLElement
		const target = document.querySelector('[data-testid="pc-target"]') as HTMLElement
		// biome-ignore lint/suspicious/noExplicitAny: the stage's click log is page state no type declares
		const w = window as any
		w.__clicks = []
		addEventListener(
			"click",
			(e) => e.isTrusted && w.__clicks.push((e.target as Element).closest("[data-testid]")?.getAttribute("data-testid")),
			true,
		)
		const change = () => {
			if (how === "moves" || how === "label") target.style.marginTop = "45px"
			if (how === "refuses" || how === "scripted") target.style.pointerEvents = "none"
			if (how === "scripted") groundEl.addEventListener("click", () => target.click())
			if (how !== "covered") return
			const other = document.createElement("button")
			other.dataset.testid = "pc-other"
			other.style.cssText = "display:block;margin:30px 0 0;padding:0;border:0;height:15px;width:60px"
			target.style.marginTop = "0"
			groundEl.insertBefore(other, target)
		}
		const hitTest = document.elementFromPoint.bind(document)
		let pending = true
		document.elementFromPoint = (x: number, y: number) => {
			const hit = hitTest(x, y)
			if (pending) {
				pending = false
				change()
			}
			return hit
		}
	}, change)
}

const clicks = (page: Page) => page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks)

test("a press that lands on the ground its control moved off is aimed again and clicks the control once", async ({ extension }) => {
	const page = await newPage(extension.browser)
	await stage(page, "moves")
	await pointerClick(page, "pc-target")
	expect(await clicks(page)).toEqual(["pc-ground", "pc-target"])
	await page.close()
})

test("a press on a label its checkbox moved off counts the label's forwarded click, and is not pressed again", async ({ extension }) => {
	const page = await newPage(extension.browser)
	await stage(page, "label")
	await pointerClick(page, "pc-target")
	expect(await clicks(page)).toEqual(["pc-ground", "pc-target"])
	expect(await page.$eval('[data-testid="pc-target"]', (el) => (el as HTMLInputElement).checked)).toBe(true)
	await page.close()
})

test("a press another control takes throws, and nothing is pressed again", async ({ extension }) => {
	const page = await newPage(extension.browser)
	await stage(page, "covered")
	await expect(pointerClick(page, "pc-target")).rejects.toThrow(/pc-target took no click from press 1 .*click on pc-other/)
	expect(await clicks(page)).toEqual(["pc-other"])
	await page.close()
})

test("a press on a control that stayed put but stopped taking presses throws, and is not pressed again", async ({ extension }) => {
	const page = await newPage(extension.browser)
	await stage(page, "refuses")
	await expect(pointerClick(page, "pc-target")).rejects.toThrow(/pc-target took no click from press 1 .*target on the point/)
	expect(await clicks(page)).toEqual(["pc-ground"])
	await page.close()
})

test("a scripted click on the control after a missed press is no press: it throws", async ({ extension }) => {
	const page = await newPage(extension.browser)
	await stage(page, "scripted")
	await expect(pointerClick(page, "pc-target")).rejects.toThrow(/pc-target took no click from press 1 .*target on the point/)
	expect(await clicks(page)).toEqual(["pc-ground"])
	await page.close()
})
