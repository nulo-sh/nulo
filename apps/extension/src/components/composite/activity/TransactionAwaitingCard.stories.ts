import type { Meta, StoryObj } from "@storybook/vue3-vite"
import TransactionAwaitingCard from "./TransactionAwaitingCard.vue"

const meta: Meta<typeof TransactionAwaitingCard> = {
	title: "Composite / TransactionAwaitingCard",
	component: TransactionAwaitingCard,
	tags: ["autodocs"],
	// box-sizing: border-box so the wrapper is 360px total (matches the popup
	// width), with 24px of inner padding leaving 312px of card width — same
	// budget the production card gets inside .content. Without border-box the
	// story would render a 408px-wide card and silently mask width-pressure
	// regressions like the one this story is here to demonstrate.
	render: (args) => ({
		components: { TransactionAwaitingCard },
		setup: () => ({ args }),
		template: '<div style="box-sizing: border-box; padding: 24px; width: 360px;"><TransactionAwaitingCard v-bind="args" /></div>',
	}),
}
export default meta

type Story = StoryObj<typeof TransactionAwaitingCard>

export const Default: Story = {}
export const SendingTransfer: Story = {
	args: { title: "Sending 5 USDC", subtitle: "Generating proofs", amount: "5.00", amountSymbol: "USDC" },
}
export const DappOriginated: Story = {
	args: { title: "Calling contract", originLabel: "example.dapp.io" },
}

/** A send proving: its pair and way badge as the settled row draws them, a long stage line ellipsis-clamped
 *  beside the amount, and the cancel button in the page-padding gutter. */
export const TransferUnderWidthPressure: Story = {
	args: {
		title: "USDC",
		subtitle: "Generating proof...",
		icon: "send",
		amount: "5.00",
		amountSymbol: "USDC",
		titleNamesToken: true,
		direction: { from: "private", to: "public", way: "out", label: "Private → Public" },
		cancellable: true,
		jobId: "story-1",
		stage: "proving",
	},
}
