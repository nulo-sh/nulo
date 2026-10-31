<script setup lang="ts">
/** A roving tablist: one tab stop, and ←/→ switch the method and move focus to it. */
import { nextTick } from "vue"

type AuthMethod = "password" | "passkey"

const method = defineModel<AuthMethod>({ required: true })

const props = defineProps<{
	ariaLabel: string
	tabClass: string
	activeClass: string
	passwordTestid: string
	passkeyTestid: string
	/** Set while a run is in flight on the method shown: no tab takes a click or a key. */
	disabled?: boolean
}>()

const LABELS: Record<AuthMethod, string> = { password: "Password", passkey: "Passkey" }
const ORDER: readonly AuthMethod[] = ["passkey", "password"]
const testid = (m: AuthMethod) => (m === "password" ? props.passwordTestid : props.passkeyTestid)

const tabs: Partial<Record<AuthMethod, HTMLButtonElement>> = {}

const onKeydown = (e: KeyboardEvent) => {
	if (props.disabled || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return
	e.preventDefault()
	method.value = method.value === "password" ? "passkey" : "password"
	nextTick(() => tabs[method.value]?.focus())
}
</script>

<template>
	<div role="tablist" :aria-label="ariaLabel" :class="disabled && $style.disabled" @keydown="onKeydown">
		<button
			v-for="m in ORDER"
			:key="m"
			:ref="(el) => (tabs[m] = (el as HTMLButtonElement | null) ?? undefined)"
			type="button"
			role="tab"
			:aria-selected="method === m"
			:tabindex="method === m ? 0 : -1"
			:class="[tabClass, method === m && activeClass]"
			:disabled="disabled"
			:data-testid="testid(m)"
			@click="method = m"
		>
			{{ LABELS[m] }}
		</button>
	</div>
</template>

<style module>
/* The design Input's disabled look. */
.disabled {
	opacity: 0.5;
	pointer-events: none;
}
</style>
