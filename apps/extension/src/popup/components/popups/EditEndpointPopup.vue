<script setup>
import { FieldWarning } from "@nulo/design"
/** Utils */
import { managers } from "@/utils/core"
import { RPC_URL_MIN_LENGTH } from "@/utils/entity-rules"
import { endpointErrorText } from "./endpoint-error-text"
import { endpointStatus } from "@/utils/endpoint-status"

/** Components */
import EndpointStatusDot from "@/popup/components/modules/settings/endpoints/EndpointStatusDot.vue"

/** Composables */
import { useToast } from "@/composables/toast"
import { usePopupStack } from "@/composables/usePopupStack"
const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
const appStore = useAppStore()
const { order, depth } = usePopupStack("edit_endpoint")
const cacheStore = useCacheStore()

const emit = defineEmits(["onClose"])
const props = defineProps({
	show: Boolean,
})

const network = computed(() => appStore.networks.find((n) => n.id === cacheStore.endpointEditNetworkId))
const endpoint = computed(() => network.value?.endpoints.find((e) => e.id === cacheStore.endpointEditId))

/** When the sheet opened: its line says how long ago as of then, or of a later read, and never ticks. */
const openedAt = ref(Date.now())
const routeStatus = computed(() => {
	const view = cacheStore.endpointRoute
	const id = endpoint.value?.id
	if (!id || !view || view.networkId !== network.value?.id) return endpointStatus(null, "")
	return endpointStatus({ snapshot: view.snapshot, readAt: Math.max(view.readAt, openedAt.value) }, id)
})

const form = useFormState({
	label: { initial: "" },
	url: { initial: "" },
})

const labelTerm = form.fields.label.value
const urlTerm = form.fields.url.value
const errorText = ref("")
const isSubmitting = ref(false)

const fillFromEndpoint = () => {
	// rebase() loads the values AND sets the dirty-baseline, so `form.isDirty`
	// below replaces the hand-rolled per-field comparison.
	form.rebase({ label: endpoint.value?.label ?? "", url: endpoint.value?.rpcUrl ?? "" })
	errorText.value = ""
}

const isDirty = form.isDirty

const isAvailableToSave = computed(() => {
	// Full-lifetime submit latch: a running save closes the form on EVERY
	// route (button, Enter, future callers) — not just the pointer path.
	if (isSubmitting.value) return false
	if (!endpoint.value || !network.value) return false
	if (urlTerm.value.length < RPC_URL_MIN_LENGTH) return false
	if (errorText.value) return false
	if (!isDirty.value) return false
	return true
})

const handleSave = async () => {
	if (!isAvailableToSave.value || !network.value || !endpoint.value) return
	try {
		isSubmitting.value = true
		errorText.value = ""
		await managers.network.updateEndpoint(network.value.id, endpoint.value.id, labelTerm.value || undefined, urlTerm.value)
		appStore.networks = await managers.network.getNetworks()
		emit("onClose")
		openToast({ kind: "success", label: "Endpoint updated" })
	} catch (err) {
		errorText.value = endpointErrorText(err, {
			duplicate: "Another endpoint of this network uses that URL.",
			chainId: () => network.value.chainId,
		})
	} finally {
		isSubmitting.value = false
	}
}

usePopupEntity(() => props.show, {
	submit: handleSave,
	onShow: () => {
		openedAt.value = Date.now()
		fillFromEndpoint()
	},
})
</script>

<template>
	<FormPopup
		v-if="endpoint"
		:show="show"
		@onClose="emit('onClose')"
		:displaceIdx="order"
		:depth="depth"
		submitLabel="Save"
		:submitDisabled="!isAvailableToSave"
		:submitLoading="isSubmitting"
		submitTestId="edit-endpoint-submit"
		@submit="handleSave"
	>
		<template #title>
			<Text variant="title-page" color="primary">
				Edit endpoint
				<Text v-if="network" color="tertiary"> · {{ network.name }}</Text>
			</Text>
		</template>

		<Flex direction="column" gap="6" data-testid="endpoint-edit-status" :data-tone="routeStatus.tone">
			<Flex align="center" gap="8">
				<EndpointStatusDot :tone="routeStatus.tone" />
				<Text variant="row-title" color="primary" data-testid="endpoint-edit-status-word">{{ routeStatus.word }}</Text>
			</Flex>
			<Text v-if="routeStatus.detail" variant="body" color="txt-danger" height="140" data-testid="endpoint-edit-status-detail">
				{{ routeStatus.detail }}
			</Text>
		</Flex>

		<Input
			label="Label"
			placeholder="Primary"
			autofocus
			sanitize
			:maxLength="25"
			v-model="labelTerm"
			data-testid="endpoint-label-input"
		/>

		<Input
			label="RPC URL"
			placeholder="https://rpc.example.com"
			v-model="urlTerm"
			@input="errorText = ''"
			data-testid="endpoint-rpc-input"
		>
			<template #right>
				<Transition name="fade">
					<FieldWarning v-if="errorText">{{ errorText }}</FieldWarning>
				</Transition>
			</template>
		</Input>

		<template #belowSubmit>
			<Button @click="fillFromEndpoint" wide variant="primary_outline" size="medium" :disabled="!isDirty">
				Reset changes
			</Button>
		</template>
	</FormPopup>
</template>
