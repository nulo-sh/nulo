import type { Meta, StoryObj } from "@storybook/vue3-vite"
import { glyphs } from "./glyphs"
import Icon from "./Icon.vue"

const meta: Meta<typeof Icon> = {
	title: "Core / Icon",
	component: Icon,
	tags: ["autodocs"],
	args: { name: "home", size: 24 },
}
export default meta

type Story = StoryObj<typeof Icon>

export const Default: Story = {}

/** Every glyph at the sizes the wallet renders, smallest last: the review sheet for the set. */
export const Sheet: Story = {
	render: () => ({
		components: { Icon },
		setup: () => ({ names: Object.keys(glyphs), sizes: [24, 14, 12, 10, 9] }),
		template: `
			<div data-testid="glyph-sheet" style="display: grid; width: max-content; grid-template-columns: repeat(3, max-content); gap: 8px 32px; padding: 24px;">
				<div v-for="name in names" :key="name" style="display: flex; align-items: center; gap: 12px; height: 28px;">
					<span style="width: 96px; font: 11px var(--font-mono);">{{ name }}</span>
					<Icon v-for="size in sizes" :key="size" :name="name" :size="size" />
				</div>
			</div>
		`,
	}),
}
