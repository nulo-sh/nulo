<script setup>
/** Method-selection list shown on the import page when no import method is selected yet; each entry
 *  sets the import option in the parent. */
const emit = defineEmits(["select"])

const props = defineProps({
	type: { type: String, default: "import" }, // "import" | "recovery"
})
</script>

<template>
	<div :class="$style.section_last">
		<span :class="$style.section_label">{{ type === "recovery" ? "Recovery" : "Import" }} with</span>
		<ItemsContainer flat>
			<SettingItem
				@click="emit('select', 'full_backup')"
				data-testid="import-option-full-backup"
				title="Full Backup"
				chevron
			/>
			<SettingItem @click="emit('select', 'seed')" data-testid="import-option-seed" title="Recovery Phrase" chevron />
		</ItemsContainer>
	</div>
</template>

<style module>
.section_last {
	composes: section_last from "./import-shared.module.css";
}

.section_label {
	composes: section_label from "./import-shared.module.css";
}
</style>
