import { mount, type VueWrapper } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { sendEvent } from "../../../../../tests/helpers/send-event"
import SendPersonStep from "./SendPersonStep.vue"

const ANA = "0x13c29548b3340707017c5d1a457c23d8b6c29548b3340706e39bf608a5aab172"
const BEN = "0x1259300cc3f28f7051594427d01711cacf0a7c1eecd0035e5ee8f744e3ca4059"
const OWN = "0x1998178760f6baf47c78a29638c93c17c3a5328585096d40d7cb18d8a81aca17"
const NOT_A_POINT = `0x0${"3".repeat(63)}`

const ana = { id: "1", name: "Ana", address: ANA }
const own = { name: "Savings", address: OWN }

const STUBS = {
	Icon: { template: "<i />" },
	Button: { template: '<button type="button"><slot /></button>' },
	AccountAvatar: { template: '<span data-testid="stub-avatar" :data-name="name" />', props: ["name", "address", "size"] },
	RecipientField: {
		props: ["searchTerm", "selectedContact", "candidates"],
		emits: ["update:searchTerm", "update:selectedContact", "choose"],
		template: `<div><input data-testid="stub-field" :value="searchTerm" />
			<button data-testid="stub-hold" @click="$emit('update:selectedContact', candidates[0])" />
			<button data-testid="stub-pick" @click="$emit('choose', candidates[0])" /></div>`,
	},
}

function mountStep(props: Record<string, unknown> = {}): VueWrapper {
	const w: VueWrapper = mount(SendPersonStep, {
		props: {
			candidates: [ana, own],
			recents: [{ address: BEN, name: null, words: "10 USDC, privately", ago: "5 min ago" }],
			accounts: [own],
			searchTerm: "",
			selectedContact: null,
			"onUpdate:selectedContact": (c: unknown) => w.setProps({ selectedContact: c }),
			...props,
		},
		global: { stubs: STUBS },
	})
	return w
}
const chosen = (w: VueWrapper) => w.emitted<[string, unknown]>("choose") ?? []

describe("modules/send/SendPersonStep", () => {
	test("asks who is paid", () => {
		expect(mountStep().get("h2").text()).toBe("Who are you paying?")
	})

	test("Pay this address only for a valid pasted address", async () => {
		const w = mountStep({ searchTerm: NOT_A_POINT })
		expect(w.find('[data-testid="send-pay-address"]').exists()).toBe(false)
		await w.setProps({ searchTerm: ANA.slice(0, -1) })
		expect(w.find('[data-testid="send-pay-address"]').exists()).toBe(false)
		await w.setProps({ searchTerm: BEN })
		await w.get('[data-testid="send-pay-address"]').trigger("click")
		expect(chosen(w)).toEqual([[BEN, null]])
	})

	test("a pasted address a contact holds is chosen as that contact", async () => {
		const w = mountStep({ searchTerm: ANA.toUpperCase().replace("0X", "0x") })
		await w.get('[data-testid="send-pay-address"]').trigger("click")
		expect(chosen(w)[0][1]).toEqual(ana)
	})

	test("Enter in the field takes a pasted address", async () => {
		const w = mountStep({ searchTerm: BEN })
		sendEvent(w.get('[data-testid="stub-field"]').element, "keydown", { key: "Enter" })
		expect(chosen(w)).toEqual([[BEN, null]])
	})

	test("a repeated or handled Enter takes nothing", () => {
		const w = mountStep({ searchTerm: BEN })
		sendEvent(w.get('[data-testid="stub-field"]').element, "keydown", { key: "Enter", repeat: true })
		expect(chosen(w)).toEqual([])
	})

	test("the field's pick is the choice once the field shows it, never at the model's write", async () => {
		const w = mountStep()
		await w.get('[data-testid="stub-hold"]').trigger("click")
		expect(chosen(w)).toEqual([])
		await w.get('[data-testid="stub-pick"]').trigger("click")
		expect(chosen(w)).toEqual([[ANA, ana]])
	})

	test("Recent rows say what was sent and when, and emit their address", async () => {
		const w = mountStep()
		const row = w.get('[data-testid="send-recent"]')
		expect(row.text()).toBe("0x1259…4059Last: 10 USDC, privately5 min ago")
		await row.trigger("click")
		expect(chosen(w)).toEqual([[BEN, null]])
	})

	test("a recent recipient the wallet names shows the name", () => {
		const w = mountStep({ recents: [{ address: ANA, name: "Ana", words: "1 TST", ago: "yesterday" }] })
		expect(w.get('[data-testid="send-recent"]').text()).toContain("Ana")
	})

	test("Your accounts rows show the account and emit it", async () => {
		const w = mountStep()
		const row = w.get('[data-testid="send-own-account"]')
		expect(row.text()).toBe("Savings0x1998…ca17")
		await row.trigger("click")
		expect(chosen(w)).toEqual([[OWN, own]])
	})

	test("no recent sends, no Recent heading", () => {
		const w = mountStep({ recents: [] })
		expect(w.text()).not.toContain("Recent")
		expect(w.find('[data-testid="send-recent"]').exists()).toBe(false)
	})
})
