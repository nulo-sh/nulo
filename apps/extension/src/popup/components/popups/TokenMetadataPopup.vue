<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Services */
import { TokenServiceClient } from "@/wallet/services/token/client"

/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { useToast } from "@/composables/toast"
import { usePopupStack } from "@/composables/usePopupStack"
const { openToast } = useToast()

/** Utils */
import { copyWithToast } from "@/utils/clipboard"
import { endsSelection } from "@/utils/selection"
import { dashIfBlank } from "@/utils/string"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
const appStore = useAppStore()
const { order, depth } = usePopupStack("token_metadata")
const cacheStore = useCacheStore()

const route = useRoute()

const emit = defineEmits(["onClose"])
const props = defineProps({
	show: Boolean,
})

const token = ref()
const capabilitySections = [
	{
		title: "Private Methods",
		rows: [
			{ label: "Balances", key: "hasPrivateBalances" },
			{ label: "Transfers", key: "hasPrivateTransfers" },
			{ label: "Private to public", key: "hasPrivateToPublicTransfers" },
		],
	},
	{
		title: "Public Methods",
		rows: [
			{ label: "Balances", key: "hasPublicBalances" },
			{ label: "Transfers", key: "hasPublicTransfers" },
			{ label: "Public to private", key: "hasPublicToPrivateTransfers" },
		],
	},
]
const tokenService = new TokenServiceClient()
tokenService.onTokenDeleted.add(onTokenDeleted)
function onTokenDeleted(token) {
	if (token.id === cacheStore.activeTokenIdx) {
		openToast({ kind: "success", label: "Token has been deleted" })

		emit("onClose")
	}
}

const handleCopyAddress = (e) => {
	if (endsSelection(e)) return
	void copyWithToast(token.value.contract, openToast, "Contract address is copied")
}

watch(
	() => props.show,
	async () => {
		if (props.show) {
			if (route.params.id) {
				cacheStore.activeTokenIdx = route.params.id
				token.value = await tokenService.getToken(cacheStore.activeTokenIdx)
			}
		} else {
			tokenService.disconnect()
		}
	},
)
</script>

<template>
	<Popup :show="show && !!token" @onClose="emit('onClose')" :displaceIdx="order">
		<PopupCard :displaceIdx="depth">
			<Flex wide direction="column" gap="20" :class="$style.wrapper">
				<Text variant="title-page" color="primary"> Token Metadata </Text>

				<Flex direction="column" gap="16">
					<Flex align="center" justify="between">
						<Text variant="label-section" color="tertiary"> Id </Text>

						<Text variant="meta" color="secondary" data-testid="token-metadata-id">
							{{ token?.id }}
						</Text>
					</Flex>

					<Flex align="center" justify="between">
						<Text variant="label-section" color="tertiary"> Contract Address </Text>

						<Text @click="handleCopyAddress" variant="meta" color="secondary" class="copyable" data-testid="token-metadata-address">
							{{ token.contract.slice(0, 6) }}
							<Text color="tertiary">•••</Text>
							{{ token.contract.slice(-4) }}
						</Text>
					</Flex>

					<Flex align="center" justify="between">
						<Text variant="label-section" color="tertiary"> Name </Text>

						<Text variant="value" color="secondary">
							{{ dashIfBlank(token.name) }}
						</Text>
					</Flex>

					<Flex align="center" justify="between">
						<Text variant="label-section" color="tertiary"> Symbol </Text>

						<Text variant="value" color="secondary">
							{{ dashIfBlank(token.symbol) }}
						</Text>
					</Flex>

					<Flex align="center" justify="between">
						<Text variant="label-section" color="tertiary"> Chain ID </Text>

						<Tooltip position="end">
							<Flex align="center" gap="4">
								<Text variant="meta" color="secondary" data-testid="token-metadata-chain-id">
									{{ token.chainId }}
								</Text>
								<Icon name="info" size="12" color="secondary" />
							</Flex>

							<template #content>
								<Text color="secondary">Network:</Text>
								{{ appStore.networks.find(t => t.chainId === token.chainId).name }}
							</template>
						</Tooltip>
					</Flex>

					<template v-for="section in capabilitySections" :key="section.title">
						<Flex align="center" gap="6" style="margin-top: 10px">
							<Text variant="label-section" color="secondary">{{ section.title }}</Text>
						</Flex>

						<Flex v-for="row in section.rows" :key="row.key" align="center" justify="between" :class="$style.capability">
							<Flex direction="column" gap="6">
								<Text variant="label-section" color="tertiary"> {{ row.label }} </Text>
								<Text variant="meta" color="secondary"> {{ row.key }} </Text>
							</Flex>

							<Icon
								:name="token[row.key] ? 'square-check' : 'square-cross'"
								size="12"
								:color="token[row.key] ? 'green' : 'red'"
								:class="$style.mark"
							/>
						</Flex>
					</template>
				</Flex>

				<Button v-snack-footer @click="emit('onClose')" wide variant="primary_outline" size="medium"> Close </Button>
			</Flex>
		</PopupCard>
	</Popup>
</template>

<style module>
.wrapper {
	composes: body from "@/components/Popup/popup-shared.module.css";
}

/* Below the popup's width a capability's mark goes under its key, at the right, when the two do not
 * fit side by side. */
@media (width < 359px) {
	.capability {
		flex-wrap: wrap;
		row-gap: 6px;
	}

	.capability > .mark {
		margin-left: auto;
	}
}
</style>
