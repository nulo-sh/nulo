/**
 * `pointerClick` against a control that changes in the round trip between the aim and the press, in
 * a real browser: the page changes it in the task that hit-tests the aim, so the press lands where the
 * control was, as it does when Send's fee line grows a note row under a pending press. A miss on the
 * control's own ground is aimed again and clicks the control once; a miss that another control takes,
 * or one on a control that stayed put but stopped taking presses, throws without pressing again.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { newPage } from "./fixtures/browser"
import { test } from "./fixtures/extension"
import { pointerClick } from "./helpers/legal-drivers"

type Change = "moves" | "covered" | "refuses"

/** A 14 px tall button 30 px into its ground, as Change sits in the fee line. On the page's first
 *  hit test, which is the aim's, `change` runs: the button drops 15 px (its own height and one more),
 *  a 15 px button is put in its place, or it stops taking presses where it stands. Every trusted
 *  click's target is logged by testid. */
async function stage(page: Page, change: Change): Promise<void> {
	await page.goto("about:blank")
	await page.evaluate((how: Change) => {
		document.body.innerHTML =
			'<div data-testid="pc-ground" style="position:fixed;left:20px;top:100px;width:200px;height:90px">' +
			'<button data-testid="pc-target" style="display:block;margin:30px 0 0;padding:0;border:0;height:14px;width:60px">Change</button></div>'
		const ground = document.querySelector('[data-testid="pc-ground"]') as HTMLElement
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
			if (how === "moves") target.style.marginTop = "45px"
			if (how === "refuses") target.style.pointerEvents = "none"
			if (how !== "covered") return
			const other = document.createElement("button")
			other.dataset.testid = "pc-other"
			other.style.cssText = "display:block;margin:30px 0 0;padding:0;border:0;height:15px;width:60px"
			target.style.marginTop = "0"
			ground.insertBefore(other, target)
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
