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
import { Input } from "@nulo/design"
import AddressInput from "@/components/composite/general/AddressInput.vue"
import RecipientCard from "@/components/composite/send/RecipientCard.vue"
import RecipientField from "./RecipientField.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>", props: ["color", "noWrap", "align", "selectable"] },
	Icon: { template: '<i data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color", "scale"] },
	AddressInput: {
		template: `<div class="stub-input"><input :value="modelValue" :aria-activedescendant="ariaActivedescendant" :aria-controls="ariaControls" @focus="$emit('focus')" @blur="$emit('blur')" /><slot name="suffix" /></div>`,
		props: ["modelValue", "placeholder", "autofocus", "ariaActivedescendant", "ariaControls"],
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
		methods: { focusChange() {} },
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

	describe("the field keeps no bidi control or zero-width character", () => {
		const address = `0x2${"a".repeat(63)}`
		const zwsp = String.fromCodePoint(0x200b)
		const rlo = String.fromCodePoint(0x202e)
		const mounted: ReturnType<typeof mount>[] = []
		const real = (props: Record<string, unknown>) => {
			const global = { components: { AddressInput, Input }, stubs: { ...STUBS, AddressInput: false } }
			const w = mount(RecipientField, { props, global, attachTo: document.body })
			mounted.push(w)
			return w
		}
		const typeAndLeave = async (w: ReturnType<typeof mount>, text: string) => {
			const input = w.get("input")
			await input.trigger("focus")
			await input.setValue(text)
			await input.trigger("blur")
			vi.advanceTimersByTime(250)
			await nextTick()
			return input.element as HTMLInputElement
		}
		const hint = (w: ReturnType<typeof mount>) => w.find('[data-testid="recipient-invalid-hint"]').exists()

		beforeEach(() => {
			vi.useFakeTimers()
		})
		afterEach(() => {
			for (const w of mounted.splice(0)) w.unmount()
			vi.useRealTimers()
		})

		test("an address pasted with a zero-width space after it reads as the address, and leaving it shows no hint", async () => {
			const w = real({ candidates: [] })
			const input = await typeAndLeave(w, `${address}${zwsp}`)
			expect(w.emitted("update:searchTerm")?.at(-1)).toEqual([address])
			expect(input.value).toBe(address)
			expect(hint(w)).toBe(false)
		})

		test("an address with a visible wrong character stays as typed, and leaving it shows the hint", async () => {
			const typed = `${address.slice(0, -1)}g`
			const w = real({ candidates: [] })
			const input = await typeAndLeave(w, typed)
			expect(w.emitted("update:searchTerm")?.at(-1)).toEqual([typed])
			expect(input.value).toBe(typed)
			expect(hint(w)).toBe(true)
		})

		test("a saved address pasted inside a bidi override is picked when the field is left", async () => {
			const bob = { id: "7", name: "Bob", address }
			const w = real({ candidates: [bob] })
			await typeAndLeave(w, `${rlo}${address}${zwsp}`)
			expect(w.emitted("update:selectedContact")?.at(-1)).toEqual([bob])
		})
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

		/** Picks the first suggestion with the real card mounted, and lets the card render. */
		const pickWithCard = async (how: "Enter" | "click") => {
			const { RecipientCard: _stub, ...stubs } = STUBS
			const w = mount(RecipientField, {
				props: { candidates: [alice, account1], searchTerm: "a" },
				global: { stubs, components: { RecipientCard } },
				attachTo: document.body,
			})
			mounted.push(w)
			w.get("input").element.focus()
			await nextTick()
			if (how === "Enter") w.get("input").element.dispatchEvent(enter())
			else await w.get('[role="option"]').trigger("click")
			await nextTick()
			await nextTick()
			expect(w.find('[data-testid="recipient-card"]').exists()).toBe(true)
		}

		test.each([
			["an Enter pick moves the focus to the card's Change recipient", "Enter", "recipient-card-change"],
			["a click pick leaves the focus where the removed field had it", "click", undefined],
		] as const)("%s", async (_, how, focused) => {
			await pickWithCard(how)
			expect(document.activeElement?.getAttribute("data-testid") ?? undefined).toBe(focused)
		})

		test("the pick's auto-repeat on Change is refused, so a held Enter picks once; a new press is not", async () => {
			await pickWithCard("Enter")
			const repeat = enter({ repeat: true })
			const press = enter()
			document.activeElement?.dispatchEvent(repeat)
			document.activeElement?.dispatchEvent(press)
			expect([repeat.defaultPrevented, press.defaultPrevented]).toEqual([true, false])
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

	describe("the suggestions are a listbox Down and Up move through", () => {
		const mounted: ReturnType<typeof mount>[] = []
		const open = async (props: Record<string, unknown> = { candidates: [alice, account1], searchTerm: "a" }) => {
			const w = mount(RecipientField, { props, global: { stubs: STUBS }, attachTo: document.body })
			mounted.push(w)
			await w.get("input").trigger("focus")
			return w
		}
		const press = async (w: ReturnType<typeof mount>, key: string, init: KeyboardEventInit = {}) => {
			const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
			w.get("input").element.dispatchEvent(e)
			await nextTick()
			return e.defaultPrevented
		}
		const field = (w: ReturnType<typeof mount>) => w.get("input").attributes()
		const options = (w: ReturnType<typeof mount>) => w.findAll('[role="option"]')
		const highlighted = (w: ReturnType<typeof mount>) => {
			const id = field(w)["aria-activedescendant"]
			const selected = options(w).flatMap((o, i) => (o.attributes("aria-selected") === "true" ? [i] : []))
			return { index: options(w).findIndex((o) => o.attributes("id") === id), selected }
		}
		let scrolled: Element[]

		beforeEach(() => {
			scrolled = []
			Element.prototype.scrollIntoView = vi.fn(function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
				expect(arg).toEqual({ block: "nearest" })
				scrolled.push(this)
			})
		})
		afterEach(() => {
			for (const w of mounted.splice(0)) w.unmount()
			document.body.innerHTML = ""
			Reflect.deleteProperty(Element.prototype, "scrollIntoView")
		})

		test("a named listbox the field controls; nothing is highlighted, and no row is a Tab stop", async () => {
			const w = await open()
			const list = w.get('[data-testid="send-destination-suggestions"]')
			expect(list.attributes("role")).toBe("listbox")
			expect(field(w)["aria-controls"]).toBe(list.attributes("id"))
			expect(document.getElementById(list.attributes("aria-labelledby") ?? "")?.textContent).toBe("Recipient Address")
			expect(list.attributes("tabindex")).toBe("-1")
			expect(options(w)).toHaveLength(2)
			for (const o of options(w)) expect(o.attributes("tabindex")).toBeUndefined()
			for (const a of w.findAll('[data-testid="stub-avatar"]')) expect(a.attributes("aria-hidden")).toBe("true")
			expect(new Set(options(w).map((o) => o.attributes("id"))).size).toBe(2)
			expect(highlighted(w)).toEqual({ index: -1, selected: [] })
		})

		test("Down starts at the first row and Up at the last; both wrap, and the row scrolls into view", async () => {
			const w = await open()
			const steps: number[] = []
			for (const key of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp"]) {
				expect(await press(w, key), key).toBe(true)
				const { index, selected } = highlighted(w)
				expect(selected).toEqual([index])
				expect(scrolled.at(-1)).toBe(options(w)[index].element)
				steps.push(index)
			}
			expect(steps).toEqual([0, 1, 0, 1])

			const up = await open()
			await press(up, "ArrowUp")
			expect(highlighted(up).index).toBe(1)
		})

		test("Enter picks the highlighted row, and is marked handled", async () => {
			const w = await open()
			await press(w, "ArrowUp")
			expect(await press(w, "Enter")).toBe(true)
			expect(w.emitted("update:searchTerm")?.at(-1)).toEqual([account1.address])
			expect(w.emitted("update:selectedContact")?.at(-1)).toEqual([account1])
		})

		test("the field is a combo box named by the list's visible label, expanded exactly while its list is open", async () => {
			const real = async (props: Record<string, unknown>) => {
				const global = { components: { AddressInput, Input }, stubs: { ...STUBS, AddressInput: false } }
				const w = mount(RecipientField, { props, global, attachTo: document.body })
				mounted.push(w)
				await w.get("input").trigger("focus")
				return w
			}
			const combo = (w: ReturnType<typeof mount>) => {
				const { role, "aria-autocomplete": autocomplete, "aria-expanded": expanded, "aria-labelledby": by } = field(w)
				return { role, autocomplete, expanded, label: w.get(`[id="${by}"]`).text(), list: w.find('[role="listbox"]').exists() }
			}
			const closed = { role: "combobox", autocomplete: "list", expanded: "false", label: "Recipient Address", list: false }
			const opened = { ...closed, expanded: "true", list: true }
			expect(combo(await real({ candidates: [alice, account1], searchTerm: "" }))).toEqual(closed)

			const w = await real({ candidates: [alice, account1], searchTerm: "a" })
			expect(combo(w)).toEqual(opened)
			expect(field(w)["aria-labelledby"]).toBe(w.get('[role="listbox"]').attributes("aria-labelledby"))
			await press(w, "ArrowDown")
			expect(combo(w)).toEqual(opened)
			await press(w, "Escape")
			expect(combo(w)).toEqual(closed)
		})

		test("Escape closes the list until the next input; with the list closed it is left unhandled", async () => {
			const w = await open()
			await press(w, "ArrowDown")
			expect(await press(w, "Escape")).toBe(true)
			expect(w.find('[role="listbox"]').exists()).toBe(false)
			expect(field(w)["aria-controls"]).toBeUndefined()
			expect(field(w)["aria-activedescendant"]).toBeUndefined()
			expect(await press(w, "Escape")).toBe(false)
			expect(await press(w, "ArrowDown")).toBe(false)
			expect(await press(w, "Enter")).toBe(false)
			expect(w.emitted("update:selectedContact")).toBeUndefined()

			await w.setProps({ searchTerm: "acc" })
			expect(options(w)).toHaveLength(1)
			expect(highlighted(w).index).toBe(-1)
		})

		test("the highlight follows its row through a new list, and goes when the row does", async () => {
			const w = await open()
			await press(w, "ArrowUp")
			const abe = { id: "6", name: "Abe", address: "0xdddd" }
			await w.setProps({ candidates: [abe, alice, account1] })
			expect(highlighted(w)).toEqual({ index: 2, selected: [2] })
			await press(w, "Enter")
			expect(w.emitted("update:selectedContact")?.at(-1)).toEqual([account1])

			const next = await open()
			await press(next, "ArrowUp")
			await next.setProps({ searchTerm: "al" })
			expect(highlighted(next)).toEqual({ index: -1, selected: [] })
			await press(next, "ArrowDown")
			expect(highlighted(next).index).toBe(0)
		})

		test("a composing key moves nothing and closes nothing", async () => {
			const w = await open()
			expect(await press(w, "ArrowDown", { isComposing: true })).toBe(false)
			expect(await press(w, "Escape", { keyCode: 229 })).toBe(false)
			expect(highlighted(w).index).toBe(-1)
			expect(w.find('[role="listbox"]').exists()).toBe(true)
		})

		describe("a long list draws the first 50 matches, and says how many more match", () => {
			const SHOWN = 50
			const contacts = Array.from({ length: SHOWN + 1_001 }, (_, i) => ({
				id: `c${i}`,
				name: `Contact ${String(i).padStart(5, "0")}`,
				address: `0x${(i + 1).toString(16).padStart(64, "0")}`,
			}))
			const MORE = "Keep typing to narrow 1,001 more matches."
			const capped = (searchTerm = "contact", candidates: unknown[] = contacts) => open({ candidates, searchTerm })
			const line = (w: ReturnType<typeof mount>) => w.find('[data-testid="send-destination-more"]')
			const status = (w: ReturnType<typeof mount>) => w.get('[data-testid="send-destination-more-live"]').text()
			const early = { id: "early", name: "Contact early", address: `0x${"e".repeat(64)}` }

			test("the listbox holds 50 options and nothing else; the line under it and the status name the rest", async () => {
				const w = await capped("")
				const live = w.get('[data-testid="send-destination-more-live"]')
				expect(live.attributes()).toMatchObject({ role: "status", "aria-live": "polite", "aria-atomic": "true" })
				expect(live.text()).toBe("")

				await w.setProps({ searchTerm: "contact" })
				const list = w.get('[role="listbox"]').element
				expect([...list.children].map((c) => c.getAttribute("role"))).toEqual(Array(SHOWN).fill("option"))
				expect(w.findAll('[data-testid="stub-avatar"]').map((a) => a.attributes("data-address"))).toEqual(
					contacts.slice(0, SHOWN).map((c) => c.address),
				)
				expect(line(w).text()).toBe(MORE)
				expect(line(w).attributes("aria-hidden")).toBe("true")
				expect(list.contains(line(w).element)).toBe(false)
				expect(w.get('[data-testid="send-destination-popover"]').element.contains(line(w).element)).toBe(true)
				expect(live.text()).toBe(MORE)
			})

			test("one match past the cap is one more match; at 50 or fewer, or once closed, no line and an empty status", async () => {
				const one = await capped("contact", contacts.slice(0, SHOWN + 1))
				expect([line(one).text(), status(one)]).toEqual(Array(2).fill("Keep typing to narrow 1 more match."))

				const full = await capped("contact", contacts.slice(0, SHOWN))
				expect(options(full)).toHaveLength(SHOWN)
				expect([line(full).exists(), status(full)]).toEqual([false, ""])

				const narrowed = await capped()
				await narrowed.setProps({ searchTerm: "contact 0000" })
				expect(options(narrowed)).toHaveLength(10)
				expect([line(narrowed).exists(), status(narrowed)]).toEqual([false, ""])

				const closed = await capped()
				expect(status(closed)).toBe(MORE)
				await press(closed, "Escape")
				expect([line(closed).exists(), status(closed)]).toEqual([false, ""])
			})

			test("Up from no highlight goes to the last drawn row and scrolls it into view; Down wraps; Enter picks it", async () => {
				const w = await capped()
				await press(w, "ArrowUp")
				expect(highlighted(w)).toEqual({ index: SHOWN - 1, selected: [SHOWN - 1] })
				expect(scrolled.at(-1)).toBe(options(w)[SHOWN - 1].element)
				await press(w, "ArrowDown")
				expect(highlighted(w).index).toBe(0)
				await press(w, "ArrowUp")
				expect(await press(w, "Enter")).toBe(true)
				expect(w.emitted("update:selectedContact")?.at(-1)).toEqual([contacts[SHOWN - 1]])
			})

			test("a highlight new candidates push past the cap is gone, and Enter picks nothing until an arrow or a keystroke", async () => {
				const w = await capped()
				await press(w, "ArrowUp")
				await w.setProps({ candidates: [early, ...contacts] })
				expect(highlighted(w)).toEqual({ index: -1, selected: [] })
				expect(await press(w, "Enter")).toBe(true)
				expect(w.emitted("update:selectedContact")).toBeUndefined()
				await press(w, "ArrowDown")
				await press(w, "Enter")
				expect(w.emitted("update:selectedContact")?.at(-1)).toEqual([early])

				const typed = await capped()
				await press(typed, "ArrowUp")
				await typed.setProps({ candidates: [early, ...contacts] })
				await typed.setProps({ searchTerm: "contact ear" })
				await press(typed, "Enter")
				expect(typed.emitted("update:selectedContact")?.at(-1)).toEqual([early])
			})
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

		test("text that is no address shows the hint once the press that took the focus ends, and after a Tab out", async () => {
			const hint = (w: ReturnType<typeof mount>) => w.find('[data-testid="recipient-invalid-hint"]').exists()
			const w = await focused({ candidates: [], searchTerm: "0xbad" })
			press("pointerdown")
			await w.get("input").trigger("blur")
			expect(hint(w)).toBe(false)
			press("pointerup")
			await afterRelease()
			expect(hint(w)).toBe(true)

			const tabbed = await focused({ candidates: [], searchTerm: "0xbad" })
			await tabbed.get("input").trigger("blur")
			expect(hint(tabbed)).toBe(false)
			vi.advanceTimersByTime(250)
			await nextTick()
			expect(hint(tabbed)).toBe(true)
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

		test("a list that changes under a held press never rebinds the pressed row to another destination", async () => {
			const own = { name: "Account 1", address: `0x${"b".repeat(64)}` }
			const w = await focused({ candidates: [own], searchTerm: "acc" })
			const pressed = w.get('[role="option"]').element as HTMLElement
			press("pointerdown")
			await w.get("input").trigger("blur")
			await w.setProps({ candidates: [{ id: "9", name: "Acc contact", address: `0x${"9".repeat(64)}` }, own] })
			press("pointerup")
			pressed.click()
			await afterRelease()
			expect(lastContact(w)).toEqual(own)
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
