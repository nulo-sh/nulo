import { expect } from "vitest"
import { test, openPopup, waitForHash, clickByTestId, replaceInputValue } from "./fixtures/extension"
import { addContact, closeStuckPopup, contactRow, deleteContact, navigateToSettings } from "./fixtures/helpers"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { shotSend } from "./fixtures/send-page"
import { doubleClick } from "./fixtures/browser"
import { settleClosedPopup } from "./fixtures/popup-leave"
import { pointerClick } from "./helpers/legal-drivers"

// Per-CALL fresh identities: the extension fixture is file-scoped, so a
// vitest retry re-enters a test with earlier attempts' contacts persisted —
// fixed names/addresses turn every retry into a duplicate-validation wall.
// About half of all field elements are off the curve, and most 64-hex values exceed the field; the
// contact form refuses both.
function randomAddress(): string {
	for (;;) {
		let hex = ""
		while (hex.length < 64) hex += Math.floor(Math.random() * 16).toString(16)
		if (isValidAztecAddress(`0x${hex}`)) return `0x${hex}`
	}
}
function uniqueName(prefix: string): string {
	return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

test("contacts page shows empty state", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "contacts")

	// Empty state testid is only rendered when contacts.length === 0
	await page.waitForSelector('[data-testid="contacts-empty"]', { visible: true, timeout: 5_000 })
	await page.waitForSelector('[data-testid="contacts-new-btn"]', { visible: true, timeout: 5_000 })

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("add contact via popup", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	const name = uniqueName("Alice")
	await navigateToSettings(page, "contacts")
	try {
		await addContact(page, name, randomAddress())
	} catch (e) {
		const snap = await page.evaluate(
			(row: string) => ({
				hash: window.location.hash,
				body: (document.body?.innerText ?? "").slice(0, 500).replace(/\s+/g, " "),
				testIds: [...document.querySelectorAll("[data-testid]")].slice(0, 30).map((el) => el.getAttribute("data-testid")),
				submitDisabled: (document.querySelector('[data-testid="new-contact-submit"]') as HTMLButtonElement | null)?.disabled,
				nameInputVal: document.querySelector<HTMLInputElement>('[data-testid="contact-name-input"]')?.value,
				addrInputVal: [...document.querySelectorAll<HTMLInputElement>('[data-testid="contact-address-input"]')].map((i) => i.value),
				rowExists: !!document.querySelector(row),
			}),
			contactRow(name),
		)
		console.error("[DIAG] addContact failed; snapshot:", JSON.stringify(snap, null, 2))
		console.error("[DIAG] consoleErrors:", JSON.stringify(registeredExtension.consoleErrors.slice(0, 10)))
		console.error("[DIAG] pageErrors:", JSON.stringify(registeredExtension.pageErrors.map((e) => e.message).slice(0, 10)))
		throw e
	}

	await page.waitForSelector(contactRow(name), { visible: true, timeout: 5_000 })

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("edit contact name", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	const name = uniqueName("Bob")
	const renamed = `${name}y`
	await navigateToSettings(page, "contacts")
	await addContact(page, name, randomAddress())

	// Wait for the row to settle
	await page.waitForSelector(contactRow(name), { visible: true, timeout: 5_000 })

	// Click edit icon scoped to the row
	await page.evaluate((s: string) => {
		const edit = document.querySelector(s)?.querySelector<HTMLElement>('[data-testid="contact-edit"]')
		edit?.click()
	}, contactRow(name))

	// Wait for the popup's PREFILL to settle before typing: the show-watcher
	// fills the fields only after its async getContacts() resolves, and a
	// value typed before that gets overwritten back to the loaded name —
	// leaving the form clean and the submit disabled (the load-flake).
	await page.waitForFunction(
		(n: string) => {
			const inputs = [...document.querySelectorAll<HTMLInputElement>('[data-testid="contact-name-input"]')]
			return inputs.some((i) => i.offsetParent !== null && i.value === n)
		},
		{ timeout: 10_000, polling: 100 },
		name,
	)

	// Replace the full name via the v-model-aware helper; triple-click +
	// type is unreliable on the Input component wrapper.
	await replaceInputValue(page, '[data-testid="contact-name-input"]', renamed)

	await clickByTestId(page, "edit-contact-submit")

	// Verify new name
	await page.waitForSelector(contactRow(renamed), { visible: true, timeout: 5_000 })

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("delete contact", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	const name = uniqueName("ToDelete")
	await navigateToSettings(page, "contacts")
	await addContact(page, name, randomAddress())
	await deleteContact(page, name)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("delete-confirm never offers sender options (contacts are decoupled from sender state)", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	const name = uniqueName("Plain")
	await navigateToSettings(page, "contacts")
	await addContact(page, name, randomAddress())

	// Open the confirm popup but DON'T submit yet — assert the toggle is
	// absent from the DOM before clicking confirm.
	const rowSelector = contactRow(name)
	await page.waitForSelector(rowSelector, { visible: true, timeout: 5_000 })
	await page.evaluate((sel: string) => {
		const row = document.querySelector<HTMLElement>(sel)
		// Synthetic hover dispatch — ElementHandle.hover() goes through the
		// broken CDP path (matches the .click() / .type() regression).
		row?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
		row?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
		row?.querySelector<HTMLElement>('[data-testid="contact-delete"]')?.click()
	}, rowSelector)
	await page.waitForSelector('[data-testid="confirm-submit"]', { visible: true, timeout: 5_000 })
	await shotSend(page, "sheet-confirm-delete", "confirm-submit")

	const toggleVisible = await page.evaluate(() => !!document.querySelector('[data-testid="confirm-toggle"]'))
	expect(toggleVisible).toBe(false)

	await clickByTestId(page, "confirm-cancel")
	// Vue Transition can stick mid-leave in headless Chrome — force-close.
	await closeStuckPopup(page)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("a double-click's second press cannot answer the Confirm its first opened; one press can", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	await navigateToSettings(page, "contacts")
	// The Confirm's answer sits at the frame's bottom, which a row's icon reaches only on a list this long.
	const rows = () => page.evaluate(() => document.querySelectorAll('[data-testid="contact-row"]').length)
	while ((await rows()) < 10) await addContact(page, uniqueName("Row"), randomAddress())

	await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="contact-delete"]')?.click())
	await page.waitForSelector('[data-testid="confirm-submit"]', { visible: true, timeout: 5_000 })
	const answer = await page.evaluate(() => {
		const box = document.querySelector('[data-testid="confirm-submit"]')?.getBoundingClientRect()
		return box ? { left: box.left, right: box.right, y: box.top + box.height / 2 } : null
	})
	if (!answer) throw new Error("confirm-submit has no box")
	await clickByTestId(page, "confirm-cancel")
	await settleClosedPopup(page, "confirm-cancel")

	const aim = await page.evaluate((target) => {
		const scrollerOf = (el: Element) => {
			for (let p = el.parentElement; p; p = p.parentElement) {
				if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p
			}
			return document.scrollingElement
		}
		for (const row of [...document.querySelectorAll<HTMLElement>('[data-testid="contact-row"]')].reverse()) {
			const icon = row.querySelector('[data-testid="contact-delete"]')
			const scroller = icon && scrollerOf(row)
			if (!icon || !scroller) continue
			const before = icon.getBoundingClientRect()
			scroller.scrollTop += before.top + before.height / 2 - target.y
			const box = icon.getBoundingClientRect()
			const x = box.left + box.width / 2
			const y = box.top + box.height / 2
			const hit = document.elementFromPoint(x, y)?.closest('[data-testid="contact-delete"]')
			if (Math.abs(y - target.y) <= 4 && x > target.left + 4 && x < target.right - 4 && hit === icon) {
				return { x, y, name: row.dataset.contactName ?? "" }
			}
		}
		return null
	}, answer)
	if (!aim) throw new Error(`no contact-delete icon could be scrolled under the answer at y ${answer.y}`)

	// Window capture runs before the sheet's own listener; `defaultPrevented` is read after dispatch.
	await page.evaluate(() => {
		const seen: { event: MouseEvent; target: string | null; delivered: boolean }[] = []
		;(window as unknown as { __clicks: typeof seen }).__clicks = seen
		window.addEventListener(
			"click",
			(event) =>
				seen.push({
					event,
					target: (event.target as Element).closest("[data-testid]")?.getAttribute("data-testid") ?? null,
					delivered: false,
				}),
			true,
		)
		window.addEventListener("click", (event) => {
			const entry = seen.find((e) => e.event === event)
			if (entry) entry.delivered = true
		})
	})
	await doubleClick(page, aim.x, aim.y, 300)
	await page.waitForFunction(() => (window as unknown as { __clicks: unknown[] }).__clicks.length >= 2, { timeout: 5_000 })
	const clicks = await page.evaluate(() =>
		(window as unknown as { __clicks: { event: MouseEvent; target: string | null; delivered: boolean }[] }).__clicks.map(
			({ event, target, delivered }) => ({ detail: event.detail, target, prevented: event.defaultPrevented, delivered }),
		),
	)
	expect(clicks).toEqual([
		{ detail: 1, target: "contact-delete", prevented: false, delivered: true },
		{ detail: 2, target: "confirm-submit", prevented: true, delivered: false },
	])
	expect(await page.evaluate((s: string) => !!document.querySelector(s), contactRow(aim.name))).toBe(true)

	await pointerClick(page, "confirm-submit")
	await page.waitForFunction((s: string) => !document.querySelector(s), { timeout: 5_000 }, contactRow(aim.name))

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})
