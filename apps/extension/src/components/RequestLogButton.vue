<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"

/** Services */
import { LogViewerServiceClient } from "@/wallet/services/log-viewer/client"

/** Utils */
import { downloadFile } from "@/utils/files"
import { useToast } from "@/composables/toast"

/** 2. Macros */
const props = defineProps<{ journalId?: string; interactionId?: string }>()

/** 4. Composables */
const { openToast } = useToast()

/** 6. Reactive state */
const walletTraceId = ref<string>()
const downloading = ref(false)

/** 7. Service clients */
const logViewerService = new LogViewerServiceClient()

/** 8. Handlers */
async function download() {
	if (!walletTraceId.value || downloading.value) return
	downloading.value = true
	try {
		const report = await logViewerService.getRequestReport(walletTraceId.value)
		if (!report) throw new Error("The request's logs are no longer kept")
		await downloadFile({ data: report.text, filename: report.fileName })
		openToast({ kind: "success", label: "Logs downloaded successfully" })
	} catch (error) {
		console.error("Request log download failed", { error })
		openToast({ kind: "error", label: "Failed to download logs" })
	} finally {
		downloading.value = false
	}
}

/** 10. Lifecycle */
onMounted(async () => {
	const ref = props.journalId ? { journalId: props.journalId } : props.interactionId ? { interactionId: props.interactionId } : undefined
	if (!ref) return
	try {
		walletTraceId.value = await logViewerService.findRequestTrace(ref)
	} catch {
		walletTraceId.value = undefined
	}
})

onBeforeUnmount(() => {
	logViewerService.disconnect()
})
</script>

<template>
	<Button
		v-if="walletTraceId"
		variant="secondary"
		size="small"
		:loading="downloading"
		data-testid="request-log-download"
		@click="download"
	>
		<Icon name="download" size="14" />
		Download logs
	</Button>
</template>
