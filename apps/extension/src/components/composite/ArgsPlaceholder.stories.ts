import type { Meta, StoryObj } from "@storybook/vue3-vite"
import ArgsPlaceholder from "./ArgsPlaceholder.vue"

/** The width an argument block has inside the approval window's card. */
const FRAME = "padding: 24px; width: 340px; background: var(--app-bg);"

const meta: Meta<typeof ArgsPlaceholder> = {
	title: "Composite / ArgsPlaceholder",
	component: ArgsPlaceholder,
}
export default meta

type Story = StoryObj<typeof ArgsPlaceholder>

/** An app's request to authorize one call, read while its four fields are decoded. */
export const AuthorizationCard: Story = {
	render: () => ({
		components: { ArgsPlaceholder },
		template: `<div style="${FRAME}"><ArgsPlaceholder role="status" aria-busy="true" :fields="4" /></div>`,
	}),
}

/** A send: the bar under a step and under an authorization's line, then that authorization's details. */
export const Send: Story = {
	render: () => ({
		components: { ArgsPlaceholder },
		template: `<div style="${FRAME} display: flex; flex-direction: column; gap: 16px;"><ArgsPlaceholder /><ArgsPlaceholder /><ArgsPlaceholder :fields="4" decorative /></div>`,
	}),
}
