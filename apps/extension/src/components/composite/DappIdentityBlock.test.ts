import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { mount } from "@vue/test-utils"
import postcss, { type ChildNode, type Rule } from "postcss"
import DappIdentityBlock from "./DappIdentityBlock.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: '<span :data-name="name" />', props: ["name", "size", "color", "loading"] },
	Tooltip: { template: "<div data-tooltip><slot /></div>" },
}

const factory = (props: Record<string, unknown> = {}) =>
	mount(DappIdentityBlock, {
		props: { actionLabel: "wants to connect", ...props },
		global: { stubs: STUBS },
	})

/** The block's own `<style module>` declarations for one rule; jsdom applies no stylesheet. */
const declarationsOf = (selector: string): Record<string, string> => {
	const source = readFileSync(join(__dirname, "DappIdentityBlock.vue"), "utf8").split("<style module>")[1] ?? ""
	const rule = postcss
		.parse(source.split("</style>")[0] ?? "")
		.nodes.find((node: ChildNode): node is Rule => node.type === "rule" && node.selector === selector)
	return Object.fromEntries((rule?.nodes ?? []).flatMap((node) => (node.type === "decl" ? [[node.prop, node.value]] : [])))
}

const LONG_ORIGIN = "https://checkout.staging.shielded-payroll-portal.example.com:8443"

describe("composite/DappIdentityBlock", () => {
	test("renders the dApp's full origin, scheme and port included", () => {
		const w = factory({ dapp: { url: "https://example.com:8443/pay?x=1" }, hostnameTestId: "execute-hostname" })
		expect(w.get('[data-testid="execute-hostname"]').text()).toBe("https://example.com:8443")
	})

	test("a long origin renders whole, in a line that wraps and never cuts", () => {
		const w = factory({ dapp: { url: `${LONG_ORIGIN}/checkout` }, hostnameTestId: "execute-hostname" })
		expect(w.get('[data-testid="execute-hostname"]').text()).toBe(LONG_ORIGIN)
		const line = declarationsOf(".dapp_hostname")
		expect(line).toMatchObject({ "min-width": "0", "overflow-wrap": "anywhere" })
		expect(line).not.toHaveProperty("text-overflow")
		expect(line).not.toHaveProperty("white-space")
		expect(line).not.toHaveProperty("overflow")
	})

	test("renders the action label", () => {
		const w = factory({ actionLabel: "wants to call" })
		expect(w.text()).toContain("wants to call")
	})

	test("renders the dapp name when present", () => {
		const w = factory({ dapp: { name: "MyDapp" } })
		expect(w.text()).toContain("MyDapp")
	})

	test("omits the name span when dapp.name is missing", () => {
		const w = factory({ dapp: { logoBlobUrl: "" } })
		expect(w.text()).not.toContain("undefined")
	})

	test("loading logo shows a loading icon", () => {
		const w = factory({ dapp: { loadingLogo: true } })
		expect(w.find('[data-name="app"]').exists()).toBe(true)
	})

	test("logo blob URL renders an <img>", () => {
		const w = factory({ dapp: { logoBlobUrl: "blob:http://x/abc" } })
		expect(w.find("img").attributes("src")).toBe("blob:http://x/abc")
	})

	test("a suspicious origin shows the warning as a visible line, not a tooltip", () => {
		const w = factory({ dapp: { url: "https://xn--tls-seda.nulo.sh" } })
		const line = w.get('[data-testid="dapp-hostname-warning"]')
		expect(line.text()).toBe(
			"This hostname contains non-ASCII or punycoded characters. Verify carefully. Some characters can imitate Latin letters.",
		)
		const icon = line.get('[data-name="warning"]')
		expect(icon.attributes("aria-hidden")).toBe("true")
		expect(line.element.firstElementChild).toBe(icon.element)
		expect(w.find("[data-tooltip]").exists()).toBe(false)
	})

	test("a safe origin shows no warning line", () => {
		const w = factory({ dapp: { url: "https://example.com" } })
		expect(w.find('[data-testid="dapp-hostname-warning"]').exists()).toBe(false)
		expect(w.find('[data-name="warning"]').exists()).toBe(false)
	})

	test("the logo aligns to the top beside a warning line and centres otherwise", () => {
		expect(factory({ dapp: { url: "https://xn--tls-seda.nulo.sh" } }).attributes("align")).toBe("start")
		expect(factory({ dapp: { url: "https://example.com" } }).attributes("align")).toBe("center")
	})

	test("hostnameTestId prop is forwarded to the hostname span", () => {
		const w = factory({ hostnameTestId: "discover-hostname" })
		expect(w.find('[data-testid="discover-hostname"]').exists()).toBe(true)
	})

	test("nameTestId prop is forwarded to the name span", () => {
		const w = factory({ dapp: { name: "MyDapp" }, nameTestId: "discover-dapp-name" })
		expect(w.find('[data-testid="discover-dapp-name"]').exists()).toBe(true)
	})

	test("actionTestId prop is forwarded to the action line", () => {
		const w = factory({ actionLabel: "wants to connect on Testnet", actionTestId: "discover-action" })
		expect(w.find('[data-testid="discover-action"]').text()).toBe("wants to connect on Testnet")
	})
})
