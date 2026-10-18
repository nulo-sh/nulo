import { Flex } from "@nulo/design"
import { mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { defineComponent, h } from "vue"
import DetailHeroMeta from "./DetailHeroMeta.vue"

const HASH = `0x${"ab".repeat(32)}`
const EXPLORER_URL = `https://testnet.aztecscan.xyz/tx-effects/${HASH}`
const TIME = "Oct 18, 2026 · 12:04"

function mountHero(props: Record<string, unknown>) {
	return mount(DetailHeroMeta, {
		props: { explorerName: "Aztecscan", ...props },
		global: { components: { Flex }, stubs: { Icon: true } },
	})
}

const separator = (w: ReturnType<typeof mountHero>) => w.findAll("span").filter((s) => s.text() === "·")

describe("DetailHeroMeta", () => {
	test("a time alone shows no separator", () => {
		const w = mountHero({ time: TIME })
		expect(w.text()).toBe(TIME)
		expect(separator(w)).toHaveLength(0)
	})

	test("a time and an explorer URL show the time, a separator and the explorer link", () => {
		const w = mountHero({ time: TIME, explorerUrl: EXPLORER_URL, hash: HASH })
		expect(w.text()).toContain(TIME)
		expect(separator(w)).toHaveLength(1)
		const link = w.get("a")
		expect(link.attributes("href")).toBe(EXPLORER_URL)
		expect(link.text()).toBe("View on Aztecscan")
		expect(w.text()).not.toContain("Copy hash")
	})

	test("without an explorer URL, the hash is offered as a copy that emits it", async () => {
		const w = mountHero({ time: TIME, hash: HASH })
		expect(w.find("a").exists()).toBe(false)
		expect(separator(w)).toHaveLength(1)
		const copy = w.findAll("span").find((s) => s.text() === "Copy hash")
		await copy?.trigger("click")
		expect(w.emitted("copy")).toEqual([[HASH]])
	})

	test("with no hash and no explorer URL, neither the link nor the copy shows", () => {
		const w = mountHero({ time: null })
		expect(w.find("a").exists()).toBe(false)
		expect(w.text()).toBe("")
	})

	test("the link and copy testids land on their elements, and none is set when not given", () => {
		expect(
			mountHero({ explorerUrl: EXPLORER_URL, linkTestid: "journal-detail-explorer-link" }).get("a").attributes("data-testid"),
		).toBe("journal-detail-explorer-link")
		expect(
			mountHero({ hash: HASH, copyTestid: "tx-detail-pending-copy-hash" }).find('[data-testid="tx-detail-pending-copy-hash"]').text(),
		).toBe("Copy hash")
		expect(mountHero({ time: TIME, explorerUrl: EXPLORER_URL }).find("[data-testid]").exists()).toBe(false)
		expect(mountHero({ time: TIME, hash: HASH }).find("[data-testid]").exists()).toBe(false)
	})

	test("the explorer link opens a new tab with no opener and no referrer", () => {
		const link = mountHero({ explorerUrl: EXPLORER_URL }).get("a")
		expect(link.attributes("target")).toBe("_blank")
		expect(link.attributes("rel")).toBe("noopener noreferrer")
	})

	test("a click on the explorer link does not reach the page, while a click on the time does", async () => {
		const onParentClick = vi.fn()
		const parent = mount(
			defineComponent({
				render: () =>
					h("div", { onClick: onParentClick }, [
						h(DetailHeroMeta, { time: TIME, explorerUrl: EXPLORER_URL, explorerName: "Aztecscan" }),
					]),
			}),
			{ global: { components: { Flex }, stubs: { Icon: true } } },
		)
		const link = parent.get("a")
		link.element.addEventListener("click", (event) => event.preventDefault())
		await link.trigger("click")
		expect(onParentClick).not.toHaveBeenCalled()
		await parent
			.findAll("span")
			.find((s) => s.text() === TIME)
			?.trigger("click")
		expect(onParentClick).toHaveBeenCalledOnce()
	})
})
