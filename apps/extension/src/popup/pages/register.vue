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
import { postAuthRoute } from "@/utils/own-window"
import { openOrFocusOnboardingTab, setupWaitsInTab } from "@/wallet/utils/onboarding-tab"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const router = useRouter()

// Before setup is finished in its tab, the popup says where it goes on instead of offering a profile:
// the popup is too small for the welcome, create and import steps. Nothing shows until the read
// settles; a failed read shows the profile actions, as the page always could.
const setup = ref("reading")

async function goToSetupTab() {
	try {
		await openOrFocusOnboardingTab()
		window.close()
	} catch (error) {
		console.debug("onboarding tab focus failed", { error })
	}
}

// A session another window opens is this window's too, so it leaves for where an unlock goes, as the
// lock screen does. Only once this window's activation has finished: until then Home has no account.
watch(
	() => appStore.isLogined,
	(logged) => {
		if (logged) router.push(postAuthRoute(appStore.pageAwaitingAuth))
	},
	{ immediate: true },
)

onBeforeMount(async () => {
	try {
		setup.value = (await setupWaitsInTab(appStore)) ? "waits" : "free"
	} catch (error) {
		console.debug("onboarding setup read failed", { error })
		setup.value = "free"
	}
})
</script>

<template>
	<Flex direction="column" :class="$style.wrapper">
		<template v-if="setup !== 'reading'">
			<!-- Brand signature: lock icon + NULO wordmark -->
			<Flex align="center" justify="center" gap="8" :class="$style.brand">
				<Icon name="lock" :size="18" color="primary" />
				<span :class="$style.wordmark">NULO</span>
			</Flex>

			<Flex
				v-if="setup === 'waits'"
				direction="column"
				align="center"
				justify="center"
				gap="40"
				:class="$style.main"
				data-testid="register-setup-waits"
			>
				<h1 :class="$style.headline">Finish setting up Nulo in its tab</h1>
				<Flex wide direction="column" gap="8" :class="$style.actions">
					<Button wide variant="primary" size="large" data-testid="register-setup-tab-btn" @click="goToSetupTab">
						Go to the tab
					</Button>
				</Flex>
			</Flex>

			<!-- Hero + actions -->
			<Flex v-else direction="column" align="center" justify="center" gap="40" :class="$style.main">
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
		</template>

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
	user-select: none;
	color: var(--nulo-secondary);
	cursor: pointer;
	border-bottom: 1px solid var(--nulo-border);

	transition: color 0.2s var(--bezier);

	&:hover {
		color: var(--txt-primary);
	}
}
</style>
