/**
 * A dApp controls the function names and argument values the execute card shows, up to their
 * 64-character caps. In mono, 64 narrow glyphs run wider than the card, so each place that holds
 * them must let them break: these cases pin the wrapping classes on the elements that render them.
 * jsdom applies no stylesheet; the window sweep measures the rendered payload against the card.
 */

import { mount } from "@vue/test-utils"
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
