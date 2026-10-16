import { describe, expect, test } from "vitest"
import { mount } from "@vue/test-utils"
import TransactionAwaitingCard from "./TransactionAwaitingCard.vue"

const STUBS = {
	Flex: { template: '<div :class="$attrs.class"><slot /></div>', inheritAttrs: false },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
	Spinner: { template: '<span data-testid="stub-spinner" />' },
	Skeleton: { template: '<i data-testid="stub-skeleton" :data-width="width" :data-height="height" />', props: ["width", "height"] },
	TransactionCardLayout: {
		template: `
			<div :data-testid="testId" :data-stage="stage" :data-backend="backend">
				<span class="title">{{ title }}</span>
				<slot name="title-trailing" />
				<slot name="badge" />
				<slot name="secondary" />
				<slot name="actions" />
				<span class="amount">{{ amount }}</span>
				<span class="symbol">{{ amountSymbol }}</span>
			</div>
		`,
		props: ["title", "icon", "amount", "amountSymbol", "testId", "stage", "backend", "oneLineTitle"],
	},
}

const mountCard = (props: Record<string, unknown> = {}) => mount(TransactionAwaitingCard, { props, global: { stubs: STUBS } })

describe("composite/TransactionAwaitingCard", () => {
	test("renders the default title 'Creating transaction'", () => {
		const w = mountCard()
		expect(w.text()).toContain("Creating transaction")
	})

	test("with no stage known, the stage line is the loading skeleton, never a guessed stage", () => {
		const line = mountCard().find("[data-testid='tx-awaiting-subtitle']")
		expect(line.text()).toBe("")
		expect(line.find("[data-testid='stub-skeleton']").attributes()).toMatchObject({ "data-width": "92", "data-height": "9" })
	})

	test("a stage line replaces the skeleton", () => {
		const line = mountCard({ subtitle: "Queued..." }).find("[data-testid='tx-awaiting-subtitle']")
		expect(line.text()).toBe("Queued...")
		expect(line.find("[data-testid='stub-skeleton']").exists()).toBe(false)
	})

	test("custom title prop overrides the default", () => {
		const w = mountCard({ title: "Sending 5 USDC" })
		expect(w.text()).toContain("Sending 5 USDC")
	})

	test("renders a Spinner stub in the badge slot of the layout", () => {
		const w = mountCard()
		expect(w.find("[data-testid='stub-spinner']").exists()).toBe(true)
	})

	test("originLabel prop renders an origin chip when provided", () => {
		const w = mountCard({ originLabel: "example.dapp.io" })
		expect(w.text()).toContain("example.dapp.io")
	})

	test("originLabel is suppressed when not provided", () => {
		const w = mountCard()
		expect(w.html()).not.toMatch(/origin_chip/)
	})

	test("forwards the testId 'tx-awaiting-card' to the underlying layout", () => {
		const w = mountCard()
		expect(w.find("[data-testid='tx-awaiting-card']").exists()).toBe(true)
	})

	test("forwards every JobStage literal through to the layout (e2e selector contract)", () => {
		// E2E concurrency tests cross-check `[data-testid="tx-awaiting-card"]`
		// rendering as a secondary UI check; the primary oracle is the journal
		// (tests/e2e/fixtures/journal.ts).
		// Contract: this card threads each `stage` literal through to
		// TransactionCardLayout verbatim. Canonical type:
		// packages/wallet-core/src/jobs/types.ts JobStage.
		const stages = ["pending", "queued", "simulating", "proving", "submitting", "succeeded", "failed", "cancelled"]
		for (const s of stages) {
			const w = mountCard({ stage: s })
			expect(w.find("[data-testid='tx-awaiting-card']").attributes("data-stage")).toBe(s)
		}
	})

	test("backend threads to data-backend next to data-stage; the subtitle carries its testid", () => {
		const w = mountCard({ stage: "proving", backend: "browser", subtitle: "Proving in browser…" })
		const card = w.find("[data-testid='tx-awaiting-card']")
		expect(card.attributes("data-stage")).toBe("proving")
		expect(card.attributes("data-backend")).toBe("browser")
		expect(w.find("[data-testid='tx-awaiting-subtitle']").text()).toBe("Proving in browser…")
		expect(mountCard({ stage: "proving" }).find("[data-testid='tx-awaiting-card']").attributes("data-backend")).toBeUndefined()
	})

	test("data-stage is omitted when stage prop is null/default (no in-flight journal binding)", () => {
		const w = mountCard()
		expect(w.find("[data-testid='tx-awaiting-card']").attributes("data-stage")).toBeUndefined()
	})

	test("forwards amount + amountSymbol props to the layout", () => {
		const w = mountCard({ amount: "5.00", amountSymbol: "USDC" })
		expect(w.text()).toContain("5.00")
		expect(w.text()).toContain("USDC")
	})

	test("transferTypeLabel renders a chip when provided; suppressed when null", () => {
		const withChip = mountCard({ transferTypeLabel: "Private → Public" })
		expect(withChip.text()).toContain("Private → Public")
		expect(withChip.html()).toMatch(/transfer_chip/)

		const noChip = mountCard()
		expect(noChip.html()).not.toMatch(/transfer_chip/)
	})

	// transferTypeLabel and originLabel are mutually exclusive on the chip: transfer ops carry the
	// first, dApp ops the second.
	test("a transfer keeps its whole title and the direction chip; the stage line is cut and atomic", () => {
		const w = mountCard({ subtitle: "Generating proof...", transferTypeLabel: "Private → Public" })
		const subtitleSpan = w.find('[role="status"]')
		expect(subtitleSpan.attributes("class")).toMatch(/subtitle/)
		expect(subtitleSpan.attributes("aria-atomic")).toBe("true")
		expect(w.html()).toMatch(/transfer_chip/)
		expect(w.text()).toContain("Private → Public")
		expect(w.findComponent(STUBS.TransactionCardLayout).props("oneLineTitle")).toBe(false)
		expect(w.find('[data-testid="activity-app-chip"]').exists()).toBe(false)
	})

	test("a dApp's call: its function title is cut to one line and the host sits in the app chip", () => {
		const host = "staging-nemi-interface.nemi-e65.workers.dev"
		const w = mountCard({ title: "Swap Exact Tokens For Tokens Supporting Fee On Transfer Tokens", originLabel: host })
		expect(w.findComponent(STUBS.TransactionCardLayout).props("oneLineTitle")).toBe(true)
		expect(w.find('[data-testid="activity-app-chip"]').text()).toBe(host)
		expect(w.html()).not.toMatch(/transfer_chip/)
	})

	describe("Cancel button", () => {
		test("renders Cancel button when cancellable + jobId + stage != submitting", () => {
			const w = mountCard({ cancellable: true, jobId: "abc123", stage: "proving" })
			expect(w.find('[data-testid="tx-awaiting-cancel"]').exists()).toBe(true)
		})

		test("does NOT render when cancellable is false", () => {
			const w = mountCard({ cancellable: false, jobId: "abc123", stage: "proving" })
			expect(w.find('[data-testid="tx-awaiting-cancel"]').exists()).toBe(false)
		})

		test("does NOT render when jobId is null (defensive)", () => {
			const w = mountCard({ cancellable: true, jobId: null, stage: "proving" })
			expect(w.find('[data-testid="tx-awaiting-cancel"]').exists()).toBe(false)
		})

		test("hides when stage is 'submitting' (FSM forbids cancel; removing the affordance is honest)", () => {
			const w = mountCard({ cancellable: true, jobId: "abc123", stage: "submitting" })
			expect(w.find('[data-testid="tx-awaiting-cancel"]').exists()).toBe(false)
		})

		test("clicking the button emits 'cancel' with the card's jobId payload", async () => {
			const w = mountCard({ cancellable: true, jobId: "abc123", stage: "proving" })
			await w.find('[data-testid="tx-awaiting-cancel"]').trigger("click")
			const events = w.emitted("cancel")
			expect(events).toBeTruthy()
			expect(events?.[0]).toEqual(["abc123"])
		})
	})

	describe("focus surface (queued only), on the real layout", () => {
		// The root listener rides on the layout's Flex, so this stub must keep its attrs.
		const { TransactionCardLayout: _stub, ...atoms } = STUBS
		const stubs = { ...atoms, Flex: { template: '<div v-bind="$attrs"><slot /></div>', inheritAttrs: false } }
		const real = (props: Record<string, unknown>) => mount(TransactionAwaitingCard, { props, global: { stubs } })
		const nests = (w: ReturnType<typeof real>) =>
			w.findAll("button, a, [tabindex]").some((el) => el.find("button, a, [tabindex]").exists())

		test("at queued: the row is a button, and its press and the focus button each emit 'focus' with the jobId", async () => {
			const w = real({ cancellable: true, jobId: "abc123", stage: "queued" })
			const target = w.find("[data-row-target]")
			expect(target.element.tagName).toBe("BUTTON")
			expect(w.find('[title="Show the approval window"]').find("[data-row-target]").exists()).toBe(true)
			const focusBtn = w.find('[data-testid="tx-awaiting-focus"]')
			expect(focusBtn.attributes("aria-label")).toBe("Show the approval window")

			await target.trigger("click")
			await focusBtn.trigger("click")
			expect(w.emitted("focus")).toEqual([["abc123"], ["abc123"]])
		})

		test("no button, link or tabindex contains another", () => {
			const w = real({ cancellable: true, jobId: "abc123", stage: "queued" })
			expect(w.find("[data-row-target]").exists()).toBe(true)
			expect(w.find('[data-testid="tx-awaiting-cancel"]').exists()).toBe(true)
			expect(nests(w)).toBe(false)
			expect(w.find('[role="button"]').exists()).toBe(false)
		})

		test("the cancel button's click emits only 'cancel' (never bubbles into a focus)", async () => {
			const w = real({ cancellable: true, jobId: "abc123", stage: "queued" })

			await w.find('[data-testid="tx-awaiting-cancel"]').trigger("click")
			expect(w.emitted("cancel")).toEqual([["abc123"]])
			expect(w.emitted("focus")).toBeUndefined()
		})

		test("past queued the row is inert: no target, no focus button, no pointer class, a click emits nothing", async () => {
			const w = real({ cancellable: true, jobId: "abc123", stage: "proving" })
			expect(w.find("[data-row-target]").exists()).toBe(false)
			expect(w.find('[data-testid="tx-awaiting-focus"]').exists()).toBe(false)
			expect(w.html()).not.toMatch(/interactive/)
			expect(w.find("[title]").exists()).toBe(false)

			await w.trigger("click")
			expect(w.emitted("focus")).toBeUndefined()
		})

		test("a queued popup send has no approval window: no focus button, no hover title, a click emits nothing", async () => {
			const w = real({ cancellable: true, jobId: "abc123", stage: "queued", hasApprovalWindow: false })
			expect(w.find('[data-testid="tx-awaiting-focus"]').exists()).toBe(false)
			expect(w.find("[data-row-target]").exists()).toBe(false)
			expect(w.find('[title="Show the approval window"]').exists()).toBe(false)
			expect(w.find('[data-testid="tx-awaiting-cancel"]').exists()).toBe(true)
			await w.trigger("click")
			expect(w.emitted("focus")).toBeUndefined()
			expect(w.emitted("review")).toBeUndefined()
		})

		test("a re-ask line replaces the stage line and the row opens its review; the × still cancels", async () => {
			const w = real({
				cancellable: true,
				jobId: "abc123",
				stage: "queued",
				hasApprovalWindow: false,
				subtitle: "Waiting for your earlier send",
				reaskLine: "Fee went up. Review",
			})
			expect(w.get('[data-testid="tx-awaiting-subtitle"]').text()).toBe("Fee went up. Review")
			expect(w.find('[data-testid="tx-awaiting-focus"]').exists()).toBe(false)
			expect(w.find('[title="Show the approval window"]').exists()).toBe(false)
			const target = w.get("[data-row-target]")
			expect(target.element.tagName).toBe("BUTTON")
			expect(nests(w)).toBe(false)

			await target.trigger("click")
			await w.get('[data-testid="tx-awaiting-cancel"]').trigger("click")
			expect(w.emitted("review")).toEqual([["abc123"]])
			expect(w.emitted("cancel")).toEqual([["abc123"]])
			expect(w.emitted("focus")).toBeUndefined()
		})

		test("queued without a jobId is inert (nothing to focus)", () => {
			const w = real({ cancellable: true, jobId: null, stage: "queued" })
			expect(w.find("[data-row-target]").exists()).toBe(false)
			expect(w.find('[data-testid="tx-awaiting-focus"]').exists()).toBe(false)
		})

		test("two buttons widen the reserved action space; one button keeps the single reservation", () => {
			const two = real({ cancellable: true, jobId: "abc123", stage: "queued", title: "A very long dApp title that fills the row" })
			expect(two.html()).toMatch(/wrapper_two_actions/)

			const one = real({ cancellable: true, jobId: "abc123", stage: "proving" })
			expect(one.html()).toMatch(/wrapper_has_actions/)
			expect(one.html()).not.toMatch(/wrapper_two_actions/)
		})
	})
})
