<script setup>
/**
 * "File password" for a file that leaves the wallet sealed under a password of its own: the
 * password with its eye and the new-password hint, then its repeat. `testid` prefixes every control.
 */
import PasswordVisibilityToggle from "@/components/composite/PasswordVisibilityToggle.vue"
import { newPasswordHint } from "@/utils/password"

defineProps({
	testid: { type: String, required: true },
	maxLength: { type: Number, default: 128 },
})

const password = defineModel("password", { default: "" })
const repeatedPassword = defineModel("repeatedPassword", { default: "" })

const isHidden = ref(true)
const hint = computed(() => newPasswordHint(password.value ?? "", repeatedPassword.value ?? ""))
</script>

<template>
	<div class="export_section_last">
		<span class="export_section_label type--label-section">File password</span>
		<Flex direction="column" gap="12">
			<Input
				v-model="password"
				:type="isHidden ? 'password' : 'text'"
				:maxLength="maxLength"
				placeholder="Enter password"
				autocomplete="new-password"
				autofocus
				:data-testid="`${testid}-input`"
			>
				<template #suffix>
					<PasswordVisibilityToggle
						:hidden="isHidden"
						:data-testid="`${testid}-input-visibility-toggle`"
						@toggle="isHidden = !isHidden"
					/>
				</template>
				<template #bottom>
					<Flex align="center" gap="6" :class="$style.hint_row">
						<Icon name="lock" :size="12" color="tertiary" />
						<Text variant="body" color="tertiary" :data-testid="`${testid}-hint`">{{ hint }}</Text>
					</Flex>
				</template>
			</Input>
			<Input
				v-model="repeatedPassword"
				:type="isHidden ? 'password' : 'text'"
				:maxLength="maxLength"
				placeholder="Repeat password"
				autocomplete="new-password"
				:data-testid="`${testid}-confirm-input`"
			/>
		</Flex>
	</div>
</template>

<style module>
.hint_row {
	margin-top: 4px;
}
</style>
