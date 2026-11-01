<route lang="json">
{ "meta": { "title": "Done" } }
</route>

<script setup lang="ts">
/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { useGetStarted } from "@/composables/useGetStarted"

/** Utils */
import { donePath } from "../steps"
import { clearOnboardingTabTracking, OPEN_TOOLBAR_POPUP, type OpenToolbarPopupAnswer } from "@/wallet/utils/onboarding-tab"

/** Stores */
import { useAppStore } from "@/stores/app.store"

const appStore = useAppStore()

const getStarted = useGetStarted({ profileId: () => appStore.profile?.id })

// Only a typed URL, or a Ready entry whose mark a failed load check dropped, lands here with no path:
// the wallet's type says which.
const path = computed(() => donePath(window.history.state) ?? (appStore.profile?.type === "password" ? "password" : "passkey"))

// Home's Get started flags, `undefined` until read. An Import entry never shows the line, even when its
// flags read as nothing done (a failed read, or a lost `imported` write).
const phraseUnsaved = computed(() => {
	const flags = getStarted.flags.value
	if (flags === undefined) return undefined
	return path.value !== "import" && !flags.imported && !flags.phraseSaved
})

// Detected on mount so the pin-tip only shows for users who actually need
// it. chrome.action.getUserSettings exists from Chrome 91+; we fall back
// to "not pinned" if the API is missing or rejects.
const isPinned = ref(false)
onMounted(async () => {
	try {
		const settings = await chrome.action.getUserSettings()
		isPinned.value = settings.isOnToolbar === true
	} catch {
		isPinned.value = false
	}
})

async function openWallet() {
	await appStore.setOnboardingCompleted(true)
	await clearOnboardingTabTracking()

	// The background closes this tab and only then opens the popup, which the close would otherwise
	// dismiss; Firefox also refuses a page's own close once its history has grown. A window's last
	// tab stays, with the popup over it.
	let answer: OpenToolbarPopupAnswer | undefined
	let messaged = false
	try {
		answer = await chrome.runtime.sendMessage({ type: OPEN_TOOLBAR_POPUP })
		messaged = true
	} catch (error) {
		console.error("Failed to message SW for openPopup; falling back to window:", error)
	}

	if (messaged) {
		// No answer, or a tab the background could not close: close it from here, as before.
		if (answer?.ok !== true) setTimeout(() => window.close(), 50)
		return
	}

	// Fallback when messaging the SW isn't possible. Left-positioned
	// popup-shaped window.
	await chrome.windows.create({
		url: chrome.runtime.getURL("src/popup/index.html"),
		type: "popup",
		width: 380,
		height: 660,
		left: 24,
		top: 80,
	})
	window.close()
}

onBeforeUnmount(() => {
	getStarted.dispose()
})
</script>

<template>
	<OnboardingPage
		align="center"
		:gap="40"
		data-testid="onboarding-done-page"
		:data-phrase-unsaved="phraseUnsaved"
	>
		<OnboardingStepHeader current="ready" :path="path" main="You're" sub="In" align="center" :class="$style.hero">
			<Text variant="body" color="secondary" height="150" align="center" :class="$style.subhead">
				Access the private coordination internet layer.
			</Text>
			<Text variant="body" color="secondary" height="150" align="center" :class="$style.tagline">
				Private by default. Sovereign by design.
			</Text>
			<Text
				v-if="phraseUnsaved"
				variant="body"
				color="secondary"
				height="150"
				align="center"
				data-testid="onboarding-done-phrase-unsaved"
			>
				Your recovery phrase is not saved yet. Save it from Get started on Home.
			</Text>
		</OnboardingStepHeader>

		<Flex
			v-if="!isPinned"
			direction="column"
			gap="12"
			:class="$style.tip"
			data-testid="onboarding-pin-tip"
		>
			<Flex align="center" gap="8">
				<Icon name="extension" :size="16" color="secondary" />
				<Text variant="label-section" color="secondary">Pro tip</Text>
			</Flex>
			<Text variant="body" color="secondary" height="150">
				Click the puzzle icon in your browser's toolbar, then pin Nulo for quick access.
			</Text>
		</Flex>

		<Button
			v-snack-footer
			variant="cta"
			size="large"
			data-testid="onboarding-done-open"
			@click="openWallet"
		>
			Open wallet
		</Button>
	</OnboardingPage>
</template>

<style module>
.hero {
	padding-bottom: 24px;
}

.subhead {
	max-width: 380px;
}

.tagline {
	opacity: 0.65;
}

.tip {
	width: 100%;
	padding: 16px 20px;
	background: var(--nulo-surface);
	border: 1px solid var(--nulo-border);
	border-left: 2px solid var(--nulo-outline);
}
</style>
