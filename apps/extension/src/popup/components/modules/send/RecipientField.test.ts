/**
 * Locks the recipient contract for RecipientField after the P3 card redesign:
 *   - the `vault` icon is gone everywhere (suffix + suggestions)
 *   - suggestion rows render an <AccountAvatar> (initials), no vault fallback
 *   - a selected recipient renders the <RecipientCard> (masked addr + reveal),
 *     replacing the typing input
 *   - the card's `change` action clears the selection and restores the input
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { nextTick } from "vue"
import RecipientField from "./RecipientField.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>", props: ["size", "weight", "color", "noWrap", "align", "mono", "selectable"] },
	Icon: { template: '<i data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color", "scale"] },
	AddressInput: {
		template: `<div class="stub-input"><input :value="modelValue" @focus="$emit('focus')" @blur="$emit('blur')" /><slot name="suffix" /></div>`,
		props: ["modelValue", "placeholder", "autofocus"],
		emits: ["focus", "blur", "update:modelValue"],
	},
	Transition: { template: "<slot />" },
	AccountAvatar: {
		template: '<div data-testid="stub-avatar" :data-name="name" :data-address="address" />',
		props: ["name", "address", "size"],
	},
	RecipientCard: {
		template: `<div data-testid="stub-card" :data-name="name" :data-address="address"><button data-testid="card-change-btn" @click="$emit('change')" /></div>`,
		props: ["name", "address"],
		emits: ["change"],
	},
}

const mountField = (props: Record<string, unknown> = {}) => mount(RecipientField, { props, global: { stubs: STUBS } })

const alice = { id: "1", name: "Alice", address: "0xaaaa", abbr: "AL" }
const account1 = { id: "2", name: "Account 1", address: "0xbbbb" }

describe("modules/send/RecipientField", () => {
	test("renders no vault icon anywhere (removed in P3)", async () => {
		const w = mountField({ candidates: [alice, account1], searchTerm: "a" })
		await w.find("input").trigger("focus")
		const iconNames = w.findAll('[data-testid="stub-icon"]').map((i) => i.attributes("data-name"))
		expect(iconNames).not.toContain("vault")
	})

	test("suggestion rows render an AccountAvatar per candidate (name + address)", async () => {
		const w = mountField({ candidates: [alice, account1], searchTerm: "a" })
		await w.find("input").trigger("focus")
		const avatars = w.findAll('[data-testid="stub-avatar"]')
		expect(avatars).toHaveLength(2)
		expect(avatars.map((a) => a.attributes("data-address"))).toEqual(["0xaaaa", "0xbbbb"])
	})

	test("filters candidates by name substring", async () => {
		const w = mountField({ candidates: [alice, account1], searchTerm: "alice" })
		await w.find("input").trigger("focus")
		const avatars = w.findAll('[data-testid="stub-avatar"]')
		expect(avatars).toHaveLength(1)
		expect(avatars[0].attributes("data-name")).toBe("Alice")
	})

	test("suggests a saved name whatever its case, spacing or invisible characters, and no look-alike", async () => {
		const saved = { id: "3", name: "Alice", address: `0x${"0a1ce".repeat(12)}0a1c`, abbr: "AL" }
		const other = { id: "4", name: "Account 1", address: `0x${"b".repeat(64)}` }
		const suggested = async (searchTerm: string) => {
			const w = mountField({ candidates: [other, saved], searchTerm })
			await w.find("input").trigger("focus")
			return w.findAll('[data-testid="stub-avatar"]').map((a) => a.attributes("data-address"))
		}
		for (const term of ["ALICE", "alice  ", "ali\u200Bce", "\uFF41lice"]) {
			expect(await suggested(term), JSON.stringify(term)).toEqual([saved.address])
		}
		expect(await suggested("\u0430lice")).toEqual([])
		expect(await suggested("\u200B\u200D")).toEqual([])
	})

	test("a selected recipient renders the RecipientCard (with the full address), not the input", () => {
		const w = mountField({ candidates: [alice], selectedContact: alice })
		const card = w.find('[data-testid="stub-card"]')
		expect(card.exists()).toBe(true)
		expect(card.attributes("data-address")).toBe("0xaaaa")
		expect(card.attributes("data-name")).toBe("Alice")
		expect(w.find("input").exists()).toBe(false)
	})

	test("the card's change action clears the selection and restores the input", async () => {
		const w = mountField({ candidates: [alice], selectedContact: alice, searchTerm: alice.address })
		await w.find('[data-testid="card-change-btn"]').trigger("click")
		expect(w.emitted("update:selectedContact")?.at(-1)).toEqual([null])
		expect(w.emitted("update:searchTerm")?.at(-1)).toEqual([""])
		expect(w.find("input").exists()).toBe(true)
		expect(w.find('[data-testid="stub-card"]').exists()).toBe(false)
	})

	test("shows the 'Invalid address' hint for a malformed address when blurred", () => {
		const w = mountField({ candidates: [], searchTerm: "0xnotavalidaddress" })
		expect(w.find('[data-testid="recipient-invalid-hint"]').exists()).toBe(true)
	})

	test("hides the invalid hint for a well-formed address", () => {
		const w = mountField({ candidates: [], searchTerm: `0x2${"a".repeat(63)}` })
		expect(w.find('[data-testid="recipient-invalid-hint"]').exists()).toBe(false)
	})

	test("shows the 'Invalid address' hint for a well-formed address off the curve", () => {
		const w = mountField({ candidates: [], searchTerm: "0x24f20fb6e501242936eb1f47e2f51610f15e6c07486ed62012774e5f14ebd583" })
		expect(w.find('[data-testid="recipient-invalid-hint"]').exists()).toBe(true)
	})

	test("hides the invalid hint while focused (no nagging mid-type)", async () => {
		const w = mountField({ candidates: [], searchTerm: "0xbad" })
		await w.find("input").trigger("focus")
		expect(w.find('[data-testid="recipient-invalid-hint"]').exists()).toBe(false)
	})

	describe("Enter picks a suggestion only from the field's own input", () => {
		// Named after the address, so it is suggested first while the blur matches Alice's address.
		const namesake = { id: "5", name: "0xaaaa fan", address: "0xcccc" }
		const mounted: ReturnType<typeof mount>[] = []
		const mountAttached = (props: Record<string, unknown>) => {
			const w = mount(RecipientField, { props, global: { stubs: STUBS }, attachTo: document.body })
			mounted.push(w)
			return w
		}
		const enter = (init: KeyboardEventInit = {}) =>
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init })
		const picks = (w: ReturnType<typeof mount>) => ({
			term: w.emitted("update:searchTerm") ?? [],
			contact: w.emitted("update:selectedContact") ?? [],
		})

		beforeEach(() => {
			vi.useFakeTimers()
		})
		afterEach(() => {
			for (const w of mounted.splice(0)) w.unmount()
			document.body.innerHTML = ""
			vi.useRealTimers()
		})

		test("an Enter on another control within the blur's grace period picks nothing and blurs nothing", async () => {
			const w = mountAttached({ candidates: [alice, account1], searchTerm: "a" })
			await w.find("input").trigger("focus")
			await w.find("input").trigger("blur")
			const other = document.createElement("button")
			document.body.append(other)
			other.focus()
			other.dispatchEvent(enter())
			expect(picks(w)).toEqual({ term: [], contact: [] })
			expect(document.activeElement).toBe(other)
		})

		test("an Enter on the account card's own button within the grace period picks nothing", async () => {
			const w = mountAttached({ candidates: [namesake, alice], searchTerm: alice.address })
			await w.find("input").trigger("focus")
			await w.find("input").trigger("blur")
			expect(w.emitted("update:selectedContact")?.at(-1)).toEqual([alice])
			const before = picks(w)
			const change = w.find('[data-testid="card-change-btn"]')
			change.element.dispatchEvent(enter())
			expect(picks(w)).toEqual(before)
		})

		test("an Enter in the field's input picks the first suggestion", async () => {
			const w = mountAttached({ candidates: [alice, account1], searchTerm: "a" })
			const input = w.find("input")
			await input.trigger("focus")
			input.element.dispatchEvent(enter())
			expect(w.emitted("update:searchTerm")?.at(-1)).toEqual([alice.address])
			expect(w.emitted("update:selectedContact")?.at(-1)).toEqual([alice])
		})

		test("a repeat, composing or already handled Enter in the input picks nothing", async () => {
			const w = mountAttached({ candidates: [alice, account1], searchTerm: "a" })
			const input = w.find("input")
			await input.trigger("focus")
			input.element.dispatchEvent(enter({ repeat: true }))
			input.element.dispatchEvent(enter({ isComposing: true }))
			const handled = (e: Event) => e.preventDefault()
			input.element.addEventListener("keydown", handled)
			input.element.dispatchEvent(enter())
			input.element.removeEventListener("keydown", handled)
			expect(picks(w)).toEqual({ term: [], contact: [] })
		})
	})

	describe("a mouse press that takes the focus from the field: the card waits for the press to end", () => {
		const namesake = { id: "5", name: "0xaaaa fan", address: "0xcccc" }
		const mounted: ReturnType<typeof mount>[] = []
		const mountAttached = (props: Record<string, unknown>) => {
			const w = mount(RecipientField, { props, global: { stubs: STUBS }, attachTo: document.body })
			mounted.push(w)
			return w
		}
		const press = (type: "pointerdown" | "pointerup" | "pointercancel", init: PointerEventInit = {}) =>
			document.body.dispatchEvent(
				new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ...init }),
			)
		/** The click a press's release delivers runs before the hold's release, which waits a task. */
		const afterRelease = async () => {
			vi.advanceTimersByTime(0)
			await nextTick()
		}
		const view = (w: ReturnType<typeof mount>) => (w.find('[data-testid="stub-card"]').exists() ? "card" : "input")
		const lastContact = (w: ReturnType<typeof mount>) => w.emitted("update:selectedContact")?.at(-1)?.[0]
		const suggested = (w: ReturnType<typeof mount>) => w.findAll('[data-testid="stub-avatar"]').map((a) => a.attributes("data-address"))
		const clickSuggestion = (w: ReturnType<typeof mount>, address: string) =>
			(w.get(`[data-testid="stub-avatar"][data-address="${address}"]`).element.parentElement as HTMLElement).click()
		const focused = async (props: Record<string, unknown>) => {
			const w = mountAttached(props)
			await w.get("input").trigger("focus")
			return w
		}

		beforeEach(() => {
			vi.useFakeTimers()
		})
		afterEach(() => {
			for (const w of mounted.splice(0)) w.unmount()
			document.body.innerHTML = ""
			vi.useRealTimers()
		})

		test("a blur during the press matches at once and keeps the input; the card shows once the press ends", async () => {
			const w = await focused({ candidates: [alice], searchTerm: alice.address })
			press("pointerdown")
			await w.get("input").trigger("blur")
			expect(lastContact(w)).toEqual(alice)
			expect(view(w)).toBe("input")
			press("pointerup")
			await nextTick()
			expect(view(w)).toBe("input")
			await afterRelease()
			expect(view(w)).toBe("card")
			expect(w.get('[data-testid="stub-card"]').attributes("data-address")).toBe(alice.address)
			expect(suggested(w)).toEqual([])
			expect(w.emitted("update:searchTerm")).toBeUndefined()
		})

		test("the click a release delivers outside the field ends the hold at its capture, before its target", async () => {
			const w = await focused({ candidates: [alice], searchTerm: alice.address })
			const outside = document.body.appendChild(document.createElement("button"))
			press("pointerdown")
			await w.get("input").trigger("blur")
			press("pointerup")
			outside.click()
			await nextTick()
			expect(view(w)).toBe("card")
			expect(vi.getTimerCount()).toBe(0)
		})

		test("a blur with no press shows the card at once", async () => {
			const w = await focused({ candidates: [alice], searchTerm: alice.address })
			await w.get("input").trigger("blur")
			expect(view(w)).toBe("card")
		})

		test("a right-button or touch press records nothing: the card shows at the blur", async () => {
			for (const init of [{ button: 2 }, { pointerType: "touch" }]) {
				const w = await focused({ candidates: [alice], searchTerm: alice.address })
				press("pointerdown", init)
				await w.get("input").trigger("blur")
				expect(view(w), JSON.stringify(init)).toBe("card")
				press("pointerup", init)
			}
		})

		test("the press lands on another suggestion it was held over, and that one is picked", async () => {
			const w = await focused({ candidates: [alice, namesake], searchTerm: alice.address })
			press("pointerdown")
			await w.get("input").trigger("blur")
			vi.advanceTimersByTime(1_500)
			await nextTick()
			expect(suggested(w)).toEqual([alice.address, namesake.address])
			press("pointerup")
			clickSuggestion(w, namesake.address)
			await afterRelease()
			expect(lastContact(w)).toEqual(namesake)
			expect(w.get('[data-testid="stub-card"]').attributes("data-address")).toBe(namesake.address)
		})

		test("a press inside the focused field holds nothing, and its suggestions stay", async () => {
			const w = await focused({ candidates: [alice, account1], searchTerm: "a" })
			press("pointerdown")
			press("pointerup")
			await afterRelease()
			expect(suggested(w)).toEqual([alice.address, account1.address])
			expect(w.emitted("update:selectedContact")).toBeUndefined()
		})

		test("the release of another pointer ends nothing; a cancelled press or a window blur ends the hold", async () => {
			const w = await focused({ candidates: [alice], searchTerm: alice.address })
			press("pointerdown")
			await w.get("input").trigger("blur")
			press("pointerup", { pointerId: 2 })
			await afterRelease()
			expect(view(w)).toBe("input")
			press("pointercancel")
			await afterRelease()
			expect(view(w)).toBe("card")

			const other = await focused({ candidates: [alice], searchTerm: alice.address })
			press("pointerdown")
			await other.get("input").trigger("blur")
			window.dispatchEvent(new Event("blur"))
			await afterRelease()
			expect(view(other)).toBe("card")
		})

		test("a second pointer never takes over the press holding the field", async () => {
			const w = await focused({ candidates: [alice], searchTerm: alice.address })
			press("pointerdown")
			await w.get("input").trigger("blur")
			press("pointerdown", { pointerId: 2, pointerType: "pen" })
			press("pointerup", { pointerId: 2, pointerType: "pen" })
			await afterRelease()
			expect(view(w)).toBe("input")
			press("pointerup")
			await afterRelease()
			expect(view(w)).toBe("card")
		})

		test("a press that starts before the last one's release ran keeps the field held until it ends", async () => {
			const w = await focused({ candidates: [alice], searchTerm: alice.address })
			press("pointerdown")
			await w.get("input").trigger("blur")
			press("pointerup")
			press("pointerdown", { pointerId: 2, pointerType: "pen" })
			await afterRelease()
			expect(view(w)).toBe("input")
			press("pointerup", { pointerId: 2, pointerType: "pen" })
			await afterRelease()
			expect(view(w)).toBe("card")
		})

		test("a refocus during the hold keeps the field editable, drops the blur's match and voids the queued release", async () => {
			const w = await focused({ candidates: [alice], searchTerm: alice.address })
			press("pointerdown")
			await w.get("input").trigger("blur")
			press("pointerup")
			await w.get("input").trigger("focus")
			await afterRelease()
			expect(view(w)).toBe("input")
			expect(lastContact(w)).toBeNull()
			expect(suggested(w)).toEqual([alice.address])

			// A newer hold outlives the voided release.
			press("pointerdown", { pointerId: 3 })
			await w.get("input").trigger("blur")
			await afterRelease()
			expect(view(w)).toBe("input")
			press("pointerup", { pointerId: 3 })
			await afterRelease()
			expect(view(w)).toBe("card")
		})

		test("an earlier blur's close timer never closes the suggestions a later held press needs", async () => {
			const w = await focused({ candidates: [alice, account1], searchTerm: "a" })
			await w.get("input").trigger("blur")
			await w.get("input").trigger("focus")
			press("pointerdown")
			await w.get("input").trigger("blur")
			vi.advanceTimersByTime(300)
			await nextTick()
			expect(suggested(w)).toEqual([alice.address, account1.address])
			press("pointerup")
			clickSuggestion(w, account1.address)
			await afterRelease()
			expect(lastContact(w)).toEqual(account1)
		})

		test("unmount removes every listener and timer", async () => {
			const add = [vi.spyOn(document, "addEventListener"), vi.spyOn(window, "addEventListener")]
			const remove = [vi.spyOn(document, "removeEventListener"), vi.spyOn(window, "removeEventListener")]
			const w = await focused({ candidates: [alice], searchTerm: alice.address })
			press("pointerdown")
			await w.get("input").trigger("blur")
			press("pointerup")
			w.unmount()
			mounted.splice(0)
			for (const [i, spy] of add.entries()) {
				const removed = remove[i].mock.calls.map(([type, fn]) => [type, fn])
				for (const [type, fn] of spy.mock.calls) expect(removed, String(type)).toContainEqual([type, fn])
			}
			expect(vi.getTimerCount()).toBe(0)
		})
	})
})
