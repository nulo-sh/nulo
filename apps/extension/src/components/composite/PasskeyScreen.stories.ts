/**
 * `PasskeyScreen` stories: the card the in-page dialog shows, and every state of the passkey window,
 * each at the size it ships (a 360×600 popup, a 500×800 window) and with the copy it ships.
 */
import type { Meta, StoryObj } from "@storybook/vue3-vite"
import Button from "@/components/ui/Button.vue"
import { PASSKEY_COPY, passkeyTag, stepFailedTitle } from "@/utils/passkey-copy"
import PasskeyScreen from "./PasskeyScreen.vue"

const meta: Meta<typeof PasskeyScreen> = {
	title: "Composite / PasskeyScreen",
	component: PasskeyScreen,
}
export default meta

type Story = StoryObj<typeof PasskeyScreen>

const windowStory = (args: Story["args"], actions: string): Story => ({
	args,
	render: (storyArgs) => ({
		components: { PasskeyScreen, Button },
		setup: () => ({ args: storyArgs }),
		template: `
			<div data-story-frame style="display: flex; flex-direction: column; width: 500px; height: 800px">
				<PasskeyScreen v-bind="args"><template #actions>${actions}</template></PasskeyScreen>
			</div>`,
	}),
})

const CANCEL = '<Button variant="cta_outline">Cancel</Button>'
const RETRY_CLOSE = '<Button variant="cta">Try again</Button><Button variant="cta_outline">Close</Button>'
const UNLOCK_ALICE = passkeyTag("unlock", "Alice")

export const CardOverThePopup: Story = {
	args: { layout: "card", tone: "waiting", tag: UNLOCK_ALICE, title: PASSKEY_COPY.waiting.title, body: PASSKEY_COPY.waiting.body },
	render: (storyArgs) => ({
		components: { PasskeyScreen, Button },
		setup: () => ({ args: storyArgs }),
		template: `
			<div data-story-frame style="position: relative; width: 360px; height: 600px; overflow: hidden; background: var(--nulo-surface)">
				<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; background: color-mix(in srgb, var(--app-bg) 72%, transparent)">
					<PasskeyScreen v-bind="args">
						<template #actions><Button variant="cta_outline" size="compact">Cancel</Button></template>
					</PasskeyScreen>
				</div>
			</div>`,
	}),
}

const WINDOW = { layout: "window", note: PASSKEY_COPY.windowNote, tag: UNLOCK_ALICE } as const

export const WindowWaiting = windowStory(
	{ ...WINDOW, tone: "waiting", title: PASSKEY_COPY.waiting.title, body: PASSKEY_COPY.waiting.body },
	CANCEL,
)

export const WindowFinishing = windowStory(
	{ ...WINDOW, tone: "finishing", title: PASSKEY_COPY.finishing.title, body: PASSKEY_COPY.finishing.body },
	CANCEL,
)

export const WindowFailed = windowStory(
	{ ...WINDOW, tone: "failed", title: PASSKEY_COPY.failed.title, body: PASSKEY_COPY.failed.body },
	RETRY_CLOSE,
)

export const WindowSavedButUnconfirmed = windowStory(
	{
		...WINDOW,
		tag: passkeyTag("create", "Savings"),
		tone: "failed",
		title: PASSKEY_COPY.failed.title,
		body: PASSKEY_COPY.failed.unconfirmedBody,
	},
	RETRY_CLOSE,
)

export const WindowStepFailed = windowStory(
	{
		...WINDOW,
		tag: passkeyTag("create", "Savings"),
		tone: "failed",
		title: stepFailedTitle("create"),
		body: PASSKEY_COPY.stepFailedBody,
	},
	'<Button variant="cta_outline">Close</Button>',
)
