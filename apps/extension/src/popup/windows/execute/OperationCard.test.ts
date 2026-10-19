import { mount } from "@vue/test-utils"
import { FEE_JUICE_ADDRESS } from "@aztec-labs/constants"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { describe, expect, test, vi } from "vitest"
import { trimAddress } from "@/utils/string"
import OperationCard from "./OperationCard.vue"

const mounts = vi.hoisted(() => ({ count: 0 }))
const stubs = {
	Flex: { inheritAttrs: false, template: `<div v-bind="$attrs"><slot /></div>` },
	Text: { inheritAttrs: false, template: `<span v-bind="$attrs"><slot /></span>` },
	AddressDisplay: {
		props: ["address"],
		setup() {
			mounts.count++
		},
		template: `<i data-testid="address" :data-address="address" />`,
	},
	FeeSettingsCard: true,
	Icon: true,
	Badge: true,
	Tooltip: true,
}

const execOp = (kind: "aztec_simulateTx" | "aztec_profileTx", to: string) => ({
	kind,
	networkId: "net",
	accountAddress: "0xacct",
	exec: { calls: [{ name: "transfer", to, selector: undefined }] },
	opts: {},
})

const authwitOp = (kind: "send_transaction" | "simulate_transaction") => ({
	kind,
	account: { name: "Owner", address: "0xacct" },
	actions: [
		{ kind: "call", contract: "0xtoken", method: "transfer", args: [] },
		{
			kind: "add_public_authwit",
			content: {
				kind: "call",
				caller: "0xspender",
				contract: "0xtoken",
				method: "transfer_in_public",
				args: ["1", `ab\u0007cd${"x".repeat(60)}`],
			},
		},
	],
})

const mountCard = (op: unknown) =>
	mount(OperationCard, {
		props: { op: op as never, index: 0 },
		// The template reaches these utils through the build's auto-import; vitest registers none.
		global: { stubs, mocks: { trimAddress } },
	})

describe("windows/execute/OperationCard", () => {
	test("simulate and profile render the same payload rows", () => {
		for (const kind of ["aztec_simulateTx", "aztec_profileTx"] as const) {
			const w = mountCard(execOp(kind, "0xaaa"))
			const row = w.find("[data-testid='execute-op-payload-row']")
			expect(row.exists()).toBe(true)
			expect(row.attributes("data-call-to")).toBe("0xaaa")
			expect(w.find("[data-testid='execute-op-call-to']").attributes("data-address")).toBe("0xaaa")
		}
	})

	test("simulate and profile name a call by its own name: they read no call, so no name earns a movement label", () => {
		for (const kind of ["aztec_simulateTx", "aztec_profileTx"] as const) {
			const op = execOp(kind, "0xtoken")
			op.exec.calls[0]!.name = "transfer_in_public"
			const row = mountCard(op).get("[data-testid='execute-op-payload-row']")
			expect(row.text()).toContain("Transfer In Public")
			expect(row.text()).not.toContain("Transfer (public)")
		}
	})

	test("a utility call's `claim` reads as Fee Juice's only on the Fee Juice contract", () => {
		const FEE_JUICE = AztecAddress.fromNumberUnsafe(FEE_JUICE_ADDRESS).toString()
		const ops = (to: string) => [
			{ kind: "aztec_executeUtility", call: { to, name: "claim", selector: "0x12345678" } },
			{ kind: "simulate_utility", contract: to, method: "claim" },
		]
		for (const op of ops("0xtoken")) expect(mountCard(op).text()).toMatch(/Function:\s*Claim(?! Fee Juice)/)
		for (const op of ops(FEE_JUICE)) expect(mountCard(op).text()).toContain("Claim Fee Juice")
	})

	test("switching the kind with a new destination remounts the payload subtree", async () => {
		const w = mountCard(execOp("aztec_simulateTx", "0xaaa"))
		const before = mounts.count
		await w.setProps({ op: execOp("aztec_profileTx", "0xbbb") as never })
		expect(w.find("[data-testid='execute-op-call-to']").attributes("data-address")).toBe("0xbbb")
		expect(mounts.count).toBe(before + 1)
	})
})

describe("windows/execute/OperationCard — action rows", () => {
	test.each(["send_transaction", "simulate_transaction"] as const)(
		"%s renders a public authwit with its spender, method and contract",
		(kind) => {
			const w = mountCard(authwitOp(kind))
			const rows = w.findAll("[data-testid='execute-op-payload-row']")
			expect(rows).toHaveLength(2)
			expect(rows[1]?.text()).toContain("Authorize public spend")
			const addresses = rows[1]?.findAll("i[data-address]").map((a) => a.attributes("data-address"))
			expect(addresses).toEqual(["0xspender", "0xtoken"])
			// No reading reaches this card, so the method reads as its contract spells it.
			expect(rows[1]?.text()).toContain("Transfer In Public")
			expect(rows[1]?.text()).not.toContain("add public authwit")
		},
	)

	test("a grant's `claim` takes the Fee Juice label only on the Fee Juice contract", () => {
		const claimOn = (contract: string) => {
			const op = authwitOp("send_transaction")
			op.actions[1] = { kind: "add_public_authwit", content: { ...op.actions[1].content, contract, method: "claim" } } as never
			return mountCard(op).findAll("[data-testid='execute-op-payload-row']")[1]?.text()
		}
		expect(claimOn("0xtoken")).toContain("Claim")
		expect(claimOn("0xtoken")).not.toContain("Claim Fee Juice")
		expect(claimOn(AztecAddress.fromNumberUnsafe(FEE_JUICE_ADDRESS).toString())).toContain("Claim Fee Juice")
	})

	test("a simulation keeps a grant's arguments in its action line; a send moves them to the grant's own rows", () => {
		// Args are wire strings: control characters stripped, capped at 48 code points plus an ellipsis.
		const simulated = mountCard(authwitOp("simulate_transaction")).find("[data-testid='execute-authwit-args']")
		expect(simulated.text()).toBe(`1, abcd${"x".repeat(44)}…`)
		const sent = mountCard(authwitOp("send_transaction"))
		expect(sent.find("[data-testid='execute-authwit-args']").exists()).toBe(false)
		expect(sent.find("[data-testid='execute-grant-args']").exists()).toBe(true)
	})
})

describe("windows/execute/OperationCard — a token add", () => {
	const token = `0x${"0c".repeat(32)}`
	const ROWS = ["register-token-symbol-row", "register-token-name-row", "register-token-decimals-row"]
	const VALUES = ["register-token-symbol", "register-token-name", "register-token-decimals"]
	const mountTokenAdd = (props: Record<string, unknown>) =>
		mount(OperationCard, {
			props: {
				op: { kind: "register_token", account: { name: "Owner", address: "0xacct" }, address: token } as never,
				index: 0,
				...props,
			},
			global: {
				stubs: {
					...stubs,
					Skeleton: {
						props: ["width", "height"],
						template: `<span data-testid="stub-skeleton" :data-width="width" :data-height="height" />`,
					},
				},
			},
		})

	test("the details read as three labelled rows with bars, then the same rows hold the values", async () => {
		const w = mountTokenAdd({ tokenMetadataLoading: true, tokenMetadata: { symbol: "USDC", name: "USDC", decimals: 6 } })
		const details = w.get("[data-testid='register-token-details']")
		expect(details.attributes("role")).toBe("status")
		expect(details.attributes("aria-busy")).toBe("true")
		const rows = ROWS.map((id) => w.get(`[data-testid='${id}']`))
		for (const row of rows) expect(row.element.parentElement).toBe(details.element)
		expect(rows.map((row) => row.element.firstElementChild?.textContent)).toEqual(["Symbol:", "Name:", "Decimals:"])
		const bars = rows.map((row) => row.get("[data-testid='stub-skeleton']"))
		expect(bars.map((bar) => [bar.attributes("data-width"), bar.attributes("data-height")])).toEqual([
			["40", "12"],
			["84", "12"],
			["20", "12"],
		])
		for (const id of VALUES) expect(w.find(`[data-testid='${id}']`).exists(), id).toBe(false)
		expect(w.text()).not.toContain("Loading")
		expect(w.get("[data-testid='register-token-address']").attributes("data-address")).toBe(token)

		await w.setProps({ tokenMetadataLoading: false })
		for (const [i, row] of rows.entries()) expect(w.get(`[data-testid='${ROWS[i]}']`).element).toBe(row.element)
		const values = VALUES.map((id) => w.get(`[data-testid='${id}']`))
		expect(values.map((value) => value.text())).toEqual(["USDC", "USDC", "6"])
		expect(values.map((value) => value.attributes("variant"))).toEqual(["name", "name", "name"])
		expect(w.find("[data-testid='stub-skeleton']").exists()).toBe(false)
		expect(w.get("[data-testid='register-token-details']").attributes("aria-busy")).toBeUndefined()
	})

	test("a name that differs from its symbol reads plainly, and decimals as a number", () => {
		const w = mountTokenAdd({ tokenMetadata: { symbol: "TST", name: "TestToken", decimals: 18 } })
		expect(VALUES.map((id) => w.get(`[data-testid='${id}']`).text())).toEqual(["TST", "TestToken", "18"])
	})

	test("a token whose details cannot be read points the person at Reject, since Confirm stays off", () => {
		const w = mountTokenAdd({ tokenMetadataError: "read failed" })
		const lines = w.get("[data-testid='register-token-meta-error']").element.parentElement?.children ?? []
		expect([...lines].map((line) => line.textContent?.trim())).toEqual([
			"Couldn't resolve token metadata",
			"Reject this request and ask the app to add the token again.",
		])
		expect(w.find("[data-testid='register-token-details']").exists()).toBe(false)
		expect(w.get("[data-testid='register-token-address']").attributes("data-address")).toBe(token)
	})
})
