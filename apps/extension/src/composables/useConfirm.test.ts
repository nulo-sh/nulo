/**
 * `requestConfirm` and `askConfirm` on the real stores and a mounted ConfirmPopup, bound as
 * PopupManager binds it;
 * then the static ban on opening the dialog any other way.
 */
import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { createPinia, type Pinia, setActivePinia } from "pinia"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { defineComponent, effectScope, h, ref } from "vue"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))

import ConfirmPopup from "@/components/ConfirmPopup.vue"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
import { GENERATED_TYPES, REPO_ROOT, sourceFiles, TEST_FILE } from "../../scripts/type-roles/source-scan"
import { useConfirm } from "./useConfirm"

const STUBS = {
	Popup: { props: ["show"], template: "<div v-if='show'><slot /></div>" },
	PopupCard: { template: "<div><slot /></div>" },
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i />" },
	Toggle: {
		props: ["modelValue"],
		emits: ["update:modelValue"],
		template: `<input type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" />`,
	},
	Input: {
		props: ["modelValue", "placeholder"],
		emits: ["update:modelValue"],
		setup(_props: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
			expose({ inputEl: { focus: () => undefined } })
			return {}
		},
		template: `<input data-testid="confirm-input" :placeholder="placeholder" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
	},
	Button: {
		props: ["type", "variant", "disabled"],
		emits: ["click"],
		template: `<button :data-type="type" :data-variant="variant" :disabled="disabled" @click="$emit('click')"><slot /></button>`,
	},
}

/** The dialog as PopupManager mounts it: shown while the popup store holds it, closed through it. */
const Manager = defineComponent(() => {
	const popupStore = usePopupStore()
	return () => h(ConfirmPopup, { show: popupStore.isOpened("confirm"), onOnClose: () => popupStore.close("confirm") })
})

let pinia: Pinia
let wrapper: VueWrapper

beforeEach(() => {
	pinia = createPinia()
	setActivePinia(pinia)
	wrapper = mount(Manager, { global: { plugins: [pinia], stubs: STUBS } })
})
afterEach(() => wrapper.unmount())

const text = (id: string) => wrapper.find(`[data-testid="${id}"]`).text()
const shown = () => usePopupStore().isOpened("confirm")
async function request(req: Parameters<ReturnType<typeof useConfirm>["requestConfirm"]>[0]) {
	useConfirm().requestConfirm(req)
	await flushPromises()
}

describe("useConfirm — what the dialog shows", () => {
	test("every field of a request reaches the dialog, the toggle bound to the caller's ref", async () => {
		const model = ref(false)
		await request({
			pre_title: "Running transactions",
			title: "Lock wallet?",
			description: "1 transaction is still running.",
			confirm_text: "Lock anyway",
			confirm_color: "red",
			confirm_variant: "destructive",
			confirmation_text: "LOCK",
			toggle: { label: "Forget the session", description: "Ask again next time", model },
		})

		expect(text("confirm-pre-title")).toBe("Running transactions")
		expect(text("confirm-title")).toBe("Lock wallet?")
		expect(text("confirm-description")).toBe("1 transaction is still running.")
		const submit = wrapper.find('[data-testid="confirm-submit"]')
		expect([submit.text(), submit.attributes("data-type"), submit.attributes("data-variant")]).toEqual([
			"Lock anyway",
			"red",
			"destructive",
		])
		expect(wrapper.text()).toContain("Forget the session")
		expect(wrapper.text()).toContain("Ask again next time")
		await wrapper.find('[data-testid="confirm-toggle"]').setValue(true)
		expect(model.value).toBe(true)
		expect(submit.attributes("disabled")).toBeDefined()
		expect(wrapper.find('[data-testid="confirm-input"]').attributes("placeholder")).toBe("LOCK")
		await wrapper.find('[data-testid="confirm-input"]').setValue("LOCK")
		expect(wrapper.find('[data-testid="confirm-submit"]').attributes("disabled")).toBeUndefined()
	})

	test("a later request replaces the whole slot: no key an earlier one set survives", async () => {
		await request({ single: true, pre_title: "Not encrypted", confirm_variant: "destructive", title: "Home is full" })

		await request({ title: "Delete this FPC?" })

		expect(useCacheStore().confirm).toEqual({ title: "Delete this FPC?" })
		expect(wrapper.find('[data-testid="confirm-cancel"]').exists()).toBe(true)
		expect(text("confirm-pre-title")).toBe("Action required")
		expect(wrapper.find('[data-testid="confirm-submit"]').attributes("data-variant")).toBeUndefined()
	})

	test("a request made while the dialog is open keeps it open, on top, showing only the new request", async () => {
		await request({ pre_title: "Running transactions", title: "Lock wallet?", single: true })
		usePopupStore().open("edit_contact")

		await request({ title: "Remove this token?" })

		const popups = usePopupStore()
		expect(shown()).toBe(true)
		expect(popups.popups.confirm?.order).toBe(popups.len - 1)
		expect(text("confirm-title")).toBe("Remove this token?")
		expect(text("confirm-pre-title")).toBe("Action required")
		expect(wrapper.find('[data-testid="confirm-cancel"]').exists()).toBe(true)
	})

	test("after a close, the next request renders", async () => {
		await request({ title: "Disable strict security?" })
		wrapper.find('[data-testid="confirm-cancel"]').trigger("click")
		await flushPromises()
		expect(shown()).toBe(false)

		await request({ title: "You already have this wallet" })

		expect(shown()).toBe(true)
		expect(text("confirm-title")).toBe("You already have this wallet")
	})

	test("the request is copied: an edit of the caller's object after the call never reaches the dialog", async () => {
		const req = { title: "Delete this sender?" }
		await request(req)
		req.title = "Changed"
		await flushPromises()
		expect(useCacheStore().confirm.title).toBe("Delete this sender?")
		expect(text("confirm-title")).toBe("Delete this sender?")
	})
})

describe("useConfirm — answering", () => {
	test("Confirm runs the callback once, then closes and clears the request", async () => {
		const callback = vi.fn(() => expect(shown()).toBe(true))
		await request({ title: "Delete chain?", callback })

		wrapper.find('[data-testid="confirm-submit"]').trigger("click")
		await flushPromises()

		expect(callback).toHaveBeenCalledOnce()
		expect(shown()).toBe(false)
		expect(useCacheStore().confirm).toEqual({})
	})

	test("Cancel runs nothing", async () => {
		const callback = vi.fn()
		await request({ title: "Disconnect all?", callback })

		wrapper.find('[data-testid="confirm-cancel"]').trigger("click")
		await flushPromises()

		expect(callback).not.toHaveBeenCalled()
		expect(shown()).toBe(false)
	})

	test("two users share one dialog and the later request wins", async () => {
		const lock = vi.fn()
		const remove = vi.fn()
		const first = useConfirm()
		const second = useConfirm()
		first.requestConfirm({ title: "Lock wallet?", callback: lock })
		second.requestConfirm({ title: "Remove this token?", callback: remove })
		await flushPromises()
		expect(text("confirm-title")).toBe("Remove this token?")

		wrapper.find('[data-testid="confirm-submit"]').trigger("click")
		await flushPromises()

		expect(remove).toHaveBeenCalledOnce()
		expect(lock).not.toHaveBeenCalled()
	})

	test("the store's state holds the request just made, not an earlier one", async () => {
		await request({ title: "First" })
		await request({ title: "Second" })
		expect((pinia.state.value.cache as { confirm: { title?: string } }).confirm.title).toBe("Second")
	})
})

describe("useConfirm — askConfirm", () => {
	function asker() {
		const scope = effectScope()
		const { askConfirm } = scope.run(() => useConfirm()) as ReturnType<typeof useConfirm>
		return { askConfirm, stop: () => scope.stop() }
	}
	const settled = <T>(p: Promise<T>) => Promise.race([p, flushPromises().then(() => "pending" as const)])

	test("Confirm answers true once, and the dialog closes", async () => {
		const answer = asker().askConfirm({ title: "Never lock automatically?" })
		await flushPromises()
		wrapper.find('[data-testid="confirm-submit"]').trigger("click")
		expect(await answer).toBe(true)
		await flushPromises()
		expect(shown()).toBe(false)
	})

	test("Cancel answers false", async () => {
		const answer = asker().askConfirm({ title: "Never lock automatically?" })
		await flushPromises()
		wrapper.find('[data-testid="confirm-cancel"]').trigger("click")
		expect(await answer).toBe(false)
	})

	test("a close from the store, as a lock's closeAll does, answers false", async () => {
		const answer = asker().askConfirm({ title: "Never lock automatically?" })
		await flushPromises()
		usePopupStore().closeAll()
		expect(await answer).toBe(false)
	})

	test("a later request answers the replaced ask false; Confirm then answers only the later one", async () => {
		const first = asker().askConfirm({ title: "Never lock automatically?" })
		const later = vi.fn()
		useConfirm().requestConfirm({ title: "Remove this token?", callback: later })
		expect(await first).toBe(false)
		await flushPromises()
		wrapper.find('[data-testid="confirm-submit"]').trigger("click")
		expect(later).toHaveBeenCalledOnce()
	})

	test("the asking scope's end answers false and closes the dialog it still shows", async () => {
		const { askConfirm, stop } = asker()
		const answer = askConfirm({ title: "Never lock automatically?" })
		await flushPromises()
		stop()
		expect(await answer).toBe(false)
		expect(shown()).toBe(false)
	})

	test("the asking scope's end leaves a dialog another request took over", async () => {
		const { askConfirm, stop } = asker()
		const answer = askConfirm({ title: "Never lock automatically?" })
		useConfirm().requestConfirm({ title: "Remove this token?" })
		expect(await answer).toBe(false)
		stop()
		await flushPromises()
		expect(text("confirm-title")).toBe("Remove this token?")
	})

	test("an ask after its scope ended answers false and opens nothing", async () => {
		const { askConfirm, stop } = asker()
		stop()
		expect(await askConfirm({ title: "Never lock automatically?" })).toBe(false)
		expect(shown()).toBe(false)
	})

	test("an open ask stays unanswered until the person answers", async () => {
		const answer = asker().askConfirm({ title: "Never lock automatically?" })
		expect(await settled(answer)).toBe("pending")
		expect(text("confirm-title")).toBe("Never lock automatically?")
	})
})

/**
 * The ban, read from each file's whole text so a call split across lines is seen: under `src/`,
 * outside tests and generated types, no assignment to `cacheStore.confirm` or a member of it (`=`,
 * `Object.assign`), and no `open("confirm")` with any quote, except ConfirmPopup's clear on close
 * and this helper. It cannot see the store bound under another name, a write through an alias of
 * the slot, or a `$patch`; those still fail the whole-object rule at review.
 */
describe("useConfirm — the only way to open the confirm dialog", () => {
	const SRC = "apps/extension/src"
	const FORMS = [
		/\b(?:cacheStore|useCacheStore\(\))\.confirm\b[\w.[\]"']*\s*=(?!=)/g,
		/Object\.assign\(\s*(?:cacheStore|useCacheStore\(\))\.confirm\b/g,
		/\bopen\(\s*["'`]confirm["'`]/g,
	]
	const ALLOWED: Record<string, RegExp> = {
		"composables/useConfirm.ts": /./,
		"components/ConfirmPopup.vue": /^\s*cacheStore\.confirm = \{\}\s*$/,
	}

	function offenses(source: string): Array<{ line: number; text: string }> {
		const lines = source.split("\n")
		return FORMS.flatMap((form) =>
			[...source.matchAll(form)].map((m) => {
				const line = source.slice(0, m.index).split("\n").length
				return { line, text: lines[line - 1] ?? "" }
			}),
		)
	}

	test("the scan sees each form it names, a call split across lines included, and lets reads pass", () => {
		const at = (source: string) => offenses(source).map((o) => o.line)
		expect(at(`cacheStore.confirm.title = "x"`)).toEqual([1])
		expect(at(`useCacheStore().confirm = {}`)).toEqual([1])
		expect(at(`x()\nObject.assign(\n\tcacheStore.confirm,\n\treq,\n)`)).toEqual([2])
		expect(at(`popupStore.open(\n\t"confirm",\n)`)).toEqual([1])
		expect(at(`if (cacheStore.confirm.callback === fn) close()\n<Toggle v-model="cacheStore.confirm.toggle.model"\n/>`)).toEqual([])
	})

	test("no source writes the slot or opens the dialog itself", () => {
		const offending: string[] = []
		for (const file of sourceFiles({ roots: [SRC], exts: ["ts", "js", "vue"], skip: [TEST_FILE, GENERATED_TYPES] })) {
			const rel = relative(SRC, file)
			for (const { line, text } of offenses(readFileSync(join(REPO_ROOT, file), "utf8"))) {
				if (!ALLOWED[rel]?.test(text)) offending.push(`${rel}:${line}`)
			}
		}
		expect(offending).toEqual([])
	})
})
