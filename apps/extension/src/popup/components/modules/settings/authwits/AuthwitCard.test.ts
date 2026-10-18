/**
 * The authorization card is a button row named by its kind; the revoke glyph is a named action
 * that never opens the card.
 */
import { describe, expect, test } from "vitest"
import { mount } from "@vue/test-utils"
import { RowAction } from "@nulo/design"
import AuthwitCard from "./AuthwitCard.vue"
import { declarationsOf, parseSource } from "../../../../../../scripts/type-roles/source-scan"

const STUBS = {
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
	Tooltip: { template: '<span><slot /><slot name="content" /></span>' },
}

const AUTHWIT = { id: "a1", kindName: "Call", content: { kind: "call", caller: "0xc", contract: "0xd", method: "transfer" } }

const mountCard = (authwit: object = AUTHWIT) =>
	mount(AuthwitCard, { props: { authwit }, global: { stubs: STUBS, components: { RowAction } }, attachTo: document.body })

/** The row's accessible name, as its `aria-labelledby` ids compose it. */
const rowName = (w: ReturnType<typeof mountCard>) =>
	(w.find("[data-row-target]").attributes("aria-labelledby") ?? "")
		.split(" ")
		.map((id) => w.find(`#${id}`).text())
		.join(" ")

describe("modules/settings/authwits/AuthwitCard", () => {
	test("renders the kind and the call fields", () => {
		const w = mountCard()
		expect(w.text()).toContain("Call")
		expect(w.text()).toContain("transfer")
		w.unmount()
	})

	test("the card is a button row named by its kind, with no tabindex of its own", () => {
		const w = mountCard()
		const target = w.find("[data-row-target]")
		expect(target.element.tagName).toBe("BUTTON")
		expect(w.find(`#${target.attributes("aria-labelledby")}`).text()).toBe("Call")
		expect(w.find("[tabindex]").exists()).toBe(false)
		w.unmount()
	})

	test("pressing the row emits 'open' with the authwit, once", async () => {
		const w = mountCard()
		await w.find("[data-row-target]").trigger("click")
		expect(w.emitted("open")).toEqual([[AUTHWIT]])
		w.unmount()
	})

	test("the revoke action is a named button outside the target; pressing it emits only 'revoke'", async () => {
		const w = mountCard()
		const revoke = w.find('button[aria-label="Revoke authwit"]')
		expect(revoke.exists()).toBe(true)
		expect(w.find("[data-row-target]").find('[aria-label="Revoke authwit"]').exists()).toBe(false)
		await revoke.trigger("click")
		expect(w.emitted("revoke")).toEqual([[AUTHWIT]])
		expect(w.emitted("open")).toBeUndefined()
		w.unmount()
	})

	test("a confirmed grant shows no Pending chip", () => {
		const w = mountCard()
		expect(w.find('[data-testid="authwit-pending-chip"]').exists()).toBe(false)
		expect(rowName(w)).toBe("Call")
		w.unmount()
	})

	test("a grant not yet proven shows a Pending chip in its name, and its Revoke stays enabled", async () => {
		const w = mountCard({ ...AUTHWIT, pending: true })
		expect(w.find('[data-testid="authwit-pending-chip"]').text()).toBe("Pending")
		expect(rowName(w)).toBe("Call Pending")
		const revoke = w.find('button[aria-label="Revoke authwit"]')
		expect(revoke.attributes("disabled")).toBeUndefined()
		await revoke.trigger("click")
		expect(w.emitted("revoke")).toEqual([[{ ...AUTHWIT, pending: true }]])
		w.unmount()
	})

	test("the chip sits beside the kind, not pushed to Revoke", () => {
		const parsed = parseSource("apps/extension/src/popup/components/modules/settings/authwits/AuthwitCard.vue")
		expect(declarationsOf(parsed, ".title")).toEqual({ display: "inline-flex", "align-items": "center", gap: "8px", "min-width": "0" })
	})

	test("no button contains another", () => {
		const w = mountCard()
		expect(w.findAll("button").some((el) => el.find("button, a, [tabindex]").exists())).toBe(false)
		w.unmount()
	})
})
