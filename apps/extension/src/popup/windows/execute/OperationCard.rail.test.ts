/**
 * A send's calls on the rail, on the fixtures the armed build renders: numbered steps in order, then
 * the unchecked line, the advice and the authorizations' node; each step and the node one press row
 * that opens only its own details, with focus left on it; the controls inside a row keep their own
 * presses. jsdom has no layout: the smoke spec measures the rows, the Tab walk and the hit testing.
 */
import { DOMWrapper, enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import SectionLabel from "@nulo/design/ui/SectionLabel.vue"
import Tooltip from "@nulo/design/ui/Tooltip.vue"
import AddressDisplay from "@/components/AddressDisplay.vue"
import DottedTerm from "@/components/composite/DottedTerm.vue"
import { executeFixture, HUB, RECIPIENT, ROUTER } from "@/e2e/execute-fixture"
import { trimAddress } from "@/utils/string"
import type { Account } from "@/wallet/services/account/client"
import type { DecodedCall } from "@/wallet/services/execution/client"
import type { Network } from "@/wallet/services/network/client"
import { MAIN, openAllSteps } from "./execute.fixture"
import OperationCard from "./OperationCard.vue"
import { shownText } from "../../../../tests/helpers/shown-text"
import { sendEvent } from "../../../../tests/helpers/send-event"

const lookups = vi.hoisted(() => ({ accounts: [] as { name: string; address: string }[] }))
vi.mock("@/utils/core", () => ({ managers: { contact: { getContactByAddress: vi.fn(async () => null) } } }))
// The real store's setup opens chrome.storage; the card only needs its account list.
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ accounts: lookups.accounts }) }))

const ACCOUNT = { name: "Main", address: MAIN, chainId: 1 } as Account
const NETWORK = { id: "net-1", chainId: 1, name: "N" } as Network

const stubs = {
	Flex: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /></div>' },
	Text: { inheritAttrs: false, template: '<span v-bind="$attrs"><slot /></span>' },
	Icon: true,
	FeeSettingsCard: true,
}

type Edit = { decodedCalls?: (calls: readonly DecodedCall[]) => readonly DecodedCall[] | undefined; props?: Record<string, unknown> }
const mountFixture = async (name: string, { decodedCalls = (d) => d, props = {} }: Edit = {}) => {
	const f = executeFixture(name, ACCOUNT, NETWORK)
	if (!f) throw new Error(name)
	const w = mount(OperationCard, {
		props: {
			op: f.operations[0] as never,
			index: 0,
			tokens: f.tokens,
			feeEstimate: f.feeEstimates[0] as never,
			decodedCalls: decodedCalls(f.decodedCalls[0]!) as never,
			decodedAuthwits: f.decodedAuthwits as never,
			...props,
		},
		global: { stubs, components: { AddressDisplay, SectionLabel } as never },
		attachTo: document.body,
	})
	await flushPromises()
	return { w, f }
}

const rows = (w: VueWrapper) => w.findAll('[data-testid="execute-op-step-toggle"]')
const node = (w: VueWrapper) => w.get('[data-testid="execute-op-authwits-toggle"]')
const panels = (w: VueWrapper) => w.findAll('[data-testid="execute-op-summary-call"] [data-testid="execute-op-details"]')
const step = (w: VueWrapper, j: number) => w.get(`[data-testid="execute-op-summary-call"][data-call-index="${j}"]`)
const openSteps = (w: VueWrapper) =>
	rows(w).flatMap((row) => (row.attributes("aria-expanded") === "true" ? [row.attributes("data-step-index")] : []))
const UNREAD: DecodedCall = { kind: "undecoded", reason: "unknown-contract" }
/** Everything Tab reaches inside the card, in DOM order: no `tabindex` here is positive. */
const tabbables = (w: VueWrapper) =>
	[...(w.element as Element).querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(
		(el) => !(el as HTMLButtonElement).disabled && !el.closest("[hidden]"),
	)

// Every mount is its own app, whose ids repeat another's; one left attached would answer `getElementById`.
enableAutoUnmount(afterEach)

beforeEach(() => {
	document.getSelection()?.removeAllRanges()
	lookups.accounts.splice(0)
	lookups.accounts.push({ name: "Main", address: MAIN })
})

describe("OperationCard — the rail", () => {
	test("order: the steps as the request lists them, then the unchecked line, the advice, the authorizations' node", async () => {
		const { w, f } = await mountFixture("batch", { decodedCalls: ([, ...rest]) => [UNREAD, ...rest] })
		const names = (f.operations[0] as unknown as { exec: { calls: { name: string }[] } }).exec.calls.map((c) => c.name)
		expect(names).toEqual([
			"deposit",
			"set_preferences",
			"transfer_private_to_private",
			"swap_exact_in",
			"claim_rewards",
			"transfer_private_to_private",
		])
		expect(w.findAll('[data-testid="execute-op-summary-call-title"]').map((t) => t.text())).toEqual([
			"Deposit",
			"Set Preferences",
			"Transfer (private)",
			"Swap Exact In",
			"Claim Rewards",
			"Transfer (private)",
		])
		const order = [
			"execute-op-summary-calls",
			"execute-op-summary-unchecked",
			"execute-op-summary-unverified-advice",
			"execute-op-summary-authwits-section",
		].map((id) => w.get(`[data-testid="${id}"]`).element)
		for (let i = 1; i < order.length; i++)
			expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy()
		expect(w.findAll('[data-testid$="-unverified-advice"]')).toHaveLength(1)
	})

	test("at rest: every sentence and every authorization's line, an unreadable call's warning and reason, no details", async () => {
		const batch = (await mountFixture("batch")).w
		expect(batch.findAll('[data-testid="execute-op-summary-call-head"]')).toHaveLength(6)
		expect(batch.findAll('[data-testid="execute-discovered-authwit-line"]').map((l) => shownText(l.element))).toEqual([
			`Lets ${trimAddress(HUB)} move 25 USDC from Main to ${trimAddress(HUB)}`,
			`Lets ${trimAddress(ROUTER)} move 10 USDC from Main to ${trimAddress(ROUTER)}`,
		])
		expect(batch.find('[data-testid="execute-op-details"]').exists()).toBe(false)

		const raw = (await mountFixture("raw")).w
		const unread = step(raw, 1)
		expect(unread.get('[data-testid="execute-op-summary-unverified-warning"]').text()).toBe("Can't read the arguments")
		expect(shownText(unread.get('[data-testid="execute-op-summary-unverified-reason"]').element)).toBe(
			"Nulo doesn't have this contract's interface.",
		)
		expect(raw.find('[data-testid="execute-op-details"]').exists()).toBe(false)
	})

	test.each([0, 1, 2, 3, 4, 5])(
		"from a fresh mount, step %i's values are one press away and its raw fields two, in its own panel",
		async (j) => {
			const { w, f } = await mountFixture("batch")
			const args = (f.operations[0] as unknown as { exec: { calls: { args: string[] }[] } }).exec.calls[j]!.args
			await rows(w)[j]!.trigger("click")
			expect(openSteps(w)).toEqual([String(j)])
			const panel = step(w, j).get('[data-testid="execute-op-details"]')
			expect(panel.attributes("data-step-index")).toBe(String(j))
			expect(panel.find('[data-testid="execute-op-decoded-param"], [data-testid="execute-op-transfer-to"]').exists()).toBe(true)
			expect(panel.find('[data-testid="execute-op-raw-args"]').exists()).toBe(false)
			await panel.get('[data-testid="execute-op-raw-toggle"]').trigger("click")
			expect(panel.findAll('[data-testid="execute-op-arg-field"]').map((r) => r.attributes("title"))).toEqual(args)
			expect(openSteps(w)).toEqual([String(j)])
		},
	)

	test("a press leaves focus on the pressed row, and the step's panel follows it, so the next Tab enters the panel", async () => {
		const { w } = await mountFixture("batch")
		const row = rows(w)[1]!.element as HTMLElement
		row.focus()
		await rows(w)[1]!.trigger("click")
		expect(document.activeElement).toBe(row)
		const after = tabbables(w)
		expect(after[after.indexOf(row) + 1]).toBe(step(w, 1).get('[data-testid="execute-op-raw-toggle"]').element)
	})

	describe("the controls inside a row keep their own presses", () => {
		test("a glossary term, by mouse and by Enter, opens nothing; a press on the warning's text beside it opens the step", async () => {
			const { w } = await mountFixture("raw")
			const term = step(w, 1).get('[data-testid="execute-op-summary-interface-term"]')
			expect(term.attributes("tabindex")).toBe("0")
			await term.trigger("click")
			sendEvent(term.element, "keydown", { key: "Enter" })
			await flushPromises()
			expect(openSteps(w)).toEqual([])
			await step(w, 1).get('[data-testid="execute-op-summary-unverified-warning"]').trigger("click")
			expect(openSteps(w)).toEqual(["1"])
		})

		test("a named address keeps its press; an unnamed one is the sentence's text and opens the step", async () => {
			const { w } = await mountFixture("batch")
			const sentence = step(w, 2)
			const named = sentence.get('[data-testid="execute-op-line-from"]')
			expect(named.text()).toBe("Main")
			await named.trigger("click")
			expect(openSteps(w)).toEqual([])
			const unnamed = sentence.get('[data-testid="execute-op-line-to"]')
			expect(unnamed.text()).toBe(trimAddress(RECIPIENT))
			await unnamed.trigger("click")
			expect(openSteps(w)).toEqual(["2"])
		})

		test("the raw-values press inside an open step opens its fields and leaves the step open", async () => {
			const { w } = await mountFixture("batch")
			await rows(w)[0]!.trigger("click")
			await step(w, 0).get('[data-testid="execute-op-raw-toggle"]').trigger("click")
			expect([openSteps(w), step(w, 0).find('[data-testid="execute-op-raw-args"]').exists()]).toEqual([["0"], true])
		})

		test("a click that ends a selection in the sentence opens nothing; the same click with nothing selected opens the step", async () => {
			const { w } = await mountFixture("batch")
			const head = step(w, 0).get('[data-testid="execute-op-summary-call-head"]').element
			document.getSelection()?.selectAllChildren(head)
			// The row's listener is the first on this path, so a raw dispatch reaches it; `trigger` cannot set `detail`.
			head.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
			await flushPromises()
			expect(openSteps(w)).toEqual([])
			document.getSelection()?.removeAllRanges()
			head.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
			await flushPromises()
			expect(openSteps(w)).toEqual(["0"])
		})

		test("a press on the sentence's text, on the row's padding and on its button opens the step; a held Enter is refused", async () => {
			const { w } = await mountFixture("batch")
			await step(w, 0).get('[data-testid="execute-op-summary-call-title"]').trigger("click")
			const padding = rows(w)[1]!.element.parentElement!
			await new DOMWrapper(padding).trigger("click")
			// Enter and Space reach a native button as a click with `detail` 0.
			await rows(w)[3]!.trigger("click")
			expect(openSteps(w)).toEqual(["0", "1", "3"])
			expect(sendEvent(rows(w)[4]!.element, "keydown", { key: "Enter", repeat: true })?.defaultPrevented).toBe(true)
			expect(sendEvent(rows(w)[4]!.element, "keydown", { key: "Enter" })?.defaultPrevented).toBe(false)
		})

		test("a press on the node's label text opens it, though the slot around it takes focus", async () => {
			const { w } = await mountFixture("batch")
			const slot = w.get('[data-testid="execute-op-authwits-slot"]')
			expect(slot.attributes("tabindex")).toBe("-1")
			await w.get('[data-testid="execute-op-summary-authwits-section"] span span').trigger("click")
			expect(node(w).attributes("aria-expanded")).toBe("true")
		})
	})

	test("each row is named Details of step N and described by its sentence, part by part; the node is named Details of the authorizations", async () => {
		const { w } = await mountFixture("raw")
		const byId = (id: string) => document.getElementById(id)
		const described = (row: DOMWrapper<Element>) => (row.attributes("aria-describedby") ?? "").split(" ").map((id) => byId(id)!)
		const parts = rows(w).map((row, j) => {
			const name = byId(row.attributes("aria-labelledby") ?? "")
			expect([name?.textContent, name?.hasAttribute("hidden")]).toEqual([`Details of step ${j + 1}`, true])
			expect([row.element.tagName, row.attributes("type"), row.attributes("aria-expanded")]).toEqual(["BUTTON", "button", "false"])
			return described(row).map((el) => el.getAttribute("data-testid"))
		})
		expect(parts).toEqual([
			["execute-op-summary-call-head", "execute-op-call-line"],
			["execute-op-summary-call-head", "execute-op-summary-unverified-args"],
		])
		// jsdom's text joins blocks with no space; a browser's description computation spaces them.
		expect(shownText(described(rows(w)[1]!)[1]!)).toMatch(/^Can't read the arguments ?Nulo doesn't have this contract's interface\.$/)
		await rows(w)[1]!.trigger("click")
		expect(rows(w)[1]!.attributes("aria-controls")).toBe(step(w, 1).get('[data-testid="execute-op-details"]').attributes("id"))

		const batch = (await mountFixture("batch")).w
		const nodeName = byId(node(batch).attributes("aria-labelledby") ?? "")
		expect([nodeName?.textContent, nodeName?.hasAttribute("hidden")]).toEqual(["Details of the authorizations", true])
	})

	test("an unreadable call's warning and a pending call's reading print once, under the sentence, with the step open", async () => {
		const raw = (await mountFixture("raw")).w
		await openAllSteps(raw)
		expect(raw.findAll('[data-testid$="-unverified-warning"]').map((n) => n.attributes("data-testid"))).toEqual([
			"execute-op-summary-unverified-warning",
		])
		expect(step(raw, 1).find('[data-testid="execute-op-raw-toggle"]').exists()).toBe(true)

		const pending = (await mountFixture("batch", { decodedCalls: () => undefined })).w
		await openAllSteps(pending)
		expect(panels(pending)).toHaveLength(6)
		expect(pending.text().split("Reading arguments…")).toHaveLength(7)
		expect(pending.findAll('[data-testid="execute-op-summary-args-pending"]')).toHaveLength(6)
	})

	test("an unreadable authorization beside readable calls takes the advice into its details, once, and none at rest", async () => {
		const f = executeFixture("batch", ACCOUNT, NETWORK)!
		const [first] = f.feeEstimates[0]!.discoveredAuthwits!
		const decodedAuthwits = new Map(f.decodedAuthwits)
		decodedAuthwits.set(first!.messageHash, UNREAD)
		const { w } = await mountFixture("batch", { props: { decodedAuthwits } })
		expect(w.findAll('[data-testid$="-unverified-advice"]')).toHaveLength(0)
		await node(w).trigger("click")
		const advice = w.findAll('[data-testid$="-unverified-advice"]')
		expect(advice.map((a) => a.attributes("data-testid"))).toEqual(["execute-discovered-authwit-unverified-advice"])
		expect(advice[0]!.element.closest("[data-message-hash]")?.getAttribute("data-message-hash")).toBe(first!.messageHash)
	})

	test("checking, a failed preview and a refusal read in the node's place; a refusal offers no advice and no Try again", async () => {
		const noFrom = (op: unknown) => ({
			...(op as object),
			executionMode: "default_entrypoint",
			feeSettings: { paymentMethod: { kind: "embedded" } },
		})
		const f = executeFixture("batch", ACCOUNT, NETWORK)!
		const slotText = (w: VueWrapper) => shownText(w.get('[data-testid="execute-op-authwits-slot"]').element)
		const base = { op: noFrom(f.operations[0]), feeEstimate: undefined }

		const checking = (await mountFixture("batch", { props: { ...base, isPreviewing: true } })).w
		expect([slotText(checking), checking.get('[data-testid="execute-op-authwits-slot"]').attributes("aria-busy")]).toEqual([
			"Checking authorizations…",
			"true",
		])

		const failed = (await mountFixture("batch", { props: { ...base, previewFailed: true } })).w
		const slot = failed.get('[data-testid="execute-op-authwits-slot"]')
		expect(slot.get('[data-testid="execute-op-authwits-preview-failed"] .color--txt-danger').text()).toBe(
			"Authorizations couldn't be previewed",
		)
		expect(slot.get('[data-testid="execute-op-authwits-preview-retry"]').text()).toBe("Try again")

		const refused = (await mountFixture("raw", { props: { ...base, previewFailed: true, refused: true } })).w
		expect(slotText(refused)).toBe("")
		expect(refused.find('[data-testid="execute-op-authwits-preview-retry"]').exists()).toBe(false)
		expect(refused.findAll('[data-testid$="-unverified-advice"]')).toHaveLength(0)
		expect(refused.find('[data-testid="execute-op-summary-unverified-warning"]').exists()).toBe(true)
	})

	test("batch: 7 rows reach Tab at rest and 17 controls with everything open; 7 presses open every step and the node", async () => {
		const { w } = await mountFixture("batch")
		expect(tabbables(w).map((el) => el.getAttribute("data-testid"))).toEqual([
			...Array(6).fill("execute-op-step-toggle"),
			"execute-op-authwits-toggle",
		])
		const closed = () =>
			w.findAll(
				'[data-testid="execute-op-step-toggle"][aria-expanded="false"], [data-testid="execute-op-authwits-toggle"][aria-expanded="false"]',
			)
		let presses = 0
		while (closed().length) {
			await closed()[0]!.trigger("click")
			presses++
		}
		expect(presses).toBe(7)
		// Every value then sits one press further at most: each step's and each authorization's raw values.
		expect(presses + w.findAll('[data-testid$="raw-toggle"]').length).toBe(15)
		expect(tabbables(w).map((el) => el.getAttribute("data-testid"))).toEqual([
			...Array(6).fill(["execute-op-step-toggle", "execute-op-raw-toggle"]).flat(),
			"execute-op-authwits-toggle",
			...Array(2).fill(["execute-discovered-authwit-toggle", "execute-discovered-authwit-raw-toggle"]).flat(),
		])
	})

	test("ten calls draw ten steps, numbered 1 to 10", async () => {
		const { w } = await mountFixture("ten")
		expect(w.findAll('[data-testid="execute-op-summary-call"]').map((li) => li.element.firstElementChild?.textContent?.trim())).toEqual(
			Array.from({ length: 10 }, (_, i) => String(i + 1)),
		)
	})

	test("no glossary term or tooltip joins the window: everything open mounts only the unreadable call's one term", async () => {
		for (const [name, terms] of [
			["batch", 0],
			["deep", 0],
			["one", 0],
			["raw", 1],
		] as const) {
			const { w } = await mountFixture(name)
			const atRest = w.findAllComponents(DottedTerm).length
			await openAllSteps(w)
			expect([name, atRest, w.findAllComponents(DottedTerm).length, w.findAllComponents(Tooltip).length]).toEqual([
				name,
				terms,
				terms,
				0,
			])
		}
	})
})
