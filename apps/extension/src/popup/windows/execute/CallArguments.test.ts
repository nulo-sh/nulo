/**
 * The argument block's value tree and raw layer, on the fixtures the armed build renders: a struct or
 * an array reads as one row per field or item under its name, ancestry kept in the DOM past the
 * sixth level; a readable call's wire fields sit behind a closed press, capped where the JSON view
 * holds the rest. jsdom applies no stylesheet: the smoke spec measures the rows inside the card.
 */
import { mount, type VueWrapper } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { executeFixture, POOL_A, POOL_B, USDC } from "@/e2e/execute-fixture"
import type { Account } from "@/wallet/services/account/client"
import type { DecodedCall } from "@/wallet/services/execution/client"
import type { Network } from "@/wallet/services/network/client"
import CallArguments from "./CallArguments.vue"
import { field, MAIN } from "./execute.fixture"
import { type CallSurface, rawRows } from "./call-surface"
import ValueTree from "./ValueTree.vue"

const ACCOUNT = { name: "Main", address: MAIN, chainId: 1 } as Account
const NETWORK = { id: "net-1", chainId: 1, name: "N" } as Network
const TREE = (ValueTree as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style

type Call = { to: string; args: string[] }
const fixtureCalls = (name: string) => {
	const f = executeFixture(name, ACCOUNT, NETWORK)
	if (!f) throw new Error(name)
	const calls = (f.operations[0] as unknown as { exec: { calls: Call[] } }).exec.calls
	return calls.map((call, j) => ({ call, decoded: f.decodedCalls[0][j] }))
}
const surfaceOf = (decoded: DecodedCall): CallSurface =>
	decoded.kind === "decoded" ? { kind: "decoded", fn: decoded.fn, params: decoded.params } : { kind: "pending" }

const stubs = {
	AddressDisplay: { props: ["address"], template: '<span class="addr" v-bind="$attrs">{{ address }}</span>' },
	Flex: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /></div>' },
	Text: { inheritAttrs: false, template: '<span v-bind="$attrs"><slot /></span>' },
	Icon: true,
	DottedTerm: { template: "<span><slot /></span>" },
}
const mountArgs = (props: Record<string, unknown>) =>
	mount(CallArguments, { props: { contract: MAIN, prefix: "t", ...props } as never, global: { stubs } })

const params = (w: VueWrapper) => w.findAll('[data-testid="t-decoded-param"]')
const nameIn = (row: Element) => row.querySelector('[data-testid="t-decoded-param-name"]')?.textContent
const valueIn = (row: Element) => row.querySelector('[data-testid="t-decoded-param-value"]')?.textContent?.trim()
/** The names a row's value sits under, read from the DOM: each enclosing group follows its branch's row. */
const ancestry = (row: Element): string[] => {
	const names: string[] = []
	for (
		let group = row.parentElement;
		group?.previousElementSibling?.matches('[data-testid="t-decoded-param"]');
		group = group.parentElement
	) {
		names.unshift(group.previousElementSibling.getAttribute("data-param") ?? "")
	}
	return names
}

describe("the value tree", () => {
	test("a struct and an array read as one row per field and item under their names, and no row holds another", () => {
		const [deposit] = fixtureCalls("batch")
		const w = mountArgs({ surface: surfaceOf(deposit.decoded) })
		const rows = params(w).map((r) => r.element)
		expect(rows.map((r) => `${r.getAttribute("data-depth")}:${nameIn(r)}${valueIn(r) ? ` ${valueIn(r)}` : ""}`)).toEqual([
			"0:order:",
			`1:token: ${USDC}`,
			"1:amount: 25000000",
			`1:recipient: ${MAIN}`,
			"1:deadline: 1767225600",
			"0:route:",
			"1:[0]:",
			`2:pool: ${POOL_A}`,
			"2:fee_bps: 30",
			"1:[1]:",
			`2:pool: ${POOL_B}`,
			"2:fee_bps: 5",
		])
		expect(rows.every((r) => r.querySelector('[data-testid="t-decoded-param"]') === null)).toBe(true)
		expect(rows.filter((r) => r.querySelector(".addr")).length).toBe(4)
		expect(rows[0].getAttribute("data-value-kind")).toBe("struct")
		expect(rows[6].getAttribute("data-param")).toBe("[0]")
	})

	test("two leaves of one name past the sixth level are told apart by their ancestry", () => {
		const [rebalance] = fixtureCalls("ancestry")
		const leaves = params(mountArgs({ surface: surfaceOf(rebalance.decoded) }))
			.map((r) => r.element)
			.filter((r) => r.getAttribute("data-param") === "amount")
		expect(leaves.map((r) => r.getAttribute("data-depth"))).toEqual(["8", "8"])
		expect(leaves.map(ancestry)).toEqual([
			["route", "inbound", "leg", "leg", "leg", "leg", "leg", "leg"],
			["route", "outbound", "leg", "leg", "leg", "leg", "leg", "leg"],
		])
		expect(leaves.map(valueIn)).toEqual(["1000", "9000000"])
	})

	test("a level past the fourth indents narrow, past the sixth by its guide alone", () => {
		const [configure] = fixtureCalls("depth")
		const rows = params(mountArgs({ surface: surfaceOf(configure.decoded) })).map((r) => r.element)
		expect(rows.at(-1)?.getAttribute("data-depth")).toBe("32")
		const indentOf = (depth: number) => rows.find((r) => r.getAttribute("data-depth") === String(depth))?.parentElement?.classList
		expect([1, 4, 5, 6, 7, 32].map((d) => [TREE.wide, TREE.narrow, TREE.tight].find((c) => indentOf(d)?.contains(c)))).toEqual([
			TREE.wide,
			TREE.wide,
			TREE.narrow,
			TREE.narrow,
			TREE.tight,
			TREE.tight,
		])
	})

	test("an empty struct or array reads as one value; `full` prints an address whole, as text", () => {
		const surface: CallSurface = {
			kind: "decoded",
			fn: "f",
			params: [
				{ name: "none", value: { kind: "struct", fields: [] } },
				{ name: "list", value: { kind: "array", items: [] } },
				{ name: "who", value: { kind: "address", value: MAIN } },
			],
		}
		const rows = params(mountArgs({ surface, full: true })).map((r) => r.element)
		expect(rows.map(valueIn)).toEqual(["{}", "[]", MAIN])
		expect(rows[2].querySelector(".addr")).toBeNull()
		expect(rows.every((r) => r.classList.contains(TREE.full))).toBe(true)
	})

	test("control: a decode of scalars reads as today, one row per parameter, with no group", () => {
		const [transfer] = fixtureCalls("one")
		const surface: CallSurface =
			transfer.decoded.kind === "decoded"
				? { kind: "decoded", fn: transfer.decoded.fn, params: transfer.decoded.params, labels: "unchecked" }
				: { kind: "pending" }
		const w = mountArgs({ surface })
		expect(params(w).map((r) => `${r.attributes("data-depth")}:${r.attributes("data-param")}`)).toEqual([
			"0:from",
			"0:to",
			"0:amount",
			"0:_nonce",
		])
		expect(w.find(`.${TREE.children}`).exists()).toBe(false)
		expect(w.find('[data-testid="t-labels-warning"]').exists()).toBe(true)
	})
})

describe("raw values under a readable call", () => {
	test("closed by default; open, the wire fields the call carries", async () => {
		const [deposit] = fixtureCalls("batch")
		const w = mountArgs({ surface: surfaceOf(deposit.decoded), raw: rawRows(deposit.call.args), jsonView: true })
		const toggle = w.get('[data-testid="t-raw-toggle"]')
		expect(toggle.text()).toBe(`Show ${deposit.call.args.length} raw values`)
		expect(w.find('[data-testid="t-raw-args"]').exists()).toBe(false)
		await toggle.trigger("click")
		expect(w.findAll('[data-testid="t-arg-field"]').map((f) => f.attributes("title"))).toEqual(deposit.call.args)
		expect(w.find('[data-testid="t-args-more"]').exists()).toBe(false)
	})

	test("a call's 33rd field on is left to the JSON view; an authorization's rows are all shown", async () => {
		const args = Array.from({ length: 40 }, (_, i) => field(BigInt(i)))
		const surface: CallSurface = { kind: "decoded", fn: "f", params: [{ name: "a", value: { kind: "integer", value: "1" } }] }
		const call = mountArgs({ surface, raw: rawRows(args), jsonView: true })
		await call.get('[data-testid="t-raw-toggle"]').trigger("click")
		expect(call.findAll('[data-testid="t-arg"]')).toHaveLength(32)
		expect(call.get('[data-testid="t-args-more"]').text()).toBe("+8 more in the JSON view")
		const authwit = mountArgs({ surface, raw: rawRows(args, Number.POSITIVE_INFINITY) })
		await authwit.get('[data-testid="t-raw-toggle"]').trigger("click")
		expect(authwit.findAll('[data-testid="t-arg"]')).toHaveLength(40)
		expect(authwit.find('[data-testid="t-args-more"]').exists()).toBe(false)
	})

	test("control: an unreadable call shows its own fields once, behind its notice; a host's rows add none", async () => {
		const args = [field(1n), field(2n)]
		const surface: CallSurface = { kind: "raw", reason: "unknown-contract", ...rawRows(args) }
		const w = mountArgs({ surface, raw: rawRows([field(9n)]) })
		expect(w.findAll('[data-testid="t-raw-toggle"]')).toHaveLength(1)
		await w.get('[data-testid="t-raw-toggle"]').trigger("click")
		expect(w.findAll('[data-testid="t-arg-field"]').map((f) => f.attributes("title"))).toEqual(args)
		expect(w.find('[data-testid="t-unverified-warning"]').exists()).toBe(true)
	})
})
