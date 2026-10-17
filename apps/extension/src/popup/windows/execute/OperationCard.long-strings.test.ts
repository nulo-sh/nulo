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
import CallArguments from "./CallArguments.vue"
import OperationCard from "./OperationCard.vue"
import SendTxSummary from "./SendTxSummary.vue"

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
const ARGS = styleOf(CallArguments)
const SUMMARY = styleOf(SendTxSummary)

/** A component's own `<style module>` source, read for the rules jsdom never applies. */
const styleSource = (file: string) =>
	postcss.parse(readFileSync(join(__dirname, file), "utf8").split("<style module>")[1]?.split("</style>")[0] ?? "")
const CARD_STYLE = styleSource("OperationCard.vue")
const ARGS_STYLE = styleSource("CallArguments.vue")
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
	mount(OperationCard, { props: { op: op as never, index: 0, ...props }, global: { stubs } })
/** A send's card with its rows open, as the person reads them after "Show all details". */
const mountOpen = async (props: Record<string, unknown> = {}) => {
	const w = mountCard(sendTx, props)
	await w.get('[data-testid="execute-op-details-toggle"]').trigger("click")
	return w
}

describe("OperationCard — long dApp strings break inside the card", () => {
	test("a grant's function name breaks in the payload column; its whole values break in their rows, names kept on one line", () => {
		const w = mountCard(grant, { decodedGrants: grantDecoded })
		expect(w.find(`.${CARD.payload}`).text()).toMatch(HUMANIZED)
		const values = w.findAll('[data-testid="execute-grant-decoded-param-value"]')
		expect(values.map((v) => v.text())).toEqual([FIELD, LONG_TEXT])
		for (const value of values) {
			expect(value.attributes("variant")).toBe("data")
			expect(value.element.parentElement?.classList.contains(ARGS.row)).toBe(true)
			expect(value.element.parentElement?.lastElementChild).toBe(value.element)
		}
		expect(w.find('[data-testid="execute-grant-decoded-args"]').classes()).toContain(ARGS.full)
		expect(declarationsOf(".row", undefined, ARGS_STYLE)).toMatchObject({ gap: "12px" })
		expect(declarationsOf(".full .row > :first-child", undefined, ARGS_STYLE)).toEqual({ "flex-shrink": "0", "max-width": "50%" })
	})

	test("a call's 64-character name and its address sit in the call row, whose children may break", async () => {
		const row = (await mountOpen()).find('[data-testid="execute-op-payload-row"]')
		expect(row.classes()).toContain(CARD.call_row)
		expect(row.element.firstElementChild?.textContent).toMatch(HUMANIZED)
		expect(row.element.lastElementChild?.querySelector(".addr")?.textContent).toBe(TOKEN)
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
		expect(value.element.parentElement?.classList.contains(CARD.row)).toBe(true)
		expect(value.element.parentElement?.lastElementChild).toBe(value.element)
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
		for (const el of held) expect(el.element.closest(`.${SUMMARY.item_body}`)).not.toBeNull()
		expect(declarationsOf(".item_body", undefined, styleSource("SendTxSummary.vue"))).toMatchObject(WRAPS)
	})

	test("a registered token's 31-character symbol and its row may shrink and break inside the card", () => {
		const symbol = "W".repeat(31)
		const w = mount(OperationCard, {
			props: {
				op: { ...base, kind: "register_token", address: TOKEN } as never,
				index: 0,
				tokenMetadata: { symbol, name: "Wide Token", decimals: 18 },
			},
			global: { stubs },
		})
		const value = w.find('[data-testid="register-token-symbol"]')
		expect(value.text()).toBe(symbol)
		expect(value.classes()).toContain(CARD.token_meta)
		expect(value.element.parentElement?.classList.contains(CARD.token_meta)).toBe(true)
		expect(declarationsOf(".token_meta")).toMatchObject(WRAPS)
	})
})

describe("CallArguments — long values wrap", () => {
	const mountArgs = (surface: unknown) =>
		mount(CallArguments, { props: { surface: surface as never, contract: TOKEN, prefix: "t" }, global: { stubs } })

	test("a decoded string value is the wrapping last child of its row", () => {
		const w = mountArgs({ kind: "decoded", fn: "f", params: [{ name: "memo", value: { kind: "string", value: NARROW } }] })
		const value = w.find('[data-testid="t-decoded-param-value"]')
		expect(value.text()).toContain(NARROW)
		expect(value.element.parentElement?.classList.contains(ARGS.row)).toBe(true)
		expect(value.element.parentElement?.lastElementChild).toBe(value.element)
	})

	test("under `full` a field, a long string and a list print whole; without it the row trims them", () => {
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
		expect(texts(true)).toEqual([FIELD, LONG_TEXT, `[${items.map((i) => i.value).join(", ")}]`])
		expect(texts(false)).toEqual([
			`${FIELD.slice(0, 10)}..${FIELD.slice(-6)}`,
			`${"i".repeat(64)}…`,
			"[0, 1, 2, 3, 4, 5, 6, 7, +4 more]",
		])
	})

	test("a raw text argument is the wrapping last child of its row", async () => {
		const w = mountArgs({ kind: "raw", reason: "unknown-contract", rows: [{ kind: "text", value: NARROW, full: NARROW }], hidden: 0 })
		await w.find('[data-testid="t-raw-toggle"]').trigger("click")
		const row = w.find('[data-testid="t-arg"]')
		expect(row.classes()).toContain(ARGS.row)
		expect(row.element.lastElementChild?.textContent).toContain(NARROW)
	})
})
