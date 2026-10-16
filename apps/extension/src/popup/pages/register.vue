<route lang="json">
{
	"meta": {
		"isAuthRequired": false
	}
}
</route>

<script setup>
/** Composables */
import { vSnackFooter } from "@/composables/snackInset"

/** Utils */
import { openLegalDocument } from "@/utils/legal-links"
import { redirectToOnboardingTabIfNeeded } from "@/wallet/utils/onboarding-tab"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const router = useRouter()

// First-time install: redirect to the onboarding tab. The popup is too small
// for the welcome / create / import flow. Delegates to the shared predicate
// helper so register/import/profile-new stay in lockstep.
onBeforeMount(() => redirectToOnboardingTabIfNeeded(appStore))
</script>

<template>
	<Flex direction="column" :class="$style.wrapper">
		<!-- Brand signature: lock icon + NULO wordmark -->
		<Flex align="center" justify="center" gap="8" :class="$style.brand">
			<MaterialIcon name="lock" :size="18" color="primary" />
			<span :class="$style.wordmark">NULO</span>
		</Flex>

		<!-- Hero + actions -->
		<Flex direction="column" align="center" justify="center" gap="40" :class="$style.main">
			<Flex direction="column" align="center" gap="16">
				<h1 :class="$style.headline">Access the internet-native coordination layer.</h1>
				<p :class="$style.subcopy">Private by default. Sovereign by design.</p>
			</Flex>

			<Flex wide direction="column" gap="8" :class="$style.actions">
				<Button
					@click="router.push('/popup/profile/new')"
					wide
					variant="primary"
					size="large"
					data-testid="register-create-btn"
				>
					Create profile
				</Button>
				<Button
					@click="router.push('/popup/import')"
					wide
					variant="primary_outline"
					size="large"
					data-testid="register-import-btn"
				>
					Import profile
				</Button>
			</Flex>
		</Flex>

		<!-- Terms footer -->
		<p v-snack-footer :class="$style.terms">
			<span @click="openLegalDocument('terms')" :class="$style.link" data-testid="legal-register-terms">Terms of Use</span>
			·
			<span @click="openLegalDocument('privacy')" :class="$style.link" data-testid="legal-register-privacy">Privacy Policy</span>
		</p>

	</Flex>
</template>

<style module>
.wrapper {
	position: relative;

	flex: 1;
	background: var(--app-bg);

	padding: 24px;
}

.brand {
	padding: 16px 0 0 0;
}

.wordmark {
	composes: type--title-hero from global;
	font-size: 20px;
	color: var(--txt-primary);
}

.main {
	flex: 1;
	padding: 0 8px;
	text-align: center;
}

.headline {
	composes: type--title-hero from global;
	font-size: 28px;
	line-height: 1.1;
	color: var(--txt-primary);
	margin: 0;

	max-width: 300px;
}

.subcopy {
	composes: type--body from global;
	line-height: 1.4;
	color: var(--nulo-secondary);
	margin: 0;

	max-width: 260px;
}

.actions {
	max-width: 280px;
}

.terms {
	composes: type--caption from global;
	line-height: 1.5;
	color: var(--nulo-secondary);
	text-align: center;
	margin: 0;

	padding: 16px 8px 0 8px;
}

.link {
	color: var(--nulo-secondary);
	cursor: pointer;
	border-bottom: 1px solid var(--nulo-border);

	transition: color 0.2s var(--bezier);

	&:hover {
		color: var(--txt-primary);
	}
}
</style>
