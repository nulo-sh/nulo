<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/** Services */
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { ExecutionServiceClient } from "@/wallet/services/execution/client"

/** Composables */
import { usePrestoCheck } from "@/composables/usePrestoCheck"
import { usePrestoHostPermission } from "@/composables/usePrestoHostPermission"

/** Utils */
import { PRESTO_SITE_URL } from "@/presto/config"
import { copyFor, detailRowsFor, isPitchKind } from "@/utils/presto-ui-state"

const configService = new ConfigServiceClient()
const { state, start, check, dispose } = usePrestoCheck(configService)
const {
	missing: permissionMissing,
	request: requestPermission,
	dispose: disposePermission,
} = usePrestoHostPermission({ onFirstAllowed: start, onGranted: check })

const lastProve = ref(null)
const copy = computed(() => copyFor(state.value, lastProve.value, "settings"))
const rows = computed(() => detailRowsFor(state.value))
const diagnosis = computed(() => (state.value.kind === "secure-connection-unavailable" ? state.value.diagnosis : undefined))

const shellRef = useTemplateRef("shellRef")
const rowRef = useTemplateRef("rowRef")

const executionService = new ExecutionServiceClient()

function retry() {
	void check()
}

// Pre-flush, so the row is still mounted: a grant that takes it away while it holds focus hands
// focus to the title, not the page.
watch(permissionMissing, (missing) => {
	if (!missing && rowRef.value?.$el.contains(document.activeElement)) shellRef.value?.focusTitle()
})

onBeforeMount(async () => {
	try {
		lastProve.value = await executionService.getLastProveOutcome()
	} catch {
		// Health alone still renders; only the denied overlay needs the SW's memory.
		lastProve.value = null
	}
})

onBeforeUnmount(() => {
	executionService.disconnect()
	configService.disconnect()
	dispose()
	disposePermission()
})
</script>

<template>
	<SettingsPageShell ref="shellRef" title="Proving" backTo="/popup/settings" gap="24">
		<PrestoPermissionRow v-if="permissionMissing" ref="rowRef" @allow="requestPermission" />

		<PrestoStatusCard
			v-if="!permissionMissing"
			compact
			:copy="copy"
			:status="state.kind"
			:diagnosis="diagnosis"
			testid="settings-proving-status"
			retryTestid="settings-proving-retry"
			@retry="retry"
		/>

		<ItemsContainer v-if="!permissionMissing && isPitchKind(state.kind)" title="Presto">
			<SettingItem
				:to="PRESTO_SITE_URL"
				title="Get Presto"
				description="presto.build · free, open source"
				materialIcon="download"
				external
				data-testid="settings-proving-get"
			/>
		</ItemsContainer>
		<ItemsContainer v-else-if="!permissionMissing" title="Details">
			<SettingItem v-for="row in rows" :key="row.title" :title="row.title" :description="row.description" :materialIcon="row.icon" raw>
				<template #right>
					<Text variant="value" color="primary">{{ row.value }}</Text>
				</template>
			</SettingItem>
		</ItemsContainer>

		<Text variant="body" color="support" height="150">
			Proofs are always generated on your machine. Presto runs them natively; without it, Nulo proves inside the
			browser, which is slower.
		</Text>
	</SettingsPageShell>
</template>
