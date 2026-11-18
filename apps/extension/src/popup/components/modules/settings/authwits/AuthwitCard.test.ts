/**
 * The authorization card is a button row named by its title; the revoke glyph is a named action
 * that never opens the card.
 */
import { describe, expect, test } from "vitest"
import { mount } from "@vue/test-utils"
import { RowAction } from "@nulo/design"
import { contractChipOf } from "@/components/composite/contract-chip"
import { trimAddress } from "@/utils/string"
import AuthwitCard from "./AuthwitCard.vue"
import { declarationsOf, parseSource } from "../../../../../../scripts/type-roles/source-scan"

const STUBS = {
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
	Tooltip: { template: '<span><slot /><slot name="content" /></span>' },
	ContractChip: {
		props: ["model", "explorer", "testid"],
		template: `<button type="button" data-testid="contract-chip" :data-level="model.level ?? 'pending'" :aria-label="model.accessibleName">{{ model.label }}</button>`,
	},
}

// Wire-shaped: 0x + 64 hex.
const CALLER = `0x${"1a".repeat(32)}`
const TOKEN = `0x${"0a".repeat(32)}`
const UNKNOWN = `0x${"2c".repeat(32)}`
const callRow = (contract: string) => ({
	id: 7,
	kindName: "Call",
	content: { kind: "call", caller: CALLER, contract, method: "transfer_in_public", args: [CALLER, `0x${"00".repeat(31)}19`] },
})
const LISTED = { model: contractChipOf({ level: "nulo", source: "token", symbol: "TST", name: "Test Token" }, TOKEN), explorer: null }
const UNLISTED = { model: contractChipOf({ level: "none", flagged: false }, UNKNOWN), explorer: null }

const AUTHWIT = { id: "a1", kindName: "Call", content: { kind: "call", caller: "0xc", contract: "0xd", method: "transfer" } }

const mountCard = (authwit: object = AUTHWIT, props: object = {}) =>
	mount(AuthwitCard, { props: { authwit, ...props }, global: { stubs: STUBS, components: { RowAction } }, attachTo: document.body })

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

	test("the chips sit beside the title, not pushed to Revoke, and wrap rather than cut the contract chip", () => {
		const parsed = parseSource("apps/extension/src/popup/components/modules/settings/authwits/AuthwitCard.vue")
		expect(declarationsOf(parsed, ".title")).toEqual({
			display: "inline-flex",
			"flex-wrap": "wrap",
			"align-items": "center",
			gap: "4px 8px",
			"min-width": "0",
		})
		expect(declarationsOf(parsed, ".title > .type")).toEqual({ flex: "0 1 auto" })
	})

	test("no button contains another", () => {
		const w = mountCard(callRow(TOKEN), { chip: LISTED, revokeState: "revoking" })
		expect(w.findAll("button").some((el) => el.find("button, a, [tabindex]").exists())).toBe(false)
		w.unmount()
	})
})

describe("modules/settings/authwits/AuthwitCard — the title names the action and the contract", () => {
	test("a call on a listed token: the action, then the token's sealed chip, and the row's name reads both", () => {
		const w = mountCard(callRow(TOKEN), { chip: LISTED })
		const chip = w.get('[data-testid="contract-chip"]')
		expect([chip.text(), chip.attributes("data-level")]).toEqual(["TST", "nulo"])
		expect(rowName(w)).toBe("Transfer · TST")
		expect(w.find("[data-row-target]").attributes("aria-labelledby")?.split(" ")).toHaveLength(2)
		w.unmount()
	})

	test("a call on an unlisted contract: the chip reads its short address, unverified", () => {
		const w = mountCard(callRow(UNKNOWN), { chip: UNLISTED })
		const chip = w.get('[data-testid="contract-chip"]')
		expect([chip.text(), chip.attributes("data-level")]).toEqual([trimAddress(UNKNOWN), "none"])
		expect(w.text()).toContain("Transfer")
		expect(w.text()).not.toContain("Call")
		w.unmount()
	})

	test("an intent row keeps its kind's title and draws no chip, whatever chip it is handed", () => {
		const intent = { id: 8, kindName: "Intent", content: { kind: "intent", consumer: UNKNOWN, intent: [CALLER] } }
		const w = mountCard(intent, { chip: UNLISTED })
		expect(w.find('[data-testid="contract-chip"]').exists()).toBe(false)
		expect(rowName(w)).toBe("Intent")
		expect(w.text()).toContain(UNKNOWN)
		w.unmount()
	})

	test("pressing the chip opens nothing on the row", async () => {
		const w = mountCard(callRow(TOKEN), { chip: LISTED })
		await w.get('[data-testid="contract-chip"]').trigger("click")
		expect(w.emitted("open")).toBeUndefined()
		w.unmount()
	})

	test("the middle dot is hidden from the row's name", () => {
		const w = mountCard(callRow(TOKEN), { chip: LISTED })
		expect(w.get('[aria-hidden="true"]').text()).toBe("·")
		w.unmount()
	})
})

describe("modules/settings/authwits/AuthwitCard — a revoke's state", () => {
	test.each([
		["revoking", "authwit-revoking-chip", "Revoking"],
		["failed", "authwit-not-revoked-chip", "Not revoked"],
	])("%s: one chip, read in the row's name after Pending", (revokeState, testid, words) => {
		const w = mountCard({ ...callRow(TOKEN), pending: true }, { chip: LISTED, revokeState })
		expect(w.get(`[data-testid="${testid}"]`).text()).toBe(words)
		expect(w.findAll('[data-testid^="authwit-"][data-testid$="-chip"]').map((c) => c.text())).toEqual(["Pending", words])
		expect(w.find("[data-row-target]").attributes("aria-labelledby")?.split(" ")).toHaveLength(4)
		w.unmount()
	})

	test("no revoke: neither chip", () => {
		const w = mountCard(callRow(TOKEN), { chip: LISTED })
		expect(w.find('[data-testid="authwit-revoking-chip"]').exists()).toBe(false)
		expect(w.find('[data-testid="authwit-not-revoked-chip"]').exists()).toBe(false)
		w.unmount()
	})

	test("Not revoked reads in danger text, and outranks the chip's own colour in any sheet order", () => {
		const parsed = parseSource("apps/extension/src/popup/components/modules/settings/authwits/AuthwitCard.vue")
		expect(declarationsOf(parsed, ".pending.failed")).toEqual({ color: "var(--txt-danger)" })
	})
})
