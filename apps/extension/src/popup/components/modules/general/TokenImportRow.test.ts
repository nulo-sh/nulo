import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { TEST_ICONS } from "@/wallet/services/token-list/list.fixture"
import TokenImportRow from "./TokenImportRow.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Spinner: { template: '<i data-testid="stub-spinner" />' },
	Icon: { template: '<i :data-name="name" />', props: ["name", "size", "color"] },
}

const baseOp = {
	id: "abc123",
	kind: "token_import" as const,
	contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
	title: undefined,
	subtitle: "Adding token…",
	progress: { stage: "simulating" as const },
	error: null,
	terminalAt: null,
}

describe("TokenImportRow", () => {
	test("with no picture from the list, leads with grey initials of its title at 32 px; a title that names no letter, or none yet, gets the mark's dash", () => {
		const mark = (title: string | undefined) =>
			mount(TokenImportRow, { props: { op: { ...baseOp, title } }, global: { stubs: STUBS } }).get('[data-testid="token-mark"]')
		const named = mark("USDC")
		expect(named.attributes()).toMatchObject({ "data-kind": "initials", "aria-hidden": "true" })
		expect(named.attributes("style")).toContain("width: 32px")
		expect([named.text(), named.find("img").exists()]).toEqual(["US", false])
		for (const title of [undefined, "", "   ", "…!"]) expect([title, mark(title).text()]).toEqual([title, "—"])
	})

	test("draws the list's picture it is given, whether or not its symbol has been read", () => {
		for (const title of ["USDC", undefined]) {
			const w = mount(TokenImportRow, { props: { op: { ...baseOp, title }, icon: TEST_ICONS.USDC }, global: { stubs: STUBS } })
			const mark = w.get('[data-testid="token-mark"]')
			expect([title, mark.attributes("data-kind"), mark.get("img").attributes("src")]).toEqual([title, "logo", TEST_ICONS.USDC])
		}
	})

	test("in-flight: renders truncated contract address as title and the configured subtitle", () => {
		const w = mount(TokenImportRow, { props: { op: baseOp }, global: { stubs: STUBS } })
		expect(w.find('[data-testid="token-import-title"]').text()).toBe("0x1234…5678")
		expect(w.find('[data-testid="token-import-subtitle"]').text()).toBe("Adding token…")
		expect(w.find('[data-testid="token-import-spinner"]').exists()).toBe(true)
		expect(w.find('[data-testid="token-import-failed"]').exists()).toBe(false)
	})

	test("in-flight: prefers explicit `op.title` over truncated address", () => {
		const w = mount(TokenImportRow, { props: { op: { ...baseOp, title: "USDC" } }, global: { stubs: STUBS } })
		expect(w.find('[data-testid="token-import-title"]').text()).toBe("USDC")
	})

	test("in-flight: a title of spaces reads as the empty-value dash in the symbol style; an empty one keeps the address", () => {
		const blank = mount(TokenImportRow, { props: { op: { ...baseOp, title: "   " } }, global: { stubs: STUBS } })
		const title = blank.get('[data-testid="token-import-title"]')
		expect(title.text()).toBe("—")
		const styled = (part: string) => title.classes().some((c) => c.includes(part))
		expect([styled("symbol"), styled("address")]).toEqual([true, false])
		const empty = mount(TokenImportRow, { props: { op: { ...baseOp, title: "" } }, global: { stubs: STUBS } })
		expect(empty.get('[data-testid="token-import-title"]').text()).toBe("0x1234…5678")
	})

	test("failed: shows the square-cross icon, no spinner; subtitle falls back to error message", () => {
		const failedOp = {
			...baseOp,
			progress: { stage: "failed" as const },
			error: { kind: "metadata_fetch", message: "Could not fetch decimals", normalizedRaw: null },
			terminalAt: Date.now(),
		}
		const w = mount(TokenImportRow, { props: { op: failedOp }, global: { stubs: STUBS } })
		expect(w.find('[data-testid="token-import-spinner"]').exists()).toBe(false)
		expect(w.find('[data-testid="token-import-failed"]').exists()).toBe(true)
		expect(w.find('[data-testid="token-import-subtitle"]').text()).toBe("Could not fetch decimals")
	})

	test("its title takes the cut in flight and failed", () => {
		const CUT = (TokenImportRow as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style.title
		const cut = (op: Record<string, unknown>) =>
			mount(TokenImportRow, { props: { op: { ...baseOp, title: "USDC", ...op } }, global: { stubs: STUBS } })
				.get('[data-testid="token-import-title"]')
				.classes()
				.includes(CUT)
		const failed = { progress: { stage: "failed" }, error: { kind: "unknown", message: "", normalizedRaw: null }, terminalAt: 1 }
		expect([typeof CUT, cut({}), cut(failed)]).toEqual(["string", true, true])
	})

	test("failed: subtitle falls back to a generic copy if the error envelope has no message", () => {
		const failedOp = {
			...baseOp,
			progress: { stage: "failed" as const },
			error: { kind: "unknown", message: "", normalizedRaw: null },
			terminalAt: Date.now(),
		}
		const w = mount(TokenImportRow, { props: { op: failedOp }, global: { stubs: STUBS } })
		expect(w.find('[data-testid="token-import-subtitle"]').text()).toBe("Couldn't add token")
	})
})
