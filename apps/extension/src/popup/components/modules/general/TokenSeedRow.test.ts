import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { TEST_ICONS } from "@/wallet/services/token-list/list.fixture"
import TokenSeedRow from "./TokenSeedRow.vue"

const STUBS = { Flex: { template: "<div><slot /></div>" } }
const entry = (status: string) => ({ chainId: 1, contract: "0xseed", symbol: "cUSDC", displayName: "Clean USDC", status })
const mountRow = (status: string) => mount(TokenSeedRow, { props: { entry: entry(status) }, global: { stubs: STUBS } })

describe("TokenSeedRow", () => {
	test("pending, seeding and seeded-awaiting-its-row look the same: the list's symbol and label, a skeleton amount, no button", () => {
		for (const status of ["pending", "seeding", "seeded"]) {
			const w = mountRow(status)
			const row = w.get('[data-testid="token-seed-row"]')
			expect(row.attributes("data-status")).toBe(status)
			expect(row.attributes("data-symbol")).toBe("cUSDC")
			expect(row.attributes("aria-busy")).toBe("true")
			expect(w.text()).toContain("cUSDC")
			expect(w.text()).toContain("Clean USDC")
			// The mark and the two skeleton bars.
			expect(w.findAll('[aria-hidden="true"]')).toHaveLength(3)
			expect(w.find("button").exists()).toBe(false)
		}
	})

	test("failed: says so and offers RETRY, which emits and nothing else", async () => {
		const w = mountRow("failed")
		expect(w.get('[data-testid="token-seed-reason"]').text()).toBe("Couldn't set up")
		expect(w.get('[data-testid="token-seed-row"]').attributes("aria-busy")).toBeUndefined()
		await w.get('[data-testid="token-seed-retry"]').trigger("click")
		expect(w.emitted("retry")).toHaveLength(1)
	})

	test("rejected: a failed verification is not the user's to retry — no button at all", () => {
		const w = mountRow("rejected")
		expect(w.get('[data-testid="token-seed-reason"]').text()).toBe("Couldn't verify")
		expect(w.find("button").exists()).toBe(false)
	})

	test("inert: a div, never a link — there is no token page to open yet", () => {
		for (const status of ["pending", "failed", "rejected"]) {
			const w = mountRow(status)
			expect(w.element.tagName).toBe("DIV")
			expect(w.find("a").exists()).toBe(false)
			expect(w.html()).not.toContain("href")
		}
	})

	test("leads with the list's picture at 32 px, or its initials when the list gives none, working or stopped", () => {
		for (const status of ["pending", "failed", "rejected"]) {
			const pictured = mount(TokenSeedRow, { props: { entry: entry(status), icon: TEST_ICONS.USDC }, global: { stubs: STUBS } })
			const mark = pictured.get('[data-testid="token-mark"]')
			expect(mark.attributes()).toMatchObject({ "data-kind": "logo", "aria-hidden": "true" })
			expect(mark.attributes("style")).toContain("width: 32px")
			expect(mark.get("img").attributes("src")).toBe(TEST_ICONS.USDC)
			const bare = mountRow(status).get('[data-testid="token-mark"]')
			expect([bare.attributes("data-kind"), bare.text()]).toEqual(["initials", "CU"])
		}
	})

	test("stopped, its picture dims with its symbol and its reason and RETRY stay at full strength; working, nothing dims", () => {
		const DIMMED = (TokenSeedRow as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style.dimmed
		const dims = (status: string) => {
			const w = mount(TokenSeedRow, { props: { entry: entry(status), icon: TEST_ICONS.USDC }, global: { stubs: STUBS } })
			// null: the row shows no such element in this state.
			const dimmed = (testid: string) => {
				const el = w.find(`[data-testid="${testid}"]`)
				return el.exists() ? el.classes().includes(DIMMED) : null
			}
			const symbol = w.findAll("span").find((s) => s.text() === "cUSDC")
			return [dimmed("token-mark"), symbol?.classes().includes(DIMMED), dimmed("token-seed-reason"), dimmed("token-seed-retry")]
		}
		expect(dims("failed")).toEqual([true, true, false, false])
		expect(dims("rejected")).toEqual([true, true, false, null])
		for (const status of ["pending", "seeding", "seeded"]) expect([status, ...dims(status)]).toEqual([status, false, false, null, null])
	})

	test("renders its strings as text, never as markup", () => {
		const w = mount(TokenSeedRow, {
			props: { entry: { ...entry("pending"), symbol: "<b>x</b>", displayName: "<img src=x>" } },
			global: { stubs: STUBS },
		})
		expect(w.find("b").exists()).toBe(false)
		expect(w.find("img").exists()).toBe(false)
		expect(w.text()).toContain("<b>x</b>")
	})
})
