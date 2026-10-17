<script setup lang="ts">
/** Components */
import { SectionLabel } from "@nulo/design"

/** Utils */
import type { GetStartedItem } from "@/utils/get-started"

defineProps<{ items: readonly GetStartedItem[]; canHide: boolean }>()
const emit = defineEmits<{ select: [item: GetStartedItem]; hide: [] }>()

const ROWS: Readonly<Record<GetStartedItem, { title: string; description?: string; value?: string }>> = {
	phrase: { title: "Save your recovery phrase", description: "The 24 words that restore this wallet" },
	backup: { title: "Back up this wallet", description: "Sync your passkey or save a backup file" },
	aztec: { title: "How Aztec works", value: "1 min" },
	feeJuice: { title: "Get Fee Juice" },
	presto: { title: "Make proofs faster", value: "Optional" },
}
</script>

<template>
	<Flex direction="column" gap="12" data-testid="get-started">
		<Flex align="end" justify="between">
			<SectionLabel label="Get started" />
			<button v-if="canHide" type="button" :class="$style.hide" data-testid="get-started-hide" @click="emit('hide')">Hide</button>
		</Flex>
		<ItemsContainer>
			<SettingItem
				v-for="item in items"
				:key="item"
				:title="ROWS[item].title"
				:description="ROWS[item].description"
				:value="ROWS[item].value"
				chevron
				:data-testid="`get-started-${item}`"
				@click="emit('select', item)"
			/>
		</ItemsContainer>
	</Flex>
</template>

<style module>
.hide {
	composes: type--label-section from global;
	padding: 0;
	border: none;
	background: transparent;
	color: var(--nulo-secondary);
	text-decoration: underline;
	text-underline-offset: 4px;
	cursor: pointer;
	transition: color 0.2s var(--bezier);
}

.hide:hover {
	color: var(--txt-primary);
}

.hide:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: 2px;
}
</style>
