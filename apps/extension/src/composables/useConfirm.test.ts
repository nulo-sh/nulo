/**
 * `requestConfirm` on the real stores and a mounted ConfirmPopup, bound as PopupManager binds it;
 * then the static ban on opening the dialog any other way.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { createPinia, type Pinia, setActivePinia } from "pinia"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { defineComponent, h, ref } from "vue"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))

import ConfirmPopup from "@/popup/components/popups/ConfirmPopup.vue"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
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

/**
 * The ban, read from source text: under `src/`, outside tests and generated types, no assignment
 * to `cacheStore.confirm` or a member of it (`=`, `Object.assign`), and no `open("confirm")` with
 * any quote, except ConfirmPopup's clear on close and this helper. It cannot see a write through an
 * alias of the slot or a `$patch`; those still fail the whole-object rule at review.
 */
describe("useConfirm — the only way to open the confirm dialog", () => {
	const SRC = join(__dirname, "..")
	const WRITE =
		/\b(?:cacheStore|useCacheStore\(\))\.confirm\b[\w.[\]"']*\s*=(?!=)|Object\.assign\(\s*(?:cacheStore|useCacheStore\(\))\.confirm\b/
	const OPEN = /\bopen\(\s*["'`]confirm["'`]/
	const ALLOWED: Record<string, RegExp> = {
		"composables/useConfirm.ts": /./,
		"popup/components/popups/ConfirmPopup.vue": /^\s*cacheStore\.confirm = \{\}\s*$/,
	}

	function sources(dir: string, out: string[] = []): string[] {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name)
			if (statSync(full).isDirectory()) sources(full, out)
			else if (/\.(ts|js|vue)$/.test(name) && !/\.test\.(ts|js)$/.test(name)) out.push(full)
		}
		return out
	}

	test("no source writes the slot or opens the dialog itself", () => {
		const offending: string[] = []
		for (const file of sources(SRC)) {
			const rel = relative(SRC, file)
			if (rel.startsWith("types/")) continue
			readFileSync(file, "utf8")
				.split("\n")
				.forEach((line, i) => {
					if ((WRITE.test(line) || OPEN.test(line)) && !ALLOWED[rel]?.test(line)) offending.push(`${rel}:${i + 1}`)
				})
		}
		expect(offending).toEqual([])
	})
})
