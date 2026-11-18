<script setup lang="ts">
/**
 * The window a locked discovery opens: the site that asks, over the wallet's own lock screen. It
 * grants nothing and never navigates; once the wallet unlocks, the worker loads the site's connect
 * window or notice in it, and until then the site shows over a spinner.
 */

/** Components */
import DappIdentityBlock from "@/components/composite/DappIdentityBlock.vue"
import LockScreen from "@/popup/components/modules/auth/LockScreen.vue"

/** Utils */
import { siteOfUnlockWindowHash } from "@/wallet/services/dapp-interaction/unlock-window-url"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const route = useRoute()

// The worker wrote the origin into the URL from the content script's sender: never dApp text.
const site = computed(() => ({ url: siteOfUnlockWindowHash(`#${route.fullPath}`) }))
</script>

<template>
	<Flex direction="column" data-testid="unlock-window" :class="$style.wrapper">
		<DappIdentityBlock :dapp="site" data-testid="unlock-site" hostnameTestId="unlock-site-hostname" />
		<LockScreen v-if="!appStore.isLogined" />
		<Flex v-else align="center" justify="center" aria-busy="true" data-testid="unlock-waiting" :class="$style.waiting">
			<Spinner size="24" color="--txt-primary" />
		</Flex>
	</Flex>
</template>

<style module>
.wrapper {
	composes: approval_wrapper from "../window-shell.module.css";
}

.waiting {
	flex: 1;
}
</style>
