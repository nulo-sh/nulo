<script setup lang="ts">
/** The one thing a hand-off window shows before its file pick, centred in the window: the press on
 *  Choose file must happen in this window for Firefox to open the picker, so Choose file takes focus
 *  on mount and Enter or Space opens it. */
import { Icon } from "@nulo/design"
import { onMounted, ref, useId } from "vue"
import Button from "@/components/ui/Button.vue"

const emit = defineEmits<{ choose: []; cancel: [] }>()
withDefaults(defineProps<{ title: string; busy?: boolean }>(), { busy: false })

const titleId = useId()
const chooseRef = ref<{ $el?: HTMLElement }>()

onMounted(() => chooseRef.value?.$el?.focus())
</script>

<template>
	<div :class="$style.window">
		<section :class="$style.card" :aria-labelledby="titleId" data-testid="handoff-card">
			<Icon name="upload" :size="24" aria-hidden="true" />
			<h1 :id="titleId" :class="$style.title">{{ title }}</h1>
			<div :class="$style.actions">
				<Button ref="chooseRef" variant="cta" size="compact" :disabled="busy" data-testid="handoff-card-choose" @click="emit('choose')">
					Choose file
				</Button>
				<Button variant="secondary" size="large" wide :disabled="busy" data-testid="handoff-card-cancel" @click="emit('cancel')">Cancel</Button>
			</div>
		</section>
	</div>
</template>

<style module>
.window {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	padding: 20px;
}

.card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 14px;

	padding: 32px 20px 20px;

	border: 1px solid var(--nulo-border);
	background: var(--nulo-surface-low);

	text-align: center;
}

.title {
	composes: type--row-title from global;
	font-size: 16px;
	color: var(--txt-primary);
	margin: 0;
}

.actions {
	display: flex;
	flex-direction: column;
	gap: 8px;
	align-self: stretch;
	margin-top: 6px;
}
</style>
