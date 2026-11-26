<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
import NewPasswordPair from "@/components/composite/NewPasswordPair.vue"
const password = defineModel("password", { type: String, default: "" })
const repeatedPassword = defineModel("repeatedPassword", { type: String, default: "" })
</script>

<template>
	<div :class="$style.section_last" data-scroll-section>
		<span :class="$style.section_label">Password</span>
		<NewPasswordPair
			v-model:password="password"
			v-model:repeatedPassword="repeatedPassword"
			:testids="{
				input: 'register-password-input',
				confirm: 'register-password-confirm-input',
				toggle: 'register-password-input-visibility-toggle',
			}"
			placeholder="Strong password"
			autofocus
		/>
	</div>
</template>

<style module>
.section_last {
	composes: section from "@/components/composite/form-section.module.css";
}

.section_label {
	composes: label from "@/components/composite/form-section.module.css";
}
</style>
