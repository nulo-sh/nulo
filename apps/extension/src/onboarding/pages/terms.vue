<route lang="json">
{ "meta": { "title": "Before you start" } }
</route>

<script setup lang="ts">
/** Services */
import { managers } from "@/utils/core"

/** Composables */
import { useToast } from "@/composables/toast"

/** Utils */
import { type LegalDocument, RISK_POINTS, currentVersion } from "@nulo/legal"
import { openLegalDocument } from "@/utils/legal-links"
import { parseNext } from "../legal-guard"

const { openToast } = useToast()

const route = useRoute()
const router = useRouter()

// Create opens on Passkey, so its row starts without the phrase step.
const path = computed(() => (parseNext(route.query.next) === "import" ? "import" : "passkey"))

const busy = ref(false)
const termsVersion = currentVersion("terms").version

const handleOpen = (doc: LegalDocument) => openLegalDocument(doc, "tab")

const handleAccept = async () => {
	busy.value = true
	try {
		// The write is awaited: the next route's guard reads the record this call stores.
		await managers.legal.accept("onboarding")
		await router.push(`/onboarding/${parseNext(route.query.next)}`)
	} catch {
		openToast({ kind: "error", label: "Could not record your acceptance. Try again." })
	} finally {
		busy.value = false
	}
}
</script>

<template>
	<OnboardingPage :gap="28">
		<OnboardingStepHeader
			current="terms"
			:path="path"
			back="legal-terms-back"
			main="Before"
			sub="you start"
			:class="$style.hero"
			data-testid="legal-terms-page"
		/>

		<LegalConsent
			:points="RISK_POINTS"
			:terms-version="termsVersion"
			:busy="busy"
			@accept="handleAccept"
			@open="handleOpen"
		/>
	</OnboardingPage>
</template>

<style module>
.hero {
	padding-bottom: 16px;
}
</style>
