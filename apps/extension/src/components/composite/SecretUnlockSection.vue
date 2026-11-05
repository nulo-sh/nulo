<script setup>
/** The export pages' password gate. `error` is the page's wrong-password flag, which an input or a
 *  click on the field clears. */
import CurrentPasswordField from "@/components/composite/CurrentPasswordField.vue"

defineProps({
	modelValue: { type: String, default: undefined },
	error: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue", "clearError"])

const onInput = (val) => {
	emit("update:modelValue", val)
	if (val !== undefined) emit("clearError")
}
const onClick = () => emit("clearError")
</script>

<template>
	<div class="export_section_last" data-scroll-section>
		<span class="export_section_label type--label-section">Unlock</span>
		<CurrentPasswordField
			:modelValue="modelValue"
			@update:modelValue="onInput"
			:error="error"
			@click="onClick"
			label="Password"
			placeholder="Enter password"
			autocomplete="current-password"
			autofocus
			data-testid="unlock-password-input"
			errorTestid="unlock-error-text"
		/>
	</div>
</template>
