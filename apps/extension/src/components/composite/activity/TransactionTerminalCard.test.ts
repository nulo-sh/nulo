/**
 * The card is presentational: `@/utils/journal-state.ts` owns the kind → display mapping and has
 * its own suite, so this file pins only the rendering contract.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { GlyphName } from "@nulo/design"
import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import type { RowDirection } from "@/utils/row-direction"
import TransactionTerminalCard from "./TransactionTerminalCard.vue"

/** Test runs answer every CSS-module name with a class, so a color's missing rule shows only here. */
const SOURCE = readFileSync(resolve(__dirname, "TransactionTerminalCard.vue"), "utf8")

const STUBS = {
	Flex: { template: '<div :class="$attrs.class"><slot /></div>', inheritAttrs: false },
	Text: { template: "<span><slot /></span>" },
	Icon: {
		template: '<span data-testid="stub-icon" :data-name="name" :data-fill="color" />',
		props: ["name", "size", "color"],
	},
	Spinner: { template: '<span data-testid="stub-spinner" />' },
	TransactionCardLayout: {
		template: `
			<div :data-testid="testId">
				<span class="title">{{ title }}</span>
				<slot name="title-trailing" />
				<span class="layout-icon" :data-icon="icon" />
				<slot name="badge" />
				<slot name="secondary" />
				<slot name="actions" />
				<span class="amount">{{ amount }}</span>
				<span class="symbol">{{ amountSymbol }}</span>
			</div>
		`,
		props: ["title", "icon", "amount", "amountSymbol", "titleNamesToken", "direction", "testId", "to", "oneLineTitle"],
	},
}

type CardProps = {
	title: string
	subtitle: string
	icon: GlyphName
	color: "gray" | "amber" | "red" | "green"
	activityIcon?: GlyphName
	originLabel?: string | null
	direction?: RowDirection | null
	amount?: string | null
	amountSymbol?: string | null
	titleNamesToken?: boolean
	oneLineTitle?: boolean
	to?: string
}

const CANCELLED: CardProps = { title: "swap", subtitle: "Cancelled", icon: "square-cross", color: "gray" }
const INTERRUPTED: CardProps = { title: "swap", subtitle: "Transaction was interrupted", icon: "refresh", color: "amber" }
const FAILED: CardProps = { title: "swap", subtitle: "Network error", icon: "square-cross", color: "red" }
const SENT: CardProps = { title: "USDC", subtitle: "Sent", icon: "square-check", color: "green" }

const mountCard = (props: CardProps) => mount(TransactionTerminalCard, { props, global: { stubs: STUBS } })

describe("composite/TransactionTerminalCard", () => {
	test("renders the title verbatim", () => {
		const w = mountCard({ ...FAILED, title: "Sending 5 USDC" })
		expect(w.text()).toContain("Sending 5 USDC")
	})

	test("renders the subtitle verbatim", () => {
		const w = mountCard({ ...INTERRUPTED, subtitle: "Transaction was interrupted" })
		expect(w.text()).toContain("Transaction was interrupted")
	})

	test("subtitle status region is atomic (cross-AT consistency per WAI ARIA-22)", () => {
		const w = mountCard(CANCELLED)
		const statusEl = w.find('[role="status"]')
		expect(statusEl.attributes("aria-live")).toBe("polite")
		expect(statusEl.attributes("aria-atomic")).toBe("true")
	})

	test("Cancelled state: gray status icon + square-cross", () => {
		const w = mountCard(CANCELLED)
		const badgeIcon = w.find('[data-testid="activity-status-icon"][data-color="gray"]')
		expect(badgeIcon.exists()).toBe(true)
		expect(badgeIcon.attributes("data-fill")).toBe("gray")
		expect(badgeIcon.attributes("data-name")).toBe("square-cross")
	})

	test("Interrupted state: amber status icon, filled with the warning text token, + refresh", () => {
		const w = mountCard(INTERRUPTED)
		const badgeIcon = w.find('[data-testid="activity-status-icon"][data-color="amber"]')
		expect(badgeIcon.exists()).toBe(true)
		expect(badgeIcon.attributes("data-fill")).toBe("txt-warning")
		expect(badgeIcon.attributes("data-name")).toBe("refresh")
	})

	test("Failed state: red status icon, filled with the danger text token, + square-cross", () => {
		const w = mountCard(FAILED)
		const badgeIcon = w.find('[data-testid="activity-status-icon"][data-color="red"]')
		expect(badgeIcon.exists()).toBe(true)
		expect(badgeIcon.attributes("data-fill")).toBe("txt-danger")
		expect(badgeIcon.attributes("data-name")).toBe("square-cross")
	})

	test("Sent state: green status icon, filled with the success text token, + square-check, over a green subtitle", () => {
		const w = mountCard(SENT)
		const badgeIcon = w.find('[data-testid="activity-status-icon"][data-color="green"]')
		expect(badgeIcon.exists()).toBe(true)
		expect(badgeIcon.attributes("data-fill")).toBe("txt-success")
		expect(badgeIcon.attributes("data-name")).toBe("square-check")
		expect(
			w
				.find('[role="status"]')
				.classes()
				.some((c) => c.includes("subtitle_green")),
		).toBe(true)
	})

	test("amber, red and green subtitles read the status text tokens", () => {
		expect(SOURCE).toMatch(/\.subtitle_amber \{\s*color: var\(--txt-warning\);/)
		expect(SOURCE).toMatch(/\.subtitle_red \{\s*color: var\(--txt-danger\);/)
		expect(SOURCE).toMatch(/\.subtitle_green \{\s*color: var\(--txt-success\);/)
	})

	test("a dApp's call: its function title is cut to one line and the host sits in the app chip", () => {
		const host = "staging-nemi-interface.nemi-e65.workers.dev"
		const title = "Swap Exact Tokens For Tokens Supporting Fee On Transfer Tokens"
		const w = mountCard({ ...CANCELLED, title, originLabel: host, oneLineTitle: true })
		expect(w.findComponent(STUBS.TransactionCardLayout).props("oneLineTitle")).toBe(true)
		expect(w.find('[data-testid="activity-app-chip"]').text()).toBe(host)
	})

	test("a failed send hands the layout its direction and title flag, and says the direction in hidden words outside the live status line", () => {
		const direction: RowDirection = { from: "private", to: "private", way: "out", label: "Private → Private" }
		const w = mountCard({ ...FAILED, direction, titleNamesToken: true })
		expect(w.findComponent(STUBS.TransactionCardLayout).props()).toMatchObject({
			direction,
			titleNamesToken: true,
			oneLineTitle: false,
		})
		const words = w.get("[data-testid='activity-direction-chip']")
		expect(words.element.textContent).toBe("Private → Private")
		expect(words.attributes("class")).toMatch(/_direction_/)
		expect(w.get('[role="status"]').find("[data-testid='activity-direction-chip']").exists()).toBe(false)
		expect(w.find("[data-testid='activity-title-sep']").exists()).toBe(false)
		expect(w.find('[data-testid="activity-app-chip"]').exists()).toBe(false)
	})

	test("suppresses the separator and the hidden words when neither originLabel nor direction is set", () => {
		const w = mountCard(FAILED)
		expect(w.text()).not.toContain("undefined")
		expect(w.html()).not.toMatch(/title_sep/)
		expect(w.find("[data-testid='activity-direction-chip']").exists()).toBe(false)
	})

	test("amount + amountSymbol flow through to the layout (transfer card case)", () => {
		const w = mountCard({ ...FAILED, amount: "5.00", amountSymbol: "USDC" })
		expect(w.text()).toContain("5.00")
		expect(w.text()).toContain("USDC")
	})

	test("activityIcon prop overrides the default 'zap' on the layout", () => {
		const w = mountCard({ ...FAILED, activityIcon: "send" })
		expect(w.find(".layout-icon").attributes("data-icon")).toBe("send")
	})

	test("defaults activityIcon to 'zap' when not supplied (dApp generic case)", () => {
		const w = mountCard(FAILED)
		expect(w.find(".layout-icon").attributes("data-icon")).toBe("zap")
	})

	test("testIds 'tx-terminal-card' and 'tx-terminal-subtitle' for e2e selectors", () => {
		const w = mountCard(FAILED)
		expect(w.find('[data-testid="tx-terminal-card"]').exists()).toBe(true)
		expect(w.find('[data-testid="tx-terminal-subtitle"]').text()).toBe("Network error")
	})

	test("`to` reaches the layout, which makes the row a link", () => {
		const w = mountCard({ ...FAILED, to: "/popup/journal/op-1" })
		expect(w.findComponent(STUBS.TransactionCardLayout).props("to")).toBe("/popup/journal/op-1")
	})
})
