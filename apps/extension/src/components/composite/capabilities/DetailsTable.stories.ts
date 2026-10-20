import type { Meta, StoryObj } from "@storybook/vue3-vite"
import DetailsTable from "./DetailsTable.vue"

/** The ends are the drawing's; the middles are filler, since the table shows only the ends. */
const address = (start: string, end: string) => `0x${start}${"0".repeat(56)}${end}`

/** The marks a call-only row leaves blank. */
const unmarked = { details: false, events: false, code: false }

const burner = {
	...unmarked,
	add: true,
	simulate: ["balance_of_private", "balance_of_public", "burn_public", "burn_private"],
	transact: ["burn_public", "burn_private"],
}

const meta: Meta<typeof DetailsTable> = {
	title: "Composite / DetailsTable",
	component: DetailsTable,
	tags: ["autodocs"],
	render: (args) => ({
		components: { DetailsTable },
		setup: () => ({ args }),
		template: '<div style="box-sizing: border-box; width: 400px; padding: 16px;"><DetailsTable v-bind="args" /></div>',
	}),
}
export default meta

type Story = StoryObj<typeof DetailsTable>

/** The tools app's testnet request, as the S1 drawing lists it. */
export const S1: Story = {
	args: {
		label: "12 contracts",
		anyContract: null,
		classes: [],
		known: [
			{
				...unmarked,
				name: "Fee Juice",
				simulate: ["claim", "claim_and_end_setup", "balance_of_public"],
				add: false,
				transact: ["claim", "claim_and_end_setup"],
			},
			{
				...unmarked,
				name: "Sponsored fee payer",
				simulate: ["sponsor_unconditionally"],
				add: false,
				transact: ["sponsor_unconditionally"],
			},
			{
				...unmarked,
				name: "Private fee payer",
				simulate: ["balance_of", "mint_and_pay_fee", "pay_fee"],
				add: true,
				transact: ["mint_and_pay_fee", "pay_fee"],
			},
			{ ...unmarked, name: "Auth registry", simulate: ["set_authorized"], add: false, transact: ["set_authorized"] },
		],
		unknown: [
			{
				...unmarked,
				address: address("0c1e", "5a7f"),
				simulate: [
					"token_for",
					"portal_for",
					"exits_paused",
					"claim_public",
					"claim_private",
					"exit_to_l1_public",
					"exit_to_l1_private",
				],
				add: true,
				transact: [
					"register_token",
					"register_and_claim_public",
					"claim_public",
					"claim_private",
					"exit_to_l1_public",
					"exit_to_l1_private",
				],
			},
			{ address: address("0024", "6502"), ...burner },
			{ address: address("14c1", "ed96"), ...burner },
			{ address: address("025c", "d7e6"), ...burner },
			{ address: address("0455", "cba9"), ...burner },
			{ ...unmarked, address: address("0643", "15fd"), simulate: [], add: true, transact: ["drip_to_public", "drip_to_private"] },
			{
				...unmarked,
				address: address("0262", "176a"),
				simulate: ["balance_of_private", "balance_of_public"],
				add: true,
				transact: [],
			},
			{
				...unmarked,
				address: address("14e0", "d592"),
				simulate: ["balance_of_private", "balance_of_public"],
				add: true,
				transact: [],
			},
		],
	},
}

/** A request reaching contracts by events and details, a contract class, and any contract's details. */
export const Reach: Story = {
	args: {
		label: "any contract",
		known: [],
		unknown: [
			{
				...unmarked,
				address: address("1a4f", "c871"),
				simulate: [],
				add: false,
				transact: ["transfer_private_to_private"],
				events: true,
			},
			{ ...unmarked, address: address("2b7c", "0a15"), simulate: [], add: false, transact: [], events: true },
		],
		classes: [{ ...unmarked, address: address("0c3e", "d726"), simulate: [], add: false, transact: [], code: true }],
		anyContract: { ...unmarked, name: "Any contract", simulate: [], add: false, transact: [], details: true },
	},
}
