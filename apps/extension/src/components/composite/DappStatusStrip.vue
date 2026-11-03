<script setup>
import IdentityStrip from "./IdentityStrip.vue"

defineProps({
	accountName: { type: String, default: "" },
	networkName: { type: String, default: "" },
	status: { type: String, default: "ready" },
})
</script>

<template>
	<IdentityStrip :accountLabel="accountName || 'No account'" :networkLabel="networkName" :status="status" />
</template>
