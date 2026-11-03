<script setup>
/** The identity strip naming the active account beside the wallet's network; owns only the no-account fallback. */
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
