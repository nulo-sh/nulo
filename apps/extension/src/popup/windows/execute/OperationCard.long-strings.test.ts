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

/** The card's own `<style module>` source, read for the rules jsdom never applies. */
const CARD_STYLE = postcss.parse(
	readFileSync(join(__dirname, "OperationCard.vue"), "utf8").split("<style module>")[1]?.split("</style>")[0] ?? "",
)
const isRule =
	(selector: string) =>
	(node: ChildNode): node is Rule =>
		node.type === "rule" && node.selector === selector
/** A top-level rule's declarations, or those of a rule nested in it. */
const declarationsOf = (selector: string, nested?: string): Record<string, string> => {
	const top = CARD_STYLE.nodes.find(isRule(selector))
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

const sendTx = {
	...base,
	kind: "aztec_sendTx" as const,
	network: { id: "net-1", chainId: 1, name: "N" },
	exec: { calls: [{ name: NARROW, to: TOKEN, selector: "0x12345678", type: "public", isStatic: false, args: [FIELD] }] },
	opts: { from: OWNER },
}

const stubs = {
	AddressDisplay: { props: ["address"], template: '<span class="addr">{{ address }}</span>' },
	Flex: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /></div>' },
	Text: { inheritAttrs: false, template: '<span v-bind="$attrs"><slot /></span>' },
	Icon: true,
	MaterialIcon: true,
	FeeSettingsCard: true,
	JsonViewer: true,
}

const mountCard = (op: unknown) => mount(OperationCard, { props: { op: op as never, index: 0 }, global: { stubs } })

describe("OperationCard — long dApp strings break inside the card", () => {
	test("a grant's arguments render in a mono role inside the payload column that lets them wrap", () => {
		const w = mountCard(grant)
		const args = w.find('[data-testid="execute-authwit-args"]')
		expect(args.attributes("variant")).toBe("data")
		expect(args.text()).toContain(FIELD.slice(0, 40))
		expect(args.element.closest(`.${CARD.payload}`)).not.toBeNull()
		expect(w.find(`.${CARD.payload}`).text()).toMatch(HUMANIZED)
	})

	test("a call's 64-character name and its address sit in the call row, whose children may break", () => {
		const row = mountCard(sendTx).find('[data-testid="execute-op-payload-row"]')
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

	test("a discovered authorization's decoded function name is the wrapping value column of its row", () => {
		const authwit = { messageHash: FIELD, consumer: TOKEN, caller: SPENDER, selector: "0x12345678", args: [FIELD], innerHash: FIELD }
		const w = mount(OperationCard, {
			props: {
				op: sendTx as never,
				index: 0,
				feeEstimate: { discoveredAuthwits: [authwit] } as never,
				decodedAuthwits: new Map([[FIELD, { kind: "decoded", contract: "Token", fn: NARROW, params: [] }]]) as never,
			},
			global: { stubs },
		})
		const value = w.find('[data-testid="execute-discovered-authwit-function"]')
		expect(value.text()).toMatch(HUMANIZED)
		expect(value.element.parentElement?.classList.contains(CARD.row)).toBe(true)
		expect(value.element.parentElement?.lastElementChild).toBe(value.element)
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

	test("a raw text argument is the wrapping last child of its row", async () => {
		const w = mountArgs({ kind: "raw", reason: "unknown-contract", rows: [{ kind: "text", value: NARROW }], hidden: 0 })
		await w.find('[data-testid="t-raw-toggle"]').trigger("click")
		const row = w.find('[data-testid="t-arg"]')
		expect(row.classes()).toContain(ARGS.row)
		expect(row.element.lastElementChild?.textContent).toContain(NARROW)
	})
})
