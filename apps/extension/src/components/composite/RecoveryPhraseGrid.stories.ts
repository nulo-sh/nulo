import type { Meta, StoryObj } from "@storybook/vue3-vite"
import RecoveryPhraseGrid from "./RecoveryPhraseGrid.vue"

// The BIP-39 test vector's words; never a real wallet's.
const WORDS =
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art".split(
		" ",
	)

const meta: Meta<typeof RecoveryPhraseGrid> = {
	title: "Composite / RecoveryPhraseGrid",
	component: RecoveryPhraseGrid,
	tags: ["autodocs"],
	args: { words: WORDS, columns: 3, testId: "story-phrase" },
	render: (args) => ({
		components: { RecoveryPhraseGrid },
		setup: () => ({ args }),
		template: '<div style="padding: 24px; width: 360px; background: var(--app-bg);"><RecoveryPhraseGrid v-bind="args" /></div>',
	}),
}
export default meta

type Story = StoryObj<typeof RecoveryPhraseGrid>

export const Popup: Story = {}
export const Tab: Story = {
	args: { columns: 4 },
	render: (args) => ({
		components: { RecoveryPhraseGrid },
		setup: () => ({ args }),
		template: '<div style="padding: 24px; width: 640px; background: var(--app-bg);"><RecoveryPhraseGrid v-bind="args" /></div>',
	}),
}
