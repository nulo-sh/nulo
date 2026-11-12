/**
 * A send's calls on the rail, on the fixtures the armed build renders: numbered steps in order, then
 * the line naming the calls Nulo cannot read and the authorizations' node; each step and the node one
 * press row that opens only its own details, with focus left on it; the controls inside a row, its
 * contract's chip among them, keep their own presses. jsdom has no layout: the smoke spec measures
 * the rows, the Tab walk and the hit testing.
 */
import { DOMWrapper, enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import Popover from "@nulo/design/ui/Popover.vue"
import SectionLabel from "@nulo/design/ui/SectionLabel.vue"
import Tooltip from "@nulo/design/ui/Tooltip.vue"
import AddressDisplay from "@/components/AddressDisplay.vue"
import DottedTerm from "@/components/composite/DottedTerm.vue"
import { executeFixture, HUB, RECIPIENT, ROUTER, UNKNOWN, USDC } from "@/e2e/execute-fixture"
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
		global: { stubs, components: { AddressDisplay, Popover, SectionLabel, Tooltip } as never },
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
const unparsed = (w: VueWrapper) => w.findAll('[data-testid="execute-op-summary-unparsed"]').map((l) => l.text())
const chipPanel = () => document.querySelector('[data-testid="contract-chip-panel"]')
/** Everything Tab reaches inside the card, in DOM order: no `tabindex` here is positive. */
const tabbables = (w: VueWrapper) =>
	[...(w.element as Element).querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(
		(el) => !(el as HTMLButtonElement).disabled && !el.closest("[hidden]"),
	)

// Every mount is its own app, whose ids repeat another's; one left attached would answer `getElementById`.
enableAutoUnmount(afterEach)

/** The teleport root a chip's press renders into, as the popup shell declares it. */
let popoverRoot: HTMLDivElement
beforeEach(() => {
	document.getSelection()?.removeAllRanges()
	lookups.accounts.splice(0)
	lookups.accounts.push({ name: "Main", address: MAIN })
	popoverRoot = document.createElement("div")
	popoverRoot.id = "popover"
	document.body.appendChild(popoverRoot)
})
afterEach(() => popoverRoot.remove())

describe("OperationCard — the rail", () => {
	test("order: the steps as the request lists them, then the line naming the calls Nulo can't parse, the authorizations' node; no advice", async () => {
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
		const order = ["execute-op-summary-calls", "execute-op-summary-unparsed", "execute-op-summary-authwits-section"].map(
			(id) => w.get(`[data-testid="${id}"]`).element,
		)
		for (let i = 1; i < order.length; i++)
			expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy()
		expect(unparsed(w)).toEqual(["Nulo can't parse calls from steps 1, 2, 4 and 5."])
		expect(w.findAll('[data-testid$="-unverified-advice"]')).toHaveLength(0)
	})

	test("at rest: every sentence and every authorization's line, the line naming an unreadable call in place of a warning under it, no details", async () => {
		const batch = (await mountFixture("batch")).w
		expect(batch.findAll('[data-testid="execute-op-summary-call-head"]')).toHaveLength(6)
		expect(batch.findAll('[data-testid="execute-discovered-authwit-line"]').map((l) => shownText(l.element))).toEqual([
			`Lets ${trimAddress(HUB)} move 25 ${trimAddress(USDC)} from Main to ${trimAddress(HUB)}`,
			`Lets ${trimAddress(ROUTER)} move 10 ${trimAddress(USDC)} from Main to ${trimAddress(ROUTER)}`,
		])
		expect(batch.find('[data-testid="execute-op-details"]').exists()).toBe(false)

		const raw = (await mountFixture("raw")).w
		const unread = step(raw, 1)
		expect(shownText(unread.get('[data-testid="execute-op-summary-call-head"]').element)).toBe(`Checkpoint on ${trimAddress(UNKNOWN)}`)
		expect(unread.findAll('[data-testid*="-unverified-"]')).toHaveLength(0)
		expect(unparsed(raw)).toEqual(["Nulo can't parse the call from step 2."])
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

	test("a press leaves focus on the pressed row, and the step's panel follows the row's chip, so the second Tab enters the panel", async () => {
		const { w } = await mountFixture("batch")
		const row = rows(w)[1]!.element as HTMLElement
		row.focus()
		await rows(w)[1]!.trigger("click")
		expect(document.activeElement).toBe(row)
		const after = tabbables(w)
		expect(after.slice(after.indexOf(row) + 1, after.indexOf(row) + 3)).toEqual([
			step(w, 1).get('[data-testid="contract-chip"]').element,
			step(w, 1).get('[data-testid="execute-op-raw-toggle"]').element,
		])
	})

	describe("the controls inside a row keep their own presses", () => {
		test("a contract's chip, by mouse and by Enter, opens its own press and never the step; a press on the sentence's text beside it opens the step", async () => {
			const { w } = await mountFixture("raw")
			const chip = step(w, 1).get<HTMLButtonElement>('[data-testid="contract-chip"]')
			expect([chip.element.tagName, chip.attributes("type")]).toEqual(["BUTTON", "button"])
			chip.element.focus()
			await chip.trigger("click")
			expect([chip.attributes("aria-expanded"), chipPanel() !== null, openSteps(w)]).toEqual(["true", true, []])
			await chip.trigger("click")
			expect([chip.attributes("aria-expanded"), openSteps(w)]).toEqual(["false", []])
			// Enter on a native button arrives as its keydown, then a click.
			sendEvent(chip.element, "keydown", { key: "Enter" })
			await chip.trigger("click")
			await flushPromises()
			expect([chip.attributes("aria-expanded"), openSteps(w)]).toEqual(["true", []])
			await step(w, 1).get('[data-testid="execute-op-summary-call-title"]').trigger("click")
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

		test("a click that ends a selection in the sentence opens nothing; a press on the row's own button over that selection, or the click with nothing selected, toggles", async () => {
			const { w } = await mountFixture("batch")
			const head = step(w, 0).get('[data-testid="execute-op-summary-call-head"]').element
			// The row's listener is the first on this path, so a raw dispatch reaches it; `trigger` cannot set `detail`.
			const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
			document.getSelection()?.selectAllChildren(head)
			click(head)
			await flushPromises()
			expect(openSteps(w)).toEqual([])
			click(rows(w)[0]!.element)
			await flushPromises()
			expect(openSteps(w)).toEqual(["0"])
			document.getSelection()?.removeAllRanges()
			click(head)
			await flushPromises()
			expect(openSteps(w)).toEqual([])
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
		const described = (row: Pick<DOMWrapper<Element>, "attributes">) =>
			(row.attributes("aria-describedby") ?? "").split(" ").map((id) => byId(id)!)
		const parts = rows(w).map((row, j) => {
			const name = byId(row.attributes("aria-labelledby") ?? "")
			expect([name?.textContent, name?.hasAttribute("hidden")]).toEqual([`Details of step ${j + 1}`, true])
			expect([row.element.tagName, row.attributes("type"), row.attributes("aria-expanded")]).toEqual(["BUTTON", "button", "false"])
			return described(row).map((el) => el.getAttribute("data-testid"))
		})
		expect(parts).toEqual([["execute-op-summary-call-head", "execute-op-call-line"], ["execute-op-summary-call-head"]])
		expect(rows(w).map((row) => described(row).map((el) => shownText(el)))).toEqual([
			[`Transfer (private) 2 ${trimAddress(USDC)}`, `from Main to ${trimAddress(RECIPIENT)}`],
			[`Checkpoint on ${trimAddress(UNKNOWN)}`],
		])
		await rows(w)[1]!.trigger("click")
		expect(rows(w)[1]!.attributes("aria-controls")).toBe(step(w, 1).get('[data-testid="execute-op-details"]').attributes("id"))

		const batch = (await mountFixture("batch")).w
		const nodeName = byId(node(batch).attributes("aria-labelledby") ?? "")
		expect([nodeName?.textContent, nodeName?.hasAttribute("hidden")]).toEqual(["Details of the authorizations", true])
		expect(described(node(batch)).map((el) => shownText(el))).toEqual([expect.stringMatching(/^Authorizations\s*2$/)])
	})

	test("with the step open, an unreadable call prints no warning and the line names it once; a pending call's reading prints once, under the sentence, and no line names it", async () => {
		const raw = (await mountFixture("raw")).w
		await openAllSteps(raw)
		expect(raw.findAll('[data-testid$="-unverified-warning"]')).toHaveLength(0)
		expect(unparsed(raw)).toEqual(["Nulo can't parse the call from step 2."])
		expect(step(raw, 1).find('[data-testid="execute-op-raw-toggle"]').exists()).toBe(true)

		const pending = (await mountFixture("batch", { decodedCalls: () => undefined })).w
		await openAllSteps(pending)
		expect(panels(pending)).toHaveLength(6)
		expect(pending.text().split("Reading arguments…")).toHaveLength(7)
		expect(pending.findAll('[data-testid="execute-op-summary-args-pending"]')).toHaveLength(6)
		expect(unparsed(pending)).toEqual([])
	})

	test("an unreadable authorization beside decoded calls says so in one line under its own, and advises neither at rest nor with its details open", async () => {
		const f = executeFixture("batch", ACCOUNT, NETWORK)!
		const [first] = f.feeEstimates[0]!.discoveredAuthwits!
		const decodedAuthwits = new Map(f.decodedAuthwits)
		decodedAuthwits.set(first!.messageHash, UNREAD)
		const { w } = await mountFixture("batch", { props: { decodedAuthwits } })
		const lines = () =>
			w
				.findAll('[data-testid="execute-op-summary-authwit-unparsed"]')
				.map((l) => [l.element.closest("[data-message-hash]")?.getAttribute("data-message-hash"), l.text()])
		const ONE = [[first!.messageHash, "Nulo can't parse this authorization."]]
		expect([lines(), w.findAll('[data-testid$="-unverified-advice"]').length]).toEqual([ONE, 0])
		await node(w).trigger("click")
		expect([lines(), w.findAll('[data-testid$="-unverified-advice"]').length]).toEqual([ONE, 0])
	})

	test("checking, a failed preview and a refusal read in the node's place; a refusal offers no advice and no Try again, and keeps the line naming its unreadable call", async () => {
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

		const raw = executeFixture("raw", ACCOUNT, NETWORK)!
		const refused = (
			await mountFixture("raw", {
				props: { op: noFrom(raw.operations[0]), feeEstimate: undefined, previewFailed: true, refused: true },
			})
		).w
		expect(slotText(refused)).toBe("")
		const group = (w: VueWrapper) => ["role", "aria-label"].map((a) => w.get('[data-testid="execute-op-authwits-slot"]').attributes(a))
		expect([group(checking), group(failed), group(refused)]).toEqual([
			["group", "Authorizations"],
			["group", "Authorizations"],
			[undefined, undefined],
		])
		expect(refused.find('[data-testid="execute-op-authwits-preview-retry"]').exists()).toBe(false)
		expect(refused.findAll('[data-testid$="-unverified-advice"]')).toHaveLength(0)
		expect(unparsed(refused)).toEqual(["Nulo can't parse the call from step 2."])
	})

	test("batch: 15 stops reach Tab at rest, each row then its chip, the node, each authorization's chip, and 25 with everything open; 7 presses open every step and the node", async () => {
		const { w } = await mountFixture("batch")
		expect(tabbables(w).map((el) => el.getAttribute("data-testid"))).toEqual([
			...Array(6).fill(["execute-op-step-toggle", "contract-chip"]).flat(),
			"execute-op-authwits-toggle",
			...Array(2).fill("contract-chip"),
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
			...Array(6).fill(["execute-op-step-toggle", "contract-chip", "execute-op-raw-toggle"]).flat(),
			"execute-op-authwits-toggle",
			...Array(2).fill(["contract-chip", "execute-discovered-authwit-toggle", "execute-discovered-authwit-raw-toggle"]).flat(),
		])
	})

	test("ten calls draw ten steps, numbered 1 to 10", async () => {
		const { w } = await mountFixture("ten")
		expect(
			w.findAll('[data-testid="execute-op-summary-call"]').map((li) => li.get('[data-testid="execute-op-step-number"]').text()),
		).toEqual(Array.from({ length: 10 }, (_, i) => String(i + 1)))
	})

	test("no glossary term or tooltip joins the window, an unreadable call's included: everything open mounts none", async () => {
		for (const name of ["batch", "deep", "one", "raw"] as const) {
			const { w } = await mountFixture(name)
			const atRest = w.findAllComponents(DottedTerm).length
			await openAllSteps(w)
			expect([name, atRest, w.findAllComponents(DottedTerm).length, w.findAllComponents(Tooltip).length]).toEqual([name, 0, 0, 0])
		}
	})
})
