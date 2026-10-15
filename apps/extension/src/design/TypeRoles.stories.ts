/**
 * The type roles: each role's name set in its own role, with the values it renders. A review aid
 * for the rulebook; switch the toolbar's theme to see both.
 */
import type { Meta, StoryObj } from "@storybook/vue3-vite"
import { typeRoleNames, typeRoles } from "./tokens"

const meta: Meta = {
	title: "Design / Type roles",
	tags: ["autodocs"],
	parameters: {
		layout: "fullscreen",
	},
}
export default meta

type Story = StoryObj

const FACES: Record<string, string> = {
	"--font-headline": "Space Grotesk",
	"--font-body": "Inter",
	"--font-mono": "JetBrains Mono",
}

function specLine(name: (typeof typeRoleNames)[number]): string {
	const spec = typeRoles[name]
	const weight = "activeWeight" in spec ? `${spec.weight}, active ${spec.activeWeight}` : String(spec.weight)
	const parts = [
		FACES[spec.family],
		spec.size === null ? "size per slot" : `${spec.size}px`,
		weight,
		spec.uppercase ? "caps" : "",
		spec.tracking === 0 ? "" : `${spec.tracking}em`,
		spec.tabular ? "tabular" : "",
	]
	return parts.filter(Boolean).join(" · ")
}

/** Site-sized roles take their size from the element; the specimen gives them a readable one. */
const SPECIMEN_SITE_SIZE = "18px"

export const Roles: Story = {
	render: () => ({
		template: `
			<div style="display: grid; grid-template-columns: 260px 1fr; gap: 14px 24px; align-items: baseline; padding: 24px; color: var(--txt-primary); background: var(--app-bg);">
				${typeRoleNames
					.map(
						(name) => `
					<span class="type--${name}"${typeRoles[name].size === null ? ` style="font-size: ${SPECIMEN_SITE_SIZE};"` : ""}>${name} 0x1f2a</span>
					<span class="type--meta" style="color: var(--txt-tertiary);">${specLine(name)}</span>
				`,
					)
					.join("")}
			</div>
		`,
	}),
}
