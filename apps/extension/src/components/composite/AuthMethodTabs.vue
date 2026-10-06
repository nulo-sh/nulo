<script setup lang="ts">
/** A roving tablist: one tab stop, and ←/→ switch the method and move focus to it. */
import { nextTick, ref } from "vue"

type AuthMethod = "password" | "passkey"

const method = defineModel<AuthMethod>({ required: true })

defineProps<{
	ariaLabel: string
	tabClass: string
	activeClass: string
	passwordTestid: string
	passkeyTestid: string
}>()

const passwordTab = ref<HTMLButtonElement>()
const passkeyTab = ref<HTMLButtonElement>()

const onKeydown = (e: KeyboardEvent) => {
	if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
	e.preventDefault()
	method.value = method.value === "password" ? "passkey" : "password"
	nextTick(() => (method.value === "password" ? passwordTab.value : passkeyTab.value)?.focus())
}
</script>

<template>
	<div role="tablist" :aria-label="ariaLabel" @keydown="onKeydown">
		<button
			ref="passwordTab"
			type="button"
			role="tab"
			:aria-selected="method === 'password'"
			:tabindex="method === 'password' ? 0 : -1"
			:class="[tabClass, method === 'password' && activeClass]"
			:data-testid="passwordTestid"
			@click="method = 'password'"
		>
			Password
		</button>
		<button
			ref="passkeyTab"
			type="button"
			role="tab"
			:aria-selected="method === 'passkey'"
			:tabindex="method === 'passkey' ? 0 : -1"
			:class="[tabClass, method === 'passkey' && activeClass]"
			:data-testid="passkeyTestid"
			@click="method = 'passkey'"
		>
			Passkey
		</button>
	</div>
</template>
