<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
import PasswordVisibilityToggle from "@/components/composite/PasswordVisibilityToggle.vue"
/**
 * Credentials section for the create-profile page in `password` mode:
 * a new-password input + repeat input + a small strength hint. Owns
 * the visibility toggle internally.
 */
const props = defineProps({
	maxPasswordLength: { type: Number, default: 128 },
	strengthHint: { type: String, default: "" },
})

const password = defineModel("password", { type: String, default: "" })
const repeatedPassword = defineModel("repeatedPassword", { type: String, default: "" })

const isPasswordType = ref(true)
</script>

<template>
	<div :class="$style.section_last">
		<span :class="$style.section_label">Password</span>
		<Flex direction="column" gap="12">
			<Input
				v-model="password"
				:type="isPasswordType ? 'password' : 'text'"
				:maxLength="maxPasswordLength"
				placeholder="Strong password"
				autofocus
				autocomplete="new-password"
				data-testid="register-password-input"
			>
				<template #suffix>
					<PasswordVisibilityToggle
						:hidden="isPasswordType"
						data-testid="register-password-input-visibility-toggle"
						@toggle="isPasswordType = !isPasswordType"
					/>
				</template>
				<template #bottom>
					<Flex align="center" gap="6" :class="$style.hint_row">
						<Icon name="lock" :size="12" color="tertiary" />
						<Text variant="body" color="tertiary">{{ strengthHint }}</Text>
					</Flex>
				</template>
			</Input>
			<Input
				v-model="repeatedPassword"
				:type="isPasswordType ? 'password' : 'text'"
				:maxLength="maxPasswordLength"
				placeholder="Repeat password"
				autocomplete="new-password"
				data-testid="register-password-confirm-input"
			/>
		</Flex>
	</div>
</template>

<style module>
.section_last {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 20px 0;
}

.section_label {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}

.hint_row {
	margin-top: 4px;
}
</style>
