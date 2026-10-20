/**
 * A3 sits on `Popup` itself: its trap, Escape and focus return are Popup's (`Popup.test.ts`). Pinned
 * here: the copy and its forms, both close areas and Escape cancel, CANCEL takes the first focus, and
 * RESET answers once per opening.
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from "vitest"
import { nextTick, ref } from "vue"
import type { StaleNetworkView } from "@/wallet/services/network-reset/client"
import { sendEvent } from "../../../tests/helpers/send-event"

type Options = Record<string, unknown>
const traps: Array<{ options: Options }> = []
vi.mock("focus-trap", () => ({
	createFocusTrap: vi.fn((_containers: unknown, options: Options) => {
		const trap = { options, active: false, activate: vi.fn(), deactivate: vi.fn() }
		traps.push(trap)
		return trap
	}),
}))
vi.mock("@/utils/core", () => ({ managers: { profile: { refreshSession: vi.fn() } } }))

import Popup from "@/components/Popup/Popup.vue"
import StaleNetworkConfirm from "./StaleNetworkConfirm.vue"

const FlexStub = {
	template: '<div ref="wrapper"><slot /></div>',
	setup() {
		return { wrapper: ref<HTMLElement>() }
	},
}

const view = (over: Partial<StaleNetworkView> = {}): StaleNetworkView => ({
	networkId: "tn",
	name: "Testnet",
	cause: { networkReset: true, addressesMoved: false },
	blocked: false,
	accounts: [
		{ name: "Account 1", address: `0x27fc${"0".repeat(56)}2ab9` },
		{ name: "Account 2", address: `0x9a01${"0".repeat(56)}c3e2` },
	],
	unmovable: [],
	switchToSeedNode: false,
	probedEndpoint: null,
	...over,
})

async function open(v = view()) {
	const wrapper = mount(StaleNetworkConfirm, {
		props: { show: false, view: v },
		attachTo: document.body,
		global: { components: { Popup }, stubs: { Flex: FlexStub } },
	})
	await wrapper.setProps({ show: true })
	await nextTick()
	await flushPromises()
	return wrapper
}

/** Every text node in document order: the card as a reader meets it. */
function lines(root: Element): string[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
	const out: string[] = []
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node.textContent?.trim()
		if (text) out.push(text)
	}
	return out
}

const q = (testid: string) => document.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
const qa = (testid: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)]

let clock: MockInstance<() => number>
beforeEach(() => {
	traps.length = 0
	document.body.innerHTML = '<div id="popup"></div>'
	// A still clock puts every press in its render's millisecond, where a raw click reaches only the
	// first Vue listener on its path, Popup's capture listener: a press that skips `sendEvent` fails
	// every run, not one CI run in many.
	clock = vi.spyOn(Date, "now").mockReturnValue(Date.now())
})
afterEach(() => {
	clock.mockRestore()
	document.body.innerHTML = ""
})

describe("StaleNetworkConfirm", () => {
	test("A3: the copy, the account list with truncated addresses, CANCEL and RESET", async () => {
		await open()
		expect(lines(q("stale-confirm")!)).toEqual([
			"TESTNET",
			"Reset Testnet?",
			"Nulo removes your Testnet tokens and history from this device. Then it moves these accounts to the new Testnet. You cannot undo this.",
			"Account 1",
			"0x27fc...2ab9",
			"Account 2",
			"0x9a01...c3e2",
			"CANCEL",
			"RESET",
		])
	})

	test("one account reads in the singular, in both variants", async () => {
		const one = [{ name: "Account 1", address: `0x27fc${"0".repeat(56)}2ab9` }]
		await open(view({ accounts: one }))
		expect(q("stale-confirm")!.textContent).toContain("Then it moves this account to the new Testnet. You cannot undo this.")
		document.body.innerHTML = '<div id="popup"></div>'
		await open(view({ accounts: one, cause: { networkReset: false, addressesMoved: true } }))
		expect(q("stale-confirm")!.textContent).toContain("Then it creates this account again at a new address. You cannot undo this.")
	})

	test("the address variant, and the unmovable notice after the list in its forms", async () => {
		await open(view({ cause: { networkReset: false, addressesMoved: true }, unmovable: ["Imported 1"] }))
		expect(q("stale-confirm")!.textContent).toContain("Then it creates these accounts again at new addresses.")
		expect(q("stale-confirm-unmovable")!.textContent?.trim()).toBe(
			"“Imported 1” cannot be moved because its stored key does not open. The reset removes it from this device.",
		)
		document.body.innerHTML = '<div id="popup"></div>'
		await open(view({ unmovable: ["Imported 1"] }))
		expect(q("stale-confirm-unmovable")!.textContent?.trim()).toBe(
			"“Imported 1” cannot be moved because its stored key does not open. The reset removes it from this device. You can import it again from its key file.",
		)
		document.body.innerHTML = '<div id="popup"></div>'
		await open(view({ unmovable: ["Imported 1", "Imported 2"] }))
		expect(q("stale-confirm-unmovable")!.textContent?.trim()).toBe(
			"2 imported accounts cannot be moved because their stored keys do not open. The reset removes them from this device. You can import them again from their key files.",
		)
		const accounts = qa("stale-confirm-account")
		const notice = q("stale-confirm-unmovable")!
		expect(accounts.at(-1)!.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
	})

	test("a network never opened: the node alone on its own node, and no account sentence without accounts", async () => {
		await open(view({ accounts: [], switchToSeedNode: true }))
		expect(lines(q("stale-confirm")!)).toEqual([
			"TESTNET",
			"Reset Testnet?",
			"Testnet will use Nulo’s node, because yours is not serving the new Testnet. You can change the node again in Networks.",
			"CANCEL",
			"RESET",
		])
		document.body.innerHTML = '<div id="popup"></div>'
		await open(view({ accounts: [], unmovable: ["Imported 1"], switchToSeedNode: true }))
		expect(q("stale-confirm")!.querySelector("p")!.textContent).toBe(
			"Nulo removes your Testnet tokens and history from this device. You cannot undo this.",
		)
	})

	test("CANCEL, either close area and Escape cancel; CANCEL takes the first focus", async () => {
		const wrapper = await open()
		expect(traps.at(-1)?.options.initialFocus).toBe("[data-testid='stale-confirm-cancel']")
		sendEvent(q("stale-confirm-cancel")!, "click")
		const card = q("stale-confirm")!
		sendEvent(card.previousElementSibling!, "click")
		sendEvent(card.nextElementSibling!, "click")
		const onEscape = traps.at(-1)?.options.escapeDeactivates as (e: KeyboardEvent) => boolean
		onEscape(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }))
		expect(wrapper.emitted("onClose")).toHaveLength(4)
		expect(wrapper.emitted("confirm")).toBeUndefined()
	})

	test("RESET answers once per opening: a double click and a repeated Enter start one reset", async () => {
		const wrapper = await open()
		const submit = q("stale-confirm-submit")!
		const repeat = new KeyboardEvent("keydown", { key: "Enter", repeat: true, cancelable: true, bubbles: true })
		submit.dispatchEvent(repeat)
		expect(repeat.defaultPrevented).toBe(true)
		// Both land before the render that disables RESET, so only the latch can refuse the second.
		sendEvent(submit, "click")
		expect(sendEvent(submit, "click")).toBeDefined()
		expect(wrapper.emitted("confirm")).toHaveLength(1)
		await wrapper.setProps({ show: false })
		await wrapper.setProps({ show: true })
		await flushPromises()
		sendEvent(q("stale-confirm-submit")!, "click")
		expect(wrapper.emitted("confirm")).toHaveLength(2)
	})
})
