<script setup>
/** The password a file leaving the wallet is sealed under. `testid` prefixes every control. */
import NewPasswordPair from "@/components/composite/NewPasswordPair.vue"

const props = defineProps({
	testid: { type: String, required: true },
	labelRepeat: { type: Boolean, default: false },
})

const password = defineModel("password", { default: "" })
const repeatedPassword = defineModel("repeatedPassword", { default: "" })

const testids = computed(() => ({
	input: `${props.testid}-input`,
	confirm: `${props.testid}-confirm-input`,
	toggle: `${props.testid}-input-visibility-toggle`,
	hint: `${props.testid}-hint`,
}))
</script>

<template>
	<div class="export_section_last">
		<span class="export_section_label type--label-section">File password</span>
		<NewPasswordPair
			v-model:password="password"
			v-model:repeatedPassword="repeatedPassword"
			:testids="testids"
			placeholder="Enter password"
			autofocus
			:labelRepeat="labelRepeat"
		/>
	</div>
</template>
