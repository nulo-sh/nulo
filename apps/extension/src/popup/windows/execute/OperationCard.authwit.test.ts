/**
 * A public grant is a persisted on-chain spend authorization, so its card names the spender, the
 * function and the contract in the action line, and below it every argument as the wallet signs it:
 * decoded from the fields the message hash commits to, each value whole, an address as its own text
 * with no name in its place. The content is wire-shaped (`grantPublicAuthwit` as the playground
 * sends it) and decodes through the real encoder, decoder and Token artifact.
 */

import { mount } from "@vue/test-utils"
import { beforeAll, describe, expect, test } from "vitest"
import type { DecodedGrant, UndecodedReason } from "@/wallet/services/execution/client"
import DottedTerm from "@/components/composite/DottedTerm.vue"
import { shownText } from "../../../../tests/helpers/shown-text"
import { GRANT, HUB, MAIN, RECIPIENT, USDC, USDC_TOKEN, decodeGrantFixture, stubTokenSelectors } from "./execute.fixture"
import OperationCard from "./OperationCard.vue"

const grantOp = (content: unknown = GRANT) => ({
	kind: "send_transaction" as const,
	networkId: "net-1",
	accountAddress: MAIN,
	account: { name: "Main", address: MAIN, profileId: "p1", chainId: 1, index: 0, type: 0, visible: true },
	network: { id: "net-1", chainId: 1, name: "N" },
	actions: [{ kind: "add_public_authwit" as const, content }],
	feeSettings: { paymentMethod: { kind: "fj" } },
})

const stubs = {
	AddressDisplay: { props: ["address"], template: '<i class="addr" :data-address="address" />' },
	Flex: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /></div>' },
	Text: { inheritAttrs: false, template: '<span v-bind="$attrs"><slot /></span>' },
	Icon: true,
	FeeSettingsCard: true,
}

const mountGrant = (props: { decodedGrants?: readonly DecodedGrant[]; tokens?: readonly unknown[] }, op = grantOp()) =>
	mount(OperationCard, { props: { op: op as never, index: 0, ...props } as never, global: { stubs } })
const byTestid = (w: ReturnType<typeof mountGrant>, id: string) => w.find(`[data-testid="${id}"]`)

/** Written out, not read from the source, so a changed line fails here. */
const LINES: Record<UndecodedReason, string> = {
	"unknown-contract": "Nulo doesn't have this contract's interface.",
	"unknown-function": "This function isn't in the interface Nulo has.",
	arguments: "The arguments don't fit the interface.",
	unavailable: "Nulo couldn't read the arguments right now.",
}
const ADVICE = "Check what the app says this does before approving."

let decoded: DecodedGrant
beforeAll(async () => {
	stubTokenSelectors()
	decoded = await decodeGrantFixture()
})

describe("OperationCard: a public grant", () => {
	test("on a registered token it reads as the transfer it signs: From and To whole, the amount in token units", () => {
		const w = mountGrant({ decodedGrants: [decoded], tokens: [USDC_TOKEN] })
		const row = byTestid(w, "execute-op-payload-row")
		expect(row.text()).toContain("Authorize public spend")
		expect(byTestid(w, "execute-authwit-spender").attributes("data-address")).toBe(HUB)
		expect(byTestid(w, "execute-authwit-contract").attributes("data-address")).toBe(USDC)
		expect(row.text()).toContain("Transfer (public)")
		// The arguments left the action line for their own rows.
		expect(byTestid(w, "execute-authwit-args").exists()).toBe(false)

		const args = byTestid(w, "execute-grant-args")
		expect(args.text()).toContain("Arguments")
		expect(byTestid(w, "execute-grant-transfer-sender-address").text()).toBe(MAIN)
		expect(byTestid(w, "execute-grant-transfer-to").text()).toBe(RECIPIENT)
		expect(byTestid(w, "execute-grant-amount").text()).toBe("25 USDC")
		expect(args.find(".addr").exists()).toBe(false)
	})

	test("on a contract the wallet has not registered as a token it reads as the parameters, each value whole", () => {
		const w = mountGrant({ decodedGrants: [decoded], tokens: [] })
		const line = byTestid(w, "execute-op-payload-row").text()
		expect(line).toContain("Transfer Public To Public")
		expect(line).not.toContain("Transfer (public)")
		const params = byTestid(w, "execute-grant-args").findAll('[data-testid="execute-grant-decoded-param"]')
		expect(params.map((p) => [p.attributes("data-param"), p.find('[data-testid="execute-grant-decoded-param-value"]').text()])).toEqual(
			[
				["from", MAIN],
				["to", RECIPIENT],
				["amount", "25000000"],
				["_nonce", `0x${"0".repeat(64)}`],
			],
		)
		expect(byTestid(w, "execute-grant-args").find(".addr").exists()).toBe(false)
	})

	test("two grants: each action line takes its own grant's reading", () => {
		const call = { kind: "call" as const, contract: MAIN, method: "noop", args: [] }
		const grants = [GRANT, GRANT].map((content) => ({ kind: "add_public_authwit" as const, content }))
		const op = { ...grantOp(), actions: [call, ...grants] }
		const w = mountGrant(
			{ decodedGrants: [{ kind: "undecoded", reason: "unknown-contract" }, decoded], tokens: [USDC_TOKEN] },
			op as never,
		)
		const lines = w.findAll('[data-testid="execute-op-payload-row"]').map((r) => r.text())
		expect(lines).toHaveLength(3)
		expect(lines[1]).toContain("Transfer Public To Public")
		expect(lines[2]).toContain("Transfer (public)")
	})

	test("three grants, the first two unreadable: each says why, and the advice reads once, under the second", () => {
		const grants = [GRANT, GRANT, GRANT].map((content) => ({ kind: "add_public_authwit" as const, content }))
		const w = mountGrant(
			{
				decodedGrants: [
					{ kind: "undecoded", reason: "unknown-contract" },
					{ kind: "undecoded", reason: "unknown-function" },
					decoded,
				],
				tokens: [USDC_TOKEN],
			},
			{ ...grantOp(), actions: grants } as never,
		)
		const blocks = w.findAll('[data-testid="execute-grant-args"]')
		expect(blocks.map((b) => b.find('[data-testid="execute-grant-unverified-reason"]').exists())).toEqual([true, true, false])
		expect(w.findAll('[data-testid="execute-grant-unverified-advice"]')).toHaveLength(1)
		expect(blocks[1]!.find('[data-testid="execute-grant-unverified-advice"]').text()).toBe(ADVICE)
	})

	test("while the wallet decodes, its arguments read as pending", () => {
		const w = mountGrant({ decodedGrants: undefined, tokens: [USDC_TOKEN] })
		expect(byTestid(w, "execute-grant-args-pending").text()).toBe("Reading arguments…")
	})

	test.each(["unknown-contract", "unknown-function", "arguments", "unavailable"] satisfies UndecodedReason[])(
		"undecoded (%s): the card's warning and why, the dApp's arguments whole behind the toggle",
		async (reason) => {
			const w = mountGrant({ decodedGrants: [{ kind: "undecoded", reason }], tokens: [USDC_TOKEN] })
			const args = byTestid(w, "execute-grant-unverified-args")
			expect(args.attributes("data-reason")).toBe(reason)
			expect(byTestid(w, "execute-grant-unverified-warning").text()).toBe("Can't read the arguments")
			expect(shownText(byTestid(w, "execute-grant-unverified-reason").element)).toBe(LINES[reason])
			expect(w.findAllComponents(DottedTerm).map((t) => t.props("term"))).toEqual(reason === "unavailable" ? [] : ["interface"])
			expect(byTestid(w, "execute-grant-unverified-advice").text()).toBe(ADVICE)
			await byTestid(w, "execute-grant-raw-toggle").trigger("click")
			expect(w.findAll('[data-testid="execute-grant-arg-field"]').map((f) => f.text().split(" ")[0])).toEqual([MAIN, RECIPIENT])
		},
	)

	test("an encoded_call content still surfaces the spender, and reads as unreadable", () => {
		const content = { kind: "encoded_call", caller: HUB, to: USDC, selector: "0xc47adea0", args: [] }
		const w = mountGrant({ decodedGrants: [{ kind: "undecoded", reason: "unavailable" }] }, grantOp(content))
		expect(byTestid(w, "execute-authwit-spender").attributes("data-address")).toBe(HUB)
		expect(byTestid(w, "execute-grant-unverified-args").attributes("data-reason")).toBe("unavailable")
		expect(w.html()).not.toContain("(encoded_call)")
	})
})
