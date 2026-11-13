<script setup lang="ts">
/**
 * A contract named in a sentence, with its level's seal; its press says what the level rests on and
 * where to look the contract up. One Tab stop: the press moves focus to its link when it has one.
 */
/** Components */
import TokenMark from "@/components/composite/general/TokenMark.vue"

/** Composables */
import { refuseRepeatEnter } from "@/composables/usePopupEntity"

/** Utils */
import { trimAddress } from "@/utils/string"
import { type ChipModel, LEVEL_GLYPH, LEVEL_LABEL } from "./contract-chip"

/** Macros */
const props = defineProps<{
	model: ChipModel
	/** The explorer page for this contract on its chain; null when no explorer covers it or none is picked. */
	explorer?: { url: string; name: string } | null
	/** On the label, so a sentence's own testid survives the chip around it. */
	testid?: string
}>()

/** Reactive state */
const open = ref(false)
const panelId = useId()
const seal = computed(() => (props.model.level === "nulo" || props.model.level === "scan" ? LEVEL_GLYPH[props.model.level] : null))
</script>

<template>
	<Popover inline :open="open" width="280" @onClose="open = false">
		<button
			type="button"
			data-testid="contract-chip"
			:data-level="model.level ?? 'pending'"
			:aria-label="model.accessibleName"
			:aria-expanded="open"
			:aria-controls="open ? panelId : undefined"
			:aria-describedby="open ? panelId : undefined"
			:class="[$style.chip, open && $style.pressed]"
			@click="open = !open"
			@keydown.enter="refuseRepeatEnter"
		>
			<TokenMark v-if="model.mark" :symbol="model.mark.symbol" :icon="model.mark.icon" :size="16" :badge="model.mark.badge" />
			<span :data-testid="testid" :class="[model.mono ? 'type--meta' : 'type--value', $style.text]">{{ model.label }}</span>
			<Icon v-if="seal" data-testid="contract-chip-seal" :name="seal" size="15" :color="model.level === 'nulo' ? 'primary' : 'secondary'" aria-hidden="true" />
		</button>
		<template #content>
			<div :id="panelId" data-testid="contract-chip-panel" :class="$style.panel">
				<Flex v-if="model.level" align="center" gap="6">
					<Icon v-if="seal" :name="seal" size="16" :color="model.level === 'nulo' ? 'primary' : 'secondary'" aria-hidden="true" />
					<Text variant="label-section" color="secondary" data-testid="contract-chip-level">{{ LEVEL_LABEL[model.level] }}</Text>
				</Flex>
				<Text v-if="model.title" variant="name" color="primary" data-testid="contract-chip-title">{{ model.title }}</Text>
				<Text v-for="line in model.lines" :key="line" variant="body" color="secondary" height="130" data-testid="contract-chip-line">{{ line }}</Text>
				<Flex v-if="model.address" align="center" gap="8" :class="$style.link_row">
					<Text variant="meta" color="primary" data-testid="contract-chip-short-address">{{ trimAddress(model.address) }}</Text>
					<a
						v-if="explorer"
						:href="explorer.url"
						target="_blank"
						rel="noopener noreferrer"
						data-testid="contract-chip-explorer-link"
						:class="$style.link"
						@keydown.enter="refuseRepeatEnter"
					>
						<span>View on {{ explorer.name }}</span>
						<Icon name="open" size="10" color="tertiary" aria-hidden="true" />
					</a>
				</Flex>
			</div>
		</template>
	</Popover>
</template>

<style module>
.chip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	height: 20px;
	max-width: 100%;
	margin: -3px 0;
	padding: 0 5px 0 6px;
	border: 1px solid var(--nulo-border);
	background: var(--nulo-surface-low);
	color: var(--txt-primary);
	vertical-align: middle;
	white-space: nowrap;
	cursor: pointer;
	transition: background 0.15s var(--bezier);

	&:hover {
		background: var(--nulo-surface);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 1px;
	}
}

.pressed {
	background: var(--nulo-surface);
}

.text {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
}

.panel {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 6px 14px;
	overflow-wrap: anywhere;
}

.link_row {
	margin-top: 2px;
}

.link {
	composes: type--body from global;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--txt-secondary);
	text-decoration: underline 1px;
	text-decoration-color: var(--nulo-outline);
	text-underline-offset: 3px;

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.chip {
		transition: none;
	}
}
</style>
