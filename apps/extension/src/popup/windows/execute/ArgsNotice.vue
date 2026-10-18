<script setup lang="ts">
import DottedTerm from "@/components/composite/DottedTerm.vue"
import { type NoticeSegment, RAW_ADVICE } from "./call-surface"

defineProps<{
	title: string
	body: readonly NoticeSegment[]
	prefix: string
	kind: "unverified" | "labels"
	/** Carries the window's closing advice; `OperationCard` picks the one notice. */
	advice?: boolean
}>()
</script>

<template>
	<Flex align="center" gap="4">
		<Icon name="warning" size="12" color="orange" />
		<Text :data-testid="`${prefix}-${kind}-warning`" variant="body" color="orange">{{ title }}</Text>
	</Flex>
	<!-- A sentence's spaces sit inside its segments: a bare newline between two tags renders none. -->
	<Text :data-testid="`${prefix}-${kind}-reason`" variant="body" color="tertiary">
		<template v-for="(segment, i) in body" :key="i">
			<DottedTerm v-if="'term' in segment" term="interface" :testid="`${prefix}-interface-term`">{{ segment.term }}</DottedTerm>
			<template v-else>{{ segment.text }}</template>
		</template>
	</Text>
	<Text v-if="advice" :data-testid="`${prefix}-${kind}-advice`" variant="body" color="tertiary">{{ RAW_ADVICE }}</Text>
</template>
