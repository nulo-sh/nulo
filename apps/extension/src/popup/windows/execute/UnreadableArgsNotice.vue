<script setup lang="ts">
/** Why the wallet shows a call's arguments as raw fields, and what the person should check instead. */
import DottedTerm from "@/components/composite/DottedTerm.vue"
import type { UndecodedReason } from "@/wallet/services/execution/client"
import { RAW_ADVICE, RAW_LINE } from "./call-surface"

defineProps<{
	reason: UndecodedReason
	/** Prefix for the warning's `data-testid`, so each host surface stays addressable. */
	prefix: string
	/** Carries the window's closing advice; `OperationCard` picks the one notice. */
	advice?: boolean
}>()
</script>

<template>
	<Flex align="center" gap="4">
		<Icon name="warning" size="12" color="orange" />
		<Text :data-testid="`${prefix}-unverified-warning`" variant="body" color="orange">Can't read the arguments</Text>
	</Flex>
	<!-- A sentence's spaces sit inside its segments: a bare newline between two tags renders none. -->
	<Text :data-testid="`${prefix}-unverified-reason`" variant="body" color="tertiary">
		<template v-for="(segment, i) in RAW_LINE[reason]" :key="i">
			<DottedTerm v-if="'term' in segment" term="interface" :testid="`${prefix}-interface-term`">{{ segment.term }}</DottedTerm>
			<template v-else>{{ segment.text }}</template>
		</template>
	</Text>
	<Text v-if="advice" :data-testid="`${prefix}-unverified-advice`" variant="body" color="tertiary">{{ RAW_ADVICE }}</Text>
</template>
