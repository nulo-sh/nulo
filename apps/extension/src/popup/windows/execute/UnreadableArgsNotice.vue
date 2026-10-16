<script setup lang="ts">
/** Why the wallet shows a call's arguments as raw fields, and what the person should check instead. */
import type { UndecodedReason } from "@/wallet/services/execution/client"
import { rawNotice } from "./call-surface"

defineProps<{
	reason: UndecodedReason
	/** Prefix for the warning's `data-testid`, so each host surface stays addressable. */
	prefix: string
}>()
</script>

<template>
	<Flex align="center" gap="4">
		<Icon name="warning" size="12" color="orange" />
		<Text :data-testid="`${prefix}-unverified-warning`" variant="body" color="orange">Can't read the arguments</Text>
	</Flex>
	<Text variant="body" color="tertiary">{{ rawNotice(reason) }}</Text>
</template>
