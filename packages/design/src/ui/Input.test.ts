import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { defineComponent, h, nextTick, ref } from "vue"
import Input from "./Input.vue"

const STUBS = {
	Flex: { template: '<div :class="$attrs.class"><slot /></div>', inheritAttrs: false },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
	Tooltip: { template: '<span><slot /><slot name="content" /></span>' },
}

const mountInput = (props: Record<string, unknown> = {}, slots: Record<string, string> = {}) =>
	mount(Input, {
		props: { placeholder: "Type something", ...props },
		slots,
		global: { stubs: STUBS },
	})

describe("Input", () => {
	test("renders a native <input> with the given placeholder", () => {
		const input = mountInput({ placeholder: "Enter name" }).find("input")
		expect(input.exists()).toBe(true)
		expect(input.attributes("placeholder")).toBe("Enter name")
	})

	test("modelValue prop sets the initial input value", () => {
		const input = mountInput({ modelValue: "hello" }).find("input").element as HTMLInputElement
		expect(input.value).toBe("hello")
	})

	test("emits update:modelValue when the user types", async () => {
		const w = mountInput()
		await w.find("input").setValue("typed")
		const emits = w.emitted("update:modelValue")
		expect(emits?.[emits.length - 1]).toEqual(["typed"])
	})

	test("emits focus + blur events", async () => {
		const w = mountInput()
		await w.find("input").trigger("focus")
		await w.find("input").trigger("blur")
		expect(w.emitted("focus")).toHaveLength(1)
		expect(w.emitted("blur")).toHaveLength(1)
	})

	test("renders the label when label prop is set", () => {
		expect(mountInput({ label: "Profile name" }).text()).toContain("Profile name")
	})

	test("error prop applies the error CSS-module class", () => {
		expect(mountInput({ error: true }).html()).toMatch(/error/)
	})

	test("disabled prop applies the disabled class", () => {
		expect(mountInput({ disabled: true }).html()).toMatch(/disabled/)
	})

	test("size prop applies the matching size class", () => {
		expect(mountInput({ size: "small" }).html()).toMatch(/small/)
	})

	test("inputTestid names the native <input> while a data-testid stays on the root", () => {
		const w = mount(Input, {
			props: { placeholder: "Type something", inputTestid: "native-id" },
			attrs: { "data-testid": "root-id" },
			global: { stubs: { ...STUBS, Flex: { template: "<div><slot /></div>" } } },
		})
		expect(w.attributes("data-testid")).toBe("root-id")
		expect(w.get("input").attributes("data-testid")).toBe("native-id")
		expect(mountInput().get("input").attributes("data-testid")).toBeUndefined()
	})

	test("the combo box attributes land on the native <input>, and none is set when not given", async () => {
		const w = mountInput({
			role: "combobox",
			ariaLabelledby: "label-1",
			ariaExpanded: false,
			ariaAutocomplete: "list",
			ariaActivedescendant: "opt-2",
			ariaControls: "list-1",
		})
		const attributes = {
			role: "combobox",
			"aria-labelledby": "label-1",
			"aria-expanded": "false",
			"aria-autocomplete": "list",
			"aria-activedescendant": "opt-2",
			"aria-controls": "list-1",
		}
		expect(w.get("input").attributes()).toMatchObject(attributes)
		await w.setProps({ ariaExpanded: true })
		expect(w.get("input").attributes("aria-expanded")).toBe("true")

		const bare = mountInput().get("input").attributes()
		for (const name of Object.keys(attributes)) expect(bare[name], name).toBeUndefined()
	})

	test.each([
		[undefined, "type--input"],
		["input-data", "type--input-data"],
	])("textVariant %s puts %s on the native <input>", (textVariant, role) => {
		expect(mountInput({ textVariant }).get("input").classes()).toEqual([role])
	})

	test("type prop maps to the native input type", () => {
		expect(mountInput({ type: "password" }).find("input").attributes("type")).toBe("password")
	})

	test("default type is text when no type prop is given", () => {
		expect(mountInput().find("input").attributes("type")).toBe("text")
	})

	test("clearable + non-empty value shows a clear icon that emits clear+blur on click", async () => {
		const w = mountInput({ clearable: true, modelValue: "something" })
		const clearIcon = w.find('[data-name="close"]')
		expect(clearIcon.exists()).toBe(true)
		await clearIcon.trigger("click")
		expect(w.emitted("clear")).toHaveLength(1)
		expect(w.emitted("blur")).toHaveLength(1)
	})

	test("clearable + empty value does NOT show the clear icon", () => {
		expect(mountInput({ clearable: true }).find('[data-name="close"]').exists()).toBe(false)
	})

	test("icon prop renders an Icon stub at the leading position", () => {
		expect(mountInput({ icon: "search" }).findAll('[data-name="search"]').length).toBeGreaterThan(0)
	})

	test("leftText prop renders a prefix label inline with the input", () => {
		expect(mountInput({ leftText: "0x" }).text()).toContain("0x")
	})

	test("maxLength caps the value to the given length", async () => {
		const w = mountInput({ maxLength: 5 })
		await w.find("input").setValue("123456789")
		const emits = w.emitted("update:modelValue")
		expect(emits?.[emits.length - 1]).toEqual(["12345"])
	})

	test("normalize decides what the field keeps and emits, in place of sanitize's filter", async () => {
		const w = mountInput({ sanitize: true, normalize: (text: string) => text.toUpperCase().replace(/\s+/g, "_") })
		await w.find("input").setValue("a b!")
		expect(w.emitted("update:modelValue")?.at(-1)).toEqual(["A_B!"])
		expect((w.find("input").element as HTMLInputElement).value).toBe("A_B!")
	})

	test("a paste is normalized before maxLength cuts it", () => {
		const w = mountInput({ maxLength: 3, normalize: (text: string) => text.replace(/_/g, "") })
		const paste = new Event("paste", { cancelable: true }) as Event & { clipboardData: unknown }
		paste.clipboardData = { getData: () => "_a_b_c_d" }
		w.find("input").element.dispatchEvent(paste)
		expect(w.emitted("update:modelValue")?.at(-1)).toEqual(["abc"])
	})

	test("a paste over a selection replaces it, normalized, and leaves the caret after the pasted text", async () => {
		const w = mountInput({ maxLength: 10, normalize: (text: string) => text.replace(/_/g, "") })
		const el = w.find("input").element as HTMLInputElement
		await w.find("input").setValue("Alxxce")
		el.setSelectionRange(2, 4)
		const paste = new Event("paste", { cancelable: true }) as Event & { clipboardData: unknown }
		paste.clipboardData = { getData: () => "_i_" }
		el.dispatchEvent(paste)
		await nextTick()
		expect(el.value).toBe("Alice")
		expect([el.selectionStart, el.selectionEnd]).toEqual([3, 3])
	})

	test("maxLength reaching the limit emits maxLengthReached(true)", async () => {
		const w = mountInput({ maxLength: 3 })
		await w.find("input").setValue("abc")
		const emits = w.emitted("maxLengthReached")
		expect(emits?.[emits.length - 1]).toEqual([true])
	})

	// A host passes `#right` only while its message shows, as every capped name field does.
	const Host = defineComponent({
		props: { duplicate: { type: Boolean, default: false } },
		setup(props) {
			return () =>
				h(
					Input,
					{ label: "Name", placeholder: "Name", maxLength: 3 },
					props.duplicate ? { right: () => h("span", { "data-testid": "duplicate" }, "Already exist") } : {},
				)
		},
	})
	const mountHost = () => mount(Host, { global: { stubs: STUBS } })
	const shows = (w: ReturnType<typeof mountHost>) => ({
		duplicate: w.find('[data-testid="duplicate"]').exists(),
		note: w.text().includes("Maximum length reached"),
	})

	test("at the cap the caller's message shows and the length note does not; when the message goes, the note takes the slot", async () => {
		const w = mountHost()
		await w.setProps({ duplicate: true })
		await w.find("input").setValue("abc")
		expect(shows(w)).toEqual({ duplicate: true, note: false })
		await w.setProps({ duplicate: false })
		expect(shows(w)).toEqual({ duplicate: false, note: true })
		await w.setProps({ duplicate: true })
		expect(shows(w)).toEqual({ duplicate: true, note: false })
	})

	test("below the cap the caller's message shows and no note; with no message, nothing", async () => {
		const w = mountHost()
		await w.setProps({ duplicate: true })
		await w.find("input").setValue("ab")
		expect(shows(w)).toEqual({ duplicate: true, note: false })
		await w.setProps({ duplicate: false })
		expect(shows(w)).toEqual({ duplicate: false, note: false })
	})

	test("a right slot that renders only a comment counts as empty: at the cap the note shows", async () => {
		const w = mountInput({ label: "Name", maxLength: 3 }, { right: '<span v-if="false">Already exist</span>' })
		await w.find("input").setValue("abc")
		expect(w.text()).toContain("Maximum length reached")
		expect(w.text()).not.toContain("Already exist")
	})

	describe("subtype='int' takes digits and refuses any other edit whole", () => {
		// Bound with v-model as a page binds it, so the field shows what the round trip writes back.
		const IntHost = defineComponent({
			props: { initial: { type: String, default: "" } },
			setup(props, { expose }) {
				const model = ref<string | number>(props.initial)
				expose({ write: (value: string) => (model.value = value) })
				return () =>
					h(Input, {
						type: "text",
						subtype: "int",
						placeholder: "30",
						modelValue: model.value,
						"onUpdate:modelValue": (value: string | number) => {
							model.value = value
						},
					})
			},
		})
		const mountInt = (initial: string) => {
			const w = mount(IntHost, { props: { initial }, global: { stubs: STUBS } })
			const el = w.get("input").element as HTMLInputElement
			const emitted = () => w.getComponent(Input).emitted("update:modelValue")
			// The Flex stub keeps only `class`, so the error state is read as the existing error-prop test reads it.
			const refused = () => el.getAttribute("aria-invalid") === "true" && /error/.test(w.html())
			const state = () => ({ value: el.value, selection: [el.selectionStart, el.selectionEnd] })
			return { w, el, emitted, refused, state }
		}
		/** One edit as a browser raises it: `beforeinput` on the text as it stands, the new text, `input`. */
		async function edit(
			w: ReturnType<typeof mountInt>,
			value: string,
			caret: number,
			inputType = "insertText",
			data: string | null = null,
		) {
			await w.w.get("input").trigger("beforeinput", { inputType, data })
			w.el.value = value
			w.el.setSelectionRange(caret, caret)
			await w.w.get("input").trigger("input", { inputType, data })
		}

		test("e typed between 1 and 5 keeps 15 and the caret, emits nothing and shows the error state", async () => {
			const f = mountInt("15")
			f.el.setSelectionRange(1, 1)
			await edit(f, "1e5", 2, "insertText", "e")
			expect([f.state(), f.emitted(), f.refused()]).toEqual([{ value: "15", selection: [1, 1] }, undefined, true])
		})

		test("a digit typed after a refused key is taken where the caret stayed, and the error state goes", async () => {
			const f = mountInt("15")
			f.el.setSelectionRange(1, 1)
			await edit(f, "1e5", 2, "insertText", "e")
			await edit(f, "135", 2, "insertText", "3")
			expect([f.el.value, f.emitted()?.at(-1), f.refused()]).toEqual(["135", [135], false])
		})

		test("3e0 put over a selected 30 keeps 30 with the same selection", async () => {
			const f = mountInt("30")
			f.el.setSelectionRange(0, 2)
			await edit(f, "3e0", 3, "insertFromPaste")
			expect([f.state(), f.emitted()]).toEqual([{ value: "30", selection: [0, 2] }, undefined])
		})

		test("an input no beforeinput announced, putting in a non-digit, restores the bound value", async () => {
			const f = mountInt("30")
			f.el.value = "3x0"
			await f.w.get("input").trigger("input")
			expect([f.state(), f.emitted(), f.refused()]).toEqual([{ value: "30", selection: [2, 2] }, undefined, true])
		})

		test("a value the caller writes clears the error state, and a refusal after it restores that value", async () => {
			const f = mountInt("15")
			f.el.setSelectionRange(2, 2)
			await edit(f, "15e", 3, "insertText", "e")
			;(f.w.vm as unknown as { write: (v: string) => void }).write("45")
			await nextTick()
			expect([f.el.value, f.refused()]).toEqual(["45", false])
			f.el.setSelectionRange(2, 2)
			await edit(f, "45-", 3, "insertText", "-")
			expect([f.el.value, f.emitted(), f.refused()]).toEqual(["45", undefined, true])
		})

		test("an open composition is not judged; the input Vue re-fires as it ends is", async () => {
			const f = mountInt("15")
			f.el.value = "15\uff15"
			await f.w.get("input").trigger("input", { inputType: "insertCompositionText", data: "\uff15", isComposing: true })
			expect([f.el.value, f.emitted()]).toEqual(["15\uff15", undefined])
			await f.w.get("input").trigger("input")
			expect([f.el.value, f.emitted(), f.refused()]).toEqual(["15", undefined, true])
		})

		test("a digit typed after a shown 1.5 the caller wrote is taken, and parsed from its digits", async () => {
			const f = mountInt("1.5")
			f.el.setSelectionRange(3, 3)
			await edit(f, "1.52", 4, "insertText", "2")
			expect([f.el.value, f.emitted()?.at(-1), f.refused()]).toEqual(["152", [152], false])
		})

		/** A Delete at the end of the text: the browser raises `beforeinput` and, with nothing to delete, no `input`. */
		async function noOpDelete(f: ReturnType<typeof mountInt>) {
			f.el.setSelectionRange(f.el.value.length, f.el.value.length)
			await f.w.get("input").trigger("beforeinput", { inputType: "deleteContentForward" })
		}
		/** A composition committed over the whole text; Vue re-fires `input` as it ends. */
		async function composeOverAll(f: ReturnType<typeof mountInt>, value: string) {
			f.el.setSelectionRange(0, f.el.value.length)
			f.el.value = value
			await f.w.get("input").trigger("input", { inputType: "insertCompositionText", isComposing: true })
			await f.w.get("input").trigger("input")
		}

		test.each([
			[
				"a composition after a no-op Delete",
				(f: ReturnType<typeof mountInt>) => noOpDelete(f).then(() => composeOverAll(f, "\uff13\uff15")),
			],
			[
				"an unannounced insertion after a no-op Delete",
				async (f: ReturnType<typeof mountInt>) => {
					await noOpDelete(f)
					f.el.value = "1.5"
					await f.w.get("input").trigger("input", { inputType: "insertText" })
				},
			],
			["a drop placed away from the recorded caret", (f: ReturnType<typeof mountInt>) => edit(f, "3e90", 4, "insertFromDrop")],
		])("%s, putting in a non-digit, is refused", async (_name, act) => {
			const f = mountInt("30")
			f.el.setSelectionRange(2, 2)
			await act(f)
			expect([f.el.value, f.emitted(), f.refused()]).toEqual(["30", undefined, true])
		})

		test("a caller's write ends a left-over record, so a refusal after it restores the written value", async () => {
			const f = mountInt("30")
			await noOpDelete(f)
			;(f.w.vm as unknown as { write: (v: string) => void }).write("45")
			await nextTick()
			await composeOverAll(f, "\uff14\uff15")
			expect([f.el.value, f.emitted(), f.refused()]).toEqual(["45", undefined, true])
		})

		test("a Backspace after a caller's 1.5 is taken, and parsed from its digits", async () => {
			const f = mountInt("1.5")
			f.el.setSelectionRange(3, 3)
			await edit(f, "1.", 2, "deleteContentBackward")
			expect([f.el.value, f.emitted()?.at(-1), f.refused()]).toEqual(["1", [1], false])
		})

		test("leaving the field ends the error state", async () => {
			const f = mountInt("15")
			f.el.setSelectionRange(2, 2)
			await edit(f, "15e", 3, "insertText", "e")
			await f.w.get("input").trigger("blur")
			expect(f.refused()).toBe(false)
		})

		test("plain digits are taken: shown and emitted", async () => {
			const f = mountInt("")
			await edit(f, "12", 2, "insertText", "2")
			expect([f.el.value, f.emitted()?.at(-1), f.refused()]).toEqual(["12", [12], false])
		})
	})

	test("(oddity) exposes inputEl + focus via defineExpose", () => {
		const vm = mountInput().vm as { focus?: unknown; inputEl?: unknown }
		expect(vm.focus).toBeTypeOf("function")
		expect("inputEl" in vm).toBe(true)
	})
})
