/**
 * A dApp controls the function names and argument values the execute card shows, up to their
 * 64-character caps. In mono, 64 narrow glyphs run wider than the card, so each place that holds
 * them must let them break: these cases pin the wrapping classes on the elements that render them,
 * and the value-column rules that wrap them. jsdom applies no stylesheet; the window sweep measures
 * the rendered payload against the card.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { mount } from "@vue/test-utils"
import postcss, { type ChildNode, type Rule } from "postcss"
import { describe, expect, test } from "vitest"
import { trimAddress } from "@/utils/string"
import AuthwitDetails from "./AuthwitDetails.vue"
import CallArguments from "./CallArguments.vue"
import { answeredList, openAllSteps } from "./execute.fixture"
import OperationCard from "./OperationCard.vue"
import SendTxSummary from "./SendTxSummary.vue"
import ValueTree from "./ValueTree.vue"

const NARROW = "i".repeat(64)
/** The card humanizes a method name, capitalizing its first letter. */
const HUMANIZED = /Ii{63}/
const OWNER = `0x${"0a".repeat(32)}`
const SPENDER = `0x${"0b".repeat(32)}`
const TOKEN = `0x${"0c".repeat(32)}`
const FIELD = `0x${"1f".repeat(32)}`

/** The compiled `<style module>` class names; a script-setup instance does not expose `$style`. */
const styleOf = (component: unknown): Record<string, string> =>
	(component as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style
const CARD = styleOf(OperationCard)
const AUTHWIT = styleOf(AuthwitDetails)
const ARGS = styleOf(CallArguments)
const SUMMARY = styleOf(SendTxSummary)
const TREE = styleOf(ValueTree)

/** A component's own `<style module>` source, read for the rules jsdom never applies. */
const styleSource = (file: string) =>
	postcss.parse(readFileSync(join(__dirname, file), "utf8").split("<style module>")[1]?.split("</style>")[0] ?? "")
const CARD_STYLE = styleSource("OperationCard.vue")
const TREE_STYLE = styleSource("ValueTree.vue")
const isRule =
	(selector: string) =>
	(node: ChildNode): node is Rule =>
		node.type === "rule" && node.selector === selector
/** A top-level rule's declarations, or those of a rule nested in it. */
const declarationsOf = (selector: string, nested?: string, style = CARD_STYLE): Record<string, string> => {
	const top = style.nodes.find(isRule(selector))
	const rule = nested === undefined ? top : top?.nodes.find(isRule(nested))
	return Object.fromEntries((rule?.nodes ?? []).flatMap((node) => (node.type === "decl" ? [[node.prop, node.value]] : [])))
}
const WRAPS = { "min-width": "0", "overflow-wrap": "anywhere" }

const account = { name: "Owner", address: OWNER, profileId: "p1", chainId: 0, index: 0, type: 0, visible: true }
const base = { networkId: "net-1", accountAddress: OWNER, account, feeSettings: { paymentMethod: { kind: "fj" } } }

const grant = {
	...base,
	kind: "send_transaction" as const,
	actions: [
		{
			kind: "add_public_authwit" as const,
			content: { kind: "call" as const, caller: SPENDER, contract: TOKEN, method: NARROW, args: [FIELD, FIELD] },
		},
	],
}

/** A decode whose 32-character parameter name and 100-character string value are the longest a
 *  contract can make the grant rows print. */
const LONG_NAME = "W".repeat(32)
const LONG_TEXT = "i".repeat(100)
const grantDecoded = [
	{
		kind: "decoded",
		call: { to: TOKEN, selector: "0x12345678", args: [FIELD, FIELD] },
		decoded: {
			kind: "decoded",
			contract: "Token",
			fn: NARROW,
			params: [
				{ name: LONG_NAME, value: { kind: "field", value: FIELD } },
				{ name: "memo", value: { kind: "string", value: LONG_TEXT } },
			],
		},
	},
]

const sendTx = {
	...base,
	kind: "aztec_sendTx" as const,
	network: { id: "net-1", chainId: 1, name: "N" },
	exec: { calls: [{ name: NARROW, to: TOKEN, selector: "0x12345678", type: "public", isStatic: false, args: [FIELD] }] },
	opts: { from: OWNER },
}

const withAuthwit = {
	feeEstimate: {
		discoveredAuthwits: [
			{ messageHash: FIELD, consumer: TOKEN, caller: SPENDER, selector: "0x12345678", args: [FIELD], innerHash: FIELD },
		],
	},
	decodedAuthwits: new Map([[FIELD, { kind: "decoded", contract: "Token", fn: NARROW, params: [] }]]),
}

const stubs = {
	AddressDisplay: { props: ["address"], template: '<span class="addr">{{ address }}</span>' },
	Flex: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /></div>' },
	Text: { inheritAttrs: false, template: '<span v-bind="$attrs"><slot /></span>' },
	Icon: true,
	FeeSettingsCard: true,
	JsonViewer: true,
}

const mountCard = (op: unknown, props: Record<string, unknown> = {}) =>
	mount(OperationCard, { props: { op: op as never, index: 0, marks: answeredList(), ...props }, global: { stubs } })
/** A send's card with its step and its authorizations open, as the person reads them after a press on each. */
const mountOpen = async (props: Record<string, unknown> = {}) => {
	const w = mountCard(sendTx, props)
	await openAllSteps(w)
	return w
}

describe("OperationCard — long dApp strings break inside the card", () => {
	test("a grant's function name breaks in the payload column; its whole values break under their names, across the row", () => {
		const w = mountCard(grant, { decodedGrants: grantDecoded })
		expect(w.find(`.${CARD.payload}`).text()).toMatch(HUMANIZED)
		const values = w.findAll('[data-testid="execute-grant-decoded-param-value"]')
		expect(values.map((v) => v.text())).toEqual([FIELD, LONG_TEXT])
		for (const value of values) {
			expect(value.classes()).toContain("type--meta")
			expect(value.element.parentElement?.classList).toContain(TREE.row)
			expect(value.element.parentElement?.classList).toContain(TREE.full)
			expect(value.element.parentElement?.lastElementChild).toBe(value.element)
		}
		expect(w.find('[data-testid="execute-grant-decoded-args"]').classes()).toContain(ARGS.full)
		expect(declarationsOf(".row", undefined, TREE_STYLE)).toMatchObject({ gap: "12px" })
		expect(declarationsOf(".full", undefined, TREE_STYLE)).toEqual({ "flex-direction": "column", gap: "2px" })
		expect(declarationsOf(".full", "> .value", TREE_STYLE)).toEqual({ "text-align": "left" })
	})

	test("an open step names its call once, in the sentence that breaks; the values under it repeat no name", async () => {
		const w = await mountOpen()
		const title = w.get('[data-testid="execute-op-summary-call-title"]')
		expect(title.text()).toMatch(HUMANIZED)
		expect(title.element.closest(`.${SUMMARY.body}`)).not.toBeNull()
		expect(w.get('[data-testid="execute-op-payload-row"]').text()).not.toMatch(HUMANIZED)
		// The contract prints once, as its chip's short address: never whole, so it has nothing to break.
		expect(w.findAll('[data-testid="execute-op-summary-call-to"]').map((a) => a.text())).toEqual([trimAddress(TOKEN)])
		expect(w.get('[data-testid="execute-op-summary-call-head"]').text()).not.toContain(TOKEN)
	})

	test.each([
		["simulate_utility", { kind: "simulate_utility", contract: TOKEN, method: NARROW }],
		["aztec_executeUtility", { kind: "aztec_executeUtility", call: { to: TOKEN, name: NARROW, selector: "0x12345678" } }],
		[
			"aztec_createAuthWit",
			{
				kind: "aztec_createAuthWit",
				messageHashOrIntent: { caller: SPENDER, call: { to: TOKEN, name: NARROW, selector: "0x12345678", args: [FIELD] } },
			},
		],
	])("%s: the 64-character function name is the wrapping value column of its row", (_, op) => {
		const w = mountCard({ ...base, network: { id: "net-1", chainId: 1, name: "N" }, ...op })
		const values = w.findAll(`.${CARD.prop}`).map((row) => row.element.lastElementChild)
		expect(values.filter((value) => HUMANIZED.test(value?.textContent ?? ""))).toHaveLength(1)
	})

	test("a prop row's and a row's value column may shrink below its longest word and break inside it", () => {
		for (const parent of [".prop", ".row"]) expect(declarationsOf(parent, "> :last-child"), parent).toMatchObject(WRAPS)
	})

	test("a discovered authorization's decoded function name is the wrapping value column of its row", async () => {
		const w = await mountOpen(withAuthwit)
		const value = w.find('[data-testid="execute-discovered-authwit-function"]')
		expect(value.text()).toMatch(HUMANIZED)
		expect(value.element.parentElement?.classList.contains(AUTHWIT.row)).toBe(true)
		expect(value.element.parentElement?.lastElementChild).toBe(value.element)
		expect(declarationsOf(".row", "> :last-child", styleSource("AuthwitDetails.vue"))).toMatchObject(WRAPS)
	})

	test("in the summary, a call's and an authorization's 64-character names and their addresses sit in a body that may break", () => {
		const w = mountCard(sendTx, withAuthwit)
		const held = [
			w.get('[data-testid="execute-op-summary-call-title"]'),
			w.get('[data-testid="execute-op-summary-call-to"]'),
			w.get('[data-testid="execute-discovered-line-function"]'),
		]
		expect(held[0]!.text()).toMatch(HUMANIZED)
		expect(held[2]!.text()).toMatch(HUMANIZED)
		for (const el of held) expect(el.element.closest(`.${SUMMARY.body}`)).not.toBeNull()
		expect(declarationsOf(".body", undefined, styleSource("SendTxSummary.vue"))).toMatchObject(WRAPS)
	})

	test("a registered token's 31-character symbol and 64-character name break inside their value column", () => {
		const symbol = "W".repeat(31)
		const name = "W".repeat(64)
		const w = mount(OperationCard, {
			props: {
				op: { ...base, kind: "register_token", address: TOKEN } as never,
				index: 0,
				tokenMetadata: { symbol, name, decimals: 18 },
			},
			global: { stubs },
		})
		for (const [id, text] of [
			["register-token-symbol", symbol],
			["register-token-name", name],
		] as const) {
			const value = w.get(`[data-testid="${id}"]`)
			expect(value.text(), id).toBe(text)
			expect(value.element.parentElement?.classList.contains(CARD.prop), id).toBe(true)
			expect(value.element.parentElement?.lastElementChild, id).toBe(value.element)
		}
		expect(declarationsOf(".prop", "> :last-child")).toMatchObject(WRAPS)
	})
})

describe("OperationCard — a warning has no label, so it stays out of the right-aligned value column", () => {
	const inValueRow = (el: Element) => el.closest(`.${CARD.prop}`) !== null

	test("a token whose details cannot be read: both lines sit in a full-width block; the address stays a value", () => {
		const w = mountCard({ ...base, kind: "register_token", address: TOKEN }, { tokenMetadataError: "read failed" })
		const block = w.get('[data-testid="register-token-meta-error"]').element.parentElement
		expect(block?.classList.contains(CARD.group)).toBe(true)
		expect(block?.children).toHaveLength(2)
		for (const line of block?.children ?? []) expect(inValueRow(line)).toBe(false)
		expect(inValueRow(w.get('[data-testid="register-token-address"]').element)).toBe(true)
	})

	test("an opaque authorization's warning sits in a full-width block; its inner hash stays a value", () => {
		const w = mountCard({ ...base, kind: "aztec_createAuthWit", messageHashOrIntent: { consumer: TOKEN, innerHash: FIELD } })
		const warning = w.get('[data-testid="execute-authwit-opaque-warning"]').element
		expect(warning.parentElement?.classList.contains(CARD.group)).toBe(true)
		expect(inValueRow(warning)).toBe(false)
		expect(inValueRow(w.get('[data-testid="execute-authwit-inner-hash-value"]').element)).toBe(true)
	})

	test("only a prop row's direct last child aligns right; the full-width block sets no alignment", () => {
		const aligned: string[] = []
		CARD_STYLE.walkDecls("text-align", (decl) => {
			const chain: string[] = []
			for (let node = decl.parent; node?.type === "rule"; node = node.parent) chain.unshift((node as Rule).selector)
			if (chain[0]?.startsWith(".prop")) aligned.push(chain.join(" "))
		})
		expect(aligned).toEqual([".prop > :last-child"])
		expect(declarationsOf(".prop", "> :last-child")).toMatchObject({ "text-align": "right" })
		const group = declarationsOf(".group")
		expect(group).toMatchObject({ width: "100%" })
		expect(group).not.toHaveProperty("text-align")
	})
})

describe("CallArguments — long values wrap", () => {
	const mountArgs = (surface: unknown) =>
		mount(CallArguments, { props: { surface: surface as never, contract: TOKEN, prefix: "t" }, global: { stubs } })

	test("a decoded string value is the wrapping last child of its row; the name keeps its width up to 60%", () => {
		const w = mountArgs({ kind: "decoded", fn: "f", params: [{ name: "memo", value: { kind: "string", value: NARROW } }] })
		const value = w.find('[data-testid="t-decoded-param-value"]')
		expect(value.text()).toContain(NARROW)
		expect(value.classes()).toContain(TREE.value)
		expect(value.element.parentElement?.classList).toContain(TREE.row)
		expect(value.element.parentElement?.lastElementChild).toBe(value.element)
		expect(w.find('[data-testid="t-decoded-param-name"]').classes()).toContain(TREE.name)
		expect(declarationsOf(".value", undefined, TREE_STYLE)).toMatchObject({ "min-width": "0", "overflow-wrap": "anywhere" })
		expect(declarationsOf(".name", undefined, TREE_STYLE)).toEqual({
			flex: "0 0 auto",
			"max-width": "60%",
			"overflow-wrap": "anywhere",
		})
	})

	test("under `full` a field and a long string print whole and without it the row trims them; a list is a row per item", () => {
		const items = Array.from({ length: 12 }, (_, i) => ({ kind: "integer", value: String(i) }))
		const surface = {
			kind: "decoded",
			fn: "f",
			params: [
				{ name: "root", value: { kind: "field", value: FIELD } },
				{ name: "memo", value: { kind: "string", value: LONG_TEXT } },
				{ name: "ids", value: { kind: "array", items } },
			],
		}
		const texts = (full: boolean) =>
			mount(CallArguments, { props: { surface: surface as never, contract: TOKEN, prefix: "t", full }, global: { stubs } })
				.findAll('[data-testid="t-decoded-param-value"]')
				.map((v) => v.text())
		expect(texts(true)).toEqual([FIELD, LONG_TEXT, ...items.map((i) => i.value)])
		expect(texts(false)).toEqual([`${FIELD.slice(0, 10)}..${FIELD.slice(-6)}`, `${"i".repeat(64)}…`, ...items.map((i) => i.value)])
	})

	test("a raw text argument is the wrapping last child of its row", async () => {
		const w = mountArgs({ kind: "raw", reason: "unknown-contract", rows: [{ kind: "text", value: NARROW, full: NARROW }], hidden: 0 })
		await w.find('[data-testid="t-raw-toggle"]').trigger("click")
		const row = w.find('[data-testid="t-arg"]')
		expect(row.classes()).toContain(ARGS.row)
		expect(row.element.lastElementChild?.textContent).toContain(NARROW)
	})
})
